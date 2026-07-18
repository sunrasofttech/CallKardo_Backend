const { GeminiLiveSession } = require('./geminiLiveService');
const { GeminiMultimodalLiveSession } = require('./geminiMultimodalLiveService');
const { SarvamLiveSession } = require('./sarvamLiveService');
const ElevenLabsLiveSession = require('./elevenlabsLiveService');
const { SarvamSTTStream, SarvamTTSStream, SARVAM_LOCALE_MAP } = require('./sarvamSocketService');
const defaults = require('../config/defaults');
const fs = require('fs');
const path = require('path');
const { normalizeConversationalText } = require('../utils/naturalConversation');

const SILENCE_WARNING_MESSAGES = {
  'en': 'I am going to cut the call.',
  'en-in': 'I am going to cut the call.',
  'hi': 'मैं कॉल काटने जा रहा हूँ।',
  'hi-in': 'मैं कॉल काटने जा रहा हूँ।',
  'bn': 'আমি কলটি কেটে দিচ্ছি।',
  'bn-in': 'আমি কলটি কেটে দিচ্ছি।',
  'ta': 'நான் அழைப்பைத் துண்டிக்கப் போகிறேன்.',
  'ta-in': 'நான் அழைப்பைத் துண்டிக்கப் போகிறேன்.',
  'te': 'నేను కాల్ కట్ చేయబోతున్నాను.',
  'te-in': 'నేను కాల్ కట్ చేయబోతున్నాను.',
  'gu': 'હું કોલ કાપી રહ્યો છું.',
  'gu-in': 'હું કોલ કાપી રહ્યો છું.',
  'kn': 'ನಾನು ಕರೆಯನ್ನು ಕಡಿತಗೊಳಿಸುತ್ತಿದ್ದೇನೆ.',
  'kn-in': 'ನಾನು ಕರೆಯನ್ನು ಕಡಿತಗೊಳಿಸುತ್ತಿದ್ದೇನೆ.',
  'ml': 'ഞാൻ കോൾ കട്ട് ചെയ്യാൻ പോകുന്നു.',
  'ml-in': 'ഞാൻ കോൾ കട്ട് ചെയ്യാൻ പോകുന്നു.',
  'mr': 'मी कॉल कट करणार आहे.',
  'mr-in': 'मी कॉल कट करणार आहे.',
  'pa': 'ਮੈਂ ਕਾਲ ਕੱਟਣ ਜਾ ਰਿਹਾ ਹਾਂ।',
  'pa-in': 'ਮੈਂ ਕਾਲ ਕੱਟਣ ਜਾ ਰਿਹਾ ਹਾਂ।',
  'od': 'ମୁଁ କଲ୍ କାଟିବାକୁ ଯାଉଛି।',
  'od-in': 'ମୁଁ କଲ୍ କାଟିବାକୁ ଯାଉଛି।',
};

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
    // 1500ms gives natural pauses room (reduced from 1050 to avoid mid-sentence flushing)
    this.SILENCE_TIMEOUT_MS = 1500;

    // Inactivity / silence monitor — ends the call if neither party speaks for this long
    this.silenceTimeoutMs = options.silenceTimeoutMs || 10000; // 10s default
    this.silenceTimer = null;
    this.onSilenceTimeout = options.onSilenceTimeout || null;
    this.hasWarnedSilence = false;
    this.silenceWarningTimeout = null;

    this.pendingUserTranscripts = [];

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
      ? "This is an INBOUND call. The customer dialed your number to speak with you. (They called you). Wait for them to state their reason before responding."
      : "This is an OUTBOUND call. You dialed the customer's phone number to speak with them. (You called them). IMPORTANT: You MUST start by greeting them, stating your name, and briefly explaining why you are calling — in ONE short sentence.";

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
- Match the customer's language (English, Hindi, etc.) naturally and dynamically.
- CRITICAL: If the customer asks "why did you call" or "who is this" — explain the purpose of this call immediately and politely. Never respond with a counter-question.
- If the customer sounds confused or irritated, apologize briefly and state the purpose of the call clearly in simpler words.
- If the customer's speech is unclear or seems garbled, politely ask them to repeat once — do not guess or make assumptions.]`;

    // Pre-configure customer info if available
    let customerInfoContext = '';
    if (this.customer) {
      customerInfoContext = `\n\n[Customer Information: You are in a call with a registered customer. Here are their details:
- Name: ${this.customer.name || 'there'}
- Mobile: ${this.customer.mobile || 'Unknown'}
- Tags: ${this.customer.tags || 'None'}
- Notes: ${this.customer.notes || 'None'}
IMPORTANT: Address the customer by their name (${this.customer.name || 'there'}) naturally during the conversation where appropriate (e.g. in the greeting or when confirming details) to make the call feel personalized and professional.]`;
    }

    // Actions and Tool Triggers instruction
    const actionsInstruction = `
\n\n[ACTION AND TOOL TRIGGERS:
If the customer explicitly asks you to perform a specific action, acknowledge their request politely (e.g., "Sure, I have sent you the link" or "I've scheduled a meeting and sent you the details"), and at the VERY END of your response text, append the exact corresponding token:
- Customer asks for the join link / link to join -> append {{action:send_join_link}} at the end of your response.
- Customer asks to send a "hi" or greeting on WhatsApp -> append {{action:send_whatsapp_hi}} at the end of your response.
- Customer asks to email them info/details -> append {{action:send_email}} at the end of your response.
- Customer asks to schedule a meeting -> append {{action:schedule_meeting}} at the end of your response.
Do not say these tokens aloud. Only append them as text at the very end of your response.]`;

    // Call-ending instruction
    const endCallInstruction = `
[CALL ENDING RULE:
If the customer clearly indicates they want to end the call (e.g., says goodbye, thank you that's all, call khatam, bye, baad mein baat karte hain, or similar), respond politely in 1 sentence saying goodbye, and at the VERY END of your response add the token {{hangup}}.
Do NOT add {{hangup}} anywhere except the very end when the customer clearly wants to end.
Examples of when to end: "thank you bye", "that's all", "call cut karo", "baad mein", "rakh do phone".
]`;

    this.combinedSystemPrompt = `${baseSystemPrompt}\n\n[System Call Context: ${directionContext} ${genderContext} Maintain this awareness throughout the conversation and speak/respond accordingly.]${conversationalGuidelines}${endCallInstruction}${actionsInstruction}${customerInfoContext}`;

    this.activeProvider = ['geminilive', 'custom', 'customv2', 'elevenlabs'].includes(this.agent.aiProvider)
      ? this.agent.aiProvider
      : 'custom';
    this._isSwitchingProvider = false;

    this._log('info', `Initializing VoicePipeline with AI Provider: ${this.agent.aiProvider}`);

    if (this.activeProvider === 'elevenlabs') {
      this.geminiSession = new ElevenLabsLiveSession({
        systemPrompt: this.combinedSystemPrompt,
        agentId: this.agent.voice?.voiceId,
        firstMessage: this.firstMessage,
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
          this._log('error', `ElevenLabs Live connection error: ${err.message}`);
          if (this.onError) this.onError(err);
        },
        onClose: () => {
          this._log('info', 'ElevenLabs Live session closed');
        },
      });
    } else if (this.activeProvider === 'geminilive') {
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

    if (this.activeProvider !== 'geminilive' && this.activeProvider !== 'elevenlabs' && this.agent.firstMessageAudioPath) {
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
    
    // Clear warning state if customer interrupts the warning
    this.hasWarnedSilence = false;
    if (this.silenceWarningTimeout) {
      clearTimeout(this.silenceWarningTimeout);
      this.silenceWarningTimeout = null;
    }

    if (this.speakingTimeout) {
      clearTimeout(this.speakingTimeout);
      this.speakingTimeout = null;
    }
    this._clearPacingQueue();
    if (this.onClearAudio) this.onClearAudio();
    if (this.geminiSession && typeof this.geminiSession.cancelStream === 'function') {
      this.geminiSession.cancelStream();
    }
    while (this.pendingUserTranscripts.length > 0) {
      const queuedText = this.pendingUserTranscripts.shift();
      if (queuedText && queuedText.trim()) {
        this._log('info', `[Interruption resumed] Processing queued customer speech after cancel: "${queuedText.trim()}"`);
        this._processFinalTranscript(queuedText);
      }
    }
  }

  _createCustomGeminiSession() {
    return new GeminiLiveSession({
      systemPrompt: this.combinedSystemPrompt,
      model: defaults.gemini.liveModel,
      onResponseText: async (text) => {
        try {
          // Process and strip action tokens
          const textAfterActions = this._processActionTriggers(text);
          
          // Check for AI hangup signal and strip it
          this._checkForCallEndRequest(textAfterActions, 'agent');
          const cleanText = textAfterActions.replace(/\{\{hangup\}\}/g, '').trim();
          if (!cleanText) return; // Only {{hangup}} — nothing to say, just end
          this._log('info', `Agent completed response: ${cleanText}`);
          if (this.onAgentTranscription) this.onAgentTranscription(cleanText);
        } catch (err) {
          this._log('error', `Gemini response logging failure: ${err.message}`);
        }
      },
      onResponseSentence: async (sentenceText, ttsGeneration) => {
        // Strip action tokens and {{hangup}} from individual sentences before TTS
        const sentenceAfterActions = sentenceText.replace(/\{\{action:[a-zA-Z0-9_]+\}\}/g, '').trim();
        const cleanSentence = sentenceAfterActions.replace(/\{\{hangup\}\}/g, '').trim();
        if (cleanSentence) {
          this._enqueueTtsPhrase(cleanSentence, ttsGeneration);
        }
      },
      onStartResponse: () => {
        const ttsGeneration = ++this._ttsGeneration;
        this._activeTtsGeneration = ttsGeneration;
        this._setAgentSpeaking(15000); // 15s covers API response time; pacing queue will shorten once audio starts
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
          // Process and strip action tokens
          const textAfterActions = this._processActionTriggers(text);
          
          // Check for AI hangup signal and strip it
          this._checkForCallEndRequest(textAfterActions, 'agent');
          const cleanText = textAfterActions.replace(/\{\{hangup\}\}/g, '').trim();
          if (!cleanText) return; // Only {{hangup}} — nothing to say, just end
          this._log('info', `Agent completed response: ${cleanText}`);
          if (this.onAgentTranscription) this.onAgentTranscription(cleanText);
        } catch (err) {
          this._log('error', `Sarvam response logging failure: ${err.message}`);
        }
      },
      onResponseSentence: async (sentenceText, ttsGeneration) => {
        // Strip action tokens and {{hangup}} from individual sentences before TTS
        const sentenceAfterActions = sentenceText.replace(/\{\{action:[a-zA-Z0-9_]+\}\}/g, '').trim();
        const cleanSentence = sentenceAfterActions.replace(/\{\{hangup\}\}/g, '').trim();
        if (cleanSentence) {
          this._enqueueTtsPhrase(cleanSentence, ttsGeneration);
        }
      },
      onStartResponse: () => {
        const ttsGeneration = ++this._ttsGeneration;
        this._activeTtsGeneration = ttsGeneration;
        this._setAgentSpeaking(15000); // 15s covers API response time; pacing queue will shorten once audio starts
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

    // Start the inactivity monitor — call will auto-end after silenceTimeoutMs of no activity
    this._resetSilenceTimer();

    this._isSwitchingProvider = false;
  }

  _setAgentSpeaking(durationMs) {
    this.isAgentSpeaking = true;
    if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
    this.speakingTimeout = setTimeout(() => {
      this.isAgentSpeaking = false;
      while (this.pendingUserTranscripts.length > 0) {
        const queuedText = this.pendingUserTranscripts.shift();
        if (queuedText && queuedText.trim()) {
          this._log('info', `[Interruption resumed] Processing queued customer speech: "${queuedText.trim()}"`);
          this._processFinalTranscript(queuedText);
        }
      }
    }, durationMs);
    // Agent speaking counts as activity — reset the inactivity monitor
    this._resetSilenceTimer();
  }

  _resetSilenceTimer() {
    if (!this.isConnected || !this.silenceTimeoutMs) return;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    
    // Clear warning state if customer speaks/interacts
    this.hasWarnedSilence = false;
    if (this.silenceWarningTimeout) {
      clearTimeout(this.silenceWarningTimeout);
      this.silenceWarningTimeout = null;
    }

    this.silenceTimer = setTimeout(() => {
      if (!this.isConnected) return;
      
      // If we haven't warned yet, say the warning and schedule the actual hangup
      if (!this.hasWarnedSilence) {
        this._sayWarningAndEndCall();
      } else {
        // If we already warned, end the call
        this._log('warn', `[Silence Timeout] Final silence timeout reached — ending call.`);
        this._endCall('Silence timeout (no customer response after warning)');
      }
    }, this.silenceTimeoutMs);
  }

  _clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.silenceWarningTimeout) {
      clearTimeout(this.silenceWarningTimeout);
      this.silenceWarningTimeout = null;
    }
    this.hasWarnedSilence = false;
  }

  async _sayWarningAndEndCall() {
    if (!this.isConnected) return;
    this.hasWarnedSilence = true;
    
    // Resolve user's active/detected language
    const activeLang = (this.sarvamTtsStream ? this.sarvamTtsStream.languageCode : null) || this.agent.language || 'en-IN';
    const normalizedLang = activeLang.toLowerCase().trim();
    
    // Fallback to English if the language is not mapped
    const warningText = SILENCE_WARNING_MESSAGES[normalizedLang] || SILENCE_WARNING_MESSAGES['en-in'];
    this._log('info', `[Silence Warning] Customer inactive in language "${activeLang}". Speaking: "${warningText}"`);
    
    if (this.onAgentTranscription) {
      this.onAgentTranscription(warningText);
    }
    
    const ttsGen = ++this._ttsGeneration;
    this._activeTtsGeneration = ttsGen;
    
    // Synthesize and play warning
    await this._synthesizeAndPlay(warningText, ttsGen);
    
    // Wait for the warning speech to finish (approx 2 seconds) before hanging up
    this.silenceWarningTimeout = setTimeout(() => {
      if (!this.isConnected) return;
      this._log('warn', `[Silence Timeout Warning Complete] Hanging up call.`);
      this._endCall('Silence timeout (no customer response after warning)');
    }, 2000);
  }

  /**
   * Triggered when the customer explicitly asks to end the call or
   * the agent has said goodbye with {{hangup}} token.
   */
  _endCall(reason) {
    if (!this.isConnected) return;
    this._log('info', `[Call End] ${reason}`);
    this._clearSilenceTimer();
    if (this.onSilenceTimeout) {
      this.onSilenceTimeout();
    }
  }

  _processActionTriggers(text) {
    if (!text) return text;
    
    // Regular expression to match {{action:xyz}}
    const actionRegex = /\{\{action:([a-zA-Z0-9_]+)\}\}/g;
    let match;
    
    while ((match = actionRegex.exec(text)) !== null) {
      const actionName = match[1];
      this._log('info', `[Action Triggered] Detected action token: ${actionName}`);
      this._executeAction(actionName).catch(err => {
        this._log('error', `Failed to execute action ${actionName}: ${err.message}`);
      });
    }
    
    // Return text with all action tokens stripped
    return text.replace(actionRegex, '').trim();
  }

  async _executeAction(actionName) {
    try {
      const ActionService = require('./actionService');
      this._log('info', `[Action Execute] Running handler for: ${actionName}`);
      
      switch (actionName) {
        case 'send_join_link':
          await ActionService.sendJoinLink(this.customer, this.agent);
          break;
        case 'send_whatsapp_hi':
          await ActionService.sendWhatsAppHi(this.customer);
          break;
        case 'send_email':
          await ActionService.sendCustomerEmail(this.customer, this.agent);
          break;
        case 'schedule_meeting':
          await ActionService.scheduleMeeting(this.customer, this.agent);
          break;
        default:
          this._log('warn', `[Action Warning] Unknown action token: ${actionName}`);
      }
    } catch (err) {
      this._log('error', `[Action Error] Failed executing action ${actionName}: ${err.message}`);
    }
  }

  /**
   * Check if the user/agent text contains call-ending keywords or the {{hangup}} marker.
   */
  _checkForCallEndRequest(text, source) {
    if (!text) return false;
    const lower = text.toLowerCase();

    // Direct {{hangup}} marker from the AI
    if (text.includes('{{hangup}}')) {
      this._log('info', `[Call End] AI signaled hangup via {{hangup}} token in ${source}`);
      this._endCall('Customer requested to end call (AI detected)');
      return true;
    }

    // Customer-side explicit end-call keywords
    if (source === 'customer') {
      const endPhrases = [
        'call cut', 'cut karo', 'call khatam', 'khatam karo',
        'rakh do', 'ra kh do', 'baad mein', 'baad me',
        'bye bye', 'goodbye', 'thank you bye', 'thanks bye',
        'that\'s all', 'that is all', 'it\'s enough', 'bus karo',
        'phone rakh', 'call end', 'end call', 'disconnect',
        'i\'m done', 'i am done', 'all done', 'ho gaya',
        'baat khatam', 'baat khtam', 'nikal lo', 'nice talking',
        'cut the call', 'cut call', 'disconnect call', 'hang up', 
        'hangup', 'stop call', 'stop the call', 'close call', 
        'alvida', 'tata'
      ];
      for (const phrase of endPhrases) {
        if (lower.includes(phrase)) {
          this._log('info', `[Call End] Customer end-call keyword detected: "${phrase}"`);
          this._endCall(`Customer said: "${text.substring(0, 60)}..."`);
          return true;
        }
      }
    }

    return false;
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

    // Customer is speaking — reset the inactivity monitor
    this._resetSilenceTimer();

    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer);
    }

    this.accumulatedTranscript = mergeTranscript(this.accumulatedTranscript, transcript);

    this.transcriptionSilenceTimer = setTimeout(() => {
      this._flushRealtimeTranscript();
    }, this.SILENCE_TIMEOUT_MS);
  }

  /**
   * Basic validation to reject garbled or noise-only STT transcripts.
   * Returns true if the transcript seems valid enough to process.
   */
  _isValidTranscript(transcript) {
    if (!transcript || transcript.length < 1) return false;

    // Reject if >60% of characters are non-alphanumeric (likely noise, not speech)
    const alphaChars = (transcript.match(/[a-zA-Z0-9\u00C0-\u024F\u0900-\u097F\u0B00-\u0B7F\u0C00-\u0C7F\u0D00-\u0D7F\u0B80-\u0BFF\u0C80-\u0CFF\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF]/g) || []);
    const ratio = transcript.length > 0 ? alphaChars.length / transcript.length : 0;
    if (ratio < 0.3) {
      this._log('info', `[STT filter] Rejected low-alpha transcript (ratio: ${ratio.toFixed(2)}): "${transcript}"`);
      return false;
    }

    // Reject single repeated character patterns (aaaaaa, ...., etc.)
    if (/^(.)\1{3,}$/.test(transcript.replace(/\s/g, ''))) {
      this._log('info', `[STT filter] Rejected repeated-character transcript: "${transcript}"`);
      return false;
    }

    return true;
  }

  _processFinalTranscript(transcript) {
    const finalTranscript = normalizeTranscript(transcript);
    if (!finalTranscript) {
      return false;
    }

    // STT quality gate — reject garbled/noise-only transcripts
    if (!this._isValidTranscript(finalTranscript)) {
      this.accumulatedTranscript = '';
      return false;
    }

    if (this.transcriptionSilenceTimer) {
      clearTimeout(this.transcriptionSilenceTimer);
      this.transcriptionSilenceTimer = null;
    }

    this.accumulatedTranscript = '';

    // Check if the customer explicitly asked to end the call
    if (this._checkForCallEndRequest(finalTranscript, 'customer')) {
      return false;
    }

    if (this.isAgentSpeaking) {
      if (this.agent.allowInterruption !== false) {
        this._log('info', `[Interruption] Customer interrupted agent. Cancelling agent speech and sending new turn.`);
        this._cancelAgentSpeech();
      } else {
        this.pendingUserTranscripts.push(finalTranscript);
        this._log('info', `[Interruption queued] Customer spoke while agent speaking; will process after agent finishes: "${finalTranscript}"`);
        return false;
      }
    }

    // Final customer transcript processed — reset inactivity monitor
    this._resetSilenceTimer();

    this._log('info', `Customer spoke (real-time WSS): ${finalTranscript}`);
    if (this.onCustomerTranscription) this.onCustomerTranscription(finalTranscript);
    try {
      this.geminiSession.sendUserTurn(finalTranscript);
      this._log('info', `[Gemini] sendUserTurn called successfully for: "${finalTranscript.substring(0, 50)}..."`);
    } catch (err) {
      this._log('error', `[Gemini] sendUserTurn crashed: ${err.message}`);
    }
    return true;
  }

  _flushRealtimeTranscript() {
    return this._processFinalTranscript(this.accumulatedTranscript);
  }

  async handleAudioInput(pcmBuffer) {
    if (!this.isConnected) return;

    if (this.activeProvider === 'elevenlabs') {
      if (!this.agent.allowInterruption && this.isAgentSpeaking) {
        return;
      }
      if (this.geminiSession && typeof this.geminiSession.sendAudioChunk === 'function') {
        this.geminiSession.sendAudioChunk(pcmBuffer);
      }
    } else if (this.activeProvider === 'geminilive') {
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
    while (this.pendingUserTranscripts.length > 0) {
      const queuedText = this.pendingUserTranscripts.shift();
      if (queuedText && queuedText.trim()) {
        this._log('info', `[Interruption resumed] Processing queued customer speech during flush: "${queuedText.trim()}"`);
        this._processFinalTranscript(queuedText);
      }
    }
  }

  async close() {
    this.isConnected = false;
    if (this.speakingTimeout) { clearTimeout(this.speakingTimeout); this.speakingTimeout = null; }
    if (this.transcriptionSilenceTimer) { clearTimeout(this.transcriptionSilenceTimer); this.transcriptionSilenceTimer = null; }
    this._clearSilenceTimer();
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
