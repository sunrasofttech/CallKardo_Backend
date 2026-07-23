const Joi = require('joi');

const createVoiceSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  provider: Joi.string().valid('sarvam', 'cartesia', 'bulbul', 'elevenlabs', 'google').required(),
  voiceId: Joi.string().max(100).required(),
  language: Joi.string().max(10).required(),
  gender: Joi.string().valid('Male', 'Female', 'Neutral', 'male', 'female', 'neutral').required(),
  sampleText: Joi.string().optional().allow(''),
  isCustom: Joi.boolean().default(false),
  userId: Joi.string().uuid().optional().allow(null),
});

const updateVoiceSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  provider: Joi.string().valid('sarvam', 'cartesia', 'bulbul', 'elevenlabs', 'google').optional(),
  voiceId: Joi.string().max(100).optional(),
  language: Joi.string().max(10).optional(),
  gender: Joi.string().valid('Male', 'Female', 'Neutral', 'male', 'female', 'neutral').optional(),
  sampleText: Joi.string().optional().allow(''),
  isCustom: Joi.boolean().optional(),
  userId: Joi.string().uuid().optional().allow(null),
});

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().optional().allow(''),
  status: Joi.string().optional().allow(''),
  planId: Joi.string().uuid().optional(),
  merchantId: Joi.string().uuid().optional(),
  action: Joi.string().optional(),
});

const adminUpgradeSubscriptionSchema = Joi.object({
  merchantId: Joi.string().uuid().optional(),
  planId: Joi.string().uuid().required().messages({
    'string.uuid': 'Invalid plan ID format',
    'any.required': 'Plan ID is required',
  }),
  customCallLimit: Joi.number().integer().min(-1).optional(),
  durationMonths: Joi.number().integer().min(1).max(36).default(1),
  expiryDate: Joi.date().iso().optional(),
  status: Joi.string().valid('active', 'expired', 'cancelled').default('active'),
});

const adminUpdateSubscriptionSchema = Joi.object({
  planId: Joi.string().uuid().optional(),
  callsRemaining: Joi.number().integer().min(-1).optional(),
  callsUsed: Joi.number().integer().min(0).optional(),
  expiryDate: Joi.date().iso().optional().allow(null),
  status: Joi.string().valid('active', 'expired', 'cancelled').optional(),
});

module.exports = {
  createVoiceSchema,
  updateVoiceSchema,
  listQuerySchema,
  adminUpgradeSubscriptionSchema,
  adminUpdateSubscriptionSchema,
};


