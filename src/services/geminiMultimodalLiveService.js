const WebSocket = require('ws');
const defaults = require('../config/defaults');
const EventEmitter = require('events');

class GeminiMultimodalLiveSession extends EventEmitter {
  constructor({ systemPrompt, voiceName, allowInterruption = true, onAudioOutput, onError, onClose, onTranscription, onInterrupted }) {
    super();
    this.apiKey = defaults.gemini.apiKey;
    const rawModel = defaults.gemini.multimodalLiveModel || 'gemini-2.0-flash';
    this.modelName = this._formatModelName(rawModel);

    this.systemPrompt = systemPrompt;
    this.voiceName = voiceName || 'Aoede';
    this.allowInterruption = allowInterruption;

    this.onAudioOutput = onAudioOutput; // (pcmBuffer, sampleRate)
    this.onError = onError;
    this.onClose = onClose;
    this.onTranscription = onTranscription; // (text, role)
    this.onInterrupted = onInterrupted;
    
    this.ws = null;
    this.isConnected = false;
    this.isSetupComplete = false;
  }

  connect(hasPreRecordedFirstMessage = false, firstMessage = null) {
    this.hasPreRecordedFirstMessage = hasPreRecordedFirstMessage;
    this.firstMessage = firstMessage;

    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      console.warn('Google Gemini API Key is missing. Gemini Multimodal Live WS will fail or run in mock mode.');
      // Fallback/mock behavior could go here, but for now we expect a real key for live WS
    }

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log(`[Gemini Multimodal Live] Connected to ${this.modelName}`);
      this._sendSetup();
    });

    this.ws.on('message', (data) => {
      this._handleMessage(data);
    });

    this.ws.on('error', (err) => {
      console.error('[Gemini Multimodal Live] WS Error:', err.message);
      if (this.onError) this.onError(err);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      this.isSetupComplete = false;
      console.log(`[Gemini Multimodal Live] WS Closed: Code=${code}, Reason=${reason ? reason.toString() : 'None'}`);
      if (this.onClose) this.onClose();
    });
  }

  _formatModelName(model) {
    const bare = model.startsWith('models/') ? model.substring(7) : model;
    return `models/${bare}`;
  }

  _sendSetup() {
    const setupMessage = {
      setup: {
        model: this.modelName,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: this.voiceName,
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: this.systemPrompt || 'You are a helpful AI assistant on a phone call.' }],
        },
        realtimeInputConfig: {
          activityHandling: this.allowInterruption
            ? 'START_OF_ACTIVITY_INTERRUPTS'
            : 'NO_INTERRUPTION',
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };

    this._send(setupMessage);
  }

  _handleMessage(data) {
    try {
      let parsed;
      if (Buffer.isBuffer(data)) {
        parsed = JSON.parse(data.toString('utf8'));
      } else {
        parsed = JSON.parse(data);
      }

      if (parsed.error) {
        const errMsg = parsed.error.message || JSON.stringify(parsed.error);
        console.error('[Gemini Multimodal Live] API error:', errMsg);
        if (this.onError) this.onError(new Error(errMsg));
        return;
      }

      // Check for Setup Complete
      if (parsed.setupComplete) {
        this.isSetupComplete = true;
        console.log('[Gemini Multimodal Live] Setup Complete');
        
        // If the agent has a first message, send it to prompt the AI to start speaking,
        // unless it's pre-recorded (in which case maybe the user speaks first or we send it silently).
        // Actually, if it's not pre-recorded, we want Gemini to say it.
        // Wait, if we send text as user role, Gemini responds. To make Gemini start, we can just send "Hi" or the first message.
        if (this.firstMessage && !this.hasPreRecordedFirstMessage) {
          this.sendText(`[System Prompt: Begin the conversation by saying: "${this.firstMessage}"]`);
        } else if (this.firstMessage && this.hasPreRecordedFirstMessage) {
           this.sendText(`[System Prompt: The call has connected and you have already greeted the user with: "${this.firstMessage}". Wait for them to respond.]`);
        } else {
           this.sendText(`[System Prompt: The call has connected. Greet the user.]`);
        }
      }

      // Handle Server Content (Audio & Transcript)
      if (parsed.serverContent) {
        const content = parsed.serverContent;
        
        if (content.inputTranscription?.text && this.onTranscription) {
          this.onTranscription(content.inputTranscription.text, 'user');
        }

        if (content.outputTranscription?.text && this.onTranscription) {
          this.onTranscription(content.outputTranscription.text, 'agent');
        }

        // Model Turn (Audio/Text from AI)
        if (content.modelTurn && content.modelTurn.parts) {
          for (const part of content.modelTurn.parts) {
            // Audio Output
            if (part.inlineData && part.inlineData.data) {
              const base64Audio = part.inlineData.data;
              const pcmBuffer = Buffer.from(base64Audio, 'base64');
              // Gemini returns 24kHz PCM by default for AUDIO responseModality
              if (this.onAudioOutput) {
                this.onAudioOutput(pcmBuffer, 24000);
              }
            }
            // Text Output (Transcript of what it said, if available)
            if (part.text && this.onTranscription) {
              this.onTranscription(part.text, 'agent');
            }
          }
        }

        if (content.interrupted) {
          console.log('[Gemini Multimodal Live] Model was interrupted.');
          if (this.onInterrupted) this.onInterrupted();
        }
      } else if (!parsed.setupComplete) {
         // If it's not serverContent and not setupComplete, log it!
         console.log('[Gemini Multimodal Live] Received unknown/error message:', JSON.stringify(parsed));
      }
    } catch (err) {
      console.error('[Gemini Multimodal Live] Error parsing message:', err.message);
    }
  }

  /**
   * Send raw 16kHz PCM audio chunk to Gemini
   * @param {Buffer} pcmBuffer 
   */
  sendAudioChunk(pcmBuffer) {
    if (!this.isConnected || !this.isSetupComplete) return;

    const base64Audio = pcmBuffer.toString('base64');
    const msg = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: base64Audio,
        },
      },
    };
    this._send(msg);
  }

  /**
   * Send a text message (e.g. initial greeting or forced instruction)
   * @param {string} text 
   */
  sendText(text) {
    if (!this.isConnected || !this.isSetupComplete) return;

    const msg = {
      clientContent: {
        turns: [{
          role: "user",
          parts: [{ text: text }]
        }],
        turnComplete: true
      }
    };
    this._send(msg);
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

module.exports = { GeminiMultimodalLiveSession };
