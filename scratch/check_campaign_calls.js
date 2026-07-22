require('dotenv').config();
const { Campaign, CampaignCustomer, Customer, CallSession, CallLog, Subscription, User, sequelize } = require('../src/models');
const { redisClient } = require('../src/config/redis');

async function debugCampaignFlow() {
  try {
    await sequelize.authenticate();
    console.log('=== CAMPAIGN & CALL PIPELINE DIAGNOSTIC ===');

    // 1. Fetch all campaigns
    const campaigns = await Campaign.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    console.log(`\nFound ${campaigns.length} recent campaigns in DB:`);
    for (const c of campaigns) {
      console.log(`\n--------------------------------------------------`);
      console.log(`Campaign ID   : ${c.id}`);
      console.log(`Name          : ${c.name}`);
      console.log(`Status        : ${c.status}`);
      console.log(`User ID       : ${c.userId}`);
      console.log(`VoBiz Num ID  : ${c.vobizNumberId}`);
      console.log(`Agent ID      : ${c.agentId}`);
      console.log(`List ID       : ${c.customerListId}`);
      console.log(`Start Time    : ${c.startTime}`);
      console.log(`Max Concurrent: ${c.maxConcurrentCalls}`);
      console.log(`Interval      : ${c.intervalBetweenCalls}s`);

      // Count campaign customers by status
      const totalMembers = await CampaignCustomer.count({ where: { campaignId: c.id } });
      const pendingCount = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'pending' } });
      const callingCount = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'calling' } });
      const completedCount = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'completed' } });
      const failedCount = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'failed' } });

      console.log(`Customer Breakdown (${totalMembers} total):`);
      console.log(`  - Pending  : ${pendingCount}`);
      console.log(`  - Calling  : ${callingCount}`);
      console.log(`  - Completed: ${completedCount}`);
      console.log(`  - Failed   : ${failedCount}`);

      // Check recent call sessions for this campaign
      const sessions = await CallSession.findAll({
        where: { campaignId: c.id },
        order: [['createdAt', 'DESC']],
        limit: 3,
      });

      console.log(`Recent Call Sessions (${sessions.length}):`);
      sessions.forEach((s) => {
        console.log(`  * Session ID: ${s.id} | Status: ${s.status} | CustomerID: ${s.customerId} | CreatedAt: ${s.createdAt}`);
      });
    }

    // 2. Check Redis Queues
    console.log('\n--- REDIS QUEUE DIAGNOSTIC ---');
    try {
      const callQueueLen = await redisClient.lLen('queue:call_queue');
      console.log(`Redis 'queue:call_queue' Length: ${callQueueLen}`);

      const scheduledJobs = await redisClient.zRangeWithScores('queue:scheduled_jobs', 0, -1);
      console.log(`Redis 'queue:scheduled_jobs' Count: ${scheduledJobs.length}`);
      scheduledJobs.forEach((job, idx) => {
        console.log(`  Job #${idx + 1}: Score ${job.score} (${new Date(job.score).toISOString()}) -> ${job.value}`);
      });
    } catch (redisErr) {
      console.error('Redis Queue Check Error:', redisErr.message);
    }

  } catch (err) {
    console.error('Diagnostic Error:', err);
  } finally {
    await sequelize.close();
  }
}

debugCampaignFlow();
