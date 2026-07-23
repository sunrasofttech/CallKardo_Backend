const { Campaign, CampaignCustomer, CustomerList, CustomerListMember, Customer, VobizNumber, Agent, sequelize } = require('../models');
const { Op } = require('sequelize');
const ResponseBuilder = require('../utils/response');
const QueueService = require('../services/queueService');
const SubscriptionService = require('../services/subscriptionService');
const { createCampaignSchema, updateCampaignSchema } = require('../validators/campaign');

const MAX_RETRIES = 3;

class CampaignController {
  /**
   * Get all merchant's campaigns
   */
  async getAll(req, res, next) {
    try {
      const campaigns = await Campaign.findAll({
        where: { userId: req.user.id },
        include: [
          { model: VobizNumber, as: 'vobizNumber' },
          { model: Agent, as: 'agent' },
          { model: CustomerList, as: 'customerList' },
        ],
      });
      return ResponseBuilder.success(res, campaigns, 'Campaigns retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get campaign details by ID
   */
  async getById(req, res, next) {
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, userId: req.user.id },
        include: [
          { model: VobizNumber, as: 'vobizNumber' },
          { model: Agent, as: 'agent' },
          { model: CustomerList, as: 'customerList' },
          { model: CampaignCustomer, as: 'customerMappings', include: ['customer'] },
        ],
      });

      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      return ResponseBuilder.success(res, campaign, 'Campaign details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create Campaign in draft
   */
  async create(req, res, next) {
    try {
      const { error, value } = createCampaignSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { name, vobizNumberId, agentId, customerListId, startTime, intervalBetweenCalls, maxConcurrentCalls } = value;

      // 1. Validate VoBiz number belongs to merchant and is active
      const number = await VobizNumber.findOne({ where: { id: vobizNumberId, userId: req.user.id, status: 'active' } });
      if (!number) {
        return ResponseBuilder.error(res, 'Active VoBiz number not found under your account', 400);
      }

      // 2. Validate agent belongs to merchant (or is preloaded default)
      const agent = await Agent.findByPk(agentId);
      if (!agent || (agent.userId !== req.user.id && agent.isCustom)) {
        return ResponseBuilder.error(res, 'Voice Agent not found or unauthorized', 400);
      }

      // 3. Validate customer list belongs to merchant
      const list = await CustomerList.findOne({ where: { id: customerListId, userId: req.user.id } });
      if (!list) {
        return ResponseBuilder.error(res, 'Customer list not found', 400);
      }

      const campaign = await Campaign.create({
        userId: req.user.id,
        name,
        vobizNumberId,
        agentId,
        customerListId,
        startTime,
        intervalBetweenCalls,
        maxConcurrentCalls,
        status: 'draft',
      });

      return ResponseBuilder.success(res, campaign, 'Campaign created successfully in Draft', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Campaign details (Only allowed in Draft / Scheduled status)
   */
  async update(req, res, next) {
    try {
      const { error, value } = updateCampaignSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
        return ResponseBuilder.error(res, 'Campaign can only be updated while in draft or scheduled state', 400);
      }

      await campaign.update(value);
      return ResponseBuilder.success(res, campaign, 'Campaign details updated');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Start / Activate Campaign
   */
  async start(req, res, next) {
    const transaction = await sequelize.transaction();
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, userId: req.user.id },
        transaction,
      });

      if (!campaign) {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (!['draft', 'scheduled', 'stopped', 'failed'].includes(campaign.status)) {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Only draft, scheduled, stopped, or failed campaigns can be started', 400);
      }

      // 1. Validate subscription limits
      const limitCheck = await SubscriptionService.validateCallLimits(req.user.id);
      if (!limitCheck.isValid) {
        await transaction.rollback();
        return ResponseBuilder.error(res, `Failed to start campaign: ${limitCheck.reason}`, 403);
      }

      const startTime = new Date(campaign.startTime);
      const isImmediate = startTime <= new Date();

      if (isImmediate) {
        // Start running immediately
        campaign.status = 'running';
        await campaign.save({ transaction });

        // Fetch customers from list count
        const memberCount = await CustomerListMember.count({
          where: { customerListId: campaign.customerListId },
          transaction,
        });

        if (memberCount === 0) {
          await transaction.rollback();
          return ResponseBuilder.error(res, 'Target customer list is empty. Cannot start campaign.', 400);
        }

        // Link customers atomically via MySQL INSERT ... SELECT to prevent OOM
        await sequelize.query(
          `INSERT IGNORE INTO campaign_customers (id, campaign_id, customer_id, call_status, retry_count, created_at, updated_at)
           SELECT UUID(), :campaignId, customer_id, 'pending', 0, NOW(), NOW()
           FROM customer_list_members
           WHERE customer_list_id = :customerListId`,
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

        return ResponseBuilder.success(res, campaign, 'Campaign started immediately');
      } else {
        // Schedule start via Redis Sorted Set
        campaign.status = 'scheduled';
        await campaign.save({ transaction });

        await QueueService.scheduleJob(
          'START_CAMPAIGN',
          {
            campaignId: campaign.id,
            userId: req.user.id,
          },
          startTime.getTime()
        );

        await transaction.commit();

        return ResponseBuilder.success(res, campaign, `Campaign scheduled to start at ${campaign.startTime}`);
      }
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      next(err);
    }
  }

  /**
   * Pause Campaign
   */
  async pause(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'running') {
        return ResponseBuilder.error(res, 'Only running campaigns can be paused', 400);
      }

      campaign.status = 'paused';
      await campaign.save();

      return ResponseBuilder.success(res, campaign, 'Campaign paused successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Resume Campaign
   */
  async resume(req, res, next) {
    const transaction = await sequelize.transaction();
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, userId: req.user.id },
        transaction,
      });
      if (!campaign) {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'paused') {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Only paused campaigns can be resumed', 400);
      }

      // Validate limits again
      const limitCheck = await SubscriptionService.validateCallLimits(req.user.id);
      if (!limitCheck.isValid) {
        await transaction.rollback();
        return ResponseBuilder.error(res, `Failed to resume campaign: ${limitCheck.reason}`, 403);
      }

      campaign.status = 'running';
      await campaign.save({ transaction });

       // Resuming campaign; lazy-loader dispatcher loop will pick up call jobs dynamically.
       await transaction.commit();

       return ResponseBuilder.success(res, campaign, 'Campaign resumed successfully.');
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      next(err);
    }
  }

  /**
   * Stop Campaign
   */
  async stop(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'running' && campaign.status !== 'paused') {
        return ResponseBuilder.error(res, 'Campaign is not currently running or paused', 400);
      }

      campaign.status = 'stopped';
      await campaign.save();

      // Clear concurrency key in Redis
      await QueueService.clearActiveCalls(campaign.id);

      return ResponseBuilder.success(res, campaign, 'Campaign stopped successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retry Failed Calls in Campaign
   */
  async retryFailedCalls(req, res, next) {
    const transaction = await sequelize.transaction();
    try {
      const campaign = await Campaign.findOne({
        where: { id: req.params.id, userId: req.user.id },
        transaction,
      });
      if (!campaign) {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      if (campaign.status !== 'completed' && campaign.status !== 'failed' && campaign.status !== 'stopped') {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'Campaign must be completed, stopped, or failed to retry calls', 400);
      }

      // Check limits
      const limitCheck = await SubscriptionService.validateCallLimits(req.user.id);
      if (!limitCheck.isValid) {
        await transaction.rollback();
        return ResponseBuilder.error(res, `Failed to retry calls: ${limitCheck.reason}`, 403);
      }

      // Count failed calls under the limit
      const failedCount = await CampaignCustomer.count({
        where: {
          campaignId: campaign.id,
          callStatus: 'failed',
          retryCount: {
            [Op.lt]: MAX_RETRIES
          }
        },
        transaction,
      });

      if (failedCount === 0) {
        await transaction.rollback();
        return ResponseBuilder.error(res, 'No failed calls under the retry limit found to retry', 400);
      }

      // Reset failed mappings to pending atomically
      await CampaignCustomer.update(
        { callStatus: 'pending' },
        {
          where: {
            campaignId: campaign.id,
            callStatus: 'failed',
            retryCount: {
              [Op.lt]: MAX_RETRIES
            }
          },
          transaction,
        }
      );

      // Set campaign to running again
      campaign.status = 'running';
      await campaign.save({ transaction });

      await transaction.commit();

      return ResponseBuilder.success(res, campaign, `Retrying ${failedCount} failed calls`);
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      next(err);
    }
  }

  /**
   * Delete Campaign (Soft delete)
   */
  async delete(req, res, next) {
    try {
      const campaign = await Campaign.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!campaign) {
        return ResponseBuilder.error(res, 'Campaign not found', 404);
      }

      await campaign.destroy();
      return ResponseBuilder.success(res, null, 'Campaign deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CampaignController();
