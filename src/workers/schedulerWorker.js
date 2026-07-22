process.env.TZ = 'Asia/Kolkata';

const QueueService = require('../services/queueService');
const { Campaign, CustomerListMember, CampaignCustomer, sequelize } = require('../models');
const { redisClient } = require('../config/redis');
const SubscriptionService = require('../services/subscriptionService');
const { Op } = require('sequelize');

let lastSubscriptionExpiryCheck = 0;

async function startScheduler() {
  console.log('Scheduler Worker started.');

  // Infinite poll loop
  while (true) {
    try {
      const now = Date.now();

      if (now - lastSubscriptionExpiryCheck >= 60 * 1000) {
        await SubscriptionService.expireDueSubscriptions();
        lastSubscriptionExpiryCheck = now;
      }

      const readyJobs = await QueueService.fetchReadyScheduledJobs(now);

      for (const job of readyJobs) {
        console.log(`Processing scheduled job: ${job.type}`);
        
        if (job.type === 'START_CAMPAIGN') {
          await handleStartCampaign(job.payload);
        } else if (job.type === 'PLACE_CALL') {
          // Move to FIFO execution queue
          await QueueService.enqueueJob('PLACE_CALL', job.payload);
          console.log(`Moved call placement job to call_queue for Customer: ${job.payload.customerId}`);
        }
      }

      // Periodically scan and dispatch calls for running campaigns dynamically
      await dispatchRunningCampaigns();
    } catch (error) {
      console.error('Error in Scheduler Worker polling loop:', error);
    }
    
    // Sleep 1 second before next poll
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

/**
 * Periodically dispatches call jobs for running campaigns based on limits and pacing
 */
async function dispatchRunningCampaigns() {
  try {
    const campaigns = await Campaign.findAll({
      where: { status: 'running' }
    });

    for (const campaign of campaigns) {
      const activeCalls = await QueueService.getActiveCalls(campaign.id);
      
      // Enforce campaign-level limits
      if (activeCalls >= campaign.maxConcurrentCalls) {
        continue;
      }

      // Check user/plan subscription limits
      let limitCheck;
      try {
        limitCheck = await SubscriptionService.validateCallLimits(campaign.userId);
      } catch (err) {
        console.error(`Error validating call limits for user ${campaign.userId}:`, err);
        continue;
      }

      if (!limitCheck.isValid) {
        console.log(`User ${campaign.userId} subscription limits exceeded. Failing campaign ${campaign.id}`);
        const transaction = await sequelize.transaction();
        try {
          campaign.status = 'failed';
          await campaign.save({ transaction });
          await CampaignCustomer.update(
            { callStatus: 'failed' },
            { where: { campaignId: campaign.id, callStatus: 'pending' }, transaction }
          );
          await transaction.commit();
        } catch (trxErr) {
          await transaction.rollback();
          console.error(`Failed to transition campaign ${campaign.id} to failed:`, trxErr);
        }
        continue;
      }

      // Enforce plan-level concurrent call limits
      let maxCallsToDispatch = campaign.maxConcurrentCalls - activeCalls;
      if (limitCheck.maxConcurrent !== undefined && limitCheck.maxConcurrent !== null) {
        const userCampaigns = await Campaign.findAll({
          where: { userId: campaign.userId, status: 'running' }
        });
        let totalUserActiveCalls = 0;
        for (const uc of userCampaigns) {
          totalUserActiveCalls += await QueueService.getActiveCalls(uc.id);
        }
        const remainingPlanSlots = limitCheck.maxConcurrent - totalUserActiveCalls;
        if (remainingPlanSlots <= 0) {
          continue; // plan limit fully saturated
        }
        maxCallsToDispatch = Math.min(maxCallsToDispatch, remainingPlanSlots);
      }

      // Enforce interval spacing (intervalBetweenCalls)
      const spacingMs = (campaign.intervalBetweenCalls || 5) * 1000;
      const lastDispatchKey = `campaign:last_dispatch:${campaign.id}`;
      const lastDispatchVal = await redisClient.get(lastDispatchKey);
      const now = Date.now();

      if (spacingMs > 0 && lastDispatchVal) {
        const elapsed = now - parseInt(lastDispatchVal, 10);
        if (elapsed < spacingMs) {
          continue; // Pacing interval has not elapsed
        }
      }

      // If pacing interval is set, we only dispatch 1 call per tick to space them out
      const limitToFetch = spacingMs > 0 ? 1 : maxCallsToDispatch;

      // Fetch pending customers
      const pending = await CampaignCustomer.findAll({
        where: { campaignId: campaign.id, callStatus: 'pending' },
        limit: limitToFetch,
        order: [['createdAt', 'ASC']]
      });

      if (pending.length === 0) {
        // Double check if there are no pending calls AND active calls is 0
        // (If so, campaign should be marked completed)
        if (activeCalls === 0) {
          campaign.status = 'completed';
          await campaign.save();
          console.log(`Campaign ${campaign.name} (${campaign.id}) finished. Marked Completed.`);
        }
        continue;
      }

      for (const p of pending) {
        // Enqueue the placement job
        await QueueService.enqueueJob('PLACE_CALL', {
          campaignId: campaign.id,
          customerId: p.customerId,
          userId: campaign.userId
        });
      }

      // Update last dispatch timestamp in Redis if we actually dispatched anything
      if (pending.length > 0) {
        await redisClient.set(lastDispatchKey, String(now));
      }
    }
  } catch (err) {
    console.error('Error in dispatchRunningCampaigns loop:', err);
  }
}

/**
 * Loads customer list details and links them atomically in DB
 */
async function handleStartCampaign(payload) {
  const { campaignId, userId } = payload;
  const transaction = await sequelize.transaction();

  try {
    const campaign = await Campaign.findByPk(campaignId, { transaction });
    if (!campaign) {
      console.log(`Campaign ${campaignId} not found. Skipping.`);
      await transaction.rollback();
      return;
    }

    if (campaign.status !== 'scheduled' && campaign.status !== 'draft') {
      console.log(`Campaign ${campaignId} status is: ${campaign.status}. Skipping.`);
      await transaction.rollback();
      return;
    }

    // Set status to running
    campaign.status = 'running';
    await campaign.save({ transaction });

    // Fetch members count
    const memberCount = await CustomerListMember.count({
      where: { customerListId: campaign.customerListId },
      transaction,
    });

    if (memberCount === 0) {
      console.warn(`Campaign ${campaignId} targets an empty customer list. Completing.`);
      campaign.status = 'completed';
      await campaign.save({ transaction });
      await transaction.commit();
      return;
    }

    // Link customers atomically via MySQL INSERT ... SELECT
    await sequelize.query(
      `INSERT IGNORE INTO campaign_customers (id, campaign_id, customer_id, call_status, retry_count, created_at, updated_at)
       SELECT UUID(), :campaignId, customer_id, 'pending', 0, NOW(), NOW()
       FROM customer_list_members
       WHERE customer_list_id = :customerListId AND deleted_at IS NULL`,
      {
        replacements: {
          campaignId: campaign.id,
          customerListId: campaign.customerListId
        },
        type: sequelize.QueryTypes.INSERT,
        transaction
      }
    );

    await transaction.commit();
    console.log(`Successfully started Campaign: ${campaign.name}. Link count: ${memberCount}`);

  } catch (err) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error(`Failed to handle START_CAMPAIGN for ${campaignId}:`, err);
  }
}

// Start processing if executed directly
if (require.main === module) {
  startScheduler();
}

module.exports = {
  startScheduler,
};
