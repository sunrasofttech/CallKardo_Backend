const Joi = require('joi');

const createForwardingSchema = Joi.object({
  vobizNumberId: Joi.string().uuid().required(),
  agentId: Joi.string().uuid().required(),
  personalNumber: Joi.string().min(10).max(20).required(),
  forwardingType: Joi.string().valid('all', 'busy', 'unanswered', 'unreachable').default('all'),
  notes: Joi.string().max(500).optional().allow(null, ''),
});

const updateForwardingSchema = Joi.object({
  agentId: Joi.string().uuid().optional(),
  personalNumber: Joi.string().min(10).max(20).optional(),
  forwardingType: Joi.string().valid('all', 'busy', 'unanswered', 'unreachable').optional(),
  status: Joi.string().valid('active', 'inactive').optional(),
  notes: Joi.string().max(500).optional().allow(null, ''),
}).min(1);

module.exports = {
  createForwardingSchema,
  updateForwardingSchema,
};
