/**
 * Diagnostic script to check the full campaign -> call -> report flow against live DB.
 * Run: node scratch/diagnose_campaign_flow.js
 */
process.env.TZ = 'Asia/Kolkata';
require('dotenv').config();

const sequelize = require('../src/config/database');

async function diagnose() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to live DB\n');

    // 1. Find all running campaigns
    const [campaigns] = await sequelize.query(
      `SELECT c.id, c.name, c.status, c.user_id, c.vobiz_number_id, c.agent_id, c.customer_list_id,
              c.max_concurrent_calls, c.interval_between_calls, c.start_time, c.created_at
       FROM campaigns c
       WHERE c.status = 'running' OR c.status = 'completed'
       ORDER BY c.created_at DESC
       LIMIT 10`
    );
    console.log(`📋 Recent Running/Completed Campaigns (${campaigns.length}):`);
    campaigns.forEach(c => {
      console.log(`  - [${c.status}] ${c.name} (${c.id}) userId=${c.user_id} vobizNumberId=${c.vobiz_number_id} agentId=${c.agent_id} listId=${c.customer_list_id}`);
    });
    console.log();

    // 2. For each running campaign, check campaign_customers
    for (const camp of campaigns) {
      const [customers] = await sequelize.query(
        `SELECT call_status, COUNT(*) as cnt
         FROM campaign_customers
         WHERE campaign_id = ?
         GROUP BY call_status`,
        { replacements: [camp.id] }
      );
      console.log(`  📊 Campaign "${camp.name}" (${camp.id}) customer status breakdown:`);
      if (customers.length === 0) {
        console.log(`     ⚠️  NO campaign_customers entries! This means INSERT IGNORE failed or list is empty.`);
      }
      customers.forEach(r => console.log(`     ${r.call_status}: ${r.cnt}`));

      // Check the customer list
      const [listMembers] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM customer_list_members WHERE customer_list_id = ?`,
        { replacements: [camp.customer_list_id] }
      );
      console.log(`     📝 Customer list ${camp.customer_list_id} has ${listMembers[0]?.cnt || 0} members`);

      // Check if customer_list_members table has deleted_at column
      try {
        const [cols] = await sequelize.query(
          `SHOW COLUMNS FROM customer_list_members LIKE 'deleted_at'`
        );
        console.log(`     🔍 customer_list_members.deleted_at column exists: ${cols.length > 0}`);
      } catch (e) {
        console.log(`     ❌ Error checking deleted_at column: ${e.message}`);
      }
      console.log();
    }

    // 3. Check subscriptions for merchant users of running campaigns
    const userIds = [...new Set(campaigns.map(c => c.user_id))];
    for (const uid of userIds) {
      const [subs] = await sequelize.query(
        `SELECT s.id, s.status, s.calls_used, s.calls_remaining, s.expiry_date, p.name as plan_name, p.call_limit, p.max_concurrent_calls
         FROM subscriptions s
         LEFT JOIN plans p ON s.plan_id = p.id
         WHERE s.user_id = ?`,
        { replacements: [uid] }
      );
      console.log(`👤 Subscription for user ${uid}:`);
      if (subs.length === 0) {
        console.log(`   ⚠️  NO SUBSCRIPTION! validateCallLimits will return isValid: false`);
      }
      subs.forEach(s => {
        console.log(`   Plan: ${s.plan_name}, Status: ${s.status}, Used: ${s.calls_used}, Remaining: ${s.calls_remaining}, Limit: ${s.call_limit}, MaxConcurrent: ${s.max_concurrent_calls}, Expiry: ${s.expiry_date}`);
        if (s.status !== 'active') {
          console.log(`   ⚠️  Subscription is NOT active! Calls will be blocked.`);
        }
        if (s.call_limit !== -1 && s.calls_remaining <= 0) {
          console.log(`   ⚠️  Call quota exhausted! No new calls will be placed.`);
        }
      });

      // Check KYC status
      const [users] = await sequelize.query(
        `SELECT id, email, kyc_status, is_verified, business_name FROM users WHERE id = ?`,
        { replacements: [uid] }
      );
      if (users.length > 0) {
        const u = users[0];
        console.log(`   KYC: ${u.kyc_status}, Verified: ${u.is_verified}, Business: ${u.business_name}`);
        if (u.kyc_status !== 'full') {
          console.log(`   ⚠️  KYC is NOT full. 48h probation rate limit may apply.`);
          // Check subscription start date
          if (subs.length > 0) {
            const [subDates] = await sequelize.query(
              `SELECT start_date FROM subscriptions WHERE user_id = ?`,
              { replacements: [uid] }
            );
            if (subDates.length > 0) {
              const hoursSinceStart = (new Date() - new Date(subDates[0].start_date)) / (1000 * 60 * 60);
              console.log(`   ⏰ Hours since subscription start: ${hoursSinceStart.toFixed(1)}`);
              if (hoursSinceStart >= 48) {
                console.log(`   🚫 BLOCKED! 48h probation expired without Full KYC. All calls will fail!`);
              }
            }
          }
        }
      }
      console.log();
    }

    // 4. Check VoBiz numbers
    for (const camp of campaigns) {
      if (camp.vobiz_number_id) {
        const [nums] = await sequelize.query(
          `SELECT id, number, status, agent_id FROM vobiz_numbers WHERE id = ?`,
          { replacements: [camp.vobiz_number_id] }
        );
        console.log(`📞 VoBiz Number for campaign "${camp.name}":`);
        if (nums.length === 0) {
          console.log(`   ⚠️  VoBiz number ${camp.vobiz_number_id} NOT FOUND in DB!`);
        } else {
          const n = nums[0];
          console.log(`   Number: ${n.number}, Status: ${n.status}, AgentId: ${n.agent_id}`);
          if (n.status !== 'active') {
            console.log(`   ⚠️  VoBiz number is NOT active!`);
          }
        }
      } else {
        console.log(`📞 Campaign "${camp.name}" has NO vobiz_number_id set!`);
      }
    }
    console.log();

    // 5. Check VoBiz account credentials
    for (const uid of userIds) {
      const [accts] = await sequelize.query(
        `SELECT id, customer_id, api_key, api_secret FROM vobiz_accounts WHERE user_id = ?`,
        { replacements: [uid] }
      );
      console.log(`🔑 VoBiz Account for user ${uid}:`);
      if (accts.length === 0) {
        console.log(`   Using PARENT credentials (${process.env.VOBIZ_PARENT_AUTH_ID})`);
      } else {
        const a = accts[0];
        console.log(`   CustomerId: ${a.customer_id}, ApiKey: ${a.api_key ? a.api_key.substring(0, 6) + '...' : 'NULL'}`);
      }
    }
    console.log();

    // 6. Check recent call sessions
    const [sessions] = await sequelize.query(
      `SELECT cs.id, cs.user_id, cs.campaign_id, cs.status, cs.direction, cs.customer_id,
              cs.vobiz_number_id, cs.start_time, cs.end_time, cs.vobiz_call_uuid, cs.created_at
       FROM call_sessions cs
       ORDER BY cs.created_at DESC
       LIMIT 20`
    );
    console.log(`📞 Recent Call Sessions (${sessions.length}):`);
    sessions.forEach(s => {
      console.log(`  [${s.status}] ${s.direction} session=${s.id.substring(0,8)}... customer=${s.customer_id || 'NULL'} campaign=${s.campaign_id || 'NULL'} vobizUuid=${s.vobiz_call_uuid || 'NULL'} created=${s.created_at}`);
    });
    console.log();

    // 7. Check recent call reports
    const [reports] = await sequelize.query(
      `SELECT cr.id, cr.user_id, cr.call_session_id, cr.customer_id, cr.campaign_id, cr.outcome,
              cr.sentiment, cr.lead_score, cr.duration, cr.recording_url,
              LENGTH(cr.transcript) as transcript_len, cr.created_at
       FROM call_reports cr
       ORDER BY cr.created_at DESC
       LIMIT 20`
    );
    console.log(`📊 Recent Call Reports (${reports.length}):`);
    reports.forEach(r => {
      console.log(`  [${r.outcome}] session=${r.call_session_id?.substring(0,8)}... customer=${r.customer_id || 'NULL'} transcript=${r.transcript_len || 0} chars, duration=${r.duration}s, score=${r.lead_score} created=${r.created_at}`);
    });
    console.log();

    // 8. Check agents
    for (const camp of campaigns) {
      const [agents] = await sequelize.query(
        `SELECT id, name, approval_status, active_status, ai_provider FROM agents WHERE id = ?`,
        { replacements: [camp.agent_id] }
      );
      console.log(`🤖 Agent for campaign "${camp.name}":`);
      if (agents.length === 0) {
        console.log(`   ⚠️  Agent ${camp.agent_id} NOT FOUND!`);
      } else {
        const a = agents[0];
        console.log(`   Name: ${a.name}, Status: ${a.approval_status}/${a.active_status ? 'active' : 'inactive'}, Provider: ${a.ai_provider}`);
        if (a.approval_status !== 'approved') {
          console.log(`   ⚠️  Agent is NOT approved!`);
        }
      }
    }
    console.log();

    // 9. Summary of potential issues
    console.log('='.repeat(60));
    console.log('🔍 DIAGNOSIS SUMMARY');
    console.log('='.repeat(60));

    let issues = [];

    // Check if any campaign has 0 campaign_customers
    for (const camp of campaigns.filter(c => c.status === 'running')) {
      const [cc] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM campaign_customers WHERE campaign_id = ?`,
        { replacements: [camp.id] }
      );
      if ((cc[0]?.cnt || 0) === 0) {
        issues.push(`Campaign "${camp.name}" has 0 campaign_customers. INSERT IGNORE likely failed.`);
      }

      const [pending] = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM campaign_customers WHERE campaign_id = ? AND call_status = 'pending'`,
        { replacements: [camp.id] }
      );
      if ((pending[0]?.cnt || 0) === 0) {
        issues.push(`Campaign "${camp.name}" has 0 PENDING customers. All may have been processed or never inserted.`);
      }
    }

    // Check subscription blocking
    for (const uid of userIds) {
      const [subs] = await sequelize.query(
        `SELECT s.status, s.calls_remaining, s.start_date, p.call_limit
         FROM subscriptions s LEFT JOIN plans p ON s.plan_id = p.id
         WHERE s.user_id = ?`,
        { replacements: [uid] }
      );
      if (subs.length === 0) {
        issues.push(`User ${uid} has NO subscription. All calls blocked.`);
      } else if (subs[0].status !== 'active') {
        issues.push(`User ${uid} subscription status is "${subs[0].status}". Calls blocked.`);
      } else if (subs[0].call_limit !== -1 && subs[0].calls_remaining <= 0) {
        issues.push(`User ${uid} call quota exhausted (remaining: ${subs[0].calls_remaining}).`);
      }

      const [users] = await sequelize.query(
        `SELECT kyc_status FROM users WHERE id = ?`,
        { replacements: [uid] }
      );
      if (users.length > 0 && users[0].kyc_status !== 'full' && subs.length > 0) {
        const hoursSinceStart = (new Date() - new Date(subs[0].start_date)) / (1000 * 60 * 60);
        if (hoursSinceStart >= 48) {
          issues.push(`User ${uid} KYC is "${users[0].kyc_status}" and 48h probation expired (${hoursSinceStart.toFixed(0)}h). ALL CALLS BLOCKED.`);
        }
      }
    }

    if (issues.length === 0) {
      console.log('✅ No obvious blocking issues found in DB data.');
    } else {
      issues.forEach((issue, i) => {
        console.log(`  ❌ ${i + 1}. ${issue}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Diagnostic script failed:', err);
    process.exit(1);
  }
}

diagnose();
