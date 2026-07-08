const {
  merchantRegisterSchema,
  adminRegisterSchema,
  loginSchema,
  setupBusinessSchema
} = require('../src/validators/auth');

function runTest(testName, schema, data, shouldPass) {
  const { error, value } = schema.validate(data);
  if (error) {
    if (shouldPass) {
      console.error(`❌ [FAIL] ${testName}: Expected success, but got error: ${error.message}`);
      return false;
    } else {
      console.log(`✅ [PASS] ${testName}: Correctly failed as expected with error: ${error.message}`);
      return true;
    }
  } else {
    if (shouldPass) {
      console.log(`✅ [PASS] ${testName}: Passed successfully!`);
      return true;
    } else {
      console.error(`❌ [FAIL] ${testName}: Expected failure, but validation passed!`);
      return false;
    }
  }
}

async function testAll() {
  console.log('--- TESTING MERCHANT REGISTRATION SCHEMA ---');
  
  // 1. Valid data without email
  runTest(
    'Merchant: Valid without email',
    merchantRegisterSchema,
    { mobile: '+919999999999', password: 'password123' },
    true
  );

  // 2. Valid data with email
  runTest(
    'Merchant: Valid with email',
    merchantRegisterSchema,
    { email: 'merchant@test.com', mobile: '+919999999999', password: 'password123' },
    true
  );

  // 3. Invalid email
  runTest(
    'Merchant: Invalid email format',
    merchantRegisterSchema,
    { email: 'not-an-email', mobile: '+919999999999', password: 'password123' },
    false
  );

  // 4. Missing mobile
  runTest(
    'Merchant: Missing mobile number',
    merchantRegisterSchema,
    { email: 'merchant@test.com', password: 'password123' },
    false
  );

  console.log('\n--- TESTING LOGIN SCHEMA ---');
  
  // 5. Login with mobile only
  runTest(
    'Login: Mobile only',
    loginSchema,
    { mobile: '+919999999999', password: 'password123', role: 'merchant' },
    true
  );

  // 6. Login with email only
  runTest(
    'Login: Email only',
    loginSchema,
    { email: 'merchant@test.com', password: 'password123', role: 'merchant' },
    true
  );

  // 7. Login with both (valid)
  runTest(
    'Login: Both email and mobile',
    loginSchema,
    { email: 'merchant@test.com', mobile: '+919999999999', password: 'password123', role: 'merchant' },
    true
  );

  // 8. Login without both (invalid)
  runTest(
    'Login: Missing both email and mobile',
    loginSchema,
    { password: 'password123', role: 'merchant' },
    false
  );

  console.log('\n--- TESTING SETUP BUSINESS SCHEMA ---');

  // 9. Valid setup business data
  runTest(
    'Setup Business: Valid info',
    setupBusinessSchema,
    {
      businessName: 'My Awesome Biz',
      businessUrl: 'https://awesomebiz.com',
      categoryId: 'b8b3b64c-cd1c-4b53-b09e-711e5f8f8b3b'
    },
    true
  );

  // 10. Setup Business: Valid with optional empty businessUrl
  runTest(
    'Setup Business: Empty business URL (optional)',
    setupBusinessSchema,
    {
      businessName: 'My Awesome Biz',
      businessUrl: '',
      categoryId: 'b8b3b64c-cd1c-4b53-b09e-711e5f8f8b3b'
    },
    true
  );

  // 11. Setup Business: Missing business name
  runTest(
    'Setup Business: Missing business name',
    setupBusinessSchema,
    {
      businessUrl: 'https://awesomebiz.com',
      categoryId: 'b8b3b64c-cd1c-4b53-b09e-711e5f8f8b3b'
    },
    false
  );
}

testAll().catch(console.error);
