const axios = require('axios');
const defaults = require('../config/defaults');

class AiAnalysisService {
  constructor() {
    this.apiKey = defaults.gemini.apiKey;
    this.modelName = defaults.gemini.analysisModel;
  }

  /**
   * Invokes Gemini model to analyze the call transcript
   * @param {string} transcript - Full textual call transcript
   * @returns {Promise<{ summary: string, outcome: string, sentiment: string, leadScore: number }>}
   */
  async analyzeTranscript(transcript) {
    if (!transcript || transcript.trim().length === 0) {
      return {
        summary: 'Call was answered but no conversation took place.',
        outcome: 'No Answer',
        sentiment: 'Neutral',
        leadScore: 0,
      };
    }

    if (!this.apiKey || this.apiKey === 'your_google_gemini_api_key') {
      return this._mockAnalysis(transcript);
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

      const prompt = `
        Analyze the following voice call transcript between an AI voice agent and a customer.
        Provide a JSON response representing the analysis of the conversation.

        Transcript:
        """
        ${transcript}
        """

        Return EXACTLY a JSON object matching this schema, with no additional text:
        {
          "summary": "A concise paragraph summarizing what was discussed.",
          "outcome": "One of these exact strings: 'Interested', 'Not Interested', 'Callback Requested', 'Appointment Booked', 'Sale Closed', 'Wrong Number', 'No Answer'",
          "sentiment": "One of these exact strings: 'Positive', 'Neutral', 'Negative'",
          "leadScore": <An integer from 0 to 100 based on interest level and intent>
        }
      `;

      let response;
      let retries = 3;
      while (retries > 0) {
        try {
          response = await axios.post(
            url,
            {
              contents: [
                {
                  parts: [
                    { text: prompt },
                  ],
                },
              ],
              generationConfig: {
                responseMimeType: 'application/json',
              },
            },
            {
              headers: { 'Content-Type': 'application/json' },
              timeout: 30000,
            }
          );
          break; // Success
        } catch (err) {
          retries--;
          const msg = err.response?.data?.error?.message || err.message;
          if (retries === 0 || (!msg.includes('timeout') && !msg.includes('high demand') && err.response?.status !== 503)) {
            throw err;
          }
          console.warn(`[AI Analysis] Gemini API Error: ${msg}. Retrying in 2 seconds... (${retries} retries left)`);
          await new Promise(res => setTimeout(res, 2000));
        }
      }

      const responseText = response.data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(responseText.trim());

      return {
        summary: parsed.summary || 'Summary unavailable.',
        outcome: parsed.outcome || 'Interested',
        sentiment: parsed.sentiment || 'Neutral',
        leadScore: typeof parsed.leadScore === 'number' ? parsed.leadScore : 50,
      };
    } catch (error) {
      console.error('Gemini Analysis API Error:', error.message);
      // Fallback
      return this._mockAnalysis(transcript);
    }
  }

  /**
   * Safe mock analysis if API call fails or keys are missing
   */
  _mockAnalysis(transcript) {
    console.log('[Mock AI Analysis] Analyzing transcript...');
    const lower = transcript.toLowerCase();
    
    let summary = 'The call discussed details about scheduling and services.';
    let outcome = 'Interested';
    let sentiment = 'Neutral';
    let leadScore = 60;

    if (lower.includes('callback') || lower.includes('tomorrow') || lower.includes('noon')) {
      summary = 'Customer answered and requested a callback for tomorrow.';
      outcome = 'Callback Requested';
      sentiment = 'Positive';
      leadScore = 80;
    } else if (lower.includes('appointment') || lower.includes('yes that works')) {
      summary = 'Customer was highly interested and agreed to schedule an appointment.';
      outcome = 'Appointment Booked';
      sentiment = 'Positive';
      leadScore = 95;
    } else if (lower.includes('not interested') || lower.includes('no thank you')) {
      summary = 'Customer stated they are not interested at this time.';
      outcome = 'Not Interested';
      sentiment = 'Negative';
      leadScore = 15;
    } else if (lower.includes('goodbye') && !lower.includes('interested')) {
      summary = 'Short conversation concluding quickly.';
      outcome = 'Not Interested';
      sentiment = 'Neutral';
      leadScore = 30;
    }

    return {
      summary,
      outcome,
      sentiment,
      leadScore,
    };
  }
}

module.exports = new AiAnalysisService();
