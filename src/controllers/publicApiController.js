const { CallReport, CallSession, Customer, Campaign } = require('../models');

class PublicApiController {
  // Get call reports for the merchant
  async getReports(req, res, next) {
    try {
      const { page = 1, limit = 50, startDate, endDate, outcome } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = { userId: req.user.id };
      
      if (startDate && endDate) {
        whereClause.createdAt = {
          $between: [new Date(startDate), new Date(endDate)]
        };
      }
      if (outcome) {
        whereClause.outcome = outcome;
      }

      // Convert between query to Sequelize Op.between if necessary
      const { Op } = require('sequelize');
      if (startDate && endDate) {
         whereClause.createdAt = {
           [Op.between]: [new Date(startDate), new Date(endDate)]
         };
      }

      const { count, rows } = await CallReport.findAndCountAll({
        where: whereClause,
        attributes: ['id', 'callSessionId', 'customerId', 'campaignId', 'duration', 'outcome', 'sentiment', 'leadScore', 'summary', 'createdAt'],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'mobile', 'email']
          },
          {
            model: Campaign,
            as: 'campaign',
            attributes: ['id', 'name']
          },
          {
            model: CallSession,
            as: 'session',
            attributes: ['id', 'status', 'direction', 'startTime', 'endTime']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get specific report details
  async getReportDetails(req, res, next) {
    try {
      const report = await CallReport.findOne({
        where: { id: req.params.id, userId: req.user.id },
        attributes: ['id', 'callSessionId', 'customerId', 'campaignId', 'duration', 'outcome', 'sentiment', 'leadScore', 'summary', 'createdAt'],
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'mobile', 'email']
          },
          {
            model: CallSession,
            as: 'session',
            attributes: ['id', 'status', 'direction', 'startTime', 'endTime']
          }
        ]
      });

      if (!report) {
        return res.status(404).json({ success: false, message: 'Report not found' });
      }

      res.status(200).json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  // Get report transcript
  async getTranscript(req, res, next) {
    try {
      const report = await CallReport.findOne({
        where: { id: req.params.id, userId: req.user.id },
        attributes: ['transcript']
      });

      if (!report) {
        return res.status(404).json({ success: false, message: 'Report not found' });
      }

      res.status(200).json({
        success: true,
        data: {
          transcript: report.transcript
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Play/Download the call recording
  async playRecording(req, res, next) {
    try {
      const report = await CallReport.findOne({
        where: { id: req.params.id, userId: req.user.id },
        attributes: ['recordingUrl']
      });

      if (!report || !report.recordingUrl) {
        return res.status(404).json({ success: false, message: 'Recording not found for this report' });
      }

      // If recording URL is an absolute URL, redirect to it
      if (report.recordingUrl.startsWith('http')) {
        return res.redirect(report.recordingUrl);
      } else {
        // If it's a relative path on the server, serve the file directly
        const path = require('path');
        const fs = require('fs');
        const filePath = path.join(__dirname, '../../', report.recordingUrl);
        
        if (fs.existsSync(filePath)) {
          return res.sendFile(filePath);
        } else {
          return res.status(404).json({ success: false, message: 'Recording file not found on server' });
        }
      }
    } catch (error) {
      next(error);
    }
  }

  // Get Customers
  async getCustomers(req, res, next) {
    try {
      const { page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const { count, rows } = await Customer.findAndCountAll({
        where: { userId: req.user.id },
        attributes: ['id', 'name', 'mobile', 'email', 'tags', 'notes', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.status(200).json({
        success: true,
        data: rows,
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
      });
    } catch (error) {
      next(error);
    }
  }

  // Get Campaigns
  async getCampaigns(req, res, next) {
    try {
      const { page = 1, limit = 50, status } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = { userId: req.user.id };
      if (status) {
        whereClause.status = status;
      }

      const { count, rows } = await Campaign.findAndCountAll({
        where: whereClause,
        attributes: ['id', 'name', 'status', 'startTime', 'createdAt'],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.status(200).json({
        success: true,
        data: rows,
        pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PublicApiController();
