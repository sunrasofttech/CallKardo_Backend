process.env.TZ = 'Asia/Kolkata';

const crypto = require('crypto');
const { duplicateClient } = require('../config/redis');
const QueueService = require('../services/queueService');
const SubscriptionService = require('../services/subscriptionService');
const VobizService = require('../services/vobizService');
const { Campaign, CampaignCustomer, CallSession, CallLog, VobizNumber, VobizAccount, User, Agent } = require('../models');
const { decrypt } = require('../utils/crypto');

async function startCallWorker() {
  console.log('Call Worker started.');
  
  // Create duplicate redis client for blocking BLPOP command
  const client = await duplicateClient();
  
  const CALL_QUEUE = 'call_queue';

  while (true) {
    try {
      // BLPOP returns: [keyName, elementValue]
      // Wait up to 30 seconds for a job
      const jobData = await client.blPop(CALL_QUEUE, 30);
      
      if (!jobData) {
        continue; // Timeout, loop again
      }

      const parsed = JSON.parse(jobData.element);
      console.log(`Processing call job for Customer: ${parsed.payload.customerId}`);

      if (parsed.type === 'PLACE_CALL') {
        await processPlaceCall(parsed.payload);
      }

    } catch (error) {
      console.error('Error in Call Worker execution:', error);
    }
  }
}

/**
 * Validates, checks concurrency, creates CallSession, and dials VoBiz
 */
