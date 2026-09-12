const Joi = require('joi');

const merchantRegisterSchema = Joi.object({
  email: Joi.string().email().optional().allow('').messages({
    'string.email': 'Please enter a valid email address',
  }),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please enter a valid international mobile number',
    'any.required': 'Mobile number is required',
  }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required',
  }),
  fcmToken: Joi.string().optional().allow(''),
  intrestinourproduct: Joi.boolean().default(true).optional(),
});

const adminRegisterSchema = Joi.object({
  email: Joi.string().email().optional().allow(''),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  password: Joi.string().min(6).required(),
  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),
  fcmToken: Joi.string().optional().allow(''),
});

const loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  password: Joi.string().optional(),
  otp: Joi.string().length(6).optional(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
  fcmToken: Joi.string().optional().allow(''),
}).or('email', 'mobile');

const loginVerifyOtpSchema = Joi.object({
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'any.required': 'Mobile number is required',
  }),
  otp: Joi.string().length(6).required().messages({
    'string.length': 'OTP must be 6 digits',
    'any.required': 'OTP is required',
  }),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
  fcmToken: Joi.string().optional().allow(''),
});

const setupBusinessSchema = Joi.object({
  businessName: Joi.string()
    .pattern(/^[a-zA-Z\s]+$/)
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.pattern.base': 'Business name must contain only letters and spaces',
      'string.min': 'Business name must be at least 2 characters long',
      'any.required': 'Business name is required',
    }),
  businessUrl: Joi.string().uri().optional().allow('').messages({
    'string.uri': 'Please enter a valid URL',
  }),
  business_type: Joi.string().valid('individual', 'proprietorship', 'private_limited', 'llp', 'partnership', 'public_limited', 'trust', 'society', 'huf', 'government').required().messages({
    'any.only': 'Invalid business type',
    'any.required': 'Business type is required',
  }),
  businessType: Joi.any().strip(),
  categoryId: Joi.string().uuid().required().messages({
    'string.uuid': 'Invalid category ID format',
    'any.required': 'Business category is required',
  }),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().optional(),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
}).or('email', 'mobile');

const resetPasswordSchema = Joi.object({
  token: Joi.string().optional(),
  otp: Joi.string().length(6).optional(),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
}).or('token', 'otp');

const verifyOtpSchema = Joi.object({
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  otp: Joi.string().length(6).required(),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
});

const resendOtpSchema = Joi.object({
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'any.required': 'Mobile number is required',
  }),
  type: Joi.string().valid('registration', 'login', 'reset_password').default('registration'),
  role: Joi.string().valid('merchant', 'super_admin').default('merchant'),
});

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required().messages({
    'any.required': 'Current password (oldPassword) is required',
  }),
  newPassword: Joi.string().min(6).required().messages({
    'string.min': 'New password must be at least 6 characters long',
    'any.required': 'New password is required',
  }),
  confirmPassword: Joi.string().optional(),
});

const updateFcmTokenSchema = Joi.object({
  fcmToken: Joi.string().required().messages({
    'any.required': 'fcmToken is required',
  }),
});

const resetMerchantPasswordSchema = Joi.object({
  password: Joi.string().min(6).optional().messages({
    'string.min': 'Password must be at least 6 characters long',
  }),
  newPassword: Joi.string().min(6).optional().messages({
    'string.min': 'Password must be at least 6 characters long',
  }),
  confirmPassword: Joi.string().optional(),
  confirm_password: Joi.string().optional(),
}).custom((value, helpers) => {
  const newPass = value.password || value.newPassword;
  const confirmPass = value.confirmPassword || value.confirm_password;

  if (!newPass) {
    return helpers.message('Password is required and must be at least 6 characters long');
  }
  if (!confirmPass) {
    return helpers.message('Confirm password is required');
  }
  if (newPass !== confirmPass) {
    return helpers.message('Password and confirm password do not match');
  }
  return value;
});

module.exports = {
  merchantRegisterSchema,
  adminRegisterSchema,
  loginSchema,
  setupBusinessSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resetMerchantPasswordSchema,
  verifyOtpSchema,
  loginVerifyOtpSchema,
  resendOtpSchema,
  changePasswordSchema,
  updateFcmTokenSchema,
};
