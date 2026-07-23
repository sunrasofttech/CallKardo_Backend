const { stt, tts } = require('@livekit/agents');
const { AudioFrame } = require('@livekit/rtc-node');
const { WebSocket } = require('ws');
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

class SarvamSpeechStream extends stt.SpeechStream {
  constructor(sttInstance, options) {
    super(sttInstance, 16000, options?.connOptions);
    this.sttInstance = sttInstance;
  }

  async run() {
    const apiKey = defaults.sarvam.apiKey;
    const apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
    const languageCode = SARVAM_LOCALE_MAP[this.sttInstance.language] || this.sttInstance.language || 'en-IN';

    const url = `${wsBaseUrl}/speech-to-text/ws?language-code=${encodeURIComponent(languageCode)}&model=saaras:v3&mode=transcribe&sample_rate=16000&high_vad_sensitivity=false&vad_signals=true&flush_signal=true`;

    console.log(`[LiveKit Sarvam STT] Connecting to WSS: ${url}`);
    const ws = new WebSocket(url, {
      headers: {
        'api-subscription-key': apiKey,
      },
    });

    const self = this;

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'data' && parsed.data?.transcript) {
          const text = parsed.data.transcript;
          const isFinal = parsed.data.is_final;
          
          self.queue.put({
            type: isFinal ? stt.SpeechEventType.FINAL_TRANSCRIPT : stt.SpeechEventType.INTERIM_TRANSCRIPT,
            alternatives: [{
              text,
              language: 'en',
              startTime: 0,
              endTime: 0,
              confidence: 1.0,
            }],
          });
        } else if (parsed.type === 'events') {
          const signalType = parsed.data?.signal_type || parsed.data?.event_type;
          if (signalType === 'END_SPEECH') {
            self.queue.put({
              type: stt.SpeechEventType.END_OF_SPEECH,
              alternatives: [{
                text: '',
                language: 'en',
                startTime: 0,
                endTime: 0,
                confidence: 1.0,
              }]
            });
          }
        }
      } catch (err) {
        // ignore
      }
    });

    ws.on('error', (err) => {
      console.error('[LiveKit Sarvam STT] WebSocket error:', err.message);
    });

    // Pump frames from input queue to Sarvam WSS
    try {
      for await (const chunk of this.input) {
        if (chunk === stt.SpeechStream.FLUSH_SENTINEL) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'flush' }));
          }
          continue;
        }

        // Convert Int16Array AudioFrame to Buffer
        const pcmBuffer = Buffer.from(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength);
        if (this.sttInstance.onAudioChunk) {
          try { this.sttInstance.onAudioChunk(pcmBuffer); } catch (_) {}
        }
        if (ws.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({
            audio: {
              data: pcmBuffer.toString('base64'),
              sample_rate: 16000,
              encoding: 'audio/wav',
            }
          });
          ws.send(payload);
        }
      }
    } catch (err) {
      console.error('[LiveKit Sarvam STT] Input pump failed:', err.message);
    } finally {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  }
}

class SarvamSTT extends stt.STT {
  constructor(options = {}) {
    super({
      streaming: true,
      interimResults: true,
    });
    this.label = 'sarvam_stt';
    this.language = options.language || 'en-IN';
    this.onAudioChunk = options.onAudioChunk || null;
  }

  get model() {
    return 'saaras:v3';
  }

  get provider() {
    return 'sarvam';
  }

  async _recognize(frame, abortSignal) {
    return {
      type: stt.SpeechEventType.FINAL_TRANSCRIPT,
      alternatives: [{
        text: '',
        language: 'en',
        startTime: 0,
        endTime: 0,
        confidence: 0,
      }]
    };
  }

  stream(options) {
    return new SarvamSpeechStream(this, options);
  }
}

class SarvamSynthesizeStream extends tts.SynthesizeStream {
  constructor(ttsInstance, options) {
    super(ttsInstance, options?.connOptions);
    this.ttsInstance = ttsInstance;
  }

