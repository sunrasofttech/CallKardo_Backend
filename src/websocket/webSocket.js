const url = require('url');
const { Agent, Voice, Customer, User } = require('../models');
const VoicePipeline = require('../services/voicePipeline');

class WebSocketHandler {
  /**
   * Handle incoming WebSocket connection from web browser tester
   */
  async handleConnection(ws, req) {
    const parameters = url.parse(req.url, true).query;
    const agentId = parameters.agentId;
    const customerId = parameters.customerId;

    if (!agentId) {
      console.error('WS Connection rejected: Missing agentId');
      ws.close(4001, 'Unauthorized: Missing agentId');
      return;
    }

    try {
      // Authenticate agent and include merchant User info
      const agent = await Agent.findByPk(agentId, {
        include: [
          { model: Voice, as: 'voice' },
          { model: User, as: 'user' }
        ],
      });

      if (!agent) {
        console.error(`WS Connection rejected: Invalid agentId "${agentId}"`);
        ws.close(4002, 'Unauthorized: Invalid agentId');
        return;
      }

      // Fetch customer context from DB if customerId is provided
      let customer = null;
      if (customerId) {
        try {
          customer = await Customer.findByPk(customerId);
          if (customer) {
            console.log(`[WebTester] Loaded customer context for: ${customer.name}`);
          }
        } catch (dbErr) {
          console.warn(`[WebTester] Failed to load customer context: ${dbErr.message}`);
        }
      }

      console.log(`WebTester Connection established for Agent: ${agent.id}`);

      // Instantiate Voice Pipeline
      const pipeline = new VoicePipeline({
        agent: agent,
        customer: customer,
        merchant: agent.user,
        direction: 'inbound',
        onAudioOutput: (pcmBuffer, targetRate) => {
          if (ws.readyState === ws.OPEN) {
            // Web clients will receive raw binary PCM 16-bit
            ws.send(pcmBuffer);
          }
        },
        onClearAudio: () => {
          if (ws.readyState === ws.OPEN) {
            // Send a clear signal via a special JSON frame or string
            // For binary websockets, we can just send a string 'CLEAR'
            ws.send('CLEAR');
          }
        },
        onAgentTranscription: (text) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'agent', text }));
          }
        },
        onCustomerTranscription: (text) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'customer', text }));
          }
        },
        onLog: (level, message) => {
          console.log(`[WebTester] ${level.toUpperCase()}: ${message}`);
        },
        onSilenceTimeout: () => {
          console.log(`[WebTester] Ending call due to silence timeout.`);
          if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
            ws.send(JSON.stringify({ type: 'system', text: 'Call ended due to silence timeout.' }));
            ws.close(1000, 'Silence timeout');
          }
        },
      });

      ws.pipeline = pipeline;

      // Web client sends Binary PCM 16kHz audio frames
      ws.on('message', async (message, isBinary) => {
        try {
          if (isBinary) {
            // Audio data
            pipeline.handleAudioInput(message);
          } else {
            // Text data (e.g., 'stop')
            const text = message.toString();
            if (text === 'stop') {
              console.log('[WebTester] Call stopped by client.');
              await pipeline.close();
            }
          }
        } catch (err) {
          console.error('Error handling WebTester stream:', err);
        }
      });

      ws.on('close', async (code, reason) => {
        console.log(`WebTester WebSocket connection closed for agent ${agent.id}. Code: ${code}`);
        if (ws.pipeline) {
          await ws.pipeline.close();
        }
      });

      ws.on('error', (error) => {
        console.error(`WebTester WebSocket error:`, error);
      });

    } catch (err) {
      console.error('WebTester WebSocket connection setup crash:', err);
      ws.close(1011, 'Internal connection error');
    }
  }
}

module.exports = new WebSocketHandler();
