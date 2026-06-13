const { Voice, User } = require('../models');
const ResponseBuilder = require('../utils/response');
const sarvamService = require('../services/sarvamService');
const { voicePreviewSchema } = require('../validators/voice');
const { Op } = require('sequelize');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class VoiceController {
  /**
   * Get all voices accessible to the current merchant
   */
  async getAll(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) {
        return ResponseBuilder.error(res, 'User not found', 404);
      }

      // Retrieve default/preloaded voices and custom voices created by this user
      const voices = await Voice.findAll({
        where: {
          [Op.or]: [
            { userId: req.user.id },
            { isCustom: false },
          ],
        },
      });

      return ResponseBuilder.success(res, voices, 'Voices retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Preview a voice by synthesizing a sample text
   * Uses disk caching to avoid hitting the Sarvam API repeatedly for the same options
   */
  async preview(req, res, next) {
    try {
      const { error, value } = voicePreviewSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { voiceId } = value;

      // Robust check if voiceId is a UUID or a provider voiceId string
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(voiceId);
      const whereClause = isUuid ? { [Op.or]: [{ id: voiceId }, { voiceId: voiceId }] } : { voiceId: voiceId };

      const voice = await Voice.findOne({ where: whereClause });
      if (!voice) {
        return ResponseBuilder.error(res, 'Target Voice not found', 404);
      }

      // Check ownership if it's a custom voice
      if (voice.isCustom && voice.userId !== req.user.id) {
        return ResponseBuilder.error(res, 'Unauthorized to access this custom voice', 403);
      }

      const resolvedVoiceId = voice.voiceId;
      const resolvedLanguage = voice.language || 'en-IN';
      const text = voice.sampleText || 'Hello, this is a preview of the voice agent.';
      const resolvedPace = 1.0;
      const resolvedTemp = 0.6;

      // Generate unique cache key using MD5 hash of parameters
      const configStr = `${resolvedVoiceId}_${resolvedLanguage}_${text}_${resolvedPace}_${resolvedTemp}`;
      const hash = crypto.createHash('md5').update(configStr).digest('hex');

      const previewsDir = path.join(__dirname, '../../uploads/previews');
      const fileName = `preview-${hash}.wav`;
      const filePath = path.join(previewsDir, fileName);

      // Check if preview already cached on disk
      if (fs.existsSync(filePath)) {
        console.log(`Serving cached voice preview: ${fileName}`);
        const cachedBuffer = fs.readFileSync(filePath);
        res.setHeader('Content-Type', 'audio/wav');
        return res.send(cachedBuffer);
      }

      // Synthesize text
      console.log(`Calling Sarvam AI TTS for voice preview: ${resolvedVoiceId} (${resolvedLanguage}) using sample text: "${text}"`);
      const audioBuffer = await sarvamService.synthesizeText(text, resolvedVoiceId, resolvedLanguage, {
        pace: resolvedPace,
        temperature: resolvedTemp,
      });

      // Write to cache directory (creating it if needed)
      if (!fs.existsSync(previewsDir)) {
        fs.mkdirSync(previewsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, audioBuffer);
      console.log(`Saved voice preview to cache: ${fileName}`);

      // Stream binary response
      res.setHeader('Content-Type', 'audio/wav');
      return res.send(audioBuffer);
    } catch (err) {
      next(err);
    }
  }

}

module.exports = new VoiceController();
