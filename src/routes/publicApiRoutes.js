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

// Get the transcript of a call report
router.get('/reports/:id/transcript', PublicApiController.getTranscript);

// Play/Download the recording of a call report
router.get('/reports/:id/recording', PublicApiController.playRecording);

// Get customers
router.get('/customers', PublicApiController.getCustomers);

// Get campaigns
router.get('/campaigns', PublicApiController.getCampaigns);

module.exports = router;
