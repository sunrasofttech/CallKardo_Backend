const { Voice, User } = require('../models');
const ResponseBuilder = require('../utils/response');
const sarvamService = require('../services/sarvamService');
const { voicePreviewSchema } = require('../validators/voice');
const { Op } = require('sequelize');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const defaults = require('../config/defaults');

function writeWavHeader(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcmBuffer.length;
  const chunkSize = 36 + dataSize;

  header.write('RIFF', 0);
  header.writeUInt32LE(chunkSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

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

      const { provider } = req.query;

      const whereClause = {
        [Op.or]: [
          { userId: req.user.id },
          { isCustom: false },
        ],
      };

      if (provider) {
        whereClause.provider = provider;
      }

      // Retrieve default/preloaded voices and custom voices created by this user
      const voices = await Voice.findAll({
        where: whereClause,
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

      const previewUrl = `${req.protocol}://${req.get('host')}/api/v1/voices/preview/${fileName}`;

      // Check if preview already cached on disk
      if (fs.existsSync(filePath)) {
        console.log(`Serving cached voice preview URL: ${previewUrl}`);
        return ResponseBuilder.success(res, { previewUrl }, 'Voice preview retrieved from cache');
      }

      let audioBuffer;

      if (voice.provider === 'google') {
        console.log(`Calling Gemini TTS for voice preview: ${resolvedVoiceId} using sample text: "${text}"`);
        const model = 'gemini-3.1-flash-tts-preview';
        const apiKey = defaults.gemini.apiKey;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const requestBody = {
          contents: [
            {
              parts: [
                { text: text }
              ]
            }
          ],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: resolvedVoiceId
                }
              }
            }
          }
        };

        const response = await axios.post(url, requestBody, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });

        const candidates = response.data?.candidates;
        if (!candidates || candidates.length === 0 || !candidates[0].content?.parts) {
          throw new Error('Gemini TTS failed to generate audio');
        }

        const part = candidates[0].content.parts.find(p => p.inlineData);
        if (!part) {
          throw new Error('Gemini TTS response did not contain inline audio data');
        }

        const rawPcm = Buffer.from(part.inlineData.data, 'base64');
        audioBuffer = writeWavHeader(rawPcm, 24000, 1, 16);
      } else {
        // Synthesize text
        console.log(`Calling Sarvam AI TTS for voice preview: ${resolvedVoiceId} (${resolvedLanguage}) using sample text: "${text}"`);
        audioBuffer = await sarvamService.synthesizeText(text, resolvedVoiceId, resolvedLanguage, {
          pace: resolvedPace,
          temperature: resolvedTemp,
        });
      }

      // Write to cache directory (creating it if needed)
      if (!fs.existsSync(previewsDir)) {
        fs.mkdirSync(previewsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, audioBuffer);
      console.log(`Saved voice preview to cache: ${fileName}`);

      return ResponseBuilder.success(res, { previewUrl }, 'Voice preview generated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Serve a previously synthesized voice preview audio file
   * GET /api/v1/voices/preview/:filename
   */
  async servePreview(req, res, next) {
    try {
      const { filename } = req.params;
      
      // Basic security check to prevent directory traversal
      if (!/^[a-zA-Z0-9\-_]+\.wav$/.test(filename)) {
        return ResponseBuilder.error(res, 'Invalid preview filename', 400);
      }
      
      const previewsDir = path.join(__dirname, '../../uploads/previews');
      const filePath = path.join(previewsDir, filename);
      
      if (!fs.existsSync(filePath)) {
        return ResponseBuilder.error(res, 'Preview file not found or expired', 404);
      }
      
      res.setHeader('Content-Type', 'audio/wav');
      return res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  }
}

/**
 * Automatically cleans up cached voice previews older than 24 hours
 */
function cleanupOldPreviews() {
  const previewsDir = path.join(__dirname, '../../uploads/previews');
  if (!fs.existsSync(previewsDir)) return;

  try {
    const files = fs.readdirSync(previewsDir);
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const file of files) {
      if (file.startsWith('preview-') && file.endsWith('.wav')) {
        const filePath = path.join(previewsDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`Evicted expired voice preview from cache: ${file}`);
        }
      }
    }
  } catch (err) {
    console.error('Failed to cleanup old voice previews:', err);
  }
}

// Run cleanup once on startup and then every 24 hours
cleanupOldPreviews();
setInterval(cleanupOldPreviews, 24 * 60 * 60 * 1000);

module.exports = new VoiceController();
