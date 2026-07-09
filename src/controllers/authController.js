const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, Admin, Subscription, Plan, Category } = require('../models');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/token');
const ResponseBuilder = require('../utils/response');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');
const { sendSMSVerification } = require('../utils/sms');

function hashToken(token) {
  if (!token) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}
const {
  merchantRegisterSchema,
  adminRegisterSchema,
  loginSchema,
  setupBusinessSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} = require('../validators/auth');

class AuthController {
  /**
   * Merchant Registration
   */
  async registerMerchant(req, res, next) {
    try {
      const { error, value } = merchantRegisterSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, mobile, password } = value;

      // 1. Check if user already exists
      if (email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return ResponseBuilder.error(res, 'Email address already registered', 400);
        }
      }

      const existingMobile = await User.findOne({ where: { mobile } });
      if (existingMobile) {
        return ResponseBuilder.error(res, 'Mobile number already registered', 400);
      }

      // 2. Hash Password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // 3. Generate 6-digit verification OTP
      const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

      // 4. Create Merchant User
      const merchant = await User.create({
        email: email || null,
        mobile,
        passwordHash,
        verificationToken,
      });

      // 5. Setup Initial Starter Subscription Plan
      let starterPlan = await Plan.findOne({ where: { name: 'Starter' } });
      if (!starterPlan) {
        // Seed default Starter plan if it doesn't exist
        starterPlan = await Plan.create({
          name: 'Starter',
          price: 0.00,
          callLimit: 5,
          maxConcurrentCalls: 1,
        });
      }

      const now = new Date();
      const expiryDate = new Date();
      expiryDate.setMonth(now.getMonth() + 1); // 1 month expiration

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

      // Send verification SMS in the background
      await sendSMSVerification(mobile, verificationToken);

      // Generate login tokens
      const tokenPayload = { id: merchant.id, email: merchant.email || null, mobile: merchant.mobile, role: 'merchant' };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Save Refresh Token for validation (hashed)
      merchant.refreshToken = hashToken(refreshToken);
      await merchant.save();

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
        'Merchant registered successfully. Please verify your mobile number with the OTP sent.',
        201
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

      const { email, mobile, password, firstName, lastName } = value;

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
   * Login (Unified Admin and Merchant)
   */
  async login(req, res, next) {
    try {
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, mobile, password, role } = value;

      let account = null;

      if (role === 'super_admin') {
        if (email) {
          account = await Admin.findOne({ where: { email } });
        } else if (mobile) {
          account = await Admin.findOne({ where: { mobile } });
        }
      } else {
        if (email) {
          account = await User.findOne({ where: { email } });
        } else if (mobile) {
          account = await User.findOne({ where: { mobile } });
        }
      }

      if (!account) {
        return ResponseBuilder.error(res, 'Invalid credentials', 401);
      }

      // Check Password
      const isMatch = await bcrypt.compare(password, account.passwordHash);
      if (!isMatch) {
        return ResponseBuilder.error(res, 'Invalid credentials', 401);
      }

      // Check Verification
      if (!account.isVerified && role !== 'super_admin') {
        return ResponseBuilder.error(res, 'Please verify your account before logging in', 403);
      }

      // Tokens
      const tokenPayload = { id: account.id, email: account.email || null, mobile: account.mobile, role };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Save Refresh Token for validation (hashed)
      if (role === 'merchant') {
        account.refreshToken = hashToken(refreshToken);
        await account.save();
      }

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
   */
  async verifyOtp(req, res, next) {
    try {
      const { error, value } = verifyOtpSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { otp, role } = value;

      if (role === 'super_admin') {
        const admin = await Admin.findOne({ where: { verificationToken: otp } });
        if (!admin) {
          return ResponseBuilder.error(res, 'Invalid verification OTP', 400);
        }
        admin.isVerified = true;
        admin.verificationToken = null;
        await admin.save();
        return ResponseBuilder.success(res, null, 'Admin account verified successfully');
      } else {
        const user = await User.findOne({ where: { verificationToken: otp } });
        if (!user) {
          return ResponseBuilder.error(res, 'Invalid verification OTP', 400);
        }
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();
        return ResponseBuilder.success(res, null, 'Merchant account verified successfully');
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * Forgot Password
   */
  async forgotPassword(req, res, next) {
    try {
      const { error, value } = forgotPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { email, role } = value;

      let account = null;
      if (role === 'super_admin') {
        account = await Admin.findOne({ where: { email } });
      } else {
        account = await User.findOne({ where: { email } });
      }

      if (!account) {
        // Return 200 for security, to prevent username enumeration
        return ResponseBuilder.success(res, null, 'If this email exists, a password reset link has been sent');
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

      account.resetToken = resetToken;
      account.resetTokenExpires = resetTokenExpires;
      await account.save();

      // Send password reset email in the background
      await sendPasswordResetEmail(email, resetToken, role);

      return ResponseBuilder.success(
        res,
        null,
        'If this email exists, a password reset link has been sent'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reset Password
   */
  async resetPassword(req, res, next) {
    try {
      const { error, value } = resetPasswordSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { token, password, role } = value;

      let account = null;
      if (role === 'super_admin') {
        account = await Admin.findOne({
          where: { resetToken: token },
        });
      } else {
        account = await User.findOne({
          where: { resetToken: token },
        });
      }

      if (!account || !account.resetTokenExpires || account.resetTokenExpires < new Date()) {
        return ResponseBuilder.error(res, 'Reset token is invalid or has expired', 400);
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

      return ResponseBuilder.success(res, null, 'Password reset successfully. You can now login.');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Setup business details for merchant
   */
  async setupBusiness(req, res, next) {
    try {
      const { error, value } = setupBusinessSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { businessName, businessUrl, categoryId } = value;

      // 1. Verify category exists
      const category = await Category.findByPk(categoryId);
      if (!category) {
        return ResponseBuilder.error(res, 'Selected business category does not exist', 400);
      }

      // 2. Update current authenticated user
      const user = req.user;
      user.businessName = businessName;
      user.businessUrl = businessUrl || null;
      user.categoryId = categoryId;
      await user.save();

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
   * Get current authenticated user profile
   */
  async getMe(req, res, next) {
    try {
      const user = req.user;
      const role = req.userRole;

      let subscription = null;
      let isTrial = false;

      if (role === 'merchant') {
        const subRecord = await Subscription.findOne({
          where: { userId: user.id },
          include: [{ model: Plan, as: 'plan' }],
        });

        if (subRecord) {
          isTrial = subRecord.plan
            ? parseFloat(subRecord.plan.price) === 0 || subRecord.plan.name.toLowerCase() === 'starter'
            : false;

          subscription = subRecord.toJSON();
          subscription.isTrial = isTrial;
        }
      }

      const profile = {
        id: user.id,
        email: user.email,
        mobile: user.mobile,
        role,
        ...(role === 'merchant'
          ? {
              businessName: user.businessName,
              businessUrl: user.businessUrl,
              categoryId: user.categoryId,
              subscription,
              isTrial,
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
}

module.exports = new AuthController();
