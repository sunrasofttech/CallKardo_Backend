const express = require('express');
const SubscriptionController = require('../controllers/subscriptionController');
const { authenticate, isAdmin, isMerchant } = require('../middleware/auth');

const router = express.Router();

// Merchant Subscription Management
router.get('/my', authenticate, isMerchant, SubscriptionController.getMySubscription);
router.post('/upgrade', authenticate, isMerchant, SubscriptionController.upgradeSubscription);

// Admin Access
router.get('/merchant/:merchantId', authenticate, isAdmin, SubscriptionController.getMerchantSubscription);
router.get('/admin/all', authenticate, isAdmin, SubscriptionController.getAllSubscriptions);
router.post('/admin/upgrade', authenticate, isAdmin, SubscriptionController.adminUpgradeSubscription);
router.post('/merchant/:merchantId/upgrade', authenticate, isAdmin, SubscriptionController.adminUpgradeSubscription);

module.exports = router;
