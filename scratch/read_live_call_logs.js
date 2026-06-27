const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('callkardo_db', 'callkardo_user', 'Callkardo@2026', {
  host: '168.144.144.219',
  port: 3306,
  dialect: 'mysql',
  logging: false,
});

async function run() {
  try {
    console.log('Connecting to remote live database (168.144.144.219)...');
    await sequelize.authenticate();
    console.log('Database connected.');

    // Define models
    const CallSession = sequelize.define('CallSession', {
      id: { type: DataTypes.UUID, primaryKey: true },
      userId: { type: DataTypes.UUID, field: 'user_id' },
      agentId: { type: DataTypes.UUID, field: 'agent_id' },
      status: { type: DataTypes.STRING },
      wsSessionToken: { type: DataTypes.STRING, field: 'ws_session_token' },
      createdAt: { type: DataTypes.DATE, field: 'created_at' },
    }, { tableName: 'call_sessions', timestamps: false });

    const CallLog = sequelize.define('CallLog', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      callSessionId: { type: DataTypes.UUID, field: 'call_session_id' },
      logLevel: { type: DataTypes.STRING, field: 'log_level' },
      message: { type: DataTypes.TEXT },
      createdAt: { type: DataTypes.DATE, field: 'created_at' },
    }, { tableName: 'call_logs', timestamps: false });

    console.log('Fetching latest 5 call sessions...');
    const sessions = await CallSession.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    if (sessions.length === 0) {
      console.log('No call sessions found in database.');
      process.exit(0);
    }

    for (const session of sessions) {
      console.log(`\n==================================================`);
      console.log(`Session ID: ${session.id}`);
      console.log(`Status: ${session.status}`);
      console.log(`Created At: ${session.createdAt}`);
      console.log(`Token: ${session.wsSessionToken}`);
      console.log(`--------------------------------------------------`);
      
      const logs = await CallLog.findAll({
        where: { callSessionId: session.id },
        order: [['id', 'ASC']]
      });

      if (logs.length === 0) {
        console.log('  (No logs recorded for this session)');
      } else {
        logs.forEach(log => {
          console.log(`  [${log.createdAt.toISOString()}] [${log.logLevel.toUpperCase()}] ${log.message}`);
        });
      }
    }

  } catch (err) {
    console.error('Error fetching live logs:', err.message);
  }
  process.exit(0);
}

run();
