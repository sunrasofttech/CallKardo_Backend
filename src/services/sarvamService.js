const axios = require('axios');
const defaults = require('../config/defaults');

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
      // In production, Sarvam STT expects chunked multi-part form upload or raw payload
      // Let's implement standard Axios multipart upload for short audio durations
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', audioBuffer, {
        filename: 'chunk.wav',
        contentType: 'audio/wav',
      });
      form.append('language_code', languageCode);

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
      // Mapping language strings to Sarvam standard locales
      const localeMap = {
        'en': 'en-IN',
        'hi': 'hi-IN',
        'mr': 'mr-IN',
        'ta': 'ta-IN',
        'te': 'te-IN',
        'kn': 'kn-IN',
        'ml': 'ml-IN',
      };
      
      const locale = localeMap[languageCode] || languageCode || 'en-IN';

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
