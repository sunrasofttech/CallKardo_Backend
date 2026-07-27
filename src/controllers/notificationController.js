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

      const { count, rows } = await Notification.findAndCountAll({
        where: { userId },
        limit,
        offset,
        order: [['createdAt', 'DESC']],
      });

      const unreadCount = await Notification.count({
        where: { userId, isRead: false },
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
}

module.exports = new NotificationController();
