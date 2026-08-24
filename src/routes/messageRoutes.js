const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads/documents/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed.'));
    }
  }
});

router.use(authenticate);

// Merchant Program Routes
router.get('/programs/requirements', messageController.getRequirements);
router.post('/programs/apply', upload.any(), messageController.applyForProgram);
router.get('/programs', messageController.getPrograms);

// Merchant Template Routes
router.get('/master-templates', messageController.getMasterTemplates);
router.post('/templates', messageController.createTemplate);
router.get('/templates', messageController.getTemplates);

module.exports = router;
