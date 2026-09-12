const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Admin, Subscription, Plan, Category, VobizNumber, VobizAccount, Agent } = require('../models');
const { redisClient } = require('../config/redis');
const defaults = require('../config/defaults');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/token');
const ResponseBuilder = require('../utils/response');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { sendSMSVerification } = require('../utils/sms');
const NotificationService = require('../services/notificationService');

function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}
const {
  merchantRegisterSchema,
  adminRegisterSchema,
  loginSchema,
  loginVerifyOtpSchema,
  setupBusinessSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetMerchantPasswordSchema,
  verifyOtpSchema,
  resendOtpSchema,
  changePasswordSchema,
  updateFcmTokenSchema,
} = require('../validators/auth');

class AuthController {
  /**
   * Helper to issue login tokens and format response profile
   */
  static async _issueLoginTokens(res, account, role, fcmToken) {
    const tokenPayload = { id: account.id, email: account.email || null, mobile: account.mobile, role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    if (fcmToken) {
      account.fcmToken = fcmToken;
    }
    if (role === 'merchant') {
      account.refreshToken = hashToken(refreshToken);
    }
    await account.save();

    const profile = {
      id: account.id,
      email: account.email,
      mobile: account.mobile,
      role,
      ...(role === 'merchant'
        ? {
            businessName: account.businessName,
            businessUrl: account.businessUrl,
            categoryId: account.categoryId,
          }
        : { firstName: account.firstName, lastName: account.lastName }),
    };

    return ResponseBuilder.success(
      res,
      { profile, accessToken, refreshToken },
      'Logged in successfully'
    );
  }

  /**
   * Merchant Registration - Unique checks validated first, then OTP sent via SMS.
   * User is NOT inserted into database until OTP is verified.
   */
  async registerMerchant(req, res, next) {
    try {
      const { error, value } = merchantRegisterSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, mobile, password, fcmToken, intrestinourproduct } = value;
      const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);

      // 1. UNIQUE VALIDATION CHECKS (Run BEFORE OTP generation/validation)
      if (email && email.trim() !== '') {
        const existingEmail = await User.findOne({ where: { email: email.trim() } });
        if (existingEmail) {
          return ResponseBuilder.error(res, 'Email address already registered', 400);
        }
      }

      const existingMobile = await User.findOne({
        where: {
          [Op.or]: [
            { mobile },
            { mobile: cleanMobile },
            { mobile: `+91${cleanMobile}` },
          ],
        },
      });
      if (existingMobile) {
        return ResponseBuilder.error(res, 'Mobile number already registered', 400);
      }

      // 2. Hash Password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 3. Generate 6-digit verification OTP
      const verificationOtp = Math.floor(100000 + Math.random() * 900000).toString();

      // 4. Cache Pending Registration in Redis (10 minutes TTL)
      const pendingData = {
        email: email && email.trim() !== '' ? email.trim() : null,
        mobile: cleanMobile,
        passwordHash,
        fcmToken: fcmToken || null,
        intrestinourproduct: intrestinourproduct !== undefined ? intrestinourproduct : true,
        otp: verificationOtp,
        createdAt: new Date().toISOString(),
      };

      await redisClient.setEx(`pending_reg:${cleanMobile}`, 600, JSON.stringify(pendingData));
      await redisClient.setEx(`pending_otp:${verificationOtp}`, 600, cleanMobile);

      // 5. Send OTP via 2Factor SMS
      await sendSMSVerification(cleanMobile, verificationOtp);

      // 6. Return response - user will be registered in system after OTP verification
      return ResponseBuilder.success(
        res,
        { mobile: cleanMobile, otpSent: true },
        'OTP sent successfully. Please verify OTP to complete registration.',
        200
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Super Admin Registration
   */
  async registerAdmin(req, res, next) {
    try {
      const { error, value } = adminRegisterSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, mobile, password, firstName, lastName, fcmToken } = value;

      if (email) {
        const existingAdmin = await Admin.findOne({ where: { email } });
        if (existingAdmin) {
          return ResponseBuilder.error(res, 'Admin email already registered', 400);
        }
      }

      const existingAdminMobile = await Admin.findOne({ where: { mobile } });
      if (existingAdminMobile) {
        return ResponseBuilder.error(res, 'Admin mobile already registered', 400);
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

      const admin = await Admin.create({
        email: email || null,
        mobile,
        passwordHash,
        firstName,
        lastName,
        role: 'super_admin',
        isVerified: true, // admin auto-verified for local dev simplicity, token is saved
        verificationToken,
        fcmToken: fcmToken || null,
      });

      // Generate login tokens
      const tokenPayload = { id: admin.id, email: admin.email || null, mobile: admin.mobile, role: 'super_admin' };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      const profile = {
        id: admin.id,
        email: admin.email,
        mobile: admin.mobile,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role,
      };

      return ResponseBuilder.success(
        res,
        { profile, accessToken, refreshToken },
        'Super Admin registered successfully',
        201
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Login (Unified Admin and Merchant) with OTP
   */
  async login(req, res, next) {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, mobile, password, otp, role = 'merchant', fcmToken } = value;
      const cleanMobile = mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null;

      let account = null;

      if (role === 'super_admin') {
        if (email) {
          account = await Admin.findOne({ where: { email } });
        } else if (cleanMobile) {
          account = await Admin.findOne({
            where: {
              [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }],
            },
          });
        }
      } else {
        if (email) {
          account = await User.findOne({ where: { email } });
        } else if (cleanMobile) {
          account = await User.findOne({
            where: {
              [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }],
            },
          });
        }
      }

      if (!account) {
        return ResponseBuilder.error(res, 'Invalid credentials', 401);
      }

      // Check Password if password provided
      if (password) {
        const isMatch = await bcrypt.compare(password, account.passwordHash);
        if (!isMatch) {
          return ResponseBuilder.error(res, 'Invalid credentials', 401);
        }
      } else if (!otp) {
        return ResponseBuilder.error(res, 'Password or OTP is required', 400);
      }

      // Check Verification
      if (!account.isVerified && role !== 'super_admin') {
        return ResponseBuilder.error(res, 'Please verify your account before logging in', 403);
      }

      const targetMobile = account.mobile ? String(account.mobile).replace(/\D/g, '').slice(-10) : cleanMobile;

      // If OTP is provided in this request, verify it directly
      if (otp) {
        const cachedLoginOtp = await redisClient.get(`login_otp:${targetMobile}`);
        if (!cachedLoginOtp || cachedLoginOtp !== otp) {
          return ResponseBuilder.error(res, 'Invalid or expired OTP', 400);
        }
        await redisClient.del(`login_otp:${targetMobile}`);
        await redisClient.del(`login_otp_lookup:${otp}`);

        return AuthController._issueLoginTokens(res, account, role, fcmToken);
      }

      // If no OTP provided, generate and send login OTP via 2factor SMS
      const loginOtp = Math.floor(100000 + Math.random() * 900000).toString();
      await redisClient.setEx(`login_otp:${targetMobile}`, 300, loginOtp); // 5 minutes TTL
      await redisClient.setEx(`login_otp_lookup:${loginOtp}`, 300, targetMobile);

      await sendSMSVerification(targetMobile, loginOtp);

      return ResponseBuilder.success(
        res,
        {
          otpRequired: true,
          mobile: targetMobile,
          role,
        },
        'OTP sent to your registered mobile number. Please verify OTP to complete login.'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Verify Login OTP
   */
  async loginVerifyOtp(req, res, next) {
    try {
      const { error, value } = loginVerifyOtpSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { mobile, otp, role = 'merchant', fcmToken } = value;
      const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);

      const cachedLoginOtp = await redisClient.get(`login_otp:${cleanMobile}`);
      if (!cachedLoginOtp || cachedLoginOtp !== otp) {
        return ResponseBuilder.error(res, 'Invalid or expired OTP', 400);
      }

      let account = null;
      if (role === 'super_admin') {
        account = await Admin.findOne({
          where: {
            [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }],
          },
        });
      } else {
        account = await User.findOne({
          where: {
            [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }],
          },
        });
      }

      if (!account) {
        return ResponseBuilder.error(res, 'Account not found', 404);
      }

      // Clear OTP
      await redisClient.del(`login_otp:${cleanMobile}`);
      await redisClient.del(`login_otp_lookup:${otp}`);

      return AuthController._issueLoginTokens(res, account, role, fcmToken);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Refresh Token
   */
  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return ResponseBuilder.error(res, 'Refresh token is required', 400);
      }

      const decoded = verifyRefreshToken(refreshToken);
      if (!decoded) {
        return ResponseBuilder.error(res, 'Invalid or expired refresh token', 401);
      }

      let account = null;
      if (decoded.role === 'super_admin') {
        account = await Admin.findByPk(decoded.id);
      } else {
        account = await User.findByPk(decoded.id);
        if (account && account.refreshToken !== hashToken(refreshToken)) {
          return ResponseBuilder.error(res, 'Session expired or revoked', 401);
        }
      }

      if (!account) {
        return ResponseBuilder.error(res, 'Account not found', 401);
      }

      const tokenPayload = { id: account.id, email: account.email, role: decoded.role };
      const newAccessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      if (decoded.role === 'merchant') {
        account.refreshToken = hashToken(newRefreshToken);
        await account.save();
      }

      return ResponseBuilder.success(
        res,
        { accessToken: newAccessToken, refreshToken: newRefreshToken },
        'Token refreshed successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Verify OTP
   * For registration: Compulsory OTP verification creates user in DB and activates services.
   */
  async verifyOtp(req, res, next) {
    try {
      const { error, value } = verifyOtpSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { otp, role = 'merchant', mobile } = value;

      if (role === 'super_admin') {
        const admin = await Admin.findOne({ where: { verificationToken: otp } });
        if (!admin) {
          return ResponseBuilder.error(res, 'Invalid verification OTP', 400);
        }
        admin.isVerified = true;
        admin.verificationToken = null;
        await admin.save();
        return ResponseBuilder.success(res, null, 'Admin account verified successfully');
      }

      // Role is merchant:
      let cleanMobile = mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null;
      if (!cleanMobile) {
        cleanMobile = await redisClient.get(`pending_otp:${otp}`);
      }

      let pendingData = null;
      if (cleanMobile) {
        const cached = await redisClient.get(`pending_reg:${cleanMobile}`);
        if (cached) {
          pendingData = JSON.parse(cached);
        }
      }

      // Check if this OTP matches a pending registration
      if (pendingData && pendingData.otp === otp) {
        // Race condition check: make sure user was not registered concurrently
        const duplicateCheck = await User.findOne({
          where: {
            [Op.or]: [
              { mobile: pendingData.mobile },
              ...(pendingData.email ? [{ email: pendingData.email }] : []),
            ],
          },
        });

        if (duplicateCheck) {
          await redisClient.del(`pending_reg:${cleanMobile}`);
          await redisClient.del(`pending_otp:${otp}`);
          return ResponseBuilder.error(res, 'Account already registered. Please login.', 400);
        }

        // CREATE MERCHANT USER IN OUR DATABASE
        const merchant = await User.create({
          email: pendingData.email,
          mobile: pendingData.mobile,
          passwordHash: pendingData.passwordHash,
          verificationToken: null,
          isVerified: true,
          fcmToken: pendingData.fcmToken,
          intrestinourproduct: pendingData.intrestinourproduct,
        });

        // Setup Initial Starter Subscription Plan
        let starterPlan = await Plan.findOne({ where: { name: 'Starter' } });
        if (!starterPlan) {
          starterPlan = await Plan.create({
            name: 'Starter',
            price: 0.00,
            callLimit: 5,
            maxConcurrentCalls: 1,
          });
        }

        const now = new Date();
        const expiryDate = new Date();
        expiryDate.setMonth(now.getMonth() + 1);

        await Subscription.create({
          userId: merchant.id,
          planId: starterPlan.id,
          activePlan: starterPlan.name,
          startDate: now,
          expiryDate,
          callsUsed: 0,
          callsRemaining: starterPlan.callLimit,
          status: 'active',
        });

        // Setup demo number for trial testing
        await VobizNumber.create({
          userId: merchant.id,
          number: defaults.vobiz.demoNumber,
          status: 'active',
          providerData: { isDemo: true },
          agentId: null,
        });

        // Generate login tokens
        const tokenPayload = { id: merchant.id, email: merchant.email || null, mobile: merchant.mobile, role: 'merchant' };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        merchant.refreshToken = hashToken(refreshToken);
        await merchant.save();

        // Clear Redis pending registration keys
        await redisClient.del(`pending_reg:${cleanMobile}`);
        await redisClient.del(`pending_otp:${otp}`);

        // Notify Admins about new signup
        NotificationService.notifyAdmin(
          'New Merchant Signup',
          `A new merchant has registered and verified with mobile: ${merchant.mobile}${merchant.email ? ` and email: ${merchant.email}` : ''}.`
        ).catch((notifyErr) => {
          console.error('[NotificationService] notifyAdmin error:', notifyErr.message);
        });

        // Trigger automatic AI Onboarding Call
        const MerchantOnboardingService = require('../services/merchantOnboardingService');
        MerchantOnboardingService.scheduleOnboardingCall(merchant.id).catch((callErr) => {
          console.error('[authController] Failed to schedule onboarding call:', callErr.message);
        });

        const profile = {
          id: merchant.id,
          email: merchant.email,
          mobile: merchant.mobile,
          role: 'merchant',
          businessName: merchant.businessName,
          businessUrl: merchant.businessUrl,
          categoryId: merchant.categoryId,
        };

        return ResponseBuilder.success(
          res,
          { profile, accessToken, refreshToken },
          'Merchant registered and verified successfully.',
          201
        );
      }

      // Fallback: Check if user exists in DB and had verificationToken
      const userWhere = { verificationToken: otp };
      if (cleanMobile) {
        userWhere.mobile = { [Op.or]: [cleanMobile, `+91${cleanMobile}`] };
      }
      const user = await User.findOne({ where: userWhere });
      if (user) {
        user.isVerified = true;
        user.verificationToken = null;

        const tokenPayload = { id: user.id, email: user.email || null, mobile: user.mobile, role: 'merchant' };
        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        user.refreshToken = hashToken(refreshToken);
        await user.save();

        const profile = {
          id: user.id,
          email: user.email,
          mobile: user.mobile,
          role: 'merchant',
          businessName: user.businessName,
          businessUrl: user.businessUrl,
          categoryId: user.categoryId,
        };

        return ResponseBuilder.success(
          res,
          { profile, accessToken, refreshToken },
          'Merchant account verified successfully'
        );
      }

      return ResponseBuilder.error(res, 'Invalid or expired verification OTP', 400);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Forgot Password - Send OTP via SMS to registered mobile
   */
  async forgotPassword(req, res, next) {
    try {
      const { error, value } = forgotPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, mobile, role = 'merchant' } = value;
      const cleanMobile = mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null;

      let account = null;
      if (role === 'super_admin') {
        if (email) {
          account = await Admin.findOne({ where: { email } });
        } else if (cleanMobile) {
          account = await Admin.findOne({
            where: {
              [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }],
            },
          });
        }
      } else {
        if (email) {
          account = await User.findOne({ where: { email } });
        } else if (cleanMobile) {
          account = await User.findOne({
            where: {
              [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }],
            },
          });
        }
      }

      if (!account) {
        // Return generic success to avoid enumeration
        return ResponseBuilder.success(res, null, 'If this account exists, a password reset OTP has been sent');
      }

      // Generate 6-digit OTP
      const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const targetMobile = account.mobile ? String(account.mobile).replace(/\D/g, '').slice(-10) : cleanMobile;

      if (targetMobile) {
        await redisClient.setEx(`reset_otp:${targetMobile}`, 600, resetOtp);
        await redisClient.setEx(`reset_otp_lookup:${resetOtp}`, 600, targetMobile);
      }

      account.resetToken = resetOtp;
      account.resetTokenExpires = new Date(Date.now() + 600000); // 10 minutes
      await account.save();

      // Send SMS OTP via 2factor
      if (targetMobile) {
        await sendSMSVerification(targetMobile, resetOtp);
      }

      // Also send reset email if email exists
      if (account.email) {
        sendPasswordResetEmail(account.email, resetOtp, role).catch((emailErr) => {
          console.error('[forgotPassword] Failed to send password reset email:', emailErr.message);
        });
      }

      return ResponseBuilder.success(
        res,
        { mobile: targetMobile },
        'Password reset OTP sent to your registered mobile number'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset Password with OTP or Token
   */
  async resetPassword(req, res, next) {
    try {
      const { error, value } = resetPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { token, otp, mobile, password, role = 'merchant' } = value;
      const resetCode = otp || token;
      const cleanMobile = mobile ? String(mobile).replace(/\D/g, '').slice(-10) : null;

      let account = null;

      // 1. Check Redis by mobile
      if (cleanMobile) {
        const cachedOtp = await redisClient.get(`reset_otp:${cleanMobile}`);
        if (cachedOtp && cachedOtp === resetCode) {
          account = role === 'super_admin'
            ? await Admin.findOne({ where: { [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }] } })
            : await User.findOne({ where: { [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }] } });
        }
      }

      // 2. Check Redis by reverse lookup
      if (!account && resetCode) {
        const lookupMobile = await redisClient.get(`reset_otp_lookup:${resetCode}`);
        if (lookupMobile) {
          account = role === 'super_admin'
            ? await Admin.findOne({ where: { [Op.or]: [{ mobile: lookupMobile }, { mobile: `+91${lookupMobile}` }] } })
            : await User.findOne({ where: { [Op.or]: [{ mobile: lookupMobile }, { mobile: `+91${lookupMobile}` }] } });
        }
      }

      // 3. Fallback to DB resetToken
      if (!account) {
        if (role === 'super_admin') {
          account = await Admin.findOne({ where: { resetToken: resetCode } });
        } else {
          account = await User.findOne({ where: { resetToken: resetCode } });
        }
      }

      if (!account || !account.resetTokenExpires || account.resetTokenExpires < new Date()) {
        return ResponseBuilder.error(res, 'Reset OTP/token is invalid or has expired', 400);
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      account.passwordHash = passwordHash;
      account.resetToken = null;
      account.resetTokenExpires = null;
      if (role === 'merchant') {
        account.refreshToken = null; // Revoke refresh tokens on password reset
      }
      await account.save();

      // Clean up Redis keys
      const accMobile = account.mobile ? String(account.mobile).replace(/\D/g, '').slice(-10) : cleanMobile;
      if (accMobile) {
        await redisClient.del(`reset_otp:${accMobile}`);
      }
      await redisClient.del(`reset_otp_lookup:${resetCode}`);

      return ResponseBuilder.success(res, null, 'Password reset successfully. You can now login.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Resend OTP (Supports registration, login, and reset_password)
   */
  async resendOtp(req, res, next) {
    try {
      const { error, value } = resendOtpSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { mobile, type = 'registration', role = 'merchant' } = value;
      const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

      if (type === 'registration') {
        const cached = await redisClient.get(`pending_reg:${cleanMobile}`);
        if (!cached) {
          return ResponseBuilder.error(res, 'No pending registration found for this mobile. Please register first.', 404);
        }
        const pendingData = JSON.parse(cached);
        pendingData.otp = newOtp;
        await redisClient.setEx(`pending_reg:${cleanMobile}`, 600, JSON.stringify(pendingData));
        await redisClient.setEx(`pending_otp:${newOtp}`, 600, cleanMobile);

        await sendSMSVerification(cleanMobile, newOtp);
        return ResponseBuilder.success(res, { mobile: cleanMobile }, 'Registration OTP resent successfully');
      } else if (type === 'login') {
        const account = role === 'super_admin'
          ? await Admin.findOne({ where: { [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }] } })
          : await User.findOne({ where: { [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }] } });

        if (!account) {
          return ResponseBuilder.error(res, 'Account not found', 404);
        }

        await redisClient.setEx(`login_otp:${cleanMobile}`, 300, newOtp);
        await redisClient.setEx(`login_otp_lookup:${newOtp}`, 300, cleanMobile);

        await sendSMSVerification(cleanMobile, newOtp);
        return ResponseBuilder.success(res, { mobile: cleanMobile }, 'Login OTP resent successfully');
      } else if (type === 'reset_password') {
        const account = role === 'super_admin'
          ? await Admin.findOne({ where: { [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }] } })
          : await User.findOne({ where: { [Op.or]: [{ mobile }, { mobile: cleanMobile }, { mobile: `+91${cleanMobile}` }] } });

        if (!account) {
          return ResponseBuilder.error(res, 'Account not found', 404);
        }

        await redisClient.setEx(`reset_otp:${cleanMobile}`, 600, newOtp);
        await redisClient.setEx(`reset_otp_lookup:${newOtp}`, 600, cleanMobile);
        account.resetToken = newOtp;
        account.resetTokenExpires = new Date(Date.now() + 600000);
        await account.save();

        await sendSMSVerification(cleanMobile, newOtp);
        return ResponseBuilder.success(res, { mobile: cleanMobile }, 'Password reset OTP resent successfully');
      }

      return ResponseBuilder.error(res, 'Invalid OTP type', 400);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Merchant Direct Password Reset (Authenticated, no old password verification required)
   */
  async resetMerchantPassword(req, res, next) {
    try {
      const { error, value } = resetMerchantPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const newPass = value.password || value.newPassword;

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPass, salt);

      const merchant = req.user;
      merchant.passwordHash = passwordHash;
      merchant.refreshToken = null; // Revoke refresh tokens on password reset
      await merchant.save();

      return ResponseBuilder.success(res, null, 'Merchant password updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Setup business details for merchant
   */
  async setupBusiness(req, res, next) {
    try {
      if (!req.body.business_type && req.body.businessType) {
        req.body.business_type = req.body.businessType;
      }
      
      const { error, value } = setupBusinessSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { businessName, businessUrl, categoryId, business_type } = value;

      // 1. Verify category exists
      const category = await Category.findByPk(categoryId);
      if (!category) {
        return ResponseBuilder.error(res, 'Selected business category does not exist', 400);
      }

      // 2. Update current authenticated user
      const user = req.user;
      const isFirstSetup = !user.categoryId;

      user.businessName = businessName;
      user.businessUrl = businessUrl || null;
      user.businessType = business_type;
      user.categoryId = categoryId;
      await user.save();

      // 3. Auto-assign/create the category's default test agent to their demo number (only on first setup)
      if (isFirstSetup) {
        const defaultAgent = await Agent.findOne({
          where: {
            isCustom: false,
            categoryId: categoryId,
          },
        });

        if (defaultAgent) {
          const [demoNumRecord, created] = await VobizNumber.findOrCreate({
            where: {
              userId: user.id,
              number: defaults.vobiz.demoNumber,
            },
            defaults: {
              status: 'active',
              providerData: { isDemo: true },
              agentId: defaultAgent.id,
            },
          });

          if (!created && demoNumRecord.agentId !== defaultAgent.id) {
            demoNumRecord.agentId = defaultAgent.id;
            await demoNumRecord.save();
          }
        }
      }

      const profile = {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        businessName: user.businessName,
        businessUrl: user.businessUrl,
        categoryId: user.categoryId,
        role: req.userRole,
      };

      return ResponseBuilder.success(
        res,
        { profile },
        'Business profile updated successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get business details for merchant
   */
  async getBusinessDetails(req, res, next) {
    try {
      const user = req.user;

      const profile = {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        businessName: user.businessName,
        businessUrl: user.businessUrl,
        categoryId: user.categoryId,
        businessType: user.businessType,
        role: req.userRole,
      };

      return ResponseBuilder.success(
        res,
        { profile },
        'Business profile retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get current authenticated user profile
   */
  async getMe(req, res, next) {
    try {
      const user = req.user;
      const role = req.userRole;

      let subscription = null;
      let isTrial = false;
      let rcsStatus = 'unverified';
      let whatsappStatus = 'unverified';

      if (role === 'merchant') {
        const { MerchantMessageProgram } = require('../models');
        const subRecord = await Subscription.findOne({
          where: { userId: user.id },
          include: [{ model: Plan, as: 'plan' }],
        });

        if (subRecord) {
          isTrial = subRecord.plan
            ? parseFloat(subRecord.plan.price) === 0 || subRecord.plan.name.toLowerCase() === 'starter'
            : false;

          subscription = {
            id: subRecord.id,
            activePlan: subRecord.activePlan,
            startDate: subRecord.startDate,
            expiryDate: subRecord.expiryDate,
            callsUsed: subRecord.callsUsed,
            callsRemaining: subRecord.callsRemaining,
            status: subRecord.status,
            isTrial,
            plan: subRecord.plan
              ? {
                  id: subRecord.plan.id,
                  name: subRecord.plan.name,
                  price: subRecord.plan.price,
                  callLimit: subRecord.plan.callLimit,
                  maxConcurrentCalls: subRecord.plan.maxConcurrentCalls,
                }
              : null,
          };
        }

        const msgPrograms = await MerchantMessageProgram.findAll({ where: { user_id: user.id } });
        for (const prog of msgPrograms) {
          if (prog.provider === 'rcs') {
            if (prog.status === 'approved') {
              if (prog.channel_mode === 'rcs') rcsStatus = 'approved';
              else rcsStatus = 'disabled_by_admin'; // approved but channel off
            } else if (rcsStatus === 'unverified') {
              rcsStatus = prog.status;
            }
          }
          if (prog.provider === 'whatsapp') {
            if (prog.status === 'approved') {
              if (prog.channel_mode === 'whatsapp') whatsappStatus = 'approved';
              else whatsappStatus = 'disabled_by_admin';
            } else if (whatsappStatus === 'unverified') {
              whatsappStatus = prog.status;
            }
          }
        }
      }

      const vobizAccount = await VobizAccount.findOne({ where: { userId: user.id } });
      const vobizOnboarded = Boolean(vobizAccount);
      const isVobizImported = vobizOnboarded ? Boolean(vobizAccount.isImported) : false;

      const profile = {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        kycStatus: user.kycStatus,
        role,
        vobizOnboarded,
        isVobizImported,
        ...(role === 'merchant'
          ? {
              businessName: user.businessName,
              businessUrl: user.businessUrl,
              categoryId: user.categoryId,
              subscription,
              rcsStatus,
              whatsappStatus,
            }
          : {
              firstName: user.firstName,
              lastName: user.lastName,
            }),
      };

      return ResponseBuilder.success(res, { profile }, 'Profile retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Change Password (for authenticated User or Admin)
   */
  async changePassword(req, res, next) {
    try {
      const { error, value } = changePasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { oldPassword, newPassword } = value;
      const account = req.user;

      if (!account || !account.passwordHash) {
        return ResponseBuilder.error(res, 'User session invalid', 401);
      }

      const isMatch = await bcrypt.compare(oldPassword, account.passwordHash);
      if (!isMatch) {
        return ResponseBuilder.error(res, 'Incorrect current password', 400);
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      account.passwordHash = newPasswordHash;
      await account.save();

      return ResponseBuilder.success(res, null, 'Password changed successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update FCM / Notification Token
   */
  async updateFcmToken(req, res, next) {
    try {
      const { error, value } = updateFcmTokenSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { fcmToken } = value;
      if (!fcmToken) {
        return ResponseBuilder.error(res, 'fcmToken is required', 400);
      }

      const account = req.user;
      account.fcmToken = fcmToken;
      await account.save();

      return ResponseBuilder.success(res, { fcmToken }, 'Notification token updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete current authenticated user's account
   */
  async deleteAccount(req, res, next) {
    try {
      const user = req.user;
      if (!user) {
        return ResponseBuilder.error(res, 'User session invalid', 401);
      }

      // Note: Sequelize associations with onDelete: 'CASCADE' will handle deleting related child rows
      // such as CallLogs, Agents, etc. Make sure cascading is set up correctly in the models.
      await user.destroy();

      return ResponseBuilder.success(res, null, 'Account permanently deleted');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();
