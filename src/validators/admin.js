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
  merchantId: Joi.string().uuid().optional(),
  action: Joi.string().optional(),
});

module.exports = {
  createVoiceSchema,
  updateVoiceSchema,
  listQuerySchema,
};
