const authController = require('../src/controllers/authController');
const { Admin } = require('../src/models');

async function test() {
  console.log('--- STARTING CONTROLLER-LEVEL PASSWORD RESET TEST ---');

  // 1. Mock req and res for forgotPassword
  const reqForgot = {
    body: {
      email: 'admin@example.com',
      role: 'super_admin'
    }
  };

  let forgotResponse = null;
  const resForgot = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      forgotResponse = data;
      return this;
    }
  };

  console.log('\nCalling authController.forgotPassword...');
  await authController.forgotPassword(reqForgot, resForgot, (err) => {
    if (err) console.error('Forgot password next(err):', err);
  });
  console.log('Response received:', forgotResponse);

  // 2. Fetch the reset token from database
  const admin = await Admin.findOne({ where: { email: 'admin@example.com' } });
  const token = admin.resetToken;
  console.log(`\nRetrieved Reset Token from DB: ${token}`);

  // 3. Mock req and res for resetPassword
  const reqReset = {
    body: {
      token: token,
      password: 'newPassword123',
      role: 'super_admin'
    }
  };

  let resetResponse = null;
  const resReset = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      resetResponse = data;
      return this;
    }
  };

  console.log('\nCalling authController.resetPassword...');
  await authController.resetPassword(reqReset, resReset, (err) => {
    if (err) console.error('Reset password next(err):', err);
  });
  console.log('Response received:', resetResponse);

  // 4. Restore original password
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('admin123', salt);
  admin.passwordHash = passwordHash;
  admin.resetToken = null;
  admin.resetTokenExpires = null;
  await admin.save();
  console.log('\nOriginal password restored.');

  console.log('\n--- CONTROLLER-LEVEL TEST COMPLETED ---');
  process.exit(0);
}

test();
