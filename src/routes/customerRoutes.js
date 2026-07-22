const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const CustomerController = require('../controllers/customerController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

router.use(authenticate, isMerchant);

// Customers CRUD
router.get('/', CustomerController.getAll);
router.get('/:id', CustomerController.getById);
router.post('/', CustomerController.create);
router.put('/:id', CustomerController.update);
router.delete('/:id', CustomerController.delete);

// Bulk Import CSV
router.post('/upload', upload.single('file'), CustomerController.uploadCSV);

// Customer Lists
router.get('/lists/all', CustomerController.getLists);
router.get('/lists/:id', CustomerController.getListById);
router.post('/lists', CustomerController.createList);
router.delete('/lists/:id', CustomerController.deleteList);

module.exports = router;