async function processPlaceCall(payload) {
  const { campaignId, customerId, userId } = payload;

  try {
    // 1. Fetch Campaign and verify if still active
    const campaign = await Campaign.findByPk(campaignId);
    if (!campaign) {
      console.log(`Campaign ${campaignId} deleted. Discarding call job.`);
      return;
    }

    if (campaign.status === 'paused') {
      // Re-schedule in Redis sorted set with 5-second delay to try again once resumed
      console.log(`Campaign ${campaign.name} is paused. Re-scheduling call job.`);
      await QueueService.scheduleJob('PLACE_CALL', payload, Date.now() + 5000);
      return;
    }

    if (campaign.status !== 'running') {
      console.log(`Campaign ${campaign.name} status is ${campaign.status}. Discarding call job.`);
      return;
    }

    // 2. Validate Subscription Call Limits
    const limitCheck = await SubscriptionService.validateCallLimits(userId);
    if (!limitCheck.isValid) {
      console.log(`Merchant ${userId} subscription limits exceeded: ${limitCheck.reason}. Failing campaign.`);
      campaign.status = 'failed';
      await campaign.save();
      
      // Update pending customers to failed
      await CampaignCustomer.update(
        { callStatus: 'failed' },
        { where: { campaignId: campaign.id, callStatus: 'pending' } }
      );
      return;
    }

    // 3. Concurrency Control
    const activeCalls = await QueueService.getActiveCalls(campaignId);
    if (activeCalls >= campaign.maxConcurrentCalls) {
      // Re-schedule with 5-second delay
      console.log(`Campaign ${campaign.name} concurrency limit saturated (${activeCalls}/${campaign.maxConcurrentCalls}). Re-scheduling call job.`);
      await QueueService.scheduleJob('PLACE_CALL', payload, Date.now() + 5000);
      return;
    }

    // Check plan-level concurrency limits
    if (limitCheck.maxConcurrent !== undefined && limitCheck.maxConcurrent !== null) {
      const userCampaigns = await Campaign.findAll({
        where: { userId, status: 'running' }
      });
      let totalUserActiveCalls = 0;
      for (const uc of userCampaigns) {
        totalUserActiveCalls += await QueueService.getActiveCalls(uc.id);
      }

      if (totalUserActiveCalls >= limitCheck.maxConcurrent) {
        console.log(`Merchant ${userId} plan concurrency limit saturated (${totalUserActiveCalls}/${limitCheck.maxConcurrent}). Re-scheduling call job.`);
        await QueueService.scheduleJob('PLACE_CALL', payload, Date.now() + 5000);
        return;
      }
    }

    // 4. Check if already called/calling this customer to avoid race conditions
    const customerMapping = await CampaignCustomer.findOne({
      where: { campaignId, customerId },
      include: ['customer']
    });

    if (!customerMapping || customerMapping.callStatus !== 'pending') {
      console.log(`Customer ${customerId} is already processed or being processed. Skipping.`);
      return;
    }

    const customer = customerMapping.customer;
    if (!customer) {
      console.log(`Customer details not found for ${customerId}. Skipping.`);
      return;
    }

    // Atomic DB Lock
    const [updatedCount] = await CampaignCustomer.update(
      { callStatus: 'calling', lastCallTime: new Date() },
      {
        where: {
          campaignId,
          customerId,
          callStatus: 'pending'
        }
      }
    );

    if (updatedCount === 0) {
      console.log(`Customer ${customerId} was locked by another worker. Skipping.`);
      return;
    }

    // 5. Connect and Dial
    // Get Merchant VoBiz account credentials and VoBiz Number
    const vobizAccount = await VobizAccount.findOne({ where: { userId } });
    const vobizNumber = await VobizNumber.findByPk(campaign.vobizNumberId);

    if (!vobizAccount || !vobizNumber) {
      console.log(`Missing VoBiz configuration for merchant ${userId}. Failing this call.`);
      await CampaignCustomer.update(
        { callStatus: 'failed' },
        { where: { campaignId, customerId } }
      );
      return;
    }

    // Create session token and db call record
    const wsToken = crypto.randomBytes(32).toString('hex');
    
    const session = await CallSession.create({
      userId,
      campaignId,
      agentId: campaign.agentId,
      vobizNumberId: campaign.vobizNumberId,
      customerId,
      wsSessionToken: wsToken,
      status: 'initiated',
      direction: 'outbound',
    });

    // Register active call in ZSET
    await QueueService.registerActiveCall(campaignId, session.id);

    await CallLog.create({
      callSessionId: session.id,
      logLevel: 'info',
      message: `Call job dispatched. Outbound dial initiated to ${customer.mobile}`,
    });

    // Decrypt credentials with fallback
    let decryptedApiKey, decryptedApiSecret;
    try {
      decryptedApiKey = decrypt(vobizAccount.apiKey);
      decryptedApiSecret = decrypt(vobizAccount.apiSecret);
    } catch (err) {
      decryptedApiKey = vobizAccount.apiKey;
      decryptedApiSecret = vobizAccount.apiSecret;
    }

    console.log(`[Campaign Call Start] Dialing customer ${customer.mobile} (Name: ${customer.name}) for Campaign "${campaign.name}"...`);

    // Invoke VoBiz Outbound dialing API
    const dialResponse = await VobizService.initiateCall({
      apiKey: decryptedApiKey,
      apiSecret: decryptedApiSecret,
      fromNumber: vobizNumber.number,
      toNumber: customer.mobile,
      wsToken,
    });

    if (!dialResponse.success) {
      console.error(`[Campaign Call Failed] VoBiz dial failed for customer ${customer.mobile}:`, dialResponse.error);
      
      // Dial failed instantly: clean up session
      session.status = 'failed';
      session.endTime = new Date();
      await session.save();

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'error',
        message: `VoBiz outbound dial trigger failed: ${dialResponse.error}`,
      });

      await CampaignCustomer.update(
        { callStatus: 'failed' },
        { where: { campaignId, customerId } }
      );

      // Deregister active call
      await QueueService.deregisterActiveCall(campaignId, session.id);
    } else {
      console.log(`[Campaign Call Dispatched] Outbound call successfully placed. Call ID: ${dialResponse.callId}`);
      // Store the VoBiz call UUID on the session so we can hang it up later via REST API
      if (dialResponse.callId) {
        try {
          session.vobizCallUuid = dialResponse.callId;
          await session.save();
        } catch (saveErr) {
          console.warn(`[Campaign Call] Failed to save vobizCallUuid on session: ${saveErr.message}`);
        }
      }
    }

  } catch (err) {
    console.error(`Error processing call job for Customer ${customerId}:`, err);
  }
}

if (require.main === module) {
  startCallWorker();
}

module.exports = {
  startCallWorker,
};
