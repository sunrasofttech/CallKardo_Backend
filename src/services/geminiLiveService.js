const axios = require('axios');
const defaults = require('../config/defaults');
const { drainStreamingPhrases } = require('../utils/streamTextChunks');
const { buildNaturalSystemInstruction } = require('../utils/naturalConversation');

class GeminiLiveSession {
  /**
   * Represents an active Gemini conversation session using the REST generateContent API with streaming.
   * Maintains multi-turn conversation history in memory for stateful dialogue.
   * 
   * @param {object} config
   * @param {string} config.systemPrompt - System instruction text
   * @param {string} [config.model] - Gemini model identifier (e.g. gemini-3.5-flash)
   * @param {function} config.onResponseText - Callback when assistant completes response with full text
   * @param {function} config.onResponseSentence - Callback when a complete sentence is streamed
   * @param {function} config.onStartResponse - Callback when assistant response starts (should return ttsGeneration)
   * @param {function} config.onError - Callback on error
   * @param {function} config.onClose - Callback on close
   */
  constructor({ systemPrompt, model = defaults.gemini.liveModel, onResponseText, onResponseSentence, onStartResponse, onError, onClose }) {
    this.systemPrompt = systemPrompt;
    this.modelName = model.startsWith('models/') ? model.substring(7) : model;
    this.onResponseText = onResponseText;
    this.onResponseSentence = onResponseSentence;
    this.onStartResponse = onStartResponse;
    this.onError = onError;
    this.onClose = onClose;

    this.apiKey = defaults.gemini.apiKey;
    this.isConnected = false;
    this.conversationHistory = []; // Multi-turn conversation context
    this.activeController = null; // Active AbortController for cancelStream
  }

  /**
   * Initialize the session
   */
  connect(skipGreeting = false, firstMessage = null) {
    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      console.warn('Google Gemini API Key is missing. Simulating Mock Gemini responses.');
      this.isConnected = true;
      if (!skipGreeting) {
        setTimeout(() => {
          if (!this.isConnected) return;
          const ttsGeneration = this.onStartResponse ? this.onStartResponse() : undefined;
          const greeting = 'Hello, I am your virtual agent. How can I help you today?';
          if (this.onResponseSentence) {
            this.onResponseSentence(greeting, ttsGeneration);
          }
          this.conversationHistory.push({
            role: 'model',
            parts: [{ text: greeting }],
          });
          if (this.onResponseText) {
            this.onResponseText(greeting);
          }
        }, 1000);
      } else if (firstMessage) {
        this.conversationHistory.push({
          role: 'model',
          parts: [{ text: firstMessage }],
        });
      }
      return;
    }

    this.isConnected = true;
    console.log(`Gemini REST session initialized with model: ${this.modelName}`);

    if (skipGreeting) {
      if (firstMessage) {
        this.conversationHistory.push({
          role: 'model',
          parts: [{ text: firstMessage }],
        });
      }
    } else {
      // Send an initial greeting request to start the conversation
      this._sendToGemini('[Call connected. Greet the customer according to your instructions.]');
    }
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

