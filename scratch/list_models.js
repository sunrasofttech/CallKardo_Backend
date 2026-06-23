const axios = require('axios');
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
  try {
    const res = await axios.get(`https://generativelanguage.googleapis.com/v1alpha/models?key=${apiKey}`);
    const models = res.data.models;
    models.forEach(m => {
      if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('bidiGenerateContent')) {
        console.log(m.name, m.supportedGenerationMethods);
      }
    });
  } catch (e) {
    console.error('Error:', e.response ? e.response.data : e.message);
  }
}

listModels();
