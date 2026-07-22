const WebSocket = require('ws');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;
const models = [
  'gemini-3.1-flash-live-preview'
];

async function testModel(modelName) {
  return new Promise((resolve) => {
    const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;
    console.log(`\nTesting model: models/${modelName}`);
    const ws = new WebSocket(WS_URL);

    let setupDone = false;

    ws.on('open', () => {
      console.log('  WebSocket Connected');
      const setup = {
        setup: {
          model: `models/${modelName}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
            }
          }
        }
      };
      ws.send(JSON.stringify(setup));
    });

    ws.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.setupComplete) {
        console.log(`  ✅ Setup Complete for models/${modelName}`);
        setupDone = true;
        const greetMsg = {
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: 'Hello, what is your name?' }]
            }],
            turnComplete: true
          }
        };
        ws.send(JSON.stringify(greetMsg));
        console.log('  Greeting sent');
      } else if (parsed.serverContent) {
        const parts = parsed.serverContent.modelTurn?.parts || [];
        const hasAudio = parts.some(p => p.inlineData && p.inlineData.data);
        const hasText = parts.some(p => p.text);
        console.log(`  🎉 Received serverContent. Parts: ${parts.length}, Has Audio: ${hasAudio}, Has Text: ${hasText}`);
        if (hasAudio) {
          const size = parts.find(p => p.inlineData?.data).inlineData.data.length;
          console.log(`     Audio chunk size: ${size} bytes (base64)`);
        }
      } else if (parsed.error) {
        console.log(`  ❌ API Error: ${parsed.error.message}`);
        ws.close();
        resolve(false);
      }
    });

    ws.on('error', (err) => {
      console.log(`  ❌ WS Error: ${err.message}`);
      resolve(false);
    });

    ws.on('close', (code, reason) => {
      console.log(`  WebSocket Closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}`);
      resolve(true);
    });

    // Timeout after 6 seconds
    setTimeout(() => {
      ws.close();
      resolve(true);
    }, 6000);
  });
}

async function run() {
  for (const m of models) {
    await testModel(m);
  }
}

run();
