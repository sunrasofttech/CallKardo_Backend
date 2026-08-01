const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');

class FcmService {
  constructor() {
    this.initialized = false;
    this.init();
  }

  init() {
    try {
      // Expecting path to the service account JSON file in the .env
      const credentialsPath = './src/config/callkardouser-firebase-adminsdk.json';

      if (credentialsPath) {
        // Resolve path to make sure it handles absolute/relative paths correctly
        const fullPath = path.resolve(process.cwd(), credentialsPath);
        const serviceAccount = require(fullPath);

        initializeApp({
          credential: cert(serviceAccount)
        });

        this.initialized = true;
        console.log('[FCM Service] Firebase Admin initialized successfully.');
      } else {
        console.warn('[FCM Service] FIREBASE_CREDENTIALS_PATH is not set in .env. Push notifications are disabled.');
      }
    } catch (error) {
      console.error('[FCM Service] Failed to initialize Firebase Admin:', error.message);
    }
  }

  /**
   * Send a push notification to a specific FCM token
   * @param {string} token - The user's FCM device token
   * @param {string} title - Notification title
   * @param {string} body - Notification body/message
   * @param {object} [data] - Optional extra data payload
   * @returns {Promise<boolean>} - True if successful, false otherwise
   */
  async sendPushNotification(token, title, body, data = {}) {
    if (!this.initialized) {
      console.warn('[FCM Service] Attempted to send push notification, but Firebase is not initialized.');
      return false;
    }

    if (!token) {
      console.warn('[FCM Service] Cannot send notification: missing token.');
      return false;
    }

    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK' // Commonly used if app is Flutter, otherwise can be customized
      },
      token
    };

    try {
      const response = await getMessaging().send(message);
      console.log(`[FCM Service] Successfully sent message to ${token.substring(0, 10)}... MessageID:`, response);
      return true;
    } catch (error) {
      console.error(`[FCM Service] Error sending message to token ${token.substring(0, 10)}...:`, error.message);
      return false;
    }
  }
}

module.exports = new FcmService();
