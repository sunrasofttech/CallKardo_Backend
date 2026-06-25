const WebSocket = require('ws');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

const candidates = [
  { version: 'v1beta', model: 'models/gemini-2.0-flash' },
  { version: 'v1beta', model: 'models/gemini-2.0-flash-lite' },
  { version: 'v1beta', model: 'models/gemini-2.5-flash' },
  { version: 'v1beta', model: 'models/gemini-2.5-flash-preview-tts' },
  { version: 'v1alpha', model: 'models/gemini-2.0-flash' },
  { version: 'v1alpha', model: 'models/gemini-2.0-flash-lite' },
  { version: 'v1alpha', model: 'models/gemini-2.5-flash' },
  { version: 'v1alpha', model: 'models/gemini-2.5-flash-preview-tts' },
  // Let's also try without models/ prefix
  { version: 'v1beta', model: 'gemini-2.0-flash' },
  { version: 'v1alpha', model: 'gemini-2.0-flash' }
];

async function testCandidate(candidate) {
  return new Promise((resolve) => {
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${candidate.version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    console.log(`\nTesting ${candidate.version} with model: ${candidate.model}`);
    const ws = new WebSocket(wsUrl);
    let resolved = false;

    ws.on('open', () => {
      const setupMessage = {
        setup: {
          model: candidate.model,
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
    });

    ws.on('message', (data) => {
      const resp = data.toString();
      console.log(`  [SUCCESS] Received message:`, resp.substring(0, 150));
      if (!resolved) {
        resolved = true;
        ws.close();
        resolve(true);
      }
    });

    ws.on('error', (err) => {
      console.error(`  [ERROR]`, err.message);
    });

    ws.on('close', (code, reason) => {
      if (!resolved) {
        console.log(`  [FAILED] Closed with code ${code}, reason: ${reason.toString()}`);
        resolve(false);
      }
    });
  });
}

async function run() {
  for (const c of candidates) {
    const ok = await testCandidate(c);
    if (ok) {
      console.log(`\nFound working combination! Version: ${c.version}, Model: ${c.model}`);
    }
  }
  process.exit(0);
}

run();
