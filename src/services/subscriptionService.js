const { Op } = require('sequelize');
const { Subscription, Plan, User, CallReport, sequelize } = require('../models');
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

    // --- 96h Wait Rate Limit / Full KYC Enforcement ---
    const user = await User.findByPk(userId);
    if (user && user.kycStatus !== 'full') {
      const isTrial = subscription.activePlan === 'Starter';
      const hoursSinceStart = (new Date() - new Date(subscription.startDate)) / (1000 * 60 * 60);
      
      const { Setting } = require('../models');
      const rateLimitSetting = await Setting.findOne({ where: { key: 'kyc_rate_limit_calls' } });
      const MAX_PROBATION_CALLS = rateLimitSetting ? parseInt(rateLimitSetting.value, 10) : 15;

      const probationHoursSetting = await Setting.findOne({ where: { key: 'kyc_probation_hours' } });
      const PROBATION_HOURS = probationHoursSetting ? parseInt(probationHoursSetting.value, 10) : 96;

      if (isTrial) {
        // Trial/Starter users are allowed to use their 15 trial calls before full KYC is required
        if (subscription.callsUsed >= MAX_PROBATION_CALLS) {
          return { isValid: false, reason: `You have completed all ${MAX_PROBATION_CALLS} trial calls. Please complete Full KYC and upgrade your plan to continue making calls.` };
        }
      } else {
        // Paid plans without full KYC: 96-hour probationary rule
        if (hoursSinceStart < PROBATION_HOURS) {
          if (subscription.callsUsed >= MAX_PROBATION_CALLS) {
            return { isValid: false, reason: `You have reached the ${PROBATION_HOURS}-hour probationary rate limit (${MAX_PROBATION_CALLS} calls). Please complete Full KYC to unlock full plan limits.` };
          }
        } else {
          // After 96 hours, full block if no KYC on paid plans
          return { isValid: false, reason: `Your ${PROBATION_HOURS}-hour probationary period has ended. Please complete Full KYC to continue making calls.` };
        }
      }
    }
    // --------------------------------------------------

    // Starter plan: Max 15 calls (Starter has callLimit = 15)
    // Validate call quota. (Starter is free, no credits required but Max 15 calls total)
    // Basic/Pro have limits. Unlimited plans might have callLimit = -1
    if (subscription.callsRemaining !== -1 && subscription.callsRemaining <= 0) {
      return { isValid: false, reason: 'Call quota limit reached for the current billing cycle.' };
    }

    if (subscription.minutesRemaining !== -1 && subscription.minutesRemaining <= 0) {
      return { isValid: false, reason: 'Call-minute quota limit reached for the current billing cycle.' };
    }

    return {
      isValid: true,
      maxConcurrent: subscription.plan ? subscription.plan.maxConcurrentCalls : 1,
    };
  }

  /**
   * Deduct one call and the rounded-up duration under a row lock.
   * @param {string} userId
   * @param {number} durationSeconds
   * @param {string} callSessionId
   */
  async recordCallUsage(userId, durationSeconds = 0, callSessionId) {
    await sequelize.transaction(async (transaction) => {
      const report = callSessionId && await CallReport.findOne({
        where: { callSessionId }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (callSessionId && (!report || report.usageRecorded)) return;

      const subscription = await Subscription.findOne({
        where: { userId }, transaction, lock: transaction.LOCK.UPDATE,
      });
      if (!subscription) return;

      subscription.callsUsed = (subscription.callsUsed || 0) + 1;
      if (subscription.callsRemaining > 0) subscription.callsRemaining -= 1;

      // 1-60 seconds uses one minute; 61-120 seconds uses two.
      const minutesConsumed = Math.ceil(Math.max(0, Number(durationSeconds) || 0) / 60);
      subscription.minutesUsed = (subscription.minutesUsed || 0) + minutesConsumed;
      if (subscription.minutesRemaining !== -1 && subscription.minutesRemaining !== null) {
        subscription.minutesRemaining = Math.max(0, subscription.minutesRemaining - minutesConsumed);
      }
      await subscription.save({ transaction });
      if (report) {
        report.usageRecorded = true;
        await report.save({ transaction });
      }
    });
  }
}

module.exports = new SubscriptionService();
