const WebSocket = require('ws');
const defaults = require('../config/defaults');

class GeminiLiveSession {
  /**
   * Represents an active bidirectional Gemini conversation session
   * @param {object} config
   * @param {string} config.systemPrompt - System instruction text
   * @param {string} [config.model] - Gemini model identifier (e.g. gemini-2.5-flash)
   * @param {function} config.onResponseText - Callback when assistant streams text
   * @param {function} config.onError - Callback on error
   * @param {function} config.onClose - Callback on close
   */
  constructor({ systemPrompt, model = defaults.gemini.liveModel, onResponseText, onError, onClose }) {
    this.systemPrompt = systemPrompt;
    this.modelName = model;
    this.onResponseText = onResponseText;
    this.onError = onError;
    this.onClose = onClose;
    
    this.ws = null;
    this.apiKey = defaults.gemini.apiKey;
    this.isConnected = false;
  }

  /**
   * Establish WebSocket connection to Gemini Live Service
   */
  connect() {
    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      console.warn('Google Gemini API Key is missing. Simulating Mock Gemini responses.');
      this.isConnected = true;
      // Trigger a starting greeting mock response after a short delay
      setTimeout(() => {
        if (this.onResponseText) {
          this.onResponseText('Hello, I am your virtual agent. How can I help you today?');
        }
      }, 1000);
      return;
    }

    const host = 'generativelanguage.googleapis.com';
    const path = `/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
    const uri = `wss://${host}${path}`;

    this.ws = new WebSocket(uri);

    this.ws.on('open', () => {
      this.isConnected = true;
      this._sendSetup();
    });

    this.ws.on('message', (data) => {
      this._handleIncomingMessage(data);
    });

    this.ws.on('error', (err) => {
      console.error('Gemini WS Error:', err);
      if (this.onError) this.onError(err);
    });

    this.ws.on('close', (code, reason) => {
      this.isConnected = false;
      console.log(`Gemini WS Closed. Code: ${code}, Reason: ${reason}`);
      if (this.onClose) this.onClose();
    });
  }

  /**
   * Send Setup configuration message
   */
  _sendSetup() {
    const setupMsg = {
      setup: {
        model: this.modelName,
        generationConfig: {
          responseModalities: ['TEXT'], // Request text responses back (since STT/TTS handled in pipeline)
        },
        systemInstruction: {
          parts: [
            { text: this.systemPrompt },
          ],
        },
      },
    };
    this.ws.send(JSON.stringify(setupMsg));
  }

  /**
   * Parse messages received from Gemini Live
   */
  _handleIncomingMessage(data) {
    try {
      const parsed = JSON.parse(data.toString());

      // Check if server responded with content
      if (parsed.serverContent && parsed.serverContent.modelTurn) {
        const parts = parsed.serverContent.modelTurn.parts;
        if (parts && parts.length > 0) {
          let chunkText = '';
          for (const part of parts) {
            if (part.text) {
              chunkText += part.text;
            }
          }
          if (chunkText && this.onResponseText) {
            this.onResponseText(chunkText);
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse Gemini Live WS Message:', error);
    }
  }

  /**
   * Send user speech text to Gemini Live
   * @param {string} text - Transcription of user's utterance
   */
  sendUserTurn(text) {
    if (!this.isConnected) {
      console.error('Cannot send turn: Gemini Live Session is not connected');
      return;
    }

    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      // Simulate mock response
      this._simulateMockResponse(text);
      return;
    }

    const clientMsg = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              { text },
            ],
          },
        ],
        turnComplete: true,
      },
    };
    this.ws.send(JSON.stringify(clientMsg));
  }

  /**
   * Terminate connection
   */
  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.isConnected = false;
  }

  /**
   * Simulate conversational AI behavior for local testing
   */
  _simulateMockResponse(inputText) {
    console.log(`[Mock Gemini] Received user turn: "${inputText}"`);
    let reply = "I understand. Let me check that for you.";
    
    const lowerText = inputText.toLowerCase();
    if (lowerText.includes('hello') || lowerText.includes('hi')) {
      reply = "Hello! Thanks for answering. How can I help you today?";
    } else if (lowerText.includes('interested')) {
      reply = "That's great! Would you like to schedule an appointment with our team tomorrow?";
    } else if (lowerText.includes('tomorrow') || lowerText.includes('schedule') || lowerText.includes('yes')) {
      reply = "Perfect. I have registered your callback request. Our representative will contact you shortly. Goodbye!";
    } else if (lowerText.includes('not interested') || lowerText.includes('no')) {
      reply = "No problem at all. Thank you for your time. Have a great day!";
    }

    // Delay response slightly to mimic network latency
    setTimeout(() => {
      if (this.onResponseText) {
        this.onResponseText(reply);
      }
    }, 1200);
  }
}

module.exports = {
  GeminiLiveSession,
};
