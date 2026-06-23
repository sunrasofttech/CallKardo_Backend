const sequelize = require('../src/config/database');
const { Voice } = require('../src/models');
const { v4: uuidv4 } = require('uuid');

async function updateDb() {
  try {
    console.log('Adding ai_provider to agents table...');
    await sequelize.query(`
      ALTER TABLE agents
      ADD COLUMN ai_provider VARCHAR(50) DEFAULT 'elevenlabs';
    `).catch(e => {
      console.log('ai_provider might already exist or error:', e.message);
    });

    console.log('Seeding Gemini Live Google Voices...');
    const googleVoices = [
      { id: uuidv4(), name: 'Puck', provider: 'google', voiceId: 'Puck', language: 'en', gender: 'male', isCustom: false },
      { id: uuidv4(), name: 'Charon', provider: 'google', voiceId: 'Charon', language: 'en', gender: 'male', isCustom: false },
      { id: uuidv4(), name: 'Kore', provider: 'google', voiceId: 'Kore', language: 'en', gender: 'female', isCustom: false },
      { id: uuidv4(), name: 'Fenrir', provider: 'google', voiceId: 'Fenrir', language: 'en', gender: 'male', isCustom: false },
      { id: uuidv4(), name: 'Aoede', provider: 'google', voiceId: 'Aoede', language: 'en', gender: 'female', isCustom: false }
    ];

    for (const voice of googleVoices) {
      const existing = await Voice.findOne({ where: { voiceId: voice.voiceId, provider: 'google' } });
      if (!existing) {
        await Voice.create(voice);
        console.log(`Inserted voice: ${voice.name}`);
      } else {
        console.log(`Voice ${voice.name} already exists.`);
      }
    }

    console.log('Done!');
  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    process.exit(0);
  }
}

updateDb();
