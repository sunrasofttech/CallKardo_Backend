const Joi = require('joi');

const createAgentSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).optional(),
  systemPrompt: Joi.string().min(10).required(),
  language: Joi.string().max(10).default('en'),
  voiceId: Joi.string().uuid().required(),
  categoryId: Joi.string().uuid().optional(),
  activeStatus: Joi.boolean().default(true),
  allowInterruption: Joi.boolean().default(true),
  pace: Joi.number().min(0.5).max(2.0).default(1.00),
  temperature: Joi.number().min(0.01).max(2.0).default(0.60),
  firstMessage: Joi.string().max(1000).optional().allow(null, ''),
  aiProvider: Joi.string().valid('custom', 'geminilive').default('custom'),
});

const updateAgentSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(500).optional(),
  systemPrompt: Joi.string().min(10).optional(),
  language: Joi.string().max(10).optional(),
  voiceId: Joi.string().uuid().optional(),
  categoryId: Joi.string().uuid().optional(),
  activeStatus: Joi.boolean().optional(),
  allowInterruption: Joi.boolean().optional(),
  pace: Joi.number().min(0.5).max(2.0).optional(),
  temperature: Joi.number().min(0.01).max(2.0).optional(),
  firstMessage: Joi.string().max(1000).optional().allow(null, ''),
  aiProvider: Joi.string().valid('custom', 'geminilive').optional(),
});

module.exports = {
  createAgentSchema,
  updateAgentSchema,
};
