const app = require('./app');
const http = require('http');
const { sequelize } = require('./models');
const { startWebSocketServer } = require('./websocket/wsServer');
const defaults = require('./config/defaults');

const port = defaults.port;

async function bootServer() {
  try {
    console.log('Testing MySQL Database connection...');
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    // Sync models in development mode
    if (defaults.nodeEnv !== 'production') {
      console.log('Syncing database models...');
      // Note: sync() creates tables if they do not exist
      await sequelize.sync();
      console.log('All database models synced successfully.');

      const { seedVoices } = require('./utils/seeder');
      await seedVoices();
    }

    const server = http.createServer(app);

    // Attach WebSocket server sharing the same port / server
    startWebSocketServer(server);

    server.listen(port, () => {
      console.log(`===============================================`);
      console.log(`  AI Calling SaaS API Server running on port ${port}`);
      console.log(`  Swagger docs: http://localhost:${port}/api-docs`);
      console.log(`  WebSocket endpoint: ws://localhost:${port}/ws/vobiz`);
      console.log(`===============================================`);
    });

  } catch (error) {
    console.error('Server boot crash:', error);
    process.exit(1);
  }
}

bootServer();
