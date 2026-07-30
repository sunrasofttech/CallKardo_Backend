require('dotenv').config();
const { Customer, User } = require('../src/models');
const ActionService = require('../src/services/actionService');
const { sendEmail } = require('../src/utils/email');

async function testMeeting() {
  try {
    const customer = await Customer.findByPk('9ba2498a-f550-41b8-b9e3-f8e6e6d8ff40');
    if (!customer) {
      console.log('Customer not found');
      return;
    }
    const merchant = await User.findByPk(customer.merchantId);
    console.log('Customer:', customer.toJSON());
    if (merchant) {
      console.log('Merchant:', merchant.toJSON());
    }

    // Try scheduling a meeting
    console.log('--- Testing scheduleMeeting ---');
    const result = await ActionService.scheduleMeeting(
      customer.toJSON(),
      { name: 'Test AI Agent' },
      merchant ? merchant.toJSON() : {},
      'tomorrow at 10am'
    );
    console.log('Schedule meeting result:', result);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testMeeting();
