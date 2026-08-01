const { CallSession, User, Customer, Agent, sequelize } = require('../src/models');
const adminController = require('../src/controllers/adminController');

async function run() {
  try {
    const req = {
      query: {
        page: 1,
        limit: 10
      }
    };
    
    const res = {
      status: (code) => {
        console.log('Status:', code);
        return res;
      },
      json: (data) => {
        console.log('Response:', JSON.stringify(data, null, 2));
      }
    };

    const next = (err) => {
      console.error('Error in next():', err);
    };

    console.log('Testing getCustomerActionsReport...');
    await adminController.getCustomerActionsReport(req, res, next);

  } catch (err) {
    console.error('Script Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
