const { GeminiLiveSession } = require('./geminiLiveService');
const { GeminiMultimodalLiveSession } = require('./geminiMultimodalLiveService');
const { SarvamLiveSession } = require('./sarvamLiveService');
const { SarvamSTTStream, SarvamTTSStream, SARVAM_LOCALE_MAP } = require('./sarvamSocketService');
const defaults = require('../config/defaults');
const fs = require('fs');
const path = require('path');
const { normalizeConversationalText } = require('../utils/naturalConversation');

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
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Preprocess text for natural-sounding TTS.
 */
function preprocessForTTS(text) {
  return normalizeConversationalText(text)
    .replace(/\bMr\./g, 'Mister')
    .replace(/\bMrs\./g, 'Misses')
    .replace(/\bDr\./g, 'Doctor')
    .replace(/\bvs\./gi, 'versus')
    .replace(/\betc\./gi, 'etcetera')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s*\/\s*/g, ' or ')
    .replace(/([.!?]){2,}/g, '$1')
    .replace(/\b(\d{1,2}):(\d{2})\s*(AM|PM)\b/gi, (_, h, m, period) =>
      `${h}:${m} ${period}`)
    .replace(/([.!?])\s+/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function normalizeTranscript(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function mergeTranscript(previous, next) {
  const prev = normalizeTranscript(previous);
  const incoming = normalizeTranscript(next);
  if (!prev) return incoming;
  if (!incoming) return prev;

  const prevLower = prev.toLowerCase();
  const incomingLower = incoming.toLowerCase();
  if (incomingLower.startsWith(prevLower)) return incoming;
  if (prevLower.includes(incomingLower)) return prev;

  const prevWords = prev.split(' ');
  const incomingWords = incoming.split(' ');
  const maxOverlap = Math.min(prevWords.length, incomingWords.length);

  for (let size = maxOverlap; size > 0; size--) {
    const prevTail = prevWords.slice(-size).join(' ').toLowerCase();
    const incomingHead = incomingWords.slice(0, size).join(' ').toLowerCase();
    if (prevTail === incomingHead) {
      return `${prevWords.join(' ')} ${incomingWords.slice(size).join(' ')}`.trim();
    }
  }

  return `${prev} ${incoming}`;
}

function isSubstantialInterruption(text) {
  const normalized = normalizeTranscript(text);
  if (normalized.length >= 8) return true;
  return normalized.split(' ').filter(Boolean).length >= 2;
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

function replaceCustomerVariables(text, customer) {
  if (!text) return text;
  const name = customer?.name || 'there';
  const mobile = customer?.mobile || '';
  const tags = customer?.tags || '';
  const notes = customer?.notes || '';

  return text
    .replace(/\{\{\s*customer_name\s*\}\}/gi, name)
    .replace(/\{\{\s*customerName\s*\}\}/gi, name)
    .replace(/\{\{\s*customer_mobile\s*\}\}/gi, mobile)
    .replace(/\{\{\s*customerMobile\s*\}\}/gi, mobile)
    .replace(/\{\{\s*customer_tags\s*\}\}/gi, tags)
    .replace(/\{\{\s*customerTags\s*\}\}/gi, tags)
    .replace(/\{\{\s*customer_notes\s*\}\}/gi, notes)
    .replace(/\{\{\s*customerNotes\s*\}\}/gi, notes);
}

/**
 * VoicePipeline orchestrates STT, LLM streaming, and TTS over WebSockets for custom/customv2.
 */
class VoicePipeline {
  constructor(options) {
    this.agent = options.agent;
    this.onAudioOutput = options.onAudioOutput;
    this.onClearAudio = options.onClearAudio;
    this.onAgentTranscription = options.onAgentTranscription;
    this.onCustomerTranscription = options.onCustomerTranscription;
    this.onError = options.onError;
    this.onLog = options.onLog;

    this.isAgentSpeaking = false;
    this.speakingTimeout = null;
    this._ttsQueue = Promise.resolve();
    this._ttsGeneration = 0;
    this._activeTtsGeneration = null;

    // Outgoing audio pacing queue for smooth, non-robotic playback
    this.audioOutBuffer = Buffer.alloc(0);
    this.audioInterval = null;

    this.accumulatedTranscript = '';
    this.transcriptionSilenceTimer = null;
    this.SILENCE_TIMEOUT_MS = 1050;
    this.pendingCustomerTranscript = '';

    this.sarvamSttStream = null;
    this.sarvamTtsStream = null;
    this.detectedLanguageCode = null;

    this.isConnected = true;
    this.direction = options.direction || 'outbound';
    this.customer = options.customer;

    // Determine agent gender from voice
    let gender = 'neutral';
    if (this.agent.voice && this.agent.voice.gender) {
      gender = this.agent.voice.gender;
    } else {
      // Fallback prebuilt voice gender detection
      const voiceIdLower = (this.agent.voice?.voiceId || '').toLowerCase();
      if (['aoede', 'kore'].includes(voiceIdLower)) {
        gender = 'female';
      } else if (['charon', 'fenrir', 'puck'].includes(voiceIdLower)) {
        gender = 'male';
      }
    }

    const genderContext = gender === 'female'
      ? "You have a FEMALE voice. You should act and speak as a female agent."
      : gender === 'male'
      ? "You have a MALE voice. You should act and speak as a male agent."
      : "You have a gender-neutral voice.";

    // Inject call direction context into the system prompt so the LLM is aware
    const directionContext = this.direction === 'inbound'
      ? "This is an INBOUND call. The customer dialed your number to speak with you. (They called you)."
      : "This is an OUTBOUND call. You dialed the customer's phone number to speak with them. (You called them).";

    // Resolve customer variables in prompt & greeting
    const baseSystemPrompt = replaceCustomerVariables(this.agent.systemPrompt, this.customer);
    this.firstMessage = replaceCustomerVariables(this.agent.firstMessage, this.customer);

    // Natural, human conversational instructions
    const conversationalGuidelines = `
[Conversational Guidelines:
- You must speak in a warm, natural, friendly, and human-like voice.
- Behave exactly like a real human receptionist/agent on the phone. Do not sound like an AI assistant.
- Use natural human conversational elements occasionally (e.g., "Oh", "Sure", "Well", "I see").
- Keep responses extremely short, concise, and simple (1-2 sentences maximum, under 20 words per turn) to maintain a fast, natural flow.
- Never output markdown lists, bullet points, asterisks, brackets, or code-like structures. Speak in plain conversational sentences.
- Match the customer's language (English, Hindi, etc.) naturally and dynamically.]`;

    // Pre-configure customer info if available
    let customerInfoContext = '';
    if (this.customer) {
      customerInfoContext = `\n\n[Customer Information: You are in a call with a registered customer. Here are their details:
- Name: ${this.customer.name || 'there'}
- Mobile: ${this.customer.mobile || 'Unknown'}
- Tags: ${this.customer.tags || 'None'}
- Notes: ${this.customer.notes || 'None'}]`;
    }

    this.combinedSystemPrompt = `${baseSystemPrompt}\n\n[System Call Context: ${directionContext} ${genderContext} Maintain this awareness throughout the conversation and speak/respond accordingly.]${conversationalGuidelines}${customerInfoContext}`;

    this.activeProvider = ['geminilive', 'custom', 'customv2'].includes(this.agent.aiProvider)
      ? this.agent.aiProvider
      : 'custom';
    this._isSwitchingProvider = false;

    this._log('info', `Initializing VoicePipeline with AI Provider: ${this.agent.aiProvider}`);

    if (this.activeProvider === 'geminilive') {
      this.geminiSession = new GeminiMultimodalLiveSession({
        systemPrompt: this.combinedSystemPrompt,
        voiceName: this.agent.voice?.voiceId || 'Puck',
        allowInterruption: this.agent.allowInterruption !== false,
        onAudioOutput: (pcmBuffer, sampleRate) => {
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
          if (!closeInfo.wasSetupComplete) {
            this._fallbackToCustomProvider(`code=${closeInfo.code}, reason=${closeInfo.reason || 'unknown'}`);
          }
        },
      });
    } else if (this.activeProvider === 'customv2') {
      this.geminiSession = this._createCustomv2Session();
      this._initSarvamRealtimeStreams();
    } else {
      this.geminiSession = this._createCustomGeminiSession();
      this._initSarvamRealtimeStreams();
    }

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;

    if (this.activeProvider !== 'geminilive' && this.agent.firstMessageAudioPath) {
      preRecordedFilePath = path.resolve(process.cwd(), this.agent.firstMessageAudioPath);
      if (fs.existsSync(preRecordedFilePath)) {
        hasPreRecordedFirstMessage = true;
      }
    }

    this.geminiSession.connect(hasPreRecordedFirstMessage, this.firstMessage);

    if (hasPreRecordedFirstMessage) {
      setImmediate(() => {
        this._playPreRecordedFirstMessage(preRecordedFilePath);
      });
    }
  }

  _usesSarvamRealtime() {
    return this.activeProvider === 'custom' || this.activeProvider === 'customv2';
  }

  _initSarvamRealtimeStreams() {
    const language = this.agent.language || defaults.sarvam.defaultLanguageCode;
    const voiceName = this.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;

    this.sarvamSttStream = new SarvamSTTStream({
      languageCode: language,
      onTranscript: (transcript, detectedLanguageCode) => {
        this._log('info', `[STT partial] ${transcript} (detected: ${detectedLanguageCode})`);
        if (detectedLanguageCode && detectedLanguageCode !== 'unknown') {
          this._updateTtsLanguage(detectedLanguageCode);
        }
        this._handleRealtimeTranscript(transcript);
      },
      onSpeechEnd: () => {
        this._log('info', '[STT] END_SPEECH detected — flushing transcript');
        if (this.transcriptionSilenceTimer) {
          clearTimeout(this.transcriptionSilenceTimer);
          this.transcriptionSilenceTimer = null;
        }
        if (this.sarvamSttStream) {
          this.sarvamSttStream.flush();
        }
        // Flush the final transcript immediately so user speech is not lost
        // if the call ends or the connection closes shortly after END_SPEECH.
        this._flushRealtimeTranscript();
      },
      onError: (err) => {
        this._log('error', `Sarvam STT WebSocket error: ${err.message}`);
      },
    });
    this.sarvamSttStream.connect();

    const targetPace = parseFloat(this.agent.pace) === 1.0 ? 1.10 : (parseFloat(this.agent.pace) || 1.10);
    const targetTemp = parseFloat(this.agent.temperature) === 0.6 ? 0.75 : (parseFloat(this.agent.temperature) || 0.75);

    this.sarvamTtsStream = new SarvamTTSStream({
      languageCode: language,
      voiceId: voiceName,
      pace: targetPace,
      temperature: targetTemp,
      onAudioChunk: (audioBuffer) => {
        this._playTtsAudioChunk(audioBuffer, this._activeTtsGeneration);
      },
      onError: (err) => {
        this._log('error', `Sarvam TTS WebSocket error: ${err.message}`);
      },
    });
    this.sarvamTtsStream.connect();
  }

  _updateTtsLanguage(newLanguageCode) {
    if (!this.isConnected) return;

    const targetTtsLanguage = SARVAM_LOCALE_MAP[newLanguageCode] || newLanguageCode || 'en-IN';
    const currentTtsLanguage = this.sarvamTtsStream ? this.sarvamTtsStream.languageCode : null;

    if (currentTtsLanguage === targetTtsLanguage) {
      return;
    }

    this._log('info', `[TTS Language Switch] Detected customer language switch. Re-initializing TTS WebSocket from ${currentTtsLanguage} to ${targetTtsLanguage}`);

    if (this.sarvamTtsStream) {
      try {
        this.sarvamTtsStream.close();
      } catch (err) {
        // ignore close error
      }
    }

    const voiceName = this.agent.voice?.voiceId || defaults.sarvam.defaultVoiceId;
    const targetPace = parseFloat(this.agent.pace) === 1.0 ? 1.10 : (parseFloat(this.agent.pace) || 1.10);
    const targetTemp = parseFloat(this.agent.temperature) === 0.6 ? 0.75 : (parseFloat(this.agent.temperature) || 0.75);

    this.sarvamTtsStream = new SarvamTTSStream({
      languageCode: targetTtsLanguage,
      voiceId: voiceName,
      pace: targetPace,
      temperature: targetTemp,
      onAudioChunk: (audioBuffer) => {
        this._playTtsAudioChunk(audioBuffer, this._activeTtsGeneration);
      },
      onError: (err) => {
        this._log('error', `Sarvam TTS WebSocket error: ${err.message}`);
      },
    });
    this.sarvamTtsStream.connect();
  }

  _cancelAgentSpeech() {
    this._ttsGeneration++;
    this._activeTtsGeneration = null;
    this.isAgentSpeaking = false;
    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
    this._clearPacingQueue();
    if (this.onClearAudio) this.onClearAudio();
    if (this.geminiSession && typeof this.geminiSession.cancelStream === 'function') {
      this.geminiSession.cancelStream();
    }
    if (this.pendingCustomerTranscript && this.pendingCustomerTranscript.trim()) {
      const queuedText = this.pendingCustomerTranscript.trim();
      this.pendingCustomerTranscript = '';
      this._log('info', `[Interruption resumed] Processing queued customer speech after cancel: "${queuedText}"`);
      this._handleRealtimeTranscript(queuedText);
    }
  }

  _createCustomGeminiSession() {
    return new GeminiLiveSession({
      systemPrompt: this.combinedSystemPrompt,
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
        this._enqueueTtsPhrase(sentenceText, ttsGeneration);
      },
      onStartResponse: () => {
        const ttsGeneration = ++this._ttsGeneration;
        this._activeTtsGeneration = ttsGeneration;
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
      systemPrompt: this.combinedSystemPrompt,
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
        this._enqueueTtsPhrase(sentenceText, ttsGeneration);
      },
      onStartResponse: () => {
        const ttsGeneration = ++this._ttsGeneration;
        this._activeTtsGeneration = ttsGeneration;
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

  _enqueueTtsPhrase(sentenceText, ttsGeneration) {
    try {
      const cleanText = stripMarkdown(sentenceText);
      if (!cleanText) return;

      this._ttsQueue = this._ttsQueue.then(() =>
        this._synthesizeAndPlay(cleanText, ttsGeneration)
      );
    } catch (err) {
      this._log('error', `TTS pipeline failure: ${err.message}`);
      if (this.onError) this.onError(err);
    }
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
    this._initSarvamRealtimeStreams();

    let hasPreRecordedFirstMessage = false;
    let preRecordedFilePath = null;
    if (this.agent.firstMessageAudioPath) {
      preRecordedFilePath = path.resolve(process.cwd(), this.agent.firstMessageAudioPath);
      hasPreRecordedFirstMessage = fs.existsSync(preRecordedFilePath);
    }

    this.geminiSession.connect(hasPreRecordedFirstMessage, this.firstMessage);
    if (hasPreRecordedFirstMessage) {
      setImmediate(() => this._playPreRecordedFirstMessage(preRecordedFilePath));
    }

    this._isSwitchingProvider = false;
  }

  _setAgentSpeaking(durationMs) {
    this.isAgentSpeaking = true;
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
    this.speakingTimeout = setTimeout(() => {
      this.isAgentSpeaking = false;
      if (this.pendingCustomerTranscript && this.pendingCustomerTranscript.trim()) {
        const queuedText = this.pendingCustomerTranscript.trim();
        this.pendingCustomerTranscript = '';
        this._log('info', `[Interruption resumed] Processing queued customer speech: "${queuedText}"`);
        this._handleRealtimeTranscript(queuedText);
      }
    }, durationMs);
  }

  _pushToPacingQueue(pcmBuffer, ttsGeneration) {
    if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;

    this.audioOutBuffer = Buffer.concat([this.audioOutBuffer, pcmBuffer]);

    if (!this.audioInterval) {
      const CHUNK_SIZE = 2560; // 80ms of 16kHz 16-bit mono PCM (16000 * 2 * 0.08)
      const INTERVAL_MS = 80;

      this.audioInterval = setInterval(() => {
        if (!this.isConnected) {
          this._clearPacingQueue();
          return;
        }

        if (this.audioOutBuffer.length >= CHUNK_SIZE) {
          const chunk = this.audioOutBuffer.slice(0, CHUNK_SIZE);
          this.audioOutBuffer = this.audioOutBuffer.slice(CHUNK_SIZE);

          const durationMs = Math.round((chunk.length / 32000) * 1000);
          this._setAgentSpeaking(durationMs + 300);

          if (this.onAudioOutput) {
            this.onAudioOutput(chunk, 16000);
          }
        } else {
          // Send remaining bytes and clear interval
          const chunk = this.audioOutBuffer;
          this.audioOutBuffer = Buffer.alloc(0);
          
          if (chunk.length > 0) {
            const durationMs = Math.round((chunk.length / 32000) * 1000);
            this._setAgentSpeaking(durationMs + 300);
            if (this.onAudioOutput) {
              this.onAudioOutput(chunk, 16000);
            }
          }
          
          clearInterval(this.audioInterval);
          this.audioInterval = null;
        }
      }, INTERVAL_MS);
    }
  }

  _clearPacingQueue() {
    if (this.audioInterval) {
      clearInterval(this.audioInterval);
      this.audioInterval = null;
    }
    this.audioOutBuffer = Buffer.alloc(0);
  }

  _playTtsAudioChunk(audioBuffer, ttsGeneration) {
    if (!this.isConnected) return;
    if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;

    let rawPcm = audioBuffer;
    let srcRate = 16000;
    if (audioBuffer.length > 44 && audioBuffer.toString('utf8', 8, 12) === 'WAVE') {
      srcRate = audioBuffer.readUInt32LE(24);
      rawPcm = audioBuffer.slice(44);
    }

    const TARGET_RATE = 16000;
    const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);
    this._pushToPacingQueue(resampledPcm, ttsGeneration);
  }

  async _synthesizeAndPlay(text, ttsGeneration) {
    if (!this.isConnected || !text.trim()) return;
    if (ttsGeneration !== undefined && ttsGeneration !== this._ttsGeneration) return;
    if (!this.sarvamTtsStream) return;

    try {
      const processedText = preprocessForTTS(text);
      this._activeTtsGeneration = ttsGeneration;

      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const timeout = setTimeout(() => {
          this._log('warn', `TTS timeout for chunk "${text.substring(0, 40)}..."`);
          finish();
        }, 30000);

        this.sarvamTtsStream.sendText(processedText, () => {
          clearTimeout(timeout);
          finish();
        });
      });
    } catch (err) {
      this._log('error', `TTS synthesis failure for chunk "${text}": ${err.message}`);
    }
  }

  _playPreRecordedFirstMessage(filePath) {
    try {
      this._log('info', `Playing pre-recorded first message audio from ${filePath}`);
      const audioBuffer = fs.readFileSync(filePath);
      if (audioBuffer.length > 44) {
        if (this.onAgentTranscription && this.firstMessage) {
          this.onAgentTranscription(this.firstMessage);
        }

        const audioDurationMs = wavDurationMs(audioBuffer);
        this._log('info', `Pre-recorded first message duration: ${audioDurationMs}ms`);

        const srcRate = audioBuffer.readUInt32LE(24);
        const rawPcm = audioBuffer.slice(44);
        const TARGET_RATE = 16000;
        const resampledPcm = resamplePCM(rawPcm, srcRate, TARGET_RATE);

        this._pushToPacingQueue(resampledPcm, this._ttsGeneration);
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

  _handleRealtimeTranscript(transcript) {
    if (!transcript || !transcript.trim()) return;

    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer);
    }

    this.accumulatedTranscript = mergeTranscript(this.accumulatedTranscript, transcript);

    this.transcriptionSilenceTimer = setTimeout(() => {
      this._flushRealtimeTranscript();
    }, this.SILENCE_TIMEOUT_MS);
  }

  _flushRealtimeTranscript() {
    const finalTranscript = (this.accumulatedTranscript || '').trim();
    if (!finalTranscript) {
      if (this.transcriptionSilenceTimer) {
        clearTimeout(this.transcriptionSilenceTimer);
        this.transcriptionSilenceTimer = null;
      }
      return;
    }

    if (!this.agent.allowInterruption && this.isAgentSpeaking) {
      this._log('info', `[Interruption Blocked] Customer spoke: "${finalTranscript}" — agent still speaking, waiting.`);
      return;
    }

    this.accumulatedTranscript = '';
    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer);
      this.transcriptionSilenceTimer = null;
    }

    if (this.isAgentSpeaking && !isSubstantialInterruption(finalTranscript)) {
      this.pendingCustomerTranscript = mergeTranscript(this.pendingCustomerTranscript, finalTranscript);
      this._log('info', `[Interruption queued] Short speech while agent speaking; will process after agent finishes: "${finalTranscript}"`);
      return;
    }

    if (this.isAgentSpeaking) {
      this._cancelAgentSpeech();
    }

    this._log('info', `Customer spoke (real-time WSS): ${finalTranscript}`);
    if (this.onCustomerTranscription) this.onCustomerTranscription(finalTranscript);
    this.geminiSession.sendUserTurn(finalTranscript);
  }

  async handleAudioInput(pcmBuffer) {
    if (!this.isConnected) return;

    if (this.activeProvider === 'geminilive') {
      if (!this.agent.allowInterruption && this.isAgentSpeaking) {
        return;
      }
      if (this.geminiSession && typeof this.geminiSession.sendAudioChunk === 'function') {
        this.geminiSession.sendAudioChunk(pcmBuffer);
      }
    } else if (this._usesSarvamRealtime() && this.sarvamSttStream) {
      if (!this.agent.allowInterruption && this.isAgentSpeaking) {
        return;
      }
      this.sarvamSttStream.sendAudio(pcmBuffer);
    }
  }

  async flushPendingInput() {
    if (!this._usesSarvamRealtime()) return;

    if (this.sarvamSttStream) {
      this.sarvamSttStream.flush();
    }
    this._flushRealtimeTranscript();
  }

  async close() {
    this.isConnected = false;
    if (this.speakingTimeout) { clearTimeout(this.speakingTimeout); this.speakingTimeout = null; }
    if (this.transcriptionSilenceTimer) { clearTimeout(this.transcriptionSilenceTimer); this.transcriptionSilenceTimer = null; }
    this._clearPacingQueue();
    await this.flushPendingInput();
    if (this.sarvamSttStream) {
      this.sarvamSttStream.close();
      this.sarvamSttStream = null;
    }
    if (this.sarvamTtsStream) {
      this.sarvamTtsStream.close();
      this.sarvamTtsStream = null;
    }
    this.geminiSession.close();
  }
}

module.exports = VoicePipeline;
