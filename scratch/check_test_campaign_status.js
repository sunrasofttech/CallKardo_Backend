require('dotenv').config();
const { Campaign, CampaignCustomer, CallSession, CallLog, sequelize } = require('../src/models');

async function checkTestStatus() {
  try {
    await sequelize.authenticate();
    const campaignId = 'a79b3832-0001-4a7f-9479-d7291d80d319';
    
    const campaign = await Campaign.findByPk(campaignId);
    console.log(`Campaign ${campaignId} Status:`, campaign ? campaign.status : 'NOT FOUND');

    const customers = await CampaignCustomer.findAll({ where: { campaignId } });
    console.log('\nCampaign Customers:');
    customers.forEach((c) => {
      console.log(`  - Customer ID: ${c.customerId} | Status: ${c.callStatus}`);
    });

    const sessions = await CallSession.findAll({ where: { campaignId } });
    console.log(`\nCall Sessions Created (${sessions.length}):`);
    for (const s of sessions) {
      console.log(`  * Session ID: ${s.id} | Customer: ${s.customerId} | Status: ${s.status} | CreatedAt: ${s.createdAt}`);
      const logs = await CallLog.findAll({ where: { callSessionId: s.id } });
      logs.forEach(l => console.log(`      [Log] ${l.logLevel}: ${l.message}`));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

checkTestStatus();
