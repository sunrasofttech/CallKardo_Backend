const express = require('express');
const PlanController = require('../controllers/planController');
const { authenticate, optionalAuthenticate, isAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuthenticate, PlanController.getAll);
router.get('/:id', optionalAuthenticate, PlanController.getById);

// Admin Only
router.post('/', authenticate, isAdmin, PlanController.create);
router.put('/:id', authenticate, isAdmin, PlanController.update);
router.delete('/:id', authenticate, isAdmin, PlanController.delete);

module.exports = router;
