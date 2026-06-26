const { VobizNumber, VobizAccount } = require('../src/models');
const vobizService = require('../src/services/vobizService');
const { decrypt } = require('../src/utils/crypto');
const defaults = require('../src/config/defaults');

async function linkExistingNumbers() {
  try {
    console.log('Fetching all active VoBiz numbers from database...');
    const numbers = await VobizNumber.findAll({ where: { status: 'active' } });
    console.log(`Found ${numbers.length} active numbers.`);

    for (const vobizNumber of numbers) {
      console.log(`\nProcessing number: ${vobizNumber.number} for User: ${vobizNumber.userId}...`);
      
      const account = await VobizAccount.findOne({ where: { userId: vobizNumber.userId } });
      if (!account) {
        console.log(`[SKIPPED] No connected VoBiz account found for User: ${vobizNumber.userId}`);
        continue;
      }

      const encryptEnabled = defaults.vobiz.encryptCredentials;
      let decryptedApiSecret;
      try {
        decryptedApiSecret = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;
      } catch (decErr) {
        decryptedApiSecret = account.apiSecret;
      }

      console.log(`Running setupInboundRouting for ${vobizNumber.number}...`);
      const result = await vobizService.setupInboundRouting({
        authId: account.customerId,
        authToken: decryptedApiSecret,
        number: vobizNumber.number
      });

      if (result.success) {
        console.log(`[SUCCESS] Number ${vobizNumber.number} linked successfully!`);
      } else {
        console.log(`[FAILED] Failed to link number ${vobizNumber.number}:`, result.error);
      }
    }

    console.log('\nProcessing completed.');
  } catch (err) {
    console.error('Error linking existing numbers:', err);
  }
  process.exit(0);
}

linkExistingNumbers();
