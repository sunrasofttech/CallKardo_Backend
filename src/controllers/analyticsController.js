const { CallReport, Subscription, Campaign, CampaignCustomer, VobizNumber, CallSession, Customer, sequelize } = require('../models');
const ResponseBuilder = require('../utils/response');
const { Op } = require('sequelize');

class AnalyticsController {
  /**
   * Get campaign performance statistics
   */
  async getCampaignStats(req, res, next) {
    try {
      const { campaignId } = req.query;

      const filter = { userId: req.user.id };
      if (campaignId) {
        filter.campaignId = campaignId;
      }

      // Aggregate call counts from CallReport
      const stats = await CallReport.findAll({
        where: filter,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalCalls'],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome IN ('Interested', 'Appointment Booked', 'Sale Closed', 'Callback Requested') THEN 1 ELSE 0 END")
            ),
            'successfulCalls',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome IN ('Wrong Number', 'No Answer') THEN 1 ELSE 0 END")
            ),
            'failedCalls',
          ],
          [sequelize.fn('AVG', sequelize.col('duration')), 'averageDuration'],
        ],
        raw: true,
      });

      // Fetch running/active calls count across campaigns
      let activeCallsCount = 0;
      if (campaignId) {
        const campaign = await Campaign.findOne({ where: { id: campaignId, userId: req.user.id } });
        if (campaign && campaign.status === 'running') {
          activeCallsCount = await CampaignCustomer.count({
            where: { campaignId, callStatus: 'calling' },
          });
        }
      } else {
        const activeCampaigns = await Campaign.findAll({
          where: { userId: req.user.id, status: 'running' },
          attributes: ['id'],
        });
        const campaignIds = activeCampaigns.map((c) => c.id);
        if (campaignIds.length > 0) {
          activeCallsCount = await CampaignCustomer.count({
            where: { campaignId: campaignIds, callStatus: 'calling' },
          });
        }
      }

      const reportStats = stats[0] || {};

      return ResponseBuilder.success(res, {
        totalCalls: parseInt(reportStats.totalCalls || 0, 10),
        completedCalls: parseInt(reportStats.totalCalls || 0, 10) - parseInt(reportStats.failedCalls || 0, 10),
        failedCalls: parseInt(reportStats.failedCalls || 0, 10),
        activeCalls: activeCallsCount,
        averageDurationSeconds: Math.round(parseFloat(reportStats.averageDuration || 0)),
      }, 'Campaign analytics retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get lead and sales indicators
   */
  async getLeadStats(req, res, next) {
    try {
      const { campaignId } = req.query;

      const filter = { userId: req.user.id };
      if (campaignId) {
        filter.campaignId = campaignId;
      }

      // Count outcomes
      const leadIndicators = await CallReport.findAll({
        where: filter,
        attributes: [
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome IN ('Interested', 'Appointment Booked', 'Sale Closed') THEN 1 ELSE 0 END")
            ),
            'interestedLeads',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome = 'Callback Requested' THEN 1 ELSE 0 END")
            ),
            'callbacksRequested',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome = 'Appointment Booked' THEN 1 ELSE 0 END")
            ),
            'appointmentsBooked',
          ],
          [
            sequelize.fn(
              'SUM',
              sequelize.literal("CASE WHEN outcome = 'Sale Closed' THEN 1 ELSE 0 END")
            ),
            'salesClosed',
          ],
        ],
        raw: true,
      });

      const metrics = leadIndicators[0] || {};

      return ResponseBuilder.success(res, {
        interestedLeads: parseInt(metrics.interestedLeads || 0, 10),
        callbacksRequested: parseInt(metrics.callbacksRequested || 0, 10),
        appointmentsBooked: parseInt(metrics.appointmentsBooked || 0, 10),
        salesClosed: parseInt(metrics.salesClosed || 0, 10),
      }, 'Lead analytics retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get merchant plan utilization
   */
  async getPlanUtilization(req, res, next) {
    try {
      const subscription = await Subscription.findOne({
        where: { userId: req.user.id },
      });

      if (!subscription) {
        return ResponseBuilder.error(res, 'No subscription plan configuration found', 404);
      }

      const totalCallsLimit = subscription.callsUsed + subscription.callsRemaining;
      const utilization = totalCallsLimit > 0
        ? Math.round((subscription.callsUsed / totalCallsLimit) * 100)
        : 0;

      return ResponseBuilder.success(res, {
        activePlan: subscription.activePlan,
        callsUsed: subscription.callsUsed,
        callsRemaining: subscription.callsRemaining,
        planExpiry: subscription.expiryDate,
        utilizationPercentage: utilization,
      }, 'Plan utilization analytics retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get dashboard report grouped by Vobiz number, along with aggregate total ("all")
   */
  async getVobizStats(req, res, next) {
    try {
      const userId = req.user.id;
      const { vobizNumberId } = req.query;

      // Date bounds
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayEnd = new Date(todayEnd);
      yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

      const filter = { userId };
      const sessionFilter = { userId, status: ['initiated', 'connected'] };
      if (vobizNumberId) {
        filter.vobizNumberId = vobizNumberId;
        sessionFilter.vobizNumberId = vobizNumberId;
      }

      // 1. Active Calls count
      const activeCalls = await CallSession.count({ where: sessionFilter });

      // 2. Calls Today & Yesterday
      const callsToday = await CallReport.count({
        where: {
          ...filter,
          createdAt: { [Op.between]: [todayStart, todayEnd] },
        },
      });
      const callsYesterday = await CallReport.count({
        where: {
          ...filter,
          createdAt: { [Op.between]: [yesterdayStart, yesterdayEnd] },
        },
      });

      // 3. Connected Today & Yesterday
      const connectedToday = await CallReport.count({
        where: {
          ...filter,
          outcome: { [Op.notIn]: ['Wrong Number', 'No Answer'] },
          createdAt: { [Op.between]: [todayStart, todayEnd] },
        },
      });
      const connectedYesterday = await CallReport.count({
        where: {
          ...filter,
          outcome: { [Op.notIn]: ['Wrong Number', 'No Answer'] },
          createdAt: { [Op.between]: [yesterdayStart, yesterdayEnd] },
        },
      });

      // 4. Meetings Today & Yesterday
      const meetingsToday = await CallReport.count({
        where: {
          ...filter,
          outcome: 'Appointment Booked',
          createdAt: { [Op.between]: [todayStart, todayEnd] },
        },
      });
      const meetingsYesterday = await CallReport.count({
        where: {
          ...filter,
          outcome: 'Appointment Booked',
          createdAt: { [Op.between]: [yesterdayStart, yesterdayEnd] },
        },
      });

      // 5. Success Rate Today & Yesterday
      const successRateToday = callsToday > 0 ? (connectedToday / callsToday) * 100 : 0;
      const successRateYesterday = callsYesterday > 0 ? (connectedYesterday / callsYesterday) * 100 : 0;

      // 6. Contacts Total & Today
      let contacts = 0;
      let contactsToday = 0;
      if (vobizNumberId) {
        contacts = await CallReport.count({
          distinct: true,
          col: 'customer_id',
          where: filter,
        });
        contactsToday = await CallReport.count({
          distinct: true,
          col: 'customer_id',
          where: {
            ...filter,
            createdAt: { [Op.between]: [todayStart, todayEnd] },
          },
        });
      } else {
        contacts = await Customer.count({ where: { userId } });
        contactsToday = await Customer.count({
          where: {
            userId,
            createdAt: { [Op.between]: [todayStart, todayEnd] },
          },
        });
      }

      // 7. Credits Left
      const subscription = await Subscription.findOne({ where: { userId } });
      const creditsLeft = subscription ? subscription.callsRemaining : 0;

      // Trends helper
      const calculateTrend = (todayVal, yesterdayVal) => {
        if (yesterdayVal === 0) {
          return todayVal > 0 ? '+100%' : '0%';
        }
        const pct = ((todayVal - yesterdayVal) / yesterdayVal) * 100;
        const sign = pct >= 0 ? '+' : '';
        return `${sign}${pct.toFixed(1)}%`;
      };

      const callsTodayTrend = calculateTrend(callsToday, callsYesterday);
      const connectedTrend = calculateTrend(connectedToday, connectedYesterday);
      const meetingsTrend = calculateTrend(meetingsToday, meetingsYesterday);
      const successRateTrend = calculateTrend(successRateToday, successRateYesterday);
      const contactsTrend = `+${contactsToday}`;

      // Vobiz Numbers reference list
      const vobizNumbers = await VobizNumber.findAll({
        where: { userId },
        attributes: ['id', 'number'],
        order: [['number', 'ASC']],
      });

      return ResponseBuilder.success(
        res,
        {
          activeCalls,
          callsToday,
          callsTodayTrend,
          connected: connectedToday,
          connectedTrend,
          meetings: meetingsToday,
          meetingsTrend,
          successRate: `${successRateToday.toFixed(1)}%`,
          successRateTrend,
          contacts,
          contactsTrend,
          creditsLeft,
          vobizNumbers,
        },
        'Vobiz dashboard statistics retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AnalyticsController();
