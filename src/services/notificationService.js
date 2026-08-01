const { Notification, Admin, User } = require('../models');
const fcmService = require('./fcmService');

class NotificationService {
  /**
   * Notify a specific merchant (user)
   * @param {string} userId - UUID of the merchant
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} category - Category ('meeting', 'payments', 'call', 'general')
   */
  async notifyMerchant(userId, title, message, category = 'general') {
    try {
      if (!userId) return null;
      const notification = await Notification.create({
        userId,
        type: 'MERCHANT',
        category,
        title,
        message,
        isRead: false
      });
      console.log(`[Notification] Sent to Merchant ${userId} [${category}]: ${title}`);

      // Attempt to send push notification
      const user = await User.findByPk(userId);
      if (user && user.fcmToken) {
        await fcmService.sendPushNotification(user.fcmToken, title, message, { category, notificationId: notification.id });
      }

      return notification;
    } catch (err) {
      console.error(`[NotificationService] Failed to notify merchant ${userId}:`, err);
    }
  }

  /**
   * Notify all admins or a specific admin
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} [adminId] - Optional specific admin UUID. If null, notifies all super_admins.
   * @param {string} category - Category ('meeting', 'payments', 'call', 'general')
   */
  async notifyAdmin(title, message, adminId = null, category = 'general') {
    try {
      if (adminId) {
        const notification = await Notification.create({
          adminId,
          type: 'ADMIN',
          category,
          title,
          message,
          isRead: false
        });
        console.log(`[Notification] Sent to Admin ${adminId} [${category}]: ${title}`);

        // Attempt to send push notification
        const adminUser = await Admin.findByPk(adminId);
        if (adminUser && adminUser.fcmToken) {
          await fcmService.sendPushNotification(adminUser.fcmToken, title, message, { category, notificationId: notification.id });
        }

        return [notification];
      } else {
        // Notify all super_admins
        const admins = await Admin.findAll({ where: { role: 'super_admin' } });
        const notifications = await Promise.all(
          admins.map(async (admin) => {
            const notif = await Notification.create({
              adminId: admin.id,
              type: 'ADMIN',
              category,
              title,
              message,
              isRead: false
            });

            if (admin.fcmToken) {
              await fcmService.sendPushNotification(admin.fcmToken, title, message, { category, notificationId: notif.id });
            }
            return notif;
          })
        );
        console.log(`[Notification] Broadcast to ${admins.length} Admins [${category}]: ${title}`);
        return notifications;
      }
    } catch (err) {
      console.error(`[NotificationService] Failed to notify admins:`, err);
    }
  }
}

module.exports = new NotificationService();
