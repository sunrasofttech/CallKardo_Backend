require('dotenv').config();
const { Customer, CallReport, CallSession, sequelize } = require('../src/models');
const { Op } = require('sequelize');

async function debugMobileReports() {
  try {
    await sequelize.authenticate();
    const searchMobile = '9561868381';
    console.log(`=== DEBUG MOBILE REPORTS FOR '${searchMobile}' ===`);

    // 1. Search Customers with exact & LIKE match
    const customers = await Customer.findAll({
      where: {
        mobile: {
          [Op.like]: `%${searchMobile}%`
        }
      }
    });

    console.log(`Found ${customers.length} customer records matching '%${searchMobile}%':`);
    customers.forEach((c) => {
      console.log(`  - Customer ID: ${c.id} | Name: ${c.name} | Mobile: '${c.mobile}' | User ID: ${c.userId}`);
    });

    // 2. Search Call Reports for these customer IDs
    const customerIds = customers.map((c) => c.id);
    const reports = await CallReport.findAll({
      where: {
        customerId: { [Op.in]: customerIds }
      }
    });

    console.log(`\nFound ${reports.length} CallReports for customer IDs [${customerIds.join(', ')}]:`);
    reports.forEach((r) => {
      console.log(`  - Report ID: ${r.id} | CallSession ID: ${r.callSessionId} | Summary: ${r.summary} | CreatedAt: ${r.createdAt}`);
    });

    // 3. Search Call Sessions for these customer IDs
    const sessions = await CallSession.findAll({
      where: {
        customerId: { [Op.in]: customerIds }
      }
    });

    console.log(`\nFound ${sessions.length} CallSessions for customer IDs [${customerIds.join(', ')}]:`);
    sessions.forEach((s) => {
      console.log(`  - Session ID: ${s.id} | Status: ${s.status} | Direction: ${s.direction} | CreatedAt: ${s.createdAt}`);
    });

    // 4. Search Call Reports globally without user filter
    const allReports = await CallReport.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']]
    });
    console.log(`\nTotal CallReports in entire DB: ${allReports.length}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

debugMobileReports();
