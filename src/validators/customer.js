const Joi = require('joi');

const createCustomerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please enter a valid international mobile number',
  }),
  email: Joi.string().email().optional().allow('').allow(null),
  tags: Joi.string().max(255).optional(),
  notes: Joi.string().max(500).optional(),
});

const updateCustomerSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  mobile: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  email: Joi.string().email().optional().allow('').allow(null),
  tags: Joi.string().max(255).optional(),
  notes: Joi.string().max(500).optional(),
});

const createListSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).optional(),
  customerIds: Joi.array().items(Joi.string().uuid()).optional(), // Optional list of pre-existing customer IDs
});

module.exports = {
  createCustomerSchema,
  updateCustomerSchema,
  createListSchema,
};
