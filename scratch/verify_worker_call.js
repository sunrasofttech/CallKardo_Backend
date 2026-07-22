require('dotenv').config();
const { Campaign, CampaignCustomer, Customer, CallSession, CallLog, VobizNumber, VobizAccount, sequelize } = require('../src/models');
const QueueService = require('../src/services/queueService');
const VobizService = require('../src/services/vobizService');
const { decrypt } = require('../src/utils/crypto');
const crypto = require('crypto');

async function testWorkerExecution() {
  try {
    await sequelize.authenticate();
    console.log('--- TESTING WORKER CALL DISPATCH WITH UPDATED LOGIC ---');

    const userId = '998e3036-1683-44f8-adc4-d2aea8b0e271';
    const defaults = require('../src/config/defaults');

    // FetchVoBiz account credentials with fallback
    let vobizAccount = await VobizAccount.findOne({ where: { userId } });
    if (!vobizAccount) {
      const adminAccount = await VobizAccount.findOne();
      if (adminAccount) vobizAccount = adminAccount;
    }
    if (!vobizAccount) {
      vobizAccount = { apiKey: 'parent_auth_id_default', apiSecret: 'parent_auth_token_default' };
    }

    let decryptedApiKey, decryptedApiSecret;
    try {
      decryptedApiKey = decrypt(vobizAccount.apiKey);
      decryptedApiSecret = decrypt(vobizAccount.apiSecret);
    } catch (_) {
      decryptedApiKey = vobizAccount.apiKey;
      decryptedApiSecret = vobizAccount.apiSecret;
    }

    console.log('Decrypted API Key:', decryptedApiKey);
    const isMock = VobizService._isMock(decryptedApiKey);
    console.log('Is Mock Mode Detected?:', isMock);

    const wsToken = crypto.randomBytes(32).toString('hex');
    const dialResponse = await VobizService.initiateCall({
      apiKey: decryptedApiKey,
      apiSecret: decryptedApiSecret,
      fromNumber: '+918071583805',
      toNumber: '+918308773519',
      wsToken,
    });

    console.log('Dial Response:', dialResponse);
    if (dialResponse.success) {
      console.log('\nSUCCESS! Call successfully initiated without 401 error.');
    } else {
      console.error('\nFAILED! Error:', dialResponse.error);
    }

  } catch (err) {
    console.error('Execution error:', err);
  } finally {
    await sequelize.close();
  }
}

testWorkerExecution();
