const axios = require('axios');
const defaults = require('../config/defaults');

/**
 * Send SMS OTP via 2factor.in API
 * @param {string} mobile - Mobile number to send OTP to
 * @param {string} otp - 6 digit OTP
 */
async function sendSMSVerification(mobile, otp) {
  const apiKey = process.env.TWOFACTOR_API_KEY;

  // Temporarily pausing SMS OTP for now
  console.warn('SMS OTP paused. Simulating SMS send.');
  console.log('\n==================================================');
  console.log('         DEVELOPMENT SMS OUTBOX SIMULATOR         ');
  console.log('==================================================');
  console.log(`To:      ${mobile}`);
  console.log(`OTP:     ${otp}`);
  console.log('==================================================\n');
  return true;

  try {
    // Extract last 10 digits to handle any +91 prefixes passed from client
    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);
    //const url = `https://2factor.in/API/V1/${apiKey}/SMS/+91${cleanMobile}/${otp}/SUNRAT`;
    const url = `https://2factor.in/API/V1/${apiKey}/SMS/+91${cleanMobile}/${otp}/OTP`;

    const response = await axios.get(url);

    if (response.data && response.data.Status === 'Success') {
      console.log(`SMS OTP sent successfully to ${mobile}`);
      return true;
    } else {
      console.error(`Failed to send SMS to ${mobile}:`, response.data);
      return false;
    }
  } catch (error) {
    console.error(`Error sending SMS to ${mobile}:`, error.message);
    return false;
  }
}

module.exports = {
  sendSMSVerification,
};
