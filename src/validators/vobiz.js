const Joi = require('joi');

const connectAccountSchema = Joi.object({
  customerId: Joi.string().min(2).max(100).required(),
  apiKey: Joi.string().min(10).required(),
  apiSecret: Joi.string().min(10).required(),
});

const addNumberSchema = Joi.object({
  number: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required().messages({
    'string.pattern.base': 'Please enter a valid international phone number (e.g. +1234567890)',
  }),
  status: Joi.string().valid('active', 'inactive').default('active'),
  agentId: Joi.string().uuid().optional().allow(null),
  providerData: Joi.object().optional(),
});

const updateNumberSchema = Joi.object({
  status: Joi.string().valid('active', 'inactive').optional(),
  agentId: Joi.string().uuid().optional().allow(null),
  providerData: Joi.object().optional(),
});

const buyNumberSchema = Joi.object({
  number: Joi.string().required(),
});

const importAccountSchema = Joi.object({
  apiKey: Joi.string().min(10).required(),
  apiSecret: Joi.string().min(10).required(),
});

const saveImportedNumberSchema = Joi.object({
  numbers: Joi.array().items(
    Joi.string().pattern(/^\+?[1-9]\d{1,14}$/)
  ).min(1).required(),
});

module.exports = {
  connectAccountSchema,
  addNumberSchema,
  updateNumberSchema,
  buyNumberSchema,
  importAccountSchema,
  saveImportedNumberSchema,
};
