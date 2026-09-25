const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Public Webhook route for ABCGate payment gateway callbacks (PAYIN / PAYOUT)
 */
router.post('/webhook', paymentController.handleWebhook);
router.post('/callback', authenticate, paymentController.completePaymentAppCallback);

/**
 * PhonePe Webhook (S2S callback) — Public, no auth (PhonePe sends directly)
 */
router.post('/phonepe/webhook', paymentController.handlePhonePeWebhook);

/**
 * PhonePe Redirect — User lands here after completing payment on PhonePe page
 */
router.get('/phonepe/redirect', paymentController.handlePhonePeRedirect);
router.post('/phonepe/redirect', paymentController.handlePhonePeRedirect);

/**
 * PhonePe Status Check by orderId (authenticated)
 */
router.get('/phonepe/status/:orderId', authenticate, paymentController.checkPhonePeStatus);

/**
 * Razorpay Webhook — Public, no auth (Razorpay sends directly, verified via HMAC-SHA256 signature)
 */
router.post('/razorpay/webhook', paymentController.handleRazorpayWebhook);

/**
 * Razorpay Payment Verification (authenticated) — Frontend sends paymentId, orderId, signature
 */
router.post('/razorpay/verify', authenticate, paymentController.verifyRazorpayPayment);

/**
 * Razorpay Status Check by orderId (authenticated)
 */
router.get('/razorpay/status/:orderId', authenticate, paymentController.getRazorpayPaymentStatus);

/**
 * Initiate Payment (General) - matching POST /api/payments/initiate
 * Automatically routes to ABCGate, PhonePe, or Razorpay based on admin gateway setting
 */
router.post('/initiate', authenticate, paymentController.initiatePayment);

/**
 * Initiate Subscription Purchase Payment
 */
router.post('/initiate-subscription', authenticate, paymentController.initiateSubscriptionPayment);

/**
 * Initiate VoBiz Phone Number Purchase Payment
 */
router.post('/initiate-number', authenticate, paymentController.initiateNumberPurchasePayment);

/**
 * Get Status of a Payment by orderId
 */
router.get('/status/:orderId', authenticate, paymentController.getTransactionStatus);

/**
 * Get My Payment Transactions (Merchant)
 */
router.get('/my-transactions', authenticate, paymentController.getMyTransactions);

module.exports = router;
