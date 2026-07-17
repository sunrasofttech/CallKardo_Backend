const { VobizAccount, User } = require('../src/models');
const sequelize = require('../src/config/database');
const { decrypt } = require('../src/utils/crypto');
const defaults = require('../src/config/defaults');

async function inspectAccounts() {
  try {
    await sequelize.authenticate();
    const accounts = await VobizAccount.findAll({
      include: [{ model: User, as: 'user', attributes: ['email', 'mobile', 'businessName'] }]
    });

    console.log(`Found ${accounts.length} connected VoBiz Accounts:`);
    accounts.forEach((acc, index) => {
      console.log(`\n[${index + 1}] Account ID: ${acc.id}`);
      console.log(`    User: ${acc.user ? acc.user.email : 'None'}`);
      console.log(`    Customer ID / Auth ID: ${acc.customerId}`);
      
      let decryptedKey = 'N/A';
      let decryptedSecret = 'N/A';
      try {
        decryptedKey = defaults.vobiz.encryptCredentials ? decrypt(acc.apiKey) : acc.apiKey;
        decryptedSecret = defaults.vobiz.encryptCredentials ? decrypt(acc.apiSecret) : acc.apiSecret;
      } catch (err) {
        decryptedKey = `Decrypt failed (${acc.apiKey})`;
        decryptedSecret = `Decrypt failed`;
      }
      
      console.log(`    API Key: ${decryptedKey.substring(0, 8)}...`);
      console.log(`    API Secret: ${decryptedSecret.substring(0, 8)}...`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error inspecting:', err);
    process.exit(1);
  }
}

inspectAccounts();
