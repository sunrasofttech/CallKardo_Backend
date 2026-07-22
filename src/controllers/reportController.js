const { CallReport, Customer, Campaign, VobizNumber, CallSession } = require('../models');
const ResponseBuilder = require('../utils/response');

class ReportController {
  /**
   * Get all reports for current merchant
   */
  async getAllReports(req, res, next) {
    try {
      const { campaignId, outcome, sentiment } = req.query;

      const filter = { userId: req.user.id };
      if (campaignId) filter.campaignId = campaignId;
      if (outcome) filter.outcome = outcome;
      if (sentiment) filter.sentiment = sentiment;

      const reports = await CallReport.findAll({
        where: filter,
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile'] },
          { model: Campaign, as: 'campaign', attributes: ['name'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
        ],
        order: [['createdAt', 'DESC']],
      });

      return ResponseBuilder.success(res, reports, 'Call reports retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get recent call sessions for current merchant
   */
  async getRecentCalls(req, res, next) {
    try {
      const { vobizNumberId, limit } = req.query;
      const limitVal = parseInt(limit || 10, 10);

      const filter = { userId: req.user.id };
      if (vobizNumberId) {
        filter.vobizNumberId = vobizNumberId;
      }

      const sessions = await CallSession.findAll({
        where: filter,
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile'] }
        ],
        order: [['createdAt', 'DESC']],
        limit: limitVal,
      });

      const recentCalls = sessions.map(session => {
        let duration = null;
        if (session.startTime && session.endTime) {
          const diffMs = new Date(session.endTime) - new Date(session.startTime);
          const durationSecs = Math.max(0, Math.round(diffMs / 1000));
          const mins = Math.floor(durationSecs / 60);
          const secs = durationSecs % 60;
          duration = `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        // Map status humanly:
        // Picked: completed, connected
        // Missed: no-answer
        // Declined: busy
        // Failed: failed
        let mappedStatus = 'Missed';
        if (session.status === 'completed' || session.status === 'connected') {
          mappedStatus = 'Picked';
        } else if (session.status === 'busy') {
          mappedStatus = 'Declined';
        } else if (session.status === 'failed') {
          mappedStatus = 'Failed';
        }

        return {
          id: session.id,
          customerName: session.customer ? session.customer.name : 'Unknown',
          mobile: session.customer ? session.customer.mobile : 'Unknown',
          status: mappedStatus,
          duration,
          createdAt: session.createdAt,
        };
      });

      return ResponseBuilder.success(res, recentCalls, 'Recent calls retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get call report details by session ID
   */
  async getReportBySession(req, res, next) {
    try {
      const report = await CallReport.findOne({
        where: { callSessionId: req.params.sessionId, userId: req.user.id },
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile', 'tags', 'notes'] },
          { model: Campaign, as: 'campaign', attributes: ['name', 'startTime'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
        ],
      });

      if (!report) {
        return ResponseBuilder.error(res, 'Call report not found', 404);
      }

      return ResponseBuilder.success(res, report, 'Call report details retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all call reports for a specific customer mobile number
   */
  async getReportsByMobile(req, res, next) {
    try {
      const { mobile } = req.params;

      if (!mobile) {
        return ResponseBuilder.error(res, 'Mobile number is required', 400);
      }

      const { Op } = require('sequelize');
      const digitsOnly = mobile.replace(/[^0-9]/g, '');
      const searchPattern = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

      const isAdminUser = req.user.role === 'admin';
      const userCondition = isAdminUser ? {} : { userId: req.user.id };

      // Find all matching customer IDs
      const customers = await Customer.findAll({
        where: {
          [Op.and]: [
            userCondition,
            {
              [Op.or]: [
                { mobile },
                { mobile: { [Op.like]: `%${searchPattern}%` } }
              ]
            }
          ]
        }
      });

      const customerIds = customers.map(c => c.id);

      if (customerIds.length === 0) {
        return ResponseBuilder.success(res, [], 'No reports found for this mobile number');
      }

      let reports = await CallReport.findAll({
        where: {
          ...userCondition,
          customerId: { [Op.in]: customerIds }
        },
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile', 'tags', 'notes'] },
          { model: Campaign, as: 'campaign', attributes: ['name', 'startTime'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
        ],
        order: [['createdAt', 'DESC']],
      });

      // Fallback to CallSessions if no CallReport entries exist yet
      if (reports.length === 0) {
        const sessions = await CallSession.findAll({
          where: {
            ...userCondition,
            customerId: { [Op.in]: customerIds }
          },
          include: [
            { model: Customer, as: 'customer', attributes: ['name', 'mobile', 'tags', 'notes'] },
            { model: Campaign, as: 'campaign', attributes: ['name', 'startTime'] },
            { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
          ],
          order: [['createdAt', 'DESC']],
        });

        reports = sessions.map(s => ({
          id: s.id,
          userId: s.userId,
          callSessionId: s.id,
          customerId: s.customerId,
          campaignId: s.campaignId,
          transcript: [],
          summary: `Call ${s.direction} (${s.status})`,
          sentiment: 'neutral',
          outcome: s.status === 'completed' ? 'connected' : (s.status === 'busy' ? 'busy' : 'failed'),
          callDurationSeconds: (s.startTime && s.endTime) ? Math.round((new Date(s.endTime) - new Date(s.startTime)) / 1000) : 0,
          customer: s.customer,
          campaign: s.campaign,
          vobizNumber: s.vobizNumber,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        }));
      }

      return ResponseBuilder.success(res, reports, 'Call reports retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReportController();
