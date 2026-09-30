const express = require('express');
const PublicApiController = require('../controllers/publicApiController');
const { apiAuth } = require('../middleware/apiAuth');

const router = express.Router();

// Apply API Key authentication middleware to all public routes
router.use(apiAuth);

// Get call reports list
router.get('/reports', PublicApiController.getReports);

// Get a single call report
router.get('/reports/:id', PublicApiController.getReportDetails);

module.exports = router;
