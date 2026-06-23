const sequelize = require('../src/config/database');

async function updateDb() {
  try {
    console.log('Updating agents ai_provider from elevenlabs to custom...');
    await sequelize.query(`
      UPDATE agents
      SET ai_provider = 'custom'
      WHERE ai_provider = 'elevenlabs';
    `);
    
    // SQLite doesn't support altering column default easily, but that's fine since Sequelize handles it on insert.
    // If it's MySQL or Postgres we could alter the default.
    try {
      await sequelize.query(`
        ALTER TABLE agents
        ALTER COLUMN ai_provider SET DEFAULT 'custom';
      `);
    } catch (e) {
      console.log('Alter default failed (might be sqlite or syntax diff), ignoring:', e.message);
    }
    
    console.log('Done!');
  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    process.exit(0);
  }
}

updateDb();
