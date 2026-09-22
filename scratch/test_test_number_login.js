const assert = require('assert');
const AuthController = require('../src/controllers/authController');
const { redisClient } = require('../src/config/redis');
const { User } = require('../src/models');
const bcrypt = require('bcryptjs');

// Mock response object
function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

async function runTests() {
  console.log('--- Starting Test Number OTP Bypass Verification ---');

  // Ensure Redis is connected
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  // Ensure merchant user exists for 9876543210
  let user = await User.findOne({ where: { mobile: '9876543210' } });
  if (!user) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('merchant123', salt);
    user = await User.create({
      email: 'testuser@example.com',
      mobile: '9876543210',
      passwordHash,
      role: 'merchant',
      isVerified: true,
    });
  } else {
    // Ensure verified and has known password
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash('merchant123', salt);
    user.isVerified = true;
    await user.save();
  }

  // Test 1: Merchant Login Step 1 (Request OTP) for 9876543210
  console.log('\n[Test 1] POST /login with mobile 9876543210 (request OTP)...');
  const req1 = {
    body: {
      mobile: '9876543210',
      password: 'merchant123',
      role: 'merchant',
    },
  };
  const res1 = createMockRes();
  await AuthController.login(req1, res1, (err) => { if (err) throw err; });

  assert.strictEqual(res1.statusCode, 200, 'Status should be 200');
  assert.strictEqual(res1.body.success, true, 'Should succeed');
  assert.strictEqual(res1.body.data.otpRequired, true, 'otpRequired should be true');
  console.log('Result 1:', res1.body.message);

  // Verify Redis cached the default OTP 123456
  const cachedOtp = await redisClient.get('login_otp:9876543210');
  assert.strictEqual(cachedOtp, '123456', 'Redis cached OTP should be default 123456');
  console.log('Redis OTP verified:', cachedOtp);

  // Test 2: Login Verify OTP with wrong OTP
  console.log('\n[Test 2] POST /login/verify-otp with incorrect OTP 999999...');
  const req2 = {
    body: {
      mobile: '9876543210',
      otp: '999999',
      role: 'merchant',
    },
  };
  const res2 = createMockRes();
  await AuthController.loginVerifyOtp(req2, res2, (err) => { if (err) throw err; });
  assert.strictEqual(res2.statusCode, 400, 'Status should be 400');
  assert.strictEqual(res2.body.success, false, 'Should fail for wrong OTP');
  console.log('Result 2: Correctly rejected with', res2.body.message);

  // Test 3: Login Verify OTP with default OTP 123456
  console.log('\n[Test 3] POST /login/verify-otp with default OTP 123456...');
  const req3 = {
    body: {
      mobile: '+919876543210',
      otp: '123456',
      role: 'merchant',
    },
  };
  const res3 = createMockRes();
  await AuthController.loginVerifyOtp(req3, res3, (err) => { if (err) throw err; });
  assert.strictEqual(res3.statusCode, 200, 'Status should be 200');
  assert.strictEqual(res3.body.success, true, 'Should succeed with default OTP');
  assert(res3.body.data.accessToken, 'Access token should be issued');
  console.log('Result 3: Successfully verified! Token issued:', res3.body.data.accessToken.substring(0, 20) + '...');

  // Test 4: Direct Login with OTP provided in POST /login
  console.log('\n[Test 4] Direct POST /login with mobile and default OTP 123456...');
  const req4 = {
    body: {
      mobile: '9876543210',
      otp: '123456',
      role: 'merchant',
    },
  };
  const res4 = createMockRes();
  await AuthController.login(req4, res4, (err) => { if (err) throw err; });
  assert.strictEqual(res4.statusCode, 200, 'Status should be 200');
  assert.strictEqual(res4.body.success, true, 'Should succeed');
  assert(res4.body.data.accessToken, 'Access token should be issued');
  console.log('Result 4: Direct login with OTP verified! Token issued:', res4.body.data.accessToken.substring(0, 20) + '...');

  console.log('\n--- ALL TESTS PASSED! ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
