const express = require('express');
const AgentController = require('../controllers/agentController');
const { authenticate, isMerchant } = require('../middleware/auth');

const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/', limits: { fileSize: 5 * 1024 * 1024 } }); // Max 5MB

const router = express.Router();

router.use(authenticate, isMerchant);

router.get('/', AgentController.getAll);
router.get('/:id', AgentController.getById);
router.post('/', AgentController.create);
router.put('/:id', AgentController.update);
router.delete('/:id', AgentController.delete);
router.post('/:id/knowledge-base', upload.single('file'), AgentController.uploadKnowledgeBase);

module.exports = router;
