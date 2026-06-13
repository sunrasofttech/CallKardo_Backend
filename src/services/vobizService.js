const axios = require('axios');
const WebSocket = require('ws');
const defaults = require('../config/defaults');

class VobizService {
  constructor() {
    this.apiUrl = defaults.vobiz.apiUrl;
  }

  /**
   * Triggers an outbound call via VoBiz API
   * @param {object} params
   * @param {string} params.apiKey - Merchant VoBiz API Key
   * @param {string} params.apiSecret - Merchant VoBiz API Secret
   * @param {string} params.fromNumber - Merchant VoBiz Number
   * @param {string} params.toNumber - Target Customer Mobile Number
   * @param {string} params.wsToken - WebSocket Token for audio streaming auth
   * @returns {Promise<{ success: boolean, callId?: string, error?: string }>}
   */
  async initiateCall({ apiKey, apiSecret, fromNumber, toNumber, wsToken }) {
    // If credentials are mocks/unset, trigger a local mock simulation
    const isMock = !apiKey || apiKey.includes('your_') || process.env.NODE_ENV !== 'production';

    if (isMock) {
      this._simulateIncomingCall(wsToken);
      return { success: true, callId: `mock-call-${Date.now()}` };
    }

    try {
      const response = await axios.post(
        `${this.apiUrl}/calls/outbound`,
        {
          from: fromNumber,
          to: toNumber,
          // VoBiz should connect its audio streaming websocket to our server with this token
          stream_url: `wss://${defaults.ws.host}/ws/vobiz?token=${wsToken}`,
          audio_format: 'linear16_16khz',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VoBiz-API-Key': apiKey,
            'X-VoBiz-API-Secret': apiSecret,
          },
          timeout: 5000,
        }
      );

      return {
        success: true,
        callId: response.data.call_id || response.data.id,
      };
    } catch (error) {
      console.error('VoBiz API Outbound Trigger Failed:', error.response ? error.response.data : error.message);
      return {
        success: false,
        error: error.response ? JSON.stringify(error.response.data) : error.message,
      };
    }
  }

  /**
   * Local Simulation: Establishes a Mock WebSocket connection to our WebSocket Service,
   * sends binary voice ticks (PCM) and closes connection after 10 seconds to simulate a complete call lifecycle.
   */
  _simulateIncomingCall(wsToken) {
    // Delay slightly to mimic dialing connection times
    setTimeout(() => {
      const port = defaults.ws.port;
      const wsUrl = `ws://127.0.0.1:${port}/ws/vobiz?token=${wsToken}`;
      console.log(`[VoBiz Simulator] Dialing customer... Connecting to WS: ${wsUrl}`);

      const client = new WebSocket(wsUrl);

      client.on('open', () => {
        console.log('[VoBiz Simulator] Customer answered. WebSocket streaming started.');
        
        // Send a fake binary audio chunk (representing customer saying "Hello, interested")
        // We'll send a dummy buffer of 1024 bytes (representing Linear16 PCM silence/static)
        client.send(Buffer.alloc(1024));

        // After 4 seconds, send another audio chunk (representing customer asking about scheduling)
        setTimeout(() => {
          if (client.readyState === WebSocket.OPEN) {
            console.log('[VoBiz Simulator] Customer speaking turn 2...');
            client.send(Buffer.alloc(1024));
          }
        }, 4000);

        // Terminate call after 8 seconds
        setTimeout(() => {
          if (client.readyState === WebSocket.OPEN) {
            console.log('[VoBiz Simulator] Hanging up call.');
            client.close(1000, 'Call completed naturally');
          }
        }, 8000);
      });

      client.on('message', (data) => {
        // Receives speech synthesizer output back from the WebSocket server
        console.log(`[VoBiz Simulator] Speaker received audio bytes: ${data.length} bytes`);
      });

      client.on('error', (err) => {
        console.error('[VoBiz Simulator] WS connection error:', err.message);
      });

      client.on('close', () => {
        console.log('[VoBiz Simulator] Call connection terminated.');
      });
    }, 1500);
  }
}

module.exports = new VobizService();
