require('dotenv').config();
const { Customer, User } = require('../src/models');
const ActionService = require('../src/services/actionService');

async function testMeeting() {
  try {
    const customer = await Customer.findByPk('9ba2498a-f550-41b8-b9e3-f8e6e6d8ff40');
    if (!customer) {
      console.log('Customer not found');
      return;
    }
    const merchant = await User.findByPk(customer.merchantId);

    // Try scheduling a meeting
    console.log('--- Testing scheduleMeeting with Tomorrow 2pm ---');
    const timeStr = 'tomorrow at 2pm';
    const parsed = ActionService._parseRequestedMeetingTime(timeStr);
    console.log('Parsed Date:', parsed.dateObj.toString());

    // Call scheduleMeeting
    const result = await ActionService.scheduleMeeting(
      customer.toJSON(),
      { name: 'Test AI Agent' },
      merchant ? merchant.toJSON() : {},
      timeStr
    );
    console.log('Schedule meeting result:', result);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testMeeting();
