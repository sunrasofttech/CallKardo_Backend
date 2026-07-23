const { resetMerchantPasswordSchema } = require('../src/validators/auth');

function testValidator() {
  console.log('Testing resetMerchantPasswordSchema...');

  // Test 1: Valid payload with password & confirmPassword
  const res1 = resetMerchantPasswordSchema.validate({
    password: 'newpassword123',
    confirmPassword: 'newpassword123',
  });
  console.log('Test 1 (password & confirmPassword):', res1.error ? res1.error.message : 'SUCCESS');

  // Test 2: Valid payload with newPassword & confirm_password
  const res2 = resetMerchantPasswordSchema.validate({
    newPassword: 'newpassword123',
    confirm_password: 'newpassword123',
  });
  console.log('Test 2 (newPassword & confirm_password):', res2.error ? res2.error.message : 'SUCCESS');

  // Test 3: Password mismatch
  const res3 = resetMerchantPasswordSchema.validate({
    password: 'newpassword123',
    confirmPassword: 'differentpassword',
  });
  console.log('Test 3 (Mismatch expected error):', res3.error ? res3.error.message : 'FAILED (Should have failed)');

  // Test 4: Too short password (<6 chars)
  const res4 = resetMerchantPasswordSchema.validate({
    password: '123',
    confirmPassword: '123',
  });
  console.log('Test 4 (Too short expected error):', res4.error ? res4.error.message : 'FAILED (Should have failed)');
}

testValidator();
