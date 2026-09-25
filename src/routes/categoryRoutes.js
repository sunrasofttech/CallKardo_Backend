const express = require('express');
const CategoryController = require('../controllers/categoryController');
const { authenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

// Public/Merchant can fetch categories
router.get('/', CategoryController.getAll);
router.get('/:id', authenticate, CategoryController.getById);

// Admin Only Category Management
router.post('/', authenticate, isAdmin, CategoryController.create);
router.put('/:id', authenticate, isAdmin, CategoryController.update);
router.delete('/:id', authenticate, isAdmin, CategoryController.delete);

module.exports = router;
