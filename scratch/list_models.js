const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('No GEMINI_API_KEY found in .env');
  process.exit(1);
}

async function printAllModels() {
  try {
    const responseBeta = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    console.log('--- v1beta models ---');
    console.log(responseBeta.data.models.map(m => m.name).sort());

    const responseAlpha = await axios.get(`https://generativelanguage.googleapis.com/v1alpha/models?key=${apiKey}`);
    console.log('--- v1alpha models ---');
    console.log(responseAlpha.data.models.map(m => m.name).sort());
  } catch (err) {
    console.error('Error listing models:', err.response?.data || err.message);
  }
}

printAllModels();
