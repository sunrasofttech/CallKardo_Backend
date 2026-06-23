const WebSocket = require('ws');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('WS Connected.');
  const setupMessage = {
    setup: {
      model: 'models/gemini-2.0-flash-exp',
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck'
            }
          }
        }
      },
      systemInstruction: {
        parts: [{ text: "Hello" }]
      }
    }
  };
  ws.send(JSON.stringify(setupMessage));
  console.log('Sent setup message.');
});

ws.on('message', (data) => {
  console.log('Received:', data.toString());
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
});

ws.on('close', (code, reason) => {
  console.log('WS Closed:', code, reason.toString());
});
