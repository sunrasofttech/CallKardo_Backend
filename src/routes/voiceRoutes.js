const express = require('express');
const VoiceController = require('../controllers/voiceController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

// Merchant authentication middleware
router.use(authenticate, isMerchant);

// Voice routes
router.get('/', VoiceController.getAll);
router.post('/preview', VoiceController.preview);
router.get('/preview/:filename', VoiceController.servePreview);

module.exports = router;