  async run() {
    const apiKey = defaults.sarvam.apiKey;
    const apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
    const languageCode = SARVAM_LOCALE_MAP[this.ttsInstance.language] || this.ttsInstance.language || 'en-IN';

    const url = `${wsBaseUrl}/text-to-speech/ws?model=bulbul:v3&send_completion_event=true`;

    const ws = new WebSocket(url, {
      headers: {
        'api-subscription-key': apiKey,
      },
    });

    const self = this;

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'config',
        data: {
          target_language_code: languageCode,
          speaker: self.ttsInstance.voiceId || 'amrit',
          pace: self.ttsInstance.pace || 1.10,
          temperature: self.ttsInstance.temperature || 0.75,
          model: 'bulbul:v3',
        }
      }));
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'audio' && parsed.data) {
          const pcmBuffer = Buffer.from(parsed.data, 'base64');
          if (self.ttsInstance.onAudioChunk) {
            try { self.ttsInstance.onAudioChunk(pcmBuffer); } catch (_) {}
          }
          const int16Array = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength / 2);
          const frame = new AudioFrame(int16Array, 16000, 1, int16Array.length);

          self.queue.put({
            requestId: 'sarvam-tts',
            segmentId: 'sarvam-segment',
            frame,
            final: false,
          });
        } else if (parsed.type === 'completion') {
          self.queue.put({
            requestId: 'sarvam-tts',
            segmentId: 'sarvam-segment',
            frame: new AudioFrame(new Int16Array(0), 16000, 1, 0),
            final: true,
          });
        }
      } catch (err) {
        // ignore
      }
    });

    ws.on('error', (err) => {
      console.error('[LiveKit Sarvam TTS] WebSocket error:', err.message);
    });

    // Pump input text to Sarvam WSS
    try {
      for await (const text of this.input) {
        if (text === tts.SynthesizeStream.FLUSH_SENTINEL) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'flush' }));
          }
          continue;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'text',
            data: text,
          }));
        }
      }
    } catch (err) {
      console.error('[LiveKit Sarvam TTS] Text pump failed:', err.message);
    } finally {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
  }
}

class SarvamChunkedStream extends tts.ChunkedStream {
  constructor(text, ttsInstance, options) {
    super(text, ttsInstance, options?.connOptions, options?.abortSignal);
    this.ttsInstance = ttsInstance;
  }

  async run() {
    const apiKey = defaults.sarvam.apiKey;
    const apiBaseUrl = defaults.sarvam.apiBaseUrl || 'https://api.sarvam.ai';
    const wsBaseUrl = apiBaseUrl.replace(/^http/, 'ws');
    const languageCode = SARVAM_LOCALE_MAP[this.ttsInstance.language] || this.ttsInstance.language || 'en-IN';

    const url = `${wsBaseUrl}/text-to-speech/ws?model=bulbul:v3&send_completion_event=true`;

    const ws = new WebSocket(url, {
      headers: { 'api-subscription-key': apiKey },
    });

    const self = this;
    const promise = new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.send(JSON.stringify({
          type: 'config',
          data: {
            target_language_code: languageCode,
            speaker: self.ttsInstance.voiceId || 'amrit',
            pace: self.ttsInstance.pace || 1.10,
            temperature: self.ttsInstance.temperature || 0.75,
            model: 'bulbul:v3',
          }
        }));
        ws.send(JSON.stringify({
          type: 'text',
          data: self.inputText,
        }));
        ws.send(JSON.stringify({ type: 'flush' }));
      });

      ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'audio' && parsed.data) {
            const pcmBuffer = Buffer.from(parsed.data, 'base64');
            const int16Array = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.byteLength / 2);
            const frame = new AudioFrame(int16Array, 16000, 1, int16Array.length);

            self.queue.put({
              requestId: 'sarvam-tts-chunked',
              segmentId: 'sarvam-segment',
              frame,
              final: false,
            });
          } else if (parsed.type === 'completion') {
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      });

      ws.on('error', reject);
    });

    try {
      await promise;
    } catch (err) {
      console.error('[LiveKit Sarvam Chunked TTS] Error:', err.message);
    } finally {
      ws.close();
    }
  }
}

class SarvamTTS extends tts.TTS {
  constructor(options = {}) {
    super(16000, 1, {
      streaming: true,
      alignedTranscript: false,
    });
    this.label = 'sarvam_tts';
    this.language = options.language || 'en-IN';
    this.voiceId = options.voiceId || 'amrit';
    this.pace = options.pace || 1.10;
    this.temperature = options.temperature || 0.75;
    this.onAudioChunk = options.onAudioChunk || null;
  }

  get model() {
    return 'bulbul:v3';
  }

  get provider() {
    return 'sarvam';
  }

  synthesize(text, connOptions, abortSignal) {
    return new SarvamChunkedStream(text, this, { connOptions, abortSignal });
  }

  stream(options) {
    return new SarvamSynthesizeStream(this, options);
  }
}

module.exports = {
  SarvamSTT,
  SarvamTTS,
};
