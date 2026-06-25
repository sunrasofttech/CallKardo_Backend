const { GeminiLiveSession } = require('./geminiLiveService');
const { GeminiMultimodalLiveSession } = require('./geminiMultimodalLiveService');
const { SarvamLiveSession } = require('./sarvamLiveService');
const SarvamService = require('./sarvamService');
const defaults = require('../config/defaults');
const fs = require('fs');
const path = require('path');

/**
 * Downsample 16-bit mono PCM from inputRate to outputRate using linear interpolation.
 */
function resamplePCM(inputBuffer, inputRate, outputRate) {
  if (inputRate === outputRate) return inputBuffer;
  const inputSamples = Math.floor(inputBuffer.length / 2);
  const outputSamples = Math.floor(inputSamples * outputRate / inputRate);
  const outputBuffer = Buffer.alloc(outputSamples * 2);
  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * inputRate / outputRate;
    const srcFloor = Math.floor(srcPos);
    const srcCeil = Math.min(srcFloor + 1, inputSamples - 1);
    const frac = srcPos - srcFloor;
    const s1 = inputBuffer.readInt16LE(srcFloor * 2);
    const s2 = inputBuffer.readInt16LE(srcCeil * 2);
    const sample = Math.round(s1 + frac * (s2 - s1));
    outputBuffer.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return outputBuffer;
}

