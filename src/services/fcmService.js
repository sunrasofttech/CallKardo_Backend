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

  /**
   * Send a push notification to multiple FCM tokens
   * @param {string[]} tokens - Array of FCM device tokens
   * @param {string} title - Notification title
   * @param {string} body - Notification body/message
   * @param {object} [data] - Optional extra data payload
   */
  async sendMulticastPushNotification(tokens, title, body, data = {}) {
    if (!this.initialized) {
      console.warn('[FCM Service] Attempted to send multicast notification, but Firebase is not initialized.');
      return false;
    }

    if (!tokens || tokens.length === 0) {
      return false;
    }

    // FCM allows a maximum of 500 tokens per multicast message
    const MAX_TOKENS = 500;
    const tokenChunks = [];
    for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
      tokenChunks.push(tokens.slice(i, i + MAX_TOKENS));
    }

    let successCount = 0;
    let failureCount = 0;

    for (const chunk of tokenChunks) {
      const message = {
        notification: {
          title,
          body
        },
        data: {
          ...data,
          click_action: 'FLUTTER_NOTIFICATION_CLICK'
        },
        tokens: chunk
      };

      try {
        const response = await getMessaging().sendEachForMulticast(message);
        successCount += response.successCount;
        failureCount += response.failureCount;
      } catch (error) {
        console.error('[FCM Service] Error sending multicast message:', error.message);
      }
    }

    console.log(`[FCM Service] Multicast finished. Success: ${successCount}, Failures: ${failureCount}`);
    return { successCount, failureCount };
  }

  /**
   * Send a push notification to a specific topic
   * @param {string} topic - The FCM topic name (e.g., 'all_merchants')
   * @param {string} title - Notification title
   * @param {string} body - Notification body/message
   * @param {object} [data] - Optional extra data payload
   */
  async sendTopicPushNotification(topic, title, body, data = {}) {
    if (!this.initialized) {
      console.warn('[FCM Service] Attempted to send topic notification, but Firebase is not initialized.');
      return false;
    }

    const message = {
      notification: {
        title,
        body
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      },
      topic
    };

    try {
      const response = await getMessaging().send(message);
      console.log(`[FCM Service] Successfully sent message to topic "${topic}". MessageID:`, response);
      return true;
    } catch (error) {
      console.error(`[FCM Service] Error sending message to topic "${topic}":`, error.message);
      return false;
    }
  }
}

module.exports = new FcmService();
