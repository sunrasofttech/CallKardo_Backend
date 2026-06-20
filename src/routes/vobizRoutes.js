const express = require('express');
const VobizController = require('../controllers/vobizController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

// Webhook for VoBiz to answer the call and connect the stream
router.post('/answer', VobizController.answerCallWebhook);

// Merchant scope only
router.use(authenticate, isMerchant);

// Credentials
router.post('/connect', VobizController.connectAccount);
router.get('/account', VobizController.getAccount);

// Phone Numbers
router.get('/numbers', VobizController.getNumbers);
router.post('/numbers', VobizController.addNumber);
router.put('/numbers/:id', VobizController.updateNumber);
router.delete('/numbers/:id', VobizController.deleteNumber);

module.exports = router;