/**
 * Strip markdown formatting from Gemini text before TTS synthesis.
 */
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/`([^`]*)`/g, '$1')       // inline code
    .replace(/#{1,6}\s/g, '')          // headings
    .replace(/^\s*[-*+]\s+/gm, '')    // bullet points
    .replace(/^\s*\d+\.\s+/gm, '')   // numbered lists
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/\n{3,}/g, '\n\n')       // excess newlines
    .trim();
}

/**
 * Preprocess text for natural-sounding TTS (ElevenLabs-style quality).
 * Expands abbreviations, numbers, and adds rhythm markers.
 */
function preprocessForTTS(text) {
  return text
    // Expand common abbreviations for natural pronunciation
    .replace(/\bMr\./g, 'Mister')
    .replace(/\bMrs\./g, 'Misses')
    .replace(/\bDr\./g, 'Doctor')
    .replace(/\bvs\./gi, 'versus')
    .replace(/\betc\./gi, 'etcetera')
    // Spell out numbers for natural reading
    .replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (_, h, m, period) =>
      `${h}:${m} ${period}`)
    // Add natural pause after sentence-ending punctuation
    .replace(/([.!?])\s+/g, '$1  ')
    // Normalize whitespace
    .replace(/\s{3,}/g, '  ')
    .trim();
}

/**
 * Split a response into sentence-level chunks for streaming TTS.
 * This gives ElevenLabs-like progressive audio output — the first sentence
 * plays while remaining sentences are still being synthesized.
 */
function splitIntoSentences(text) {
  // Split on sentence-ending punctuation, keep the delimiter
  const raw = text.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [text];
  return raw
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Compute actual audio duration in milliseconds from a WAV buffer.
 */
function wavDurationMs(wavBuffer) {
  if (wavBuffer.length < 44) return 1500;
  try {
    const sampleRate = wavBuffer.readUInt32LE(24);
    const byteRate = wavBuffer.readUInt32LE(28);
    if (!byteRate || byteRate <= 0) return 1500;
    const dataLength = wavBuffer.length - 44;
    const duration = Math.round((dataLength / byteRate) * 1000);
    return isFinite(duration) && duration > 0 ? duration : 1500;
  } catch {
    return 1500;
  }
}

/**
 * VoicePipeline orchestrates the audio processing loop independent of the transport layer.
 * It handles STT transcription, Gemini responses, and TTS synthesis.
 * 
 * Quality improvements:
 * - Sentence-level streaming TTS for low Time to First Audio (like ElevenLabs)
 * - Accurate isAgentSpeaking tracking based on actual WAV duration
 * - Correct allow_interruption enforcement with audio buffer clearing
 */
class VoicePipeline {
  constructor(options) {
    this.agent = options.agent;
    this.onAudioOutput = options.onAudioOutput; // (pcmBuffer, sampleRate)
    this.onClearAudio = options.onClearAudio;   // ()
    this.onAgentTranscription = options.onAgentTranscription; // (text)
    this.onCustomerTranscription = options.onCustomerTranscription; // (text)
    this.onError = options.onError; // (error)
    this.onLog = options.onLog; // (level, message)

    this.isAgentSpeaking = false;
    this.speakingTimeout = null;

    // Sentence-level TTS streaming queue to ensure ordered playback
    this._ttsQueue = Promise.resolve();
    this._ttsGeneration = 0;

    this.audioInputBuffer = [];
    this.silenceTimer = null;
    this.maxDurationTimer = null;
    this.SILENCE_TIMEOUT_MS = 200;
    this.MAX_BUFFER_DURATION_MS = 2000;
    this.MIN_BUFFER_BYTES = 1600;

    this.isConnected = true;
    this.activeProvider = ['geminilive', 'custom', 'customv2'].includes(this.agent.aiProvider)
      ? this.agent.aiProvider
      : 'custom';
    this._isSwitchingProvider = false;

    this._log('info', `Initializing VoicePipeline with AI Provider: ${this.agent.aiProvider}`);

    if (this.activeProvider === 'geminilive') {
      this.geminiSession = new GeminiMultimodalLiveSession({
        systemPrompt: this.agent.systemPrompt,
        voiceName: this.agent.voice?.voiceId || 'Puck',
        allowInterruption: this.agent.allowInterruption !== false,
        onAudioOutput: (pcmBuffer, sampleRate) => {
          // Resample Gemini's native 24kHz down to Vobiz 16kHz
          const resampledPcm = resamplePCM(pcmBuffer, sampleRate, 16000);

          const rawDurationMs = Math.round((resampledPcm.length / 32000) * 1000);
          this._setAgentSpeaking(rawDurationMs + 300);

          if (this.onAudioOutput) this.onAudioOutput(resampledPcm, 16000);
        },
        onTranscription: (text, role) => {
          if (role === 'agent' && this.onAgentTranscription) {
            this.onAgentTranscription(text);
          } else if (role === 'user' && this.onCustomerTranscription) {
            this.onCustomerTranscription(text);
          }
        },
        onInterrupted: () => {
          this._cancelAgentSpeech();
        },
        onError: (err) => {
          this._log('error', `Gemini Multimodal Live connection error: ${err.message}`);
          if (this.onError) this.onError(err);
        },
        onClose: (closeInfo = {}) => {
          this._log('info', 'Gemini Multimodal Live session closed');
          if (!this.isConnected || this._isSwitchingProvider || this.activeProvider !== 'geminilive') return;

          // If live session cannot start (unsupported/invalid model or bidi unavailable),
          // fall back to the custom STT->Gemini REST->TTS flow instead of dropping the call.
          if (!closeInfo.wasSetupComplete) {
            this._fallbackToCustomProvider(`code=${closeInfo.code}, reason=${closeInfo.reason || 'unknown'}`);
          }
        },
      });
    } else if (this.activeProvider === 'customv2') {
      this.geminiSession = this._createCustomv2Session();
    } else {
      this.geminiSession = this._createCustomGeminiSession();
    }

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;

    // Pre-recorded first message uses Sarvam TTS — only for the custom (STT+REST+TTS) provider.
    if (this.activeProvider !== 'geminilive' && this.agent.firstMessageAudioPath) {
      preRecordedFilePath = path.resolve(process.cwd(), this.agent.firstMessageAudioPath);
      if (fs.existsSync(preRecordedFilePath)) {
        hasPreRecordedFirstMessage = true;
      }
    }

    this.geminiSession.connect(hasPreRecordedFirstMessage, this.agent.firstMessage);

    if (hasPreRecordedFirstMessage) {
      setImmediate(() => {
        this._playPreRecordedFirstMessage(preRecordedFilePath);
      });
    }
  }

  _cancelAgentSpeech() {
    this._ttsGeneration++;
    this.isAgentSpeaking = false;
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
    if (this.onClearAudio) this.onClearAudio();
    if (this.geminiSession && typeof this.geminiSession.cancelStream === 'function') {
      this.geminiSession.cancelStream();
    }
  }

  _createCustomGeminiSession() {
    return new GeminiLiveSession({
      systemPrompt: this.agent.systemPrompt,
      model: defaults.gemini.liveModel,
      onResponseText: async (text) => {
        try {
          this._log('info', `Agent completed response: ${text}`);
          if (this.onAgentTranscription) this.onAgentTranscription(text);
        } catch (err) {
          this._log('error', `Gemini response logging failure: ${err.message}`);
        }
      },
      onResponseSentence: async (sentenceText, ttsGeneration) => {
        try {
          const cleanText = stripMarkdown(sentenceText);
          if (!cleanText) return;

          // Schedule sentence TTS synthesis under the specific ttsGeneration
          this._ttsQueue = this._ttsQueue.then(() =>
            this._synthesizeAndPlay(cleanText, ttsGeneration)
          );
        } catch (err) {
          this._log('error', `TTS pipeline failure: ${err.message}`);
          if (this.onError) this.onError(err);
        }
      },
      onStartResponse: () => {
        // Set agent speaking immediately, increment generation ID and return it
        const ttsGeneration = ++this._ttsGeneration;
        this._setAgentSpeaking(3000);
        return ttsGeneration;
      },
      onError: (err) => {
        this._log('error', `Gemini Live connection error: ${err.message}`);
        if (this.onError) this.onError(err);
      },
      onClose: () => {
        this._log('info', 'Gemini session closed');
      },
    });
  }

  _createCustomv2Session() {
    return new SarvamLiveSession({
      systemPrompt: this.agent.systemPrompt,
      model: defaults.sarvam.chatModel || 'sarvam-2b',
      onResponseText: async (text) => {
        try {
          this._log('info', `Agent completed response: ${text}`);
          if (this.onAgentTranscription) this.onAgentTranscription(text);
        } catch (err) {
          this._log('error', `Sarvam response logging failure: ${err.message}`);
        }
      },
      onResponseSentence: async (sentenceText, ttsGeneration) => {
        try {
          const cleanText = stripMarkdown(sentenceText);
          if (!cleanText) return;

          // Schedule sentence TTS synthesis under the specific ttsGeneration
          this._ttsQueue = this._ttsQueue.then(() =>
            this._synthesizeAndPlay(cleanText, ttsGeneration)
          );
        } catch (err) {
          this._log('error', `TTS pipeline failure: ${err.message}`);
          if (this.onError) this.onError(err);
        }
      },
      onStartResponse: () => {
        // Set agent speaking immediately, increment generation ID and return it
        const ttsGeneration = ++this._ttsGeneration;
        this._setAgentSpeaking(3000);
        return ttsGeneration;
      },
      onError: (err) => {
        this._log('error', `Sarvam Live connection error: ${err.message}`);
        if (this.onError) this.onError(err);
      },
      onClose: () => {
        this._log('info', 'Sarvam session closed');
      },
    });
  }

  _fallbackToCustomProvider(reason) {
    this._isSwitchingProvider = true;
    this._log('info', `[Provider Fallback] Gemini Live unavailable (${reason}). Switching to custom pipeline.`);

    try {
      if (this.geminiSession && typeof this.geminiSession.close === 'function') {
        this.geminiSession.close();
      }
    } catch (closeErr) {
      this._log('error', `[Provider Fallback] Failed closing live session: ${closeErr.message}`);
    }

    this.activeProvider = 'custom';
    this.geminiSession = this._createCustomGeminiSession();

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;
    if (this.agent.firstMessageAudioPath) {
      preRecordedFilePath = path.resolve(process.cwd(), this.agent.firstMessageAudioPath);
      hasPreRecordedFirstMessage = fs.existsSync(preRecordedFilePath);
    }

    this.geminiSession.connect(hasPreRecordedFirstMessage, this.agent.firstMessage);
    if (hasPreRecordedFirstMessage) {
      setImmediate(() => this._playPreRecordedFirstMessage(preRecordedFilePath));
    }

    this._isSwitchingProvider = false;
  }

  /**
   * Set isAgentSpeaking = true and schedule automatic reset after durationMs.
   * Cancels any previous timer.
   * @param {number} durationMs
   */
  _setAgentSpeaking(durationMs) {
    this.isAgentSpeaking = true;
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
    this.speakingTimeout = setTimeout(() => {
      this.isAgentSpeaking = false;
    }, durationMs);
  }

  /**
   * Synthesize a single sentence/chunk via Sarvam TTS and stream it.
   * Updates isAgentSpeaking with the actual WAV audio duration.
   * @param {string} text
   */
  async _synthesizeAndPlay(text, ttsGeneration) {
    if (!this.isConnected || !text.trim()) return;
    if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;

    try {
      const processedText = preprocessForTTS(text);
      const voiceName = this.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;
      const language = this.agent.language || defaults.sarvam.defaultLanguageCode;

      const audioBuffer = await SarvamService.synthesizeText(processedText, voiceName, language, {
        pace: this.agent.pace,
        temperature: this.agent.temperature,
      });

      if (!this.isConnected || audioBuffer.length <= 44) return;
      if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;

      // ── FIX: compute actual audio duration and extend speaking window ──
      const audioDurationMs = wavDurationMs(audioBuffer);
      this._setAgentSpeaking(audioDurationMs + 300); // +300ms buffer after audio ends

      const srcRate = audioBuffer.readUInt32LE(24);
      const rawPcm = audioBuffer.slice(44);
      const TARGET_RATE = 16000;
      const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);

      if (this.onAudioOutput) this.onAudioOutput(resampledPcm, TARGET_RATE);
    } catch (err) {
      this._log('error', `TTS synthesis failure for chunk "${text}": ${err.message}`);
    }
  }

  /**
   * Play a pre-synthesized first message audio file directly with no delay.
   */
  _playPreRecordedFirstMessage(filePath) {
    try {
      this._log('info', `Playing pre-recorded first message audio from ${filePath}`);
      const audioBuffer = fs.readFileSync(filePath);
      if (audioBuffer.length > 44) {
        if (this.onAgentTranscription && this.agent.firstMessage) {
          this.onAgentTranscription(this.agent.firstMessage);
        }

        const audioDurationMs = wavDurationMs(audioBuffer);
        this._setAgentSpeaking(audioDurationMs + 300);

        const srcRate = audioBuffer.readUInt32LE(24);
        const rawPcm = audioBuffer.slice(44);
        const TARGET_RATE = 16000;
        const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);

        if (this.onAudioOutput) {
          this.onAudioOutput(resampledPcm, TARGET_RATE);
        }
      }
    } catch (err) {
      this._log('error', `Error playing pre-recorded first message: ${err.message}`);
    }
  }

  _log(level, message) {
    if (this.onLog) this.onLog(level, message);
    if (level === 'error') console.error(message);
    else console.log(message);
  }

  /**
   * Handle incoming raw PCM buffer from user's microphone/telephone.
   * Note: Expects 16000Hz L16 format.
   * @param {Buffer} pcmBuffer
   */
  async handleAudioInput(pcmBuffer) {
    if (!this.isConnected) return;

    if (this.activeProvider === 'geminilive') {
      // Interrupt handling
      if (!this.agent.allowInterruption && this.isAgentSpeaking) {
         // Do not send customer audio to Gemini if interruption is disabled and agent is talking
         return;
      }
      
      // Direct stream to Gemini Multimodal Live API
      if (this.geminiSession && typeof this.geminiSession.sendAudioChunk === 'function') {
        this.geminiSession.sendAudioChunk(pcmBuffer);
      }
    } else {
      // Legacy STT buffering flow
      this.audioInputBuffer.push(pcmBuffer);

      if (this.silenceTimer) clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => this.flushAudioBuffer(), this.SILENCE_TIMEOUT_MS);

      if (!this.maxDurationTimer) {
        this.maxDurationTimer = setTimeout(() => this.flushAudioBuffer(), this.MAX_BUFFER_DURATION_MS);
      }
    }
  }

  /**
   * Transcribe buffered audio and send to Gemini.
   */
  async flushAudioBuffer() {
    if (this.activeProvider === 'geminilive') return; // Handled natively in real-time

    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.maxDurationTimer) { clearTimeout(this.maxDurationTimer); this.maxDurationTimer = null; }

    if (this.audioInputBuffer.length === 0) return;
    const combinedBuffer = Buffer.concat(this.audioInputBuffer);
    this.audioInputBuffer = [];

    if (combinedBuffer.length < this.MIN_BUFFER_BYTES || !this.isConnected) return;

    try {
      const transcript = await SarvamService.transcribeAudioChunk(combinedBuffer, this.agent.language);

      if (transcript && transcript.trim()) {
        // ── FIX: properly enforce allow_interruption ──
        if (!this.agent.allowInterruption && this.isAgentSpeaking) {
          this._log('info', `[Interruption Blocked] Customer spoke: "${transcript}" — agent still speaking, discarding.`);
          // Clear buffer so the same audio doesn't replay on next flush
          this.audioInputBuffer = [];
          return;
        }

        // Customer interrupted — stop agent audio immediately
        if (this.isAgentSpeaking) {
          this._cancelAgentSpeech();
        }

        this._log('info', `Customer spoke: ${transcript}`);
        if (this.onCustomerTranscription) this.onCustomerTranscription(transcript);
        this.geminiSession.sendUserTurn(transcript);
      }
    } catch (err) {
      this._log('error', `[STT] Transcription error: ${err.message}`);
    }
  }

  /**
   * Close connections and clean up resources.
   */
  async close() {
    this.isConnected = false;
    if (this.silenceTimer) { clearTimeout(this.silenceTimer); this.silenceTimer = null; }
    if (this.maxDurationTimer) { clearTimeout(this.maxDurationTimer); this.maxDurationTimer = null; }
    if (this.speakingTimeout) { clearTimeout(this.speakingTimeout); this.speakingTimeout = null; }
    await this.flushAudioBuffer();
    this.geminiSession.close();
  }
}

module.exports = VoicePipeline;
