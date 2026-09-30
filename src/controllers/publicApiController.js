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
        include: [
          {
            model: Customer,
            as: 'customer',
            attributes: ['id', 'name', 'mobile', 'email']
          },
          {
            model: CallSession,
            as: 'session'
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
}

module.exports = new PublicApiController();
