const express = require('express');
const VobizController = require('../controllers/vobizController');
const { authenticate, isMerchant } = require('../middleware/auth');

const router = express.Router();

// Webhook for VoBiz to answer the call and connect the stream
router.post('/answer', VobizController.answerCallWebhook);

// Merchant scope only
router.use(authenticate, isMerchant);

// Credentials & Sub-Accounts
router.post('/connect', VobizController.connectAccount);
router.post('/create-subaccount', VobizController.createSubAccount);
router.get('/account', VobizController.getAccount);

// Phone Numbers
router.get('/numbers', VobizController.getNumbers);
router.post('/numbers', VobizController.addNumber);
router.put('/numbers/:id', VobizController.updateNumber);
router.delete('/numbers/:id', VobizController.deleteNumber);

// Number Purchasing
router.get('/available-numbers', VobizController.listAvailableNumbers);
router.post('/buy-number', VobizController.buyNumber);

module.exports = router;
