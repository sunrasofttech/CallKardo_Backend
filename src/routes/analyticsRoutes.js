const express = require('express');
const AnalyticsController = require('../controllers/analyticsController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, isMerchant);

// Stats endpoints
router.get('/campaign', AnalyticsController.getCampaignStats);
router.get('/leads', AnalyticsController.getLeadStats);
router.get('/plan', AnalyticsController.getPlanUtilization);
router.get('/vobiz', AnalyticsController.getVobizStats);

module.exports = router;
