const { Subscription, Plan, User } = require('../models');
const ResponseBuilder = require('../utils/response');
const { upgradeSubscriptionSchema } = require('../validators/subscription');
const { removeTrialDemoNumber } = require('../services/trialDemoNumberService');

class SubscriptionController {
  /**
   * Get current merchant's subscription
   */
  async getMySubscription(req, res, next) {
    try {
      const subscription = await Subscription.findOne({
        where: { userId: req.user.id },
        include: [{ model: Plan, as: 'plan' }],
      });

      if (!subscription) {
        return ResponseBuilder.error(res, 'Subscription record not found', 404);
      }

      return ResponseBuilder.success(res, subscription, 'Subscription retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Upgrade / Change Subscription Plan (Merchant)
   */
  async upgradeSubscription(req, res, next) {
    try {
      const { error, value } = upgradeSubscriptionSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { planId } = value;

      // Find the new plan
      const targetPlan = await Plan.findByPk(planId);
      if (!targetPlan) {
        return ResponseBuilder.error(res, 'Target subscription plan not found', 404);
      }

      // Find or create subscription for this merchant
      let subscription = await Subscription.findOne({
        where: { userId: req.user.id },
      });

      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setMonth(now.getMonth() + 1); // 30-day billing cycle

      if (!subscription) {
        subscription = await Subscription.create({
          userId: req.user.id,
          planId: targetPlan.id,
          activePlan: targetPlan.name,
          startDate: now,
          expiryDate,
          callsUsed: 0,
          callsRemaining: targetPlan.callLimit,
          status: 'active',
        });
      } else {
        await subscription.update({
          planId: targetPlan.id,
          activePlan: targetPlan.name,
          startDate: now,
          expiryDate,
          callsRemaining: targetPlan.callLimit === -1 ? 999999 : targetPlan.callLimit, // Large value for unlimited
          status: 'active',
        });
      }

      await removeTrialDemoNumber(req.user.id);

      return ResponseBuilder.success(res, subscription, `Successfully subscribed to ${targetPlan.name} plan`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get subscription status for admin dashboard
   */
  async getMerchantSubscription(req, res, next) {
    try {
      const { merchantId } = req.params;
      const subscription = await Subscription.findOne({
        where: { userId: merchantId },
        include: [{ model: Plan, as: 'plan' }],
      });

      if (!subscription) {
        return ResponseBuilder.error(res, 'Subscription not found for this merchant', 404);
      }

      return ResponseBuilder.success(res, subscription, 'Merchant subscription details retrieved');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SubscriptionController();
