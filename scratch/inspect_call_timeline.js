const { CallLog, CallSession } = require('../src/models');
const sequelize = require('../src/config/database');

async function inspectTimeline() {
  try {
    await sequelize.authenticate();
    const sessions = await CallSession.findAll({
      limit: 3,
      order: [['createdAt', 'DESC']],
    });

    if (sessions.length === 0) {
      console.log('No sessions found.');
      process.exit(0);
    }

    for (const session of sessions) {
      console.log(`\n========================================`);
      console.log(`Session: ${session.id} | Status: ${session.status} | Created: ${session.createdAt}`);
      console.log(`========================================`);
      const logs = await CallLog.findAll({
        where: { callSessionId: session.id },
        order: [['createdAt', 'ASC']]
      });

      logs.forEach(log => {
        const timeStr = new Date(log.createdAt).toISOString();
        console.log(`[${timeStr}] [${log.logLevel.toUpperCase()}] ${log.message}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

inspectTimeline();
