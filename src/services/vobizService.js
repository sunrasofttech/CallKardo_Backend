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
   * @param {string} params.apiKey - Merchant VoBiz Auth ID (X-Auth-ID)
   * @param {string} params.apiSecret - Merchant VoBiz Auth Token (X-Auth-Token)
   * @param {string} params.fromNumber - Merchant VoBiz Number
   * @param {string} params.toNumber - Target Customer Mobile Number
   * @param {string} params.wsToken - WebSocket Token for audio streaming auth
   * @returns {Promise<{ success: boolean, callId?: string, error?: string }>}
   */
  async initiateCall({ apiKey, apiSecret, fromNumber, toNumber, wsToken }) {
    // If credentials are mocks/unset, trigger a local mock simulation
    const isMock = !apiKey || 
                   apiKey.includes('your_') || 
                   apiKey.includes('mock') || 
                   (process.env.NODE_ENV !== 'production' && process.env.VOBIZ_FORCE_REAL_CALL !== 'true');

    if (isMock) {
      this._simulateIncomingCall(wsToken);
      return { success: true, callId: `mock-call-${Date.now()}` };
    }

    try {
      const authId = apiKey;
      const authToken = apiSecret;
      const url = `${this.apiUrl}/Account/${authId}/Call/`;

      // Answer URL must be an HTTP/S endpoint that returns XML
      // We'll point it to our vobiz webhook endpoint
      const answerUrl = `https://${defaults.ws.host}/api/v1/vobiz/answer?token=${wsToken}`;

      const data = {
        from: fromNumber,
        to: toNumber.startsWith('+') ? toNumber.substring(1) : toNumber,
        answer_url: answerUrl,
        answer_method: 'POST',
      };

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-ID': authId,
          'X-Auth-Token': authToken,
        },
        timeout: 10000,
      });

      return {
        success: true,
        callId: response.data.call_id || response.data.request_uuid || response.data.id,
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
        
        // Send a start event frame
        client.send(JSON.stringify({
          event: 'start',
          start: { streamId: 'mock-stream-id' }
        }));

        // Send a fake audio chunk (representing customer saying "Hello, interested")
        client.send(JSON.stringify({
          event: 'media',
          media: {
            payload: Buffer.alloc(1024).toString('base64')
          }
        }));

        // After 4 seconds, send another audio chunk (representing customer asking about scheduling)
        setTimeout(() => {
          if (client.readyState === WebSocket.OPEN) {
            console.log('[VoBiz Simulator] Customer speaking turn 2...');
            client.send(JSON.stringify({
              event: 'media',
              media: {
                payload: Buffer.alloc(1024).toString('base64')
              }
            }));
          }
        }, 4000);

        // Terminate call after 8 seconds
        setTimeout(() => {
          if (client.readyState === WebSocket.OPEN) {
            console.log('[VoBiz Simulator] Hanging up call.');
            client.send(JSON.stringify({ event: 'stop' }));
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

  /**
   * Helper to create an Axios instance with standard Auth headers
   */
  _getClient(authId, authToken) {
    return axios.create({
      baseURL: this.apiUrl,
      headers: {
        'X-Auth-ID': authId,
        'X-Auth-Token': authToken,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Helper to get the parent client
   */
  _getParentClient() {
    const parentAuthId = defaults.vobiz.parentAuthId;
    const parentAuthToken = defaults.vobiz.parentAuthToken;
    
    if (!parentAuthId || !parentAuthToken) {
      throw new Error('VOBIZ_PARENT_AUTH_ID or VOBIZ_PARENT_AUTH_TOKEN is not configured');
    }
    
    return this._getClient(parentAuthId, parentAuthToken);
  }

  /**
   * Create a SubAccount for a merchant
   * POST /api/v1/accounts/{auth_id}/sub-accounts/
   */
  async createSubAccount(name) {
    const client = this._getParentClient();
    try {
      const payload = {
        name: name,
        enabled: true
      };
      
      const response = await client.post(`/accounts/${defaults.vobiz.parentAuthId}/sub-accounts/`, payload);
      
      if (response.data && response.data.auth_id) {
         return {
           authId: response.data.auth_id,
           authToken: response.data.auth_token,
           name: response.data.name
         };
      }
      return response.data;
    } catch (err) {
      console.error('Vobiz createSubAccount Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Failed to create Vobiz Sub-Account');
    }
  }

  /**
   * List available phone numbers to purchase
   * GET /api/v1/Account/{auth_id}/inventory/numbers
   */
  async listAvailableNumbers(countryISO = 'IN', type = 'local', pattern = '') {
    const client = this._getParentClient();
    try {
      const params = {
        country: countryISO,
      };
      if (pattern) {
        params.search = pattern;
      }
      
      const response = await client.get(`/Account/${defaults.vobiz.parentAuthId}/inventory/numbers`, { params });
      return response.data;
    } catch (err) {
      console.error('Vobiz listAvailableNumbers Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Failed to list available phone numbers');
    }
  }

  /**
   * Buy a specific phone number under the parent account
   * POST /api/v1/Account/{auth_id}/numbers/purchase-from-inventory
   */
  async buyNumber(number) {
    const client = this._getParentClient();
    try {
      const e164 = number.startsWith('+') ? number : `+${number}`;
      const payload = { e164 };
      const response = await client.post(`/Account/${defaults.vobiz.parentAuthId}/numbers/purchase-from-inventory`, payload);
      return response.data;
    } catch (err) {
      console.error('Vobiz buyNumber Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Failed to purchase phone number');
    }
  }

  /**
   * Assign a purchased number to a subaccount
   * POST /api/v1/account/{auth_id}/numbers/{e164}/assign-subaccount
   */
  async assignNumberToSubAccount(number, subAccountAuthId) {
    const client = this._getParentClient();
    try {
      const e164 = number.startsWith('+') ? number : `+${number}`;
      const payload = {
        sub_account_id: subAccountAuthId
      };
      
      const response = await client.post(`/Account/${defaults.vobiz.parentAuthId}/numbers/${encodeURIComponent(e164)}/assign-subaccount`, payload);
      return response.data;
    } catch (err) {
      console.error('Vobiz assignNumberToSubAccount Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Failed to assign phone number to sub-account');
    }
  }

  /**
   * Unrent a phone number
   * DELETE /api/v1/Account/{auth_id}/numbers/{e164}
   */
  async unrentNumber(number) {
    const client = this._getParentClient();
    try {
      const e164 = number.startsWith('+') ? number : `+${number}`;
      const response = await client.delete(`/Account/${defaults.vobiz.parentAuthId}/numbers/${encodeURIComponent(e164)}`);
      return response.data;
    } catch (err) {
      console.error('Vobiz unrentNumber Error:', err.response?.data || err.message);
      throw new Error(err.response?.data?.message || 'Failed to unrent phone number');
    }
  }
}

module.exports = new VobizService();
