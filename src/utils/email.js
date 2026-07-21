const nodemailer = require('nodemailer');
const defaults = require('../config/defaults');

/**
 * Send general email.
 * If SMTP configuration is missing, prints to console (useful in local dev).
 */
async function sendEmail({ to, cc, bcc, subject, text, html, icalEvent }) {
  const { host, port, user, pass, from } = defaults.smtp;

  if (host && user && pass) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // True for 465, false for others
        auth: {
          user,
          pass,
        },
      });

      const isValidEmail = (addr) => addr && typeof addr === 'string' && addr.includes('@') && !addr.includes('example.com');

      const mailOptions = {
        from,
        to,
        subject,
        text,
        html,
      };

      if (isValidEmail(cc) && cc !== to) {
        mailOptions.cc = cc;
      }
      if (isValidEmail(bcc) && bcc !== to) {
        mailOptions.bcc = bcc;
      }

      if (icalEvent) {
        mailOptions.icalEvent = icalEvent;
      }

      const info = await transporter.sendMail(mailOptions);

      console.log(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      return true;
    } catch (err) {
      console.error(`Failed to send email to ${to} via SMTP:`, err);
      return false;
    }
  } else {
    // Local dev / no SMTP configured: log to console
    console.log('\n==================================================');
    console.log('         DEVELOPMENT EMAIL OUTBOX SIMULATOR       ');
    console.log('==================================================');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text:    ${text}`);
    if (html) {
      console.log(`HTML:    ${html}`);
    }
    console.log('==================================================\n');
    return true;
  }
}

/**
 * Send email verification link
 */
async function sendVerificationEmail(email, token) {
  const verificationUrl = `https://app.ailive.com/verify-email?token=${token}`;
  const subject = 'Verify your AILive Email Address';
  const text = `Welcome to AILive! Please verify your email address by clicking on the link below:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.`;
  const html = `<p>Welcome to AILive!</p><p>Please verify your email address by clicking the link below:</p><p><a href="${verificationUrl}">${verificationUrl}</a></p><p>This link will expire in 24 hours.</p>`;

  return await sendEmail({ to: email, subject, text, html });
}

/**
 * Send password reset link
 */
async function sendPasswordResetEmail(email, token, role) {
  const resetUrl = `https://app.ailive.com/reset-password?token=${token}&role=${role}`;
  const subject = 'Reset your AILive Password';
  const text = `You are receiving this email because you (or someone else) requested a password reset for your account.\n\nPlease click on the link below to complete the process:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email. The link will expire in 1 hour.`;
  const html = `<p>You requested a password reset for your account.</p><p>Please click on the link below to complete the process:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, please ignore this email. The link will expire in 1 hour.</p>`;

  return await sendEmail({ to: email, subject, text, html });
}

module.exports = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
