const { Notification } = require('../models');
const ResponseBuilder = require('../utils/response');

class NotificationController {
  /**
   * Get User Notifications
   */
  async getUserNotifications(req, res, next) {
    try {
      const userId = req.user.id;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const { category } = req.query;

      const whereClause = { userId };
      if (category) {
        whereClause.category = category;
      }

      const { count, rows } = await Notification.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
      });

      const unreadCount = await Notification.count({
        where: { ...whereClause, isRead: false },
      });

      return ResponseBuilder.success(
        res,
        {
          notifications: rows,
          unreadCount,
          pagination: {
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            limit,
          },
        },
        'Notifications retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark Notification as Read
   */
  async markAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        where: { id, userId },
      });

      if (!notification) {
        return ResponseBuilder.error(res, 'Notification not found', 404);
      }

      notification.isRead = true;
      await notification.save();

      return ResponseBuilder.success(res, notification, 'Notification marked as read');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark All Notifications as Read
   */
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.id;

      await Notification.update(
        { isRead: true },
        { where: { userId, isRead: false } }
      );

      return ResponseBuilder.success(res, null, 'All notifications marked as read');
    } catch (err) {
      next(err);
    }
  }
  /**
   * Get Admin Notifications
   */
  async getAdminNotifications(req, res, next) {
    try {
      const adminId = req.user.id;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = (page - 1) * limit;

      const { Op } = require('sequelize');
      const { category } = req.query;

      const whereClause = {
        [Op.or]: [
          { adminId },
          { adminId: null } // Show existing/global data to admin
        ]
      };

      if (category) {
        whereClause.category = category;
      }

      const { count, rows } = await Notification.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
      });

      const unreadCount = await Notification.count({
        where: { ...whereClause, isRead: false },
      });

      return ResponseBuilder.success(
        res,
        {
          notifications: rows,
          unreadCount,
          pagination: {
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            limit,
          },
        },
        'Admin notifications retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark Admin Notification as Read
   */
  async markAdminAsRead(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const notification = await Notification.findOne({
        where: { id, adminId },
      });

      if (!notification) {
        return ResponseBuilder.error(res, 'Notification not found', 404);
      }

      notification.isRead = true;
      await notification.save();

      return ResponseBuilder.success(res, notification, 'Notification marked as read');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Mark All Admin Notifications as Read
   */
  async markAdminAllAsRead(req, res, next) {
    try {
      const adminId = req.user.id;

      await Notification.update(
        { isRead: true },
        { where: { adminId, isRead: false } }
      );

      return ResponseBuilder.success(res, null, 'All notifications marked as read');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Broadcast Notification to all Merchants
   */
  async broadcastNotification(req, res, next) {
    try {
      const { title, message, category } = req.body;

      if (!title || !message) {
        return ResponseBuilder.error(res, 'Title and message are required', 400);
      }

      const NotificationService = require('../services/notificationService');
      const result = await NotificationService.broadcastToMerchants(title, message, category || 'general');

      return ResponseBuilder.success(res, { count: result.count }, 'Broadcasted notification successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new NotificationController();
