const { cli, ServerOptions } = require('@livekit/agents');
const path = require('path');
const defaults = require('../config/defaults');

// LiveKit Agents CLI expects the path to the voice agent file
const voiceAgentPath = path.resolve(__dirname, '../agent/voiceAgent.js');

function startLivekitWorker() {
  // Ensure connection parameters are populated in process.env for the CLI runner
  process.env.LIVEKIT_URL = process.env.LIVEKIT_URL || defaults.livekit.url;
  process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || defaults.livekit.apiKey;
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || defaults.livekit.apiSecret;

  console.log(`[AgentWorker] Starting LiveKit Agent Worker → ${process.env.LIVEKIT_URL}`);

  // The CLI parser reads from process.argv.
  // When forked by server.js, 'dev' is passed as an argument.
  // Ensure 'dev' is in argv so it uses a random port (avoids EADDRINUSE on 8081).
  const hasMode = process.argv.some(a => a === 'dev' || a === 'start');
  if (!hasMode) {
    process.argv.push('dev');
  }

  const opts = new ServerOptions({
    agent: voiceAgentPath,
    initializeProcessTimeout: 120000, // 120 seconds for slow 1-vCPU servers
    port: 0, // Random open port for the health-check server
  });

  cli.runApp(opts);
}

// Always start when this file is loaded (both `require.main === module` AND when forked)
startLivekitWorker();

