const axios = require('axios');
const defaults = require('../config/defaults');

const SARVAM_LOCALE_MAP = {
  'en': 'en-IN',
  'hi': 'hi-IN',
  'bn': 'bn-IN',
  'ta': 'ta-IN',
  'te': 'te-IN',
  'gu': 'gu-IN',
  'kn': 'kn-IN',
  'ml': 'ml-IN',
  'mr': 'mr-IN',
  'pa': 'pa-IN',
  'od': 'od-IN',
  'en-IN': 'en-IN',
  'hi-IN': 'hi-IN',
  'bn-IN': 'bn-IN',
  'ta-IN': 'ta-IN',
  'te-IN': 'te-IN',
  'gu-IN': 'gu-IN',
  'kn-IN': 'kn-IN',
  'ml-IN': 'ml-IN',
  'mr-IN': 'mr-IN',
  'pa-IN': 'pa-IN',
  'od-IN': 'od-IN'
};

function addWavHeader(pcmBuffer, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // 1 Channel (Mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * 16 * 1) / 8, 28);
  header.writeUInt16LE((16 * 1) / 8, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

class SarvamService {
  constructor() {
    this.apiKey = defaults.sarvam.apiKey;
    this.apiBaseUrl = defaults.sarvam.apiBaseUrl;
  }

  /**
   * Transcribe an audio chunk (Speech to Text)
   * @param {Buffer} audioBuffer - Linear16 PCM audio chunk
   * @param {string} languageCode - Language code (e.g. en-IN, hi-IN)
   */
  async transcribeAudioChunk(audioBuffer, languageCode = defaults.sarvam.defaultLanguageCode) {
    // If API Key is missing, simulate mock transcription
    if (!this.apiKey || this.apiKey === 'your_sarvam_api_key') {
      return this._mockTranscription(audioBuffer);
    }

    try {
      const locale = SARVAM_LOCALE_MAP[languageCode] || languageCode || 'en-IN';

      // Convert raw linear16 PCM to a valid WAV buffer with header
      const wavBuffer = addWavHeader(audioBuffer, 16000);

      // In production, Sarvam STT expects chunked multi-part form upload or raw payload
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', wavBuffer, {
        filename: 'chunk.wav',
        contentType: 'audio/wav',
      });
      form.append('language_code', locale);

      const response = await axios.post(`${this.apiBaseUrl}/speech-to-text`, form, {
        headers: {
          ...form.getHeaders(),
          'api-subscription-key': this.apiKey,
        },
      });

      return response.data.transcript || '';
    } catch (error) {
      console.error('Sarvam STT Error:', error.response ? error.response.data : error.message);
      return '';
    }
  }

  /**
   * Convert Text to Speech (TTS)
   * Support: Hindi, English, Marathi, Tamil, Telugu, Kannada, Malayalam
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Voice identifier
   * @param {string} languageCode - Target language (e.g. 'hi-IN', 'en-IN')
   * @returns {Promise<Buffer>} Audio buffer (typically linear16 PCM or WAV)
   */
  async synthesizeText(text, voiceId = defaults.sarvam.defaultVoiceId, languageCode = defaults.sarvam.defaultLanguageCode, options = {}) {
    if (!this.apiKey || this.apiKey === 'your_sarvam_api_key') {
      return this._mockTtsAudio(text);
    }

    try {
      const locale = SARVAM_LOCALE_MAP[languageCode] || languageCode || 'en-IN';

      const response = await axios.post(
        `${this.apiBaseUrl}/text-to-speech`,
        {
          inputs: [text],
          voice: voiceId, // e.g. 'shubh' or category preloaded voices
          language_code: locale,
          model: 'bulbul:v3',
          pace: options.pace !== undefined ? parseFloat(options.pace) : 1.0,
          temperature: options.temperature !== undefined ? parseFloat(options.temperature) : 0.6,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': this.apiKey,
          },
        }
      );

      // Sarvam TTS responses contain base64 encoded audio format (typically wav)
      if (response.data && response.data.audios && response.data.audios[0]) {
        return Buffer.from(response.data.audios[0], 'base64');
      }
      throw new Error('No audio returned from Sarvam TTS');
    } catch (error) {
      console.error('Sarvam TTS Error:', error.response ? error.response.data : error.message);
      // Fallback to mock audio on error
      return this._mockTtsAudio(text);
    }
  }

  /**
   * Private mock STT transcription
   */
  _mockTranscription(audioBuffer) {
    // Generate simple mock transcripts based on time
    const responses = [
      'hello',
      'i am interested in your services',
      'can you call me back tomorrow at noon?',
      'yes that works for me',
      'thank you goodbye',
    ];
    // Return a random response phrase for testing
    const idx = Math.floor(Math.random() * responses.length);
    return responses[idx];
  }

  /**
   * Private mock TTS audio generator (generates small silent wave chunk)
   */
  _mockTtsAudio(text) {
    // Return a 1024-byte buffer of pseudo-silent PCM audio data to satisfy the WS streaming output
    return Buffer.alloc(1024);
  }
}

module.exports = new SarvamService();
