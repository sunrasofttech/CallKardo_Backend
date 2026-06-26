require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const axios = require('axios');
const { decrypt } = require('../src/utils/crypto');
const defaults = require('../src/config/defaults');

// Connect to live DB
const sequelize = new Sequelize('callkardo_db', 'callkardo_user', 'Callkardo@2026', {
  host: '168.144.144.219',
  port: 3306,
  dialect: 'mysql',
  logging: false,
});

async function run() {
  try {
    console.log('Connecting to remote live database (168.144.144.219)...');
    await sequelize.authenticate();
    console.log('Database connected.');

    // Define models
    const VobizAccount = sequelize.define('VobizAccount', {
      id: { type: DataTypes.UUID, primaryKey: true },
      userId: { type: DataTypes.UUID, field: 'user_id' },
      customerId: { type: DataTypes.STRING, field: 'customer_id' },
      apiKey: { type: DataTypes.STRING, field: 'api_key' },
      apiSecret: { type: DataTypes.STRING, field: 'api_secret' },
    }, { tableName: 'vobiz_accounts', timestamps: false });

    // Target User ID for +918071583805
    const targetUserId = '7589ace5-8f8a-4e4e-b86b-17f09290a54e';
    const targetNumber = '+918071583805';

    console.log(`Fetching VoBiz account for User: ${targetUserId}...`);
    const account = await VobizAccount.findOne({ where: { userId: targetUserId } });
    if (!account) {
      console.error('No VoBiz account found in live DB for this user!');
      process.exit(1);
    }

    console.log('Decrypting credentials...');
    const decryptedApiKey = decrypt(account.apiKey);
    const decryptedApiSecret = decrypt(account.apiSecret);

    const authId = decryptedApiKey;
    const authToken = decryptedApiSecret;

    console.log(`Decrypted Auth ID: ${authId}`);
    
    // Create axios client for VoBiz API
    const client = axios.create({
      baseURL: 'https://api.vobiz.ai/api/v1',
      headers: {
        'X-Auth-ID': authId,
        'X-Auth-Token': authToken,
        'Content-Type': 'application/json'
      }
    });

    // 1. Create or Find Application
    const appName = 'AILIVE_INBOUND';
    
    // Resolve host dynamically
    const host = defaults.ws.host;
    const answerUrl = `https://${host}/api/v1/vobiz/answer`;
    
    console.log(`Checking applications for name "${appName}"...`);
    
    let appId = null;
    let apps = [];
    try {
      const listResponse = await client.get(`/Account/${authId}/Application/`);
      apps = listResponse.data?.objects || listResponse.data || [];
    } catch (listErr) {
      console.log(`List via /Application/ failed: ${listErr.response ? JSON.stringify(listErr.response.data) : listErr.message}`);
    }

    if (Array.isArray(apps)) {
      const existingApp = apps.find(app => app.app_name === appName || app.name === appName);
      if (existingApp) {
        appId = existingApp.app_id || existingApp.id;
        console.log(`Found existing Application "AILIVE_INBOUND" with ID: ${appId}`);
      }
    }

    if (!appId) {
      console.log(`Creating Application "${appName}" with answerUrl: ${answerUrl}...`);
      let createAppResponse;
      try {
        createAppResponse = await client.post(`/Account/${authId}/Application/`, {
          name: appName,
          app_name: appName,
          answer_url: answerUrl,
          answer_method: 'POST'
        });
      } catch (createErr) {
        console.log(`Create via /Application/ failed: ${createErr.response ? JSON.stringify(createErr.response.data) : createErr.message}`);
        
        console.log('Trying fallback route /applications/ ...');
        try {
          createAppResponse = await client.post(`/Account/${authId}/applications/`, {
            name: appName,
            app_name: appName,
            answer_url: answerUrl,
            answer_method: 'POST'
          });
        } catch (createErr2) {
          console.error(`Create via /applications/ failed: ${createErr2.response ? JSON.stringify(createErr2.response.data) : createErr2.message}`);
          throw createErr; // throw original
        }
      }
      
      appId = createAppResponse.data?.app_id || createAppResponse.data?.id;
      if (!appId) {
        throw new Error('Application creation failed, did not return app_id or id');
      }
      console.log(`Created Application "AILIVE_INBOUND" with ID: ${appId}`);
    }

    // 2. Link number to Application
    console.log(`Linking number ${targetNumber} to Application ${appId}...`);
    let linkResponse;
    try {
      linkResponse = await client.post(`/Account/${authId}/Number/${encodeURIComponent(targetNumber)}/`, {
        app_id: appId
      });
    } catch (err1) {
      console.log(`Link via /Number/ failed (${err1.response ? JSON.stringify(err1.response.data) : err1.message}), trying /numbers/`);
      try {
        linkResponse = await client.post(`/Account/${authId}/numbers/${encodeURIComponent(targetNumber)}/`, {
          app_id: appId
        });
      } catch (err2) {
        console.log(`Link via /numbers/ failed (${err2.response ? JSON.stringify(err2.response.data) : err2.message}), trying sub-resource assign`);
        linkResponse = await client.post(`/Account/${authId}/Application/${appId}/`, {
          numbers: [targetNumber]
        });
      }
    }

    console.log('[SUCCESS] Inbound routing setup complete for live number +918071583805.');
    console.log('Response data:', linkResponse ? linkResponse.data : 'No response');

  } catch (err) {
    console.error('[FAILED] Link live number failed:', err.response ? err.response.data : err.message);
  }
  process.exit(0);
}

run();
