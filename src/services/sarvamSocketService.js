const WebSocket = require('ws');
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

class SarvamSTTStream {
  /**
   * Persistent Speech-to-Text WebSocket Stream
   * @param {object} params
   * @param {string} params.languageCode - Language code (e.g. en-IN)
   * @param {function} params.onTranscript - Callback when new transcript is received
   * @param {function} params.onError - Callback on WebSocket error
   */
  constructor({ languageCode = defaults.sarvam.defaultLanguageCode, onTranscript, onSpeechEnd, onError }) {
    this.apiKey = defaults.sarvam.apiKey;
    this.apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    this.languageCode = SARVAM_LOCALE_MAP[languageCode] || languageCode || 'en-IN';
    this.onTranscript = onTranscript;
    this.onSpeechEnd = onSpeechEnd;
    this.onError = onError;

    this.ws = null;
    this.isMock = !this.apiKey || this.apiKey === 'your_sarvam_api_key';
    this.isConnected = false;
    this.pendingAudioChunks = [];
    this.pcmBatchBuffer = [];
    this.pcmBatchBytes = 0;
    this.PCM_BATCH_TARGET_BYTES = 3200;

    // Local buffering for mock mode
    this.mockTimer = null;
    this.mockResponses = [
      'hello',
      'i am interested in your services',
      'can you call me back tomorrow at noon?',
      'yes that works for me',
      'thank you goodbye',
    ];
  }

