const { CallSession } = require('../src/models');
const sequelize = require('../src/config/database');

async function inspectTranscript() {
  try {
    await sequelize.authenticate();
    const sessions = await CallSession.findAll({
      limit: 3,
      order: [['createdAt', 'DESC']],
    });

    for (const session of sessions) {
      console.log(`\n========================================`);
      console.log(`Session: ${session.id}`);
      console.log(`Status: ${session.status} | Direction: ${session.direction}`);
      console.log(`Transcript:\n${session.transcript || '(Empty)'}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

inspectTranscript();
