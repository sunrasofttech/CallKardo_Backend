const Joi = require('joi');

const updatePageSchema = Joi.object({
  title: Joi.string().min(2).max(200).optional(),
  content: Joi.string().allow('').optional(),
  metaTitle: Joi.string().max(200).optional(),
  metaDescription: Joi.string().max(500).optional(),
  contactEmail: Joi.string().email().optional(),
  contactPhone: Joi.string().optional(),
  faq: Joi.array().items(
    Joi.object({
      question: Joi.string().required(),
      answer: Joi.string().required(),
    })
  ).optional(),
});

const upsertSettingSchema = Joi.object({
  key: Joi.string().min(2).max(100).required(),
  value: Joi.any().required(),
});

module.exports = {
  updatePageSchema,
  upsertSettingSchema,
};
