const axios = require('axios');

class DovesoftService {
  static async sendRCS(mobileno, templateCode, customParams) {
    const key = process.env.DOVESOFT_RCS_KEY;
    const botId = process.env.DOVESOFT_BOT_ID;

    if (!key) {
      throw new Error("Missing environment variable: DOVESOFT_RCS_KEY.");
    }
    if (!botId) {
      throw new Error("Missing environment variable: DOVESOFT_BOT_ID.");
    }
    if (!templateCode) {
      throw new Error("Cannot send via RCS: 'templateCode' is required.");
    }

    // Clean mobile number (remove '+' or any non-numeric characters)
    let cleanMobileNo = (mobileno || '').toString().replace(/\D/g, '');

    // Dovesoft requires the country code (91 for India). Auto-append if exactly 10 digits.
    if (cleanMobileNo.length === 10) {
      cleanMobileNo = '91' + cleanMobileNo;
    }

    const endpoint = 'https://api.dovesoft.io//REST/direct/sendRCS';

    console.log(`[MessagingService] Sending RCS to ${cleanMobileNo} with template ${templateCode}...`);

    try {
      const response = await axios.post(
        endpoint,
        {
          contentMessage: {
            templateMessage: {
              customParams,
              templateCode
            },
            mobileno: cleanMobileNo,
            botId
          }
        },
        {
          headers: {
            'key': key,
            'content-type': 'application/json',
            'Cookie': 'JSESSIONID=3DFE6BB850E604CBE09C348FB6B2663B; JSESSIONID=CEEF245534E0771C5B83EC86969C6EF9'
          }
        }
      );

      console.log('[MessagingService] RCS response:', JSON.stringify(response.data));
      return { success: true, data: response.data };
    } catch (error) {
      const errorDetail = error.response?.data || error.message;
      console.error('[MessagingService] RCS send failed:', JSON.stringify(errorDetail));
      throw new Error(`RCS send failed: ${JSON.stringify(errorDetail)}`);
    }
  }
}

module.exports = DovesoftService;
