require('dotenv').config();
const { Customer, User } = require('../src/models');
const ActionService = require('../src/services/actionService');

async function testJoinLink() {
  try {
    const customer = await Customer.findByPk('9ba2498a-f550-41b8-b9e3-f8e6e6d8ff40');
    if (!customer) {
      console.log('Customer not found');
      return;
    }
    const merchant = await User.findByPk(customer.merchantId);
    console.log('Customer:', customer.toJSON());

    console.log('--- Testing sendJoinLink ---');
    const result = await ActionService.sendJoinLink(
      customer.toJSON(),
      { name: 'Test AI Agent' },
      merchant ? merchant.toJSON() : {}
    );
    console.log('Join link result:', result);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testJoinLink();
