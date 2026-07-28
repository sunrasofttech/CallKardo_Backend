const { VobizNumber, User } = require('../src/models');
const VobizService = require('../src/services/vobizService');

async function test() {
  console.log('--- STARTING PHONE NUMBER RENTAL VERIFICATION TEST ---');

  // Find a test merchant
  const merchant = await User.findOne({ where: { role: 'merchant' } });
  if (!merchant) {
    console.error('No merchant found to link test number to.');
    process.exit(1);
  }

  const userId = merchant.id;
  const testNumber = '+919999988888';

  // Cleanup existing if any
  await VobizNumber.destroy({ where: { number: testNumber } });

  // 1. Create a new VoBiz number with expiry in 3 days (should stay active)
  console.log('\n--- Test 1: Number with 3 days expiry (Should stay active) ---');
  let expiry = new Date();
  expiry.setDate(expiry.getDate() + 3);
  let num = await VobizNumber.create({
    userId,
    number: testNumber,
    status: 'active',
    rentalExpiryDate: expiry
  });
  console.log(`Created number ${testNumber} with expiry: ${expiry}`);

  await VobizService.checkNumberRentals();
  
  num = await VobizNumber.findOne({ where: { number: testNumber } });
  console.log(`Status after check (expected active): ${num?.status}`);

  // 2. Set expiry to 2 days (Should become inactive)
  console.log('\n--- Test 2: Number with 2 days expiry (Should become inactive) ---');
  expiry = new Date();
  expiry.setDate(expiry.getDate() + 2);
  await num.update({ rentalExpiryDate: expiry });
  console.log(`Updated expiry to 2 days: ${expiry}`);

  await VobizService.checkNumberRentals();

  num = await VobizNumber.findOne({ where: { number: testNumber } });
  console.log(`Status after check (expected inactive): ${num?.status}`);

  // 3. Set expiry to 1 day (Should be cancelled and destroyed)
  console.log('\n--- Test 3: Number with 1 day expiry (Should be unrented and deleted) ---');
  expiry = new Date();
  expiry.setDate(expiry.getDate() + 1);
  await num.update({ rentalExpiryDate: expiry });
  console.log(`Updated expiry to 1 day: ${expiry}`);

  await VobizService.checkNumberRentals();

  num = await VobizNumber.findOne({ where: { number: testNumber } });
  console.log(`Record status after check (expected null/deleted): ${num ? 'Still exists' : 'Deleted successfully'}`);

  console.log('\n--- RENTAL VERIFICATION TEST COMPLETED ---');
  process.exit(0);
}

test();
