const Joi = require('joi');

const createPlanSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    'string.min': 'Plan name must be at least 2 characters long',
    'any.required': 'Plan name is required',
  }),
  price: Joi.number().min(0).required().messages({
    'number.min': 'Price cannot be negative',
    'any.required': 'Price is required',
  }),
  callLimit: Joi.number().integer().min(-1).required().messages({
    'number.min': 'Call limit must be -1 (unlimited) or greater',
    'any.required': 'Call limit is required',
  }),
  maxConcurrentCalls: Joi.number().integer().min(1).required().messages({
    'number.min': 'Max concurrent calls must be at least 1',
    'any.required': 'Max concurrent calls is required',
  }),
}).unknown(true);

const updatePlanSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  price: Joi.number().min(0).optional(),
  callLimit: Joi.number().integer().min(-1).optional(),
  maxConcurrentCalls: Joi.number().integer().min(1).optional(),
}).unknown(true);

module.exports = {
  createPlanSchema,
  updatePlanSchema,
};
