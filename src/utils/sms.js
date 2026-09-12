const axios = require('axios');
const defaults = require('../config/defaults');

/**
 * Send SMS OTP via 2factor.in API
 * @param {string} mobile - Mobile number to send OTP to
 * @param {string} otp - 6 digit OTP
 */
async function sendSMSVerification(mobile, otp) {
  const apiKey = process.env.TWO_FACTOR_API_KEY || process.env.TWOFACTOR_API_KEY || '7949f1f9-0188-11f1-a6b2-0200cd936042';

  try {
    // Extract last 10 digits to handle any +91 prefixes passed from client
    const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
    if (!cleanMobile || cleanMobile.length < 10) {
      console.error(`Invalid mobile number format for SMS OTP: ${mobile}`);
      return false;
    }

    const url = `https://2factor.in/API/V1/${apiKey}/SMS/+91${cleanMobile}/${otp}/OTP`;

    const response = await axios.get(url, { timeout: 10000 });

    if (response.data && response.data.Status === 'Success') {
      console.log(`[2Factor] SMS OTP sent successfully to +91${cleanMobile}. Session: ${response.data.Details}`);
      return true;
    } else {
      console.error(`[2Factor] Failed to send SMS to +91${cleanMobile}:`, response.data);
      return false;
    }
  } catch (error) {
    console.error(`[2Factor] Error sending SMS to ${mobile}:`, error.response?.data || error.message);
    return false;
  }
}

module.exports = {
  sendSMSVerification,
};
