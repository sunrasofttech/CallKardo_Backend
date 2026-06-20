const axios = require('axios');
const defaults = require('../config/defaults');

class GeminiLiveSession {
  /**
   * Represents an active Gemini conversation session using the REST generateContent API.
   * Maintains multi-turn conversation history in memory for stateful dialogue.
   * 
   * This replaces the previous WebSocket BidiGenerateContent approach because
   * all current Gemini Live API models (gemini-3.1-flash-live-preview, etc.)
   * only support AUDIO output modality, which is incompatible with our
   * Sarvam STT → Gemini TEXT → Sarvam TTS pipeline.
   * 
   * @param {object} config
   * @param {string} config.systemPrompt - System instruction text
   * @param {string} [config.model] - Gemini model identifier (e.g. gemini-3.5-flash)
   * @param {function} config.onResponseText - Callback when assistant responds with text
   * @param {function} config.onError - Callback on error
   * @param {function} config.onClose - Callback on close
   */
  constructor({ systemPrompt, model = defaults.gemini.liveModel, onResponseText, onError, onClose }) {
    this.systemPrompt = systemPrompt;
    this.modelName = model;
    this.onResponseText = onResponseText;
    this.onError = onError;
    this.onClose = onClose;

    this.apiKey = defaults.gemini.apiKey;
    this.isConnected = false;
    this.conversationHistory = []; // Multi-turn conversation context
  }

  /**
   * Initialize the session (replaces WebSocket connect)
   * Sends an initial greeting turn to kick off the conversation
   */
  connect() {
    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      console.warn('Google Gemini API Key is missing. Simulating Mock Gemini responses.');
      this.isConnected = true;
      setTimeout(() => {
        if (this.onResponseText) {
          this.onResponseText('Hello, I am your virtual agent. How can I help you today?');
        }
      }, 1000);
      return;
    }

    this.isConnected = true;
    console.log(`Gemini REST session initialized with model: ${this.modelName}`);

    // Send an initial greeting request to start the conversation
    this._sendToGemini('[Call connected. Greet the customer according to your instructions.]');
  }

  /**
   * Send user speech text to Gemini
   * @param {string} text - Transcription of user's utterance
   */
  sendUserTurn(text) {
    if (!this.isConnected) {
      console.error('Cannot send turn: Gemini session is not connected');
      return;
    }

    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      this._simulateMockResponse(text);
      return;
    }

    this._sendToGemini(text);
  }

  /**
   * Send a message to Gemini REST API and handle the response
   * @param {string} userText - The user's message text
   */
  async _sendToGemini(userText) {
    try {
      // Add user turn to conversation history
      this.conversationHistory.push({
        role: 'user',
        parts: [{ text: userText }],
      });

      const requestBody = {
        systemInstruction: {
          parts: [{ text: this.systemPrompt }],
        },
        contents: this.conversationHistory,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 256,
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

      const response = await axios.post(url, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      // Extract text from response
      const candidates = response.data?.candidates;
      let responseText = '';

      if (candidates && candidates.length > 0) {
        const parts = candidates[0]?.content?.parts;
        if (parts) {
          for (const part of parts) {
            if (part.text) {
              responseText += part.text;
            }
          }
        }
      }

      if (responseText) {
        // Add model response to conversation history for multi-turn context
        this.conversationHistory.push({
          role: 'model',
          parts: [{ text: responseText }],
        });

        if (this.onResponseText) {
          this.onResponseText(responseText);
        }
      } else {
        console.warn('Gemini returned empty response');
      }
    } catch (error) {
      const errMsg = error.response?.data?.error?.message || error.message;
      console.error('Gemini REST API Error:', errMsg);
      if (this.onError) {
        this.onError(new Error(errMsg));
      }
    }
  }

  /**
   * Terminate session
   */
  close() {
    this.isConnected = false;
    this.conversationHistory = [];
    if (this.onClose) this.onClose();
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
