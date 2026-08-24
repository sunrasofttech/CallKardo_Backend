const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Merchant Program Routes
router.get('/programs/requirements', messageController.getRequirements);
router.post('/programs/apply', messageController.applyForProgram);
router.get('/programs', messageController.getPrograms);

// Merchant Template Routes
router.get('/master-templates', messageController.getMasterTemplates);
router.post('/templates', messageController.createTemplate);
router.get('/templates', messageController.getTemplates);

module.exports = router;
