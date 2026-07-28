const { sequelize, User, CallSession, CallReport, Subscription, Plan, Admin } = require('../src/models');

async function dump() {
  try {
    await sequelize.authenticate();
    
    console.log('=== PLANS ===');
    const plans = await Plan.findAll();
    plans.forEach(p => console.log(`ID: ${p.id} | Name: ${p.name} | Price: ${p.price}`));

    console.log('\n=== MERCHANTS ===');
    const merchants = await User.findAll({ where: { role: 'merchant' } });
    merchants.forEach(m => console.log(`ID: ${m.id} | Email: ${m.email} | Mobile: ${m.mobile} | BizName: ${m.businessName}`));

    console.log('\n=== RECENT CALL SESSIONS ===');
    const sessions = await CallSession.findAll({ limit: 3, order: [['createdAt', 'DESC']] });
    sessions.forEach(s => console.log(`ID: ${s.id} | UserId: ${s.userId} | Status: ${s.status}`));

    console.log('\n=== RECENT CALL REPORTS ===');
    const reports = await CallReport.findAll({ limit: 3, order: [['createdAt', 'DESC']] });
    reports.forEach(r => console.log(`ID: ${r.id} | UserId: ${r.userId} | CallSessionId: ${r.callSessionId} | Outcome: ${r.outcome}`));

    console.log('\n=== ADMINS ===');
    const admins = await Admin.findAll();
    admins.forEach(a => console.log(`ID: ${a.id} | Email: ${a.email} | Mobile: ${a.mobile}`));

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

dump();