    // Cancel any active stream before starting a new turn
    this.cancelStream();

    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      this._simulateMockResponse(text);
      return;
    }

    console.log(`[Gemini Live] Sending user turn (turn #${this.conversationHistory.length + 1}): "${text.substring(0, 80)}..."`);
    this._sendToGemini(text).catch(err => {
      console.error(`[Gemini Live] Unhandled error in _sendToGemini:`, err);
    });
  }

  /**
   * Abort the active stream request if it's currently running
   */
  cancelStream() {
    if (this.activeController) {
      try {
        this.activeController.abort();
      } catch (err) {
        // Ignore errors from aborting
      }
      this.activeController = null;
    }
  }

  /**
   * Send a message to Gemini REST API and stream the response
   * @param {string} userText - The user's message text
   */
  async _sendToGemini(userText) {
    const startTime = Date.now();
    let responseReceived = false;
    let firstTokenTime = 0;

    // Safety timeout: if no response starts within 15s, warn
    const safetyTimer = setTimeout(() => {
      if (!responseReceived) {
        console.warn(`[Gemini Live] WARNING: No response started for 15s. Turn: "${userText.substring(0, 60)}..."`);
        console.warn(`[Gemini Live] History size: ${this.conversationHistory.length} turns`);
      }
    }, 15000);

    try {
      // Add user turn to conversation history, merging if the last turn was also from the user
      const lastTurn = this.conversationHistory[this.conversationHistory.length - 1];
      if (lastTurn && lastTurn.role === 'user') {
        lastTurn.parts[0].text = `${lastTurn.parts[0].text} ${userText}`;
        console.log(`[Gemini Live] Merged consecutive user turn. Updated text: "${lastTurn.parts[0].text.substring(0, 80)}..."`);
      } else {
        this.conversationHistory.push({
          role: 'user',
          parts: [{ text: userText }],
        });
      }

      const ttsGeneration = this.onStartResponse ? this.onStartResponse() : undefined;

      const requestBody = {
        systemInstruction: {
          parts: [{ text: buildNaturalSystemInstruction(this.systemPrompt) }],
        },
        contents: this.conversationHistory,
        generationConfig: {
          temperature: 0.55,
          topP: 0.9,
          maxOutputTokens: 220,
        },
      };

      let modelPath = this.modelName;
      if (modelPath.startsWith('tunedModels/')) {
        // Do not prepend models/ for custom tuned models
      } else {
        modelPath = `models/${modelPath}`;
      }
      
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

      this.activeController = new AbortController();

      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' },
            responseType: 'stream',
            signal: this.activeController.signal,
            timeout: 30000,
          });
          break; // Success
        } catch (err) {
          if (axios.isCancel(err) || err.name === 'AbortError') {
            return;
          }
          retries--;
          const msg = err.response?.data?.error?.message || err.message;
          if (retries === 0 || (!msg.includes('timeout') && !msg.includes('high demand') && err.response?.status !== 503)) {
            throw err;
          }
          console.warn(`[Gemini Live] API Error: ${msg}. Retrying in 2 seconds... (${retries} retries left)`);
          await new Promise(res => setTimeout(res, 2000));
        }
      }

      const stream = response.data;
      let buffer = '';
      let fullResponseText = '';
      let currentPhrase = '';

      stream.on('data', (chunk) => {
        if (!responseReceived) {
          responseReceived = true;
          firstTokenTime = Date.now();
          clearTimeout(safetyTimer);
          console.log(`[Gemini Live] First token received after ${firstTokenTime - startTime}ms`);
        }
        const textChunk = chunk.toString('utf8');
        buffer += textChunk;

        let boundary;
        while ((boundary = buffer.indexOf('\n')) !== -1) {
          const line = buffer.substring(0, boundary).trim();
          buffer = buffer.substring(boundary + 1);

          if (line.startsWith('data:')) {
            const dataStr = line.substring(5).trim();
            if (dataStr === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const parts = parsed.candidates?.[0]?.content?.parts;
              let token = '';
              if (parts) {
                for (const part of parts) {
                  if (part.text) {
                    token += part.text;
                  }
                }
              }

              if (token) {
                fullResponseText += token;
                currentPhrase += token;

                const { phrases, remainder } = drainStreamingPhrases(currentPhrase);
                currentPhrase = remainder;
                for (const phrase of phrases) {
                  if (this.onResponseSentence) {
                    this.onResponseSentence(phrase, ttsGeneration);
                  }
                }
              }
            } catch (err) {
              // Ignore parse errors from partial lines or heartbeat frames
            }
          }
        }
      });

      stream.on('end', () => {
        clearTimeout(safetyTimer);
        this.activeController = null;
        if (!this.isConnected) return;

        const totalTime = Date.now() - startTime;
        console.log(`[Gemini Live] Stream ended. Total time: ${totalTime}ms, Response length: ${fullResponseText.length} chars`);

        // Flush remaining text
        if (currentPhrase.trim()) {
          if (this.onResponseSentence) {
            this.onResponseSentence(currentPhrase.trim(), ttsGeneration);
          }
        }

        if (fullResponseText.trim()) {
          // Add model response to history
          this.conversationHistory.push({
            role: 'model',
            parts: [{ text: fullResponseText }],
          });

          if (this.onResponseText) {
            this.onResponseText(fullResponseText);
          }
        }
      });

      stream.on('error', (err) => {
        clearTimeout(safetyTimer);
        this.activeController = null;
        if (err.name === 'AbortError' || err.message === 'canceled') {
          return;
        }
        if (this.onError) {
          this.onError(err);
        }
      });

    } catch (error) {
      this.activeController = null;
      if (error.name === 'AbortError' || axios.isCancel(error)) {
        return;
      }
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
    this.cancelStream();
    this.conversationHistory = [];
    if (this.onClose) this.onClose();
  }

  /**
   * Simulate conversational AI behavior for local testing with streaming
   */
  _simulateMockResponse(inputText) {
    console.log(`[Mock Gemini] Received user turn: "${inputText}"`);
    let reply = "I understand. Let me check that for you.";
    
    const lowerText = inputText.toLowerCase();
    if (lowerText.includes('hello') || lowerText.includes('hi')) {
      reply = "Hi, thanks for answering. How can I help today?";
    } else if (lowerText.includes('interested')) {
      reply = "That's great. Would tomorrow work for a quick call with our team?";
    } else if (lowerText.includes('tomorrow') || lowerText.includes('schedule') || lowerText.includes('yes')) {
      reply = "Perfect, I've noted that. Our team will call you soon. Thanks, and have a good day.";
    } else if (lowerText.includes('not interested') || lowerText.includes('no')) {
      reply = "No problem at all. Thank you for your time. Have a great day!";
    }

    const sentences = reply.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [reply];
    const ttsGeneration = this.onStartResponse ? this.onStartResponse() : undefined;
    
    let index = 0;
    const sendNextSentence = () => {
      if (!this.isConnected) return;
      if (index < sentences.length) {
        const sentence = sentences[index].trim();
        index++;
        if (sentence && this.onResponseSentence) {
          this.onResponseSentence(sentence, ttsGeneration);
        }
        setTimeout(sendNextSentence, 800);
      } else {
        this.conversationHistory.push({
          role: 'model',
          parts: [{ text: reply }],
        });
        if (this.onResponseText) {
          this.onResponseText(reply);
        }
      }
    };

    setTimeout(sendNextSentence, 500);
  }
}

module.exports = {
  GeminiLiveSession,
};
