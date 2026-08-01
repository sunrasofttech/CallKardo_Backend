const { Op } = require('sequelize');
const { Subscription, Plan, User } = require('../models');
const { removeTrialDemoNumber } = require('./trialDemoNumberService');

const NotificationService = require('./notificationService');

class SubscriptionService {
  async expireDueSubscriptions() {
    const now = new Date();
    
    // 1. Handle actually expired subscriptions
    const expiredSubscriptions = await Subscription.findAll({
      where: {
        status: 'active',
        expiryDate: { [Op.lt]: now },
      },
    });

    for (const subscription of expiredSubscriptions) {
      subscription.status = 'expired';
      await subscription.save();
      await removeTrialDemoNumber(subscription.userId);

      await NotificationService.notifyMerchant(subscription.userId, 'Plan Expired', `Your subscription plan has expired. Please upgrade to continue making calls.`, 'payments');
      await NotificationService.notifyAdmin('Plan Expired', `Merchant (User ID: ${subscription.userId})'s subscription plan has expired.`, null, 'payments');
    }

    // 2. Handle subscriptions expiring in 3 days (notified only once)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const expiringSubscriptions = await Subscription.findAll({
      where: {
        status: 'active',
        isExpiringNotified: false,
        expiryDate: { 
          [Op.not]: null,
          [Op.lte]: threeDaysFromNow 
        },
      },
    });

    for (const sub of expiringSubscriptions) {
      sub.isExpiringNotified = true;
      await sub.save();

      await NotificationService.notifyMerchant(sub.userId, 'Plan Expiring Soon', `Your subscription plan is expiring within 3 days. Please upgrade to avoid service interruption.`, 'payments');
      await NotificationService.notifyAdmin('Plan Expiring Soon', `Merchant (User ID: ${sub.userId})'s subscription plan is expiring within 3 days.`, null, 'payments');
    }

    return expiredSubscriptions.length;
  }

  /**
   * Validates if a merchant user has active call credits and is within plan expiration limits
   * @param {string} userId - The Merchant User UUID
   * @returns {Promise<{ isValid: boolean, reason?: string, maxConcurrent?: number }>}
   */
  async validateCallLimits(userId) {
    const subscription = await Subscription.findOne({
      where: { userId },
      include: [{ model: Plan, as: 'plan' }],
    });

    if (!subscription) {
      return { isValid: false, reason: 'No active subscription plan found.' };
    }

    if (subscription.status !== 'active') {
      return { isValid: false, reason: `Subscription is currently: ${subscription.status}` };
    }

    // Check plan expiration
    if (subscription.expiryDate && new Date(subscription.expiryDate) < new Date()) {
      // Mark as expired in DB
      subscription.status = 'expired';
      await subscription.save();
      await removeTrialDemoNumber(userId);
      return { isValid: false, reason: 'Subscription plan has expired.' };
    }

    // --- 48h Wait Rate Limit / Full KYC Enforcement ---
    const user = await User.findByPk(userId);
    if (user && user.kycStatus !== 'full') {
      const hoursSinceStart = (new Date() - new Date(subscription.startDate)) / (1000 * 60 * 60);
      
      const { Setting } = require('../models');
      const rateLimitSetting = await Setting.findOne({ where: { key: 'kyc_rate_limit_calls' } });
      const MAX_PROBATION_CALLS = rateLimitSetting ? parseInt(rateLimitSetting.value, 10) : 10;

      if (hoursSinceStart < 48) {
        if (subscription.callsUsed >= MAX_PROBATION_CALLS) {
          return { isValid: false, reason: `You have reached the 48-hour probationary rate limit (${MAX_PROBATION_CALLS} calls). Please complete Full KYC to unlock full plan limits.` };
        }
      } else {
        // After 48 hours, full block if no KYC
        return { isValid: false, reason: 'Your 48-hour probationary period has ended. Please complete Full KYC to continue making calls.' };
      }
    }
    // --------------------------------------------------

    // Starter plan: Max 5 calls, but wait, Starter has callLimit = 5
    // Validate call quota. (Starter is free, no credits required but Max 5 calls total)
    // Basic/Pro have limits. Unlimited plans might have callLimit = -1
    const callLimit = subscription.plan ? subscription.plan.callLimit : -1;
    
    if (callLimit !== -1 && subscription.callsRemaining <= 0) {
      return { isValid: false, reason: 'Call quota limit reached for the current billing cycle.' };
    }

    return {
      isValid: true,
      maxConcurrent: subscription.plan ? subscription.plan.maxConcurrentCalls : 1,
    };
  }

  /**
   * Deduct 1 call credit and record usage
   * @param {string} userId 
   */
  async recordCallUsage(userId) {
    const subscription = await Subscription.findOne({ where: { userId } });
    if (!subscription) return;

    subscription.callsUsed += 1;
    if (subscription.callsRemaining > 0) {
      subscription.callsRemaining -= 1;
    }
    await subscription.save();
  }
}

module.exports = new SubscriptionService();
