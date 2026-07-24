const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Public Webhook route for payment gateway callbacks (PAYIN / PAYOUT)
 */
router.post('/webhook', paymentController.handleWebhook);

/**
 * Initiate Payment (General) - matching POST /api/payments/initiate
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
