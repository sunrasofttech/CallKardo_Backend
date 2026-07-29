const axios = require('axios');

class DovesoftService {
  /**
   * Send an RCS message using the Dovesoft API with the 'ramaapplink' template.
   *
   * @param {string} mobileNo - The recipient's mobile number (e.g., '+919876543210' or '919876543210')
   * @param {Object} params - Dynamic parameters for the template
   * @param {string} params.user_name - The user's name
   * @param {string} params.app_link - The app link URL
   * @param {string} params.website_url - The website URL
   * @param {string} params.support_mobile - The support mobile number
   * @returns {Promise<Object>} The API response data
   */
  async sendRamaAppLinkRCS(mobileNo, { user_name, app_link, website_url, support_mobile }) {
    const rcsKey = process.env.DOVESOFT_RCS_KEY;
    const botId = process.env.DOVESOFT_BOT_ID;

    if (!rcsKey || !botId) {
      throw new Error('Dovesoft API credentials (DOVESOFT_RCS_KEY, DOVESOFT_BOT_ID) are missing from environment variables.');
    }

    // Clean mobile number (remove '+' or any non-numeric characters)
    const cleanMobileNo = (mobileNo || '').toString().replace(/\D/g, '');

    if (!cleanMobileNo) {
      throw new Error('Invalid mobile number provided to DovesoftService.');
    }

    const payload = {
      contentMessage: {
        templateMessage: {
          templateCode: 'ramaapplink',
          customParams: {
            user_name: user_name || '',
            app_link: app_link || '',
            website_url: website_url || '',
            support_mobile: support_mobile || ''
          }
        },
        mobileno: cleanMobileNo,
        botId: botId
      }
    };

    try {
      const response = await axios.post('https://api.dovesoft.io//REST/direct/sendRCS', payload, {
        headers: {
          'key': rcsKey,
          'content-type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('[DovesoftService] Failed to send RCS message:', error.response?.data || error.message);
      throw error;
    }
  }
}

module.exports = new DovesoftService();
