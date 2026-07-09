const express = require('express');
const VoiceController = require('../controllers/voiceController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

// Public route - accessible without auth
router.get('/preview/:filename', VoiceController.servePreview);

// Merchant authentication middleware
router.use(authenticate, isMerchant);

// Authenticated voice routes
router.get('/', VoiceController.getAll);
router.post('/preview', VoiceController.preview);

module.exports = router;
