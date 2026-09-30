const express = require('express');
const MerchantIntegrationController = require('../controllers/merchantIntegrationController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

// All routes require merchant authentication
router.use(authenticate);
router.use(isMerchant);

// Get integration settings (API key, webhook URL)
router.get('/', MerchantIntegrationController.getSettings);

// Generate new API key
router.post('/api-key/generate', MerchantIntegrationController.generateApiKey);

// Update Webhook URL
router.post('/webhook', MerchantIntegrationController.updateWebhook);

module.exports = router;