  connect() {
    if (this.isMock) {
      console.warn('[Mock Sarvam STT WSS] Key missing. Initializing Mock STT stream.');
      this.isConnected = true;
      return;
    }

    try {
      const wsBaseUrl = this.apiBaseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}/speech-to-text/ws?language-code=${encodeURIComponent(this.languageCode)}&model=saaras:v3&mode=transcribe&sample_rate=16000&high_vad_sensitivity=true&vad_signals=true&flush_signal=true`;

      console.log(`[Sarvam STT WSS] Connecting to: ${url}`);
      this.ws = new WebSocket(url, {
        headers: {
          'api-subscription-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        console.log('[Sarvam STT WSS] Connection established.');
        this.isConnected = true;
        if (this.pendingAudioChunks.length > 0) {
          const queued = this.pendingAudioChunks;
          this.pendingAudioChunks = [];
          for (const chunk of queued) {
            this.pcmBatchBuffer.push(chunk);
            this.pcmBatchBytes += chunk.length;
          }
          this._flushPcmBatch();
        }
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());

          if (parsed.type === 'data' && parsed.data?.transcript) {
            if (this.onTranscript) {
              this.onTranscript(parsed.data.transcript);
            }
            return;
          }

          if (parsed.type === 'events') {
            const signalType = parsed.data?.signal_type || parsed.data?.event_type;
            if (signalType === 'END_SPEECH' && this.onSpeechEnd) {
              this.onSpeechEnd();
            }
            return;
          }

          if (parsed.type === 'error') {
            const errMsg = parsed.data?.error || parsed.data?.message || JSON.stringify(parsed.data);
            console.error('[Sarvam STT WSS] API error:', errMsg);
            if (this.onError) this.onError(new Error(errMsg));
          }
        } catch (err) {
          // Ignore JSON parsing errors
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Sarvam STT WSS] Error:', err.message);
        if (this.onError) this.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Sarvam STT WSS] Connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
      });
    } catch (err) {
      console.error('[Sarvam STT WSS] Connection setup failed:', err.message);
      if (this.onError) this.onError(err);
    }
  }

  sendAudio(pcmBuffer) {
    if (this.isMock) {
      if (!this.isConnected) return;
      if (this.mockTimer) clearTimeout(this.mockTimer);
      this.mockTimer = setTimeout(() => {
        const transcript = this.mockResponses[Math.floor(Math.random() * this.mockResponses.length)];
        if (this.onTranscript) {
          this.onTranscript(transcript);
        }
      }, 800);
      return;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.ws) {
        this.pendingAudioChunks.push(pcmBuffer);
      }
      return;
    }

    this.pcmBatchBuffer.push(pcmBuffer);
    this.pcmBatchBytes += pcmBuffer.length;

    if (this.pcmBatchBytes >= this.PCM_BATCH_TARGET_BYTES) {
      this._flushPcmBatch();
    }
  }

  _flushPcmBatch() {
    if (this.pcmBatchBytes === 0) return;

    const combined = Buffer.concat(this.pcmBatchBuffer);
    this.pcmBatchBuffer = [];
    this.pcmBatchBytes = 0;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this._sendAudioPayload(combined);
    } else if (this.ws) {
      this.pendingAudioChunks.push(combined);
    }
  }

  _sendAudioPayload(pcmBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const payload = JSON.stringify({
      audio: {
        data: pcmBuffer.toString('base64'),
        sample_rate: 16000,
        encoding: 'pcm_s16le',
      },
    });
    this.ws.send(payload);
  }

  flush() {
    this._flushPcmBatch();

    if (!this.isConnected) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'flush' }));
    }
  }

  close() {
    this.isConnected = false;
    this.pendingAudioChunks = [];
    this.pcmBatchBuffer = [];
    this.pcmBatchBytes = 0;
    if (this.mockTimer) clearTimeout(this.mockTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}

class SarvamTTSStream {
  /**
   * Persistent Text-to-Speech WebSocket Stream
   * @param {object} params
   * @param {string} params.languageCode - Language code (e.g. en-IN)
   * @param {string} params.voiceId - Speaker ID (e.g. shubh)
   * @param {function} params.onAudioChunk - Callback when synthesized audio chunk is received (decoded raw PCM)
   * @param {function} params.onDone - Callback when streaming is completed
   * @param {function} params.onError - Callback on error
   */
  constructor({ languageCode = defaults.sarvam.defaultLanguageCode, voiceId = defaults.sarvam.defaultVoiceId, onAudioChunk, onDone, onError }) {
    this.apiKey = defaults.sarvam.apiKey;
    this.apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    this.languageCode = SARVAM_LOCALE_MAP[languageCode] || languageCode || 'en-IN';
    this.voiceId = voiceId || 'amrit';
    this.onAudioChunk = onAudioChunk;
    this.onDone = onDone;
    this.onError = onError;

    this.ws = null;
    this.isMock = !this.apiKey || this.apiKey === 'your_sarvam_api_key';
    this.isConnected = false;
    this.queuedText = null;
    this.queuedCallbacks = null;
    this.pendingDoneCallbacks = [];
  }

  connect() {
    if (this.isMock) {
      console.warn('[Mock Sarvam TTS WSS] Key missing. Initializing Mock TTS stream.');
      this.isConnected = true;
      return;
    }

    try {
      const wsBaseUrl = this.apiBaseUrl.replace(/^http/, 'ws');
      const url = `${wsBaseUrl}/text-to-speech/ws?model=bulbul:v3&send_completion_event=true`;

      console.log(`[Sarvam TTS WSS] Connecting to: ${url}`);
      this.ws = new WebSocket(url, {
        headers: {
          'api-subscription-key': this.apiKey,
        },
      });

      this.ws.on('open', () => {
        console.log('[Sarvam TTS WSS] Connection established.');
        this.isConnected = true;

        // Send initial handshake configuration
        const configMessage = JSON.stringify({
          type: 'config',
          data: {
            target_language_code: this.languageCode,
            speaker: this.voiceId,
            send_completion_event: true,
            output_audio_codec: 'linear16',
            speech_sample_rate: 16000,
          },
        });
        this.ws.send(configMessage);

        // Send queued text if any
        if (this.queuedText) {
          if (this.queuedCallbacks) {
            this.pendingDoneCallbacks.push(this.queuedCallbacks);
            this.queuedCallbacks = null;
          }
          this._sendTextPayload(this.queuedText);
          this.queuedText = null;
        }
      });

      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'audio' && parsed.data?.audio) {
            const base64Audio = parsed.data.audio;
            const audioBuffer = Buffer.from(base64Audio, 'base64');
            
            // Audio from Sarvam TTS WSS is typically encoded base64 WAV.
            // If it has a WAV header, strip it or parse PCM.
            // Since VoicePipeline synthesizes and resamples, let's extract the raw PCM chunk.
            if (this.onAudioChunk) {
              this.onAudioChunk(audioBuffer);
            }
          } else if (parsed.type === 'event' && (parsed.data?.event === 'final_audio_chunk_generated' || parsed.data?.event_type === 'final')) {
            this._resolveNextDone();
          }
        } catch (err) {
          // Ignore JSON parsing errors
        }
      });

      this.ws.on('error', (err) => {
        console.error('[Sarvam TTS WSS] Error:', err.message);
        if (this.onError) this.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[Sarvam TTS WSS] Connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        this._flushDoneCallbacks();
      });
    } catch (err) {
      console.error('[Sarvam TTS WSS] Connection setup failed:', err.message);
      if (this.onError) this.onError(err);
    }
  }

  sendText(text, onDone) {
    if (this.isMock) {
      if (onDone) this.pendingDoneCallbacks.push(onDone);
      setTimeout(() => {
        if (this.onAudioChunk) {
          this.onAudioChunk(Buffer.alloc(1024));
        }
        setTimeout(() => {
          this._resolveNextDone();
        }, 300);
      }, 200);
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (onDone) this.pendingDoneCallbacks.push(onDone);
      this._sendTextPayload(text);
      return;
    }

    this.queuedText = text;
    if (onDone) this.queuedCallbacks = onDone;
  }

  _resolveNextDone() {
    const callback = this.pendingDoneCallbacks.shift();
    if (callback) callback();
  }

  _flushDoneCallbacks() {
    while (this.pendingDoneCallbacks.length > 0) {
      this._resolveNextDone();
    }
    if (this.queuedCallbacks) {
      this.queuedCallbacks();
      this.queuedCallbacks = null;
    }
  }

  _sendTextPayload(text) {
    const textMessage = JSON.stringify({
      type: 'text',
      data: {
        text: text,
      },
    });
    this.ws.send(textMessage);

    // Immediately send flush to initiate synthesis for this sentence segment
    const flushMessage = JSON.stringify({
      type: 'flush',
    });
    this.ws.send(flushMessage);
  }

  close() {
    this.isConnected = false;
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        // Ignore close errors
      }
      this.ws = null;
    }
  }
}

module.exports = {
  SarvamSTTStream,
  SarvamTTSStream,
};
