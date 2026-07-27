const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const { authenticate, isAdmin } = require('../middleware/auth');

// All admin routes should require admin role
router.use(authenticate);
router.use(isAdmin);

// Merchant management routes
router.get('/dashboard', adminController.getDashboard);
router.get('/admins', adminController.getAdmins);
router.post('/admins', authController.registerAdmin);
router.put('/admins/:id', adminController.updateAdmin);
router.get('/merchants', adminController.getMerchants);
router.get('/merchants/:id', adminController.getMerchant);
router.put('/merchants/:id', adminController.updateMerchant);
router.put('/merchants/:id/subscription', adminController.upgradeMerchantSubscription);
router.post('/merchants/:id/subscription/upgrade', adminController.upgradeMerchantSubscription);
router.get('/merchants/:id/numbers', adminController.getMerchantNumbers);
router.put('/merchants/:id/numbers/:numberId', adminController.updateMerchantNumber);
router.delete('/merchants/:id/numbers/:numberId', adminController.deleteMerchantNumber);

// Reset Merchant/User Password (Admin)
router.post('/merchants/:id/reset-password', adminController.resetMerchantPasswordByAdmin);
router.post('/merchants/reset-password', adminController.resetMerchantPasswordByAdmin);
router.post('/users/:id/reset-password', adminController.resetMerchantPasswordByAdmin);
router.post('/users/reset-password', adminController.resetMerchantPasswordByAdmin);

// Subscription management routes
router.get('/subscriptions', adminController.getSubscriptions);
router.get('/subscriptions/:id', adminController.getSubscriptionById);
router.post('/subscriptions/upgrade', adminController.upgradeMerchantSubscription);
router.put('/subscriptions/:id', adminController.updateSubscription);
router.post('/subscriptions/:id/cancel', adminController.cancelSubscription);


// Agent approval routes
router.get('/agents', adminController.getAgents);
router.get('/agents/pending', adminController.getPendingAgents);
router.post('/agents/:id/approve', adminController.approveAgent);
router.post('/agents/:id/reject', adminController.rejectAgent);

// Sensitive Words routes
router.get('/sensitive-words', adminController.getSensitiveWords);
router.post('/sensitive-words', adminController.updateSensitiveWords);

// KYC Rate Limit routes
router.get('/kyc-rate-limit', adminController.getKycRateLimit);
router.post('/kyc-rate-limit', adminController.updateKycRateLimit);

// Voice Library Management routes
router.get('/voices', adminController.getVoices);
router.post('/voices', adminController.createVoice);
router.put('/voices/:id', adminController.updateVoice);
router.delete('/voices/:id', adminController.deleteVoice);

// Audit Logs routes
router.get('/audit-logs', adminController.getAuditLogs);

// Global Call Reports routes
router.get('/reports', adminController.getGlobalCallReports);
router.get('/reports/session/:sessionId', adminController.getGlobalCallSession);

const categoryController = require('../controllers/categoryController');
const PlanController = require('../controllers/planController');
const settingController = require('../controllers/settingController');

// Admin Profile routes
router.get('/profile', adminController.getProfile);
router.put('/profile', adminController.updateProfile);

// Admin Team management routes
router.delete('/admins/:id', adminController.deleteAdmin);

// Settings routes
router.get('/settings', settingController.getAllSettings);
router.put('/settings', settingController.upsertSetting);

// Admin Notification routes
router.post('/notifications/send', adminController.sendNotification);
router.get('/notifications', adminController.getAllNotifications);

// Admin Password management routes
router.post('/password/change', authController.changePassword);
router.post('/password/reset', authController.forgotPassword);

// Business Category management routes
router.get('/categories', categoryController.getAll);
router.get('/categories/:id', categoryController.getById);
router.post('/categories', categoryController.create);
router.put('/categories/:id', categoryController.update);
router.delete('/categories/:id', categoryController.delete);

// Subscription Plan management routes
router.get('/plans', PlanController.getAll);
router.get('/plans/:id', PlanController.getById);
router.post('/plans', PlanController.create);
router.put('/plans/:id', PlanController.update);
router.delete('/plans/:id', PlanController.delete);

module.exports = router;

