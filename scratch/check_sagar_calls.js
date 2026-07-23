require('dotenv').config();
const { Customer, CallReport, CallSession, sequelize } = require('../src/models');

async function debugSagar() {
  try {
    await sequelize.authenticate();
    const sagarUserId = '49d695d2-3867-45da-ba2f-95b8c4acabaa';
    console.log(`=== DEBUG CALLS FOR SAGAR (${sagarUserId}) ===`);

    const customers = await Customer.findAll({
      where: { userId: sagarUserId }
    });

    console.log(`Total Customers under Sagar's account: ${customers.length}`);
    customers.forEach(c => console.log(`  Customer ID: ${c.id} | Name: ${c.name} | Mobile: ${c.mobile}`));

    const sessions = await CallSession.findAll({
      where: { userId: sagarUserId }
    });
    console.log(`\nTotal CallSessions under Sagar's account: ${sessions.length}`);
    sessions.forEach(s => console.log(`  Session ID: ${s.id} | CustomerID: ${s.customerId} | Status: ${s.status}`));

    const reports = await CallReport.findAll({
      where: { userId: sagarUserId }
    });
    console.log(`\nTotal CallReports under Sagar's account: ${reports.length}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

debugSagar();
