const express = require('express');
const AuthController = require('../controllers/authController');

const router = express.Router();

// Merchant Registration
router.post('/register', AuthController.registerMerchant);

// Super Admin Registration (typically internal/restricted)
router.post('/admin/register', AuthController.registerAdmin);

// Unified Login
router.post('/login', AuthController.login);

// Verify Login OTP
router.post('/login/verify-otp', AuthController.loginVerifyOtp);

// Refresh Access Token
router.post('/refresh-token', AuthController.refreshToken);

// Verify OTP (Registration & General Verification)
router.post('/verify-otp', AuthController.verifyOtp);

// Resend OTP (Registration, Login, Reset Password)
router.post('/resend-otp', AuthController.resendOtp);

// Forgot Password Flow
router.post('/forgot-password', AuthController.forgotPassword);

// Reset Password Flow
router.post('/reset-password', AuthController.resetPassword);

// Onboarding/Setup Business Profile
const { authenticate, isMerchant } = require('../middleware/auth');
router.post('/setup-business', authenticate, isMerchant, AuthController.setupBusiness);

// Get Business Details
router.get('/business-details', authenticate, isMerchant, AuthController.getBusinessDetails);

// Merchant Direct Password Reset (Authenticated, no old password verification)
router.post('/merchant/reset-password', authenticate, isMerchant, AuthController.resetMerchantPassword);

// Change Password (Authenticated User/Admin)
router.post('/change-password', authenticate, AuthController.changePassword);

// Update Notification / FCM Push Token
router.post('/fcm-token', authenticate, AuthController.updateFcmToken);

// Get User Profile
router.get('/me', authenticate, AuthController.getMe);

// Delete User Account
router.delete('/me', authenticate, AuthController.deleteAccount);

module.exports = router;

