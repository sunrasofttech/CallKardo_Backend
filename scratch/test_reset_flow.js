const axios = require('axios');
const { Admin } = require('../src/models');

const BASE_URL = 'http://localhost:3000/api/v1';

async function run() {
  console.log('--- STARTING PASSWORD RESET FLOW CROSS-CHECK ---');

  // 1. Trigger forgot password to generate token
  console.log('\nStep 1: Calling forgot password API (/admin/password/reset)...');
  try {
    const forgotRes = await axios.post(`${BASE_URL}/admin/password/reset`, {
      email: 'admin@example.com',
      role: 'super_admin'
    });
    console.log('Forgot Password response:', forgotRes.data);
  } catch (error) {
    console.error('Forgot password failed:', error.response?.data || error.message);
    process.exit(1);
  }

  // 2. Fetch the reset token from database
  console.log('\nStep 2: Fetching reset token from DB...');
  const admin = await Admin.findOne({ where: { email: 'admin@example.com' } });
  if (!admin || !admin.resetToken) {
    console.error('Admin reset token not found in DB!');
    process.exit(1);
  }
  const token = admin.resetToken;
  console.log(`Retrieved Token: ${token}, Expires: ${admin.resetTokenExpires}`);

  // 3. Complete the password reset via unified reset-password API
  console.log('\nStep 3: Completing password reset (/auth/reset-password)...');
  try {
    const resetRes = await axios.post(`${BASE_URL}/auth/reset-password`, {
      token: token,
      password: 'newSecurePassword123',
      role: 'super_admin'
    });
    console.log('Reset Password response:', resetRes.data);
  } catch (error) {
    console.error('Reset password failed:', error.response?.data || error.message);
    process.exit(1);
  }

  // 4. Verify login with the new password
  console.log('\nStep 4: Verifying login with new password...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'newSecurePassword123',
      role: 'super_admin'
    });
    console.log('Login success! User role:', loginRes.data.data.profile.role);
  } catch (error) {
    console.error('Login with new password failed:', error.response?.data || error.message);
    process.exit(1);
  }

  // 5. Restore the original password (admin123)
  console.log('\nStep 5: Restoring original password (admin123)...');
  const bcrypt = require('bcryptjs');
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('admin123', salt);
  admin.passwordHash = passwordHash;
  admin.resetToken = null;
  admin.resetTokenExpires = null;
  await admin.save();
  console.log('Original password restored successfully.');

  console.log('\n--- PASSWORD RESET FLOW VERIFICATION COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}

run();
