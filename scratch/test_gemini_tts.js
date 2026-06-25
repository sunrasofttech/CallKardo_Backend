const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

const models = [
  'gemini-2.5-flash-preview-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.0-flash',
  'gemini-3.5-flash'
];

async function testTtsForModel(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: 'Hello, this is a test of Google Gemini Text to Speech voice preview.' }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: 'Puck'
          }
        }
      }
    }
  };

  try {
    console.log(`\nTesting model: ${model}...`);
    const response = await axios.post(url, requestBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    console.log('  Response status:', response.status);
    const candidates = response.data?.candidates;
    if (candidates && candidates.length > 0) {
      const parts = candidates[0].content?.parts;
      if (parts) {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (part.inlineData) {
            console.log(`  Part ${i}: inlineData found! MimeType:`, part.inlineData.mimeType);
            console.log(`  Data length:`, part.inlineData.data?.length);
            const buf = Buffer.from(part.inlineData.data, 'base64');
            require('fs').writeFileSync(`scratch/test_tts_${model}.wav`, buf);
            console.log(`  Wrote file to scratch/test_tts_${model}.wav`);
            return true;
          }
        }
      }
    }
    console.log('  No audio found in response.');
    return false;
  } catch (err) {
    console.error('  Error:', err.response?.data?.error?.message || err.message);
    return false;
  }
}

async function run() {
  for (const m of models) {
    const ok = await testTtsForModel(m);
    if (ok) {
      console.log(`\nSUCCESS with model: ${m}`);
      break;
    }
  }
  process.exit(0);
}

run();
