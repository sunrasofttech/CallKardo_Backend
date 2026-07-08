const express = require('express');
const AuthController = require('../controllers/authController');

const router = express.Router();

// Merchant Registration
router.post('/register', AuthController.registerMerchant);

// Super Admin Registration (typically internal/restricted)
router.post('/admin/register', AuthController.registerAdmin);

// Unified Login
router.post('/login', AuthController.login);

// Refresh Access Token
router.post('/refresh-token', AuthController.refreshToken);

// Verify OTP via SMS
router.post('/verify-otp', AuthController.verifyOtp);

// Forgot Password Flow
router.post('/forgot-password', AuthController.forgotPassword);

// Reset Password Flow
router.post('/reset-password', AuthController.resetPassword);

// Onboarding/Setup Business Profile
const { authenticate, isMerchant } = require('../middleware/auth');
router.post('/setup-business', authenticate, isMerchant, AuthController.setupBusiness);

module.exports = router;
