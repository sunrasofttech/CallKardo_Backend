const Joi = require('joi');

const voicePreviewSchema = Joi.object({
  voiceId: Joi.string().required(),
  text: Joi.string().max(500).optional(),
  language: Joi.string().max(10).optional(),
  pace: Joi.number().min(0.5).max(2.0).optional(),
  temperature: Joi.number().min(0.01).max(2.0).optional(),
});

module.exports = {
  voicePreviewSchema,
};
