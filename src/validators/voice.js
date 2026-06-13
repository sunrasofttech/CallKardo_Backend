const Joi = require('joi');

const voicePreviewSchema = Joi.object({
  voiceId: Joi.string().required(),
});

module.exports = {
  voicePreviewSchema,
};
