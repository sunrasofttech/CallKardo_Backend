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
router.put('/merchants/:id/subscription', adminController.updateMerchantSubscription);
router.get('/merchants/:id/numbers', adminController.getMerchantNumbers);
router.put('/merchants/:id/numbers/:numberId', adminController.updateMerchantNumber);
router.delete('/merchants/:id/numbers/:numberId', adminController.deleteMerchantNumber);

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

// Global Virtual Numbers inventory route
router.get('/virtual-numbers', adminController.getGlobalVirtualNumbers);

module.exports = router;

