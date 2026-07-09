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
    const isMock = this._isMock(apiKey);

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
        from: fromNumber.startsWith('+') ? fromNumber.substring(1) : fromNumber,
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
   * Helper to parse error messages from VoBiz API responses
   */
  _getErrorMessage(err, defaultMsg) {
    if (err.response?.data) {
      if (typeof err.response.data === 'string') {
        return err.response.data;
      }
      if (err.response.data.message) {
        return err.response.data.message;
      }
      if (err.response.data.error) {
        return typeof err.response.data.error === 'string'
          ? err.response.data.error
          : (err.response.data.error.message || JSON.stringify(err.response.data.error));
      }
    }
    return err.message || defaultMsg;
  }

  /**
   * Helper to check if mock/simulation mode should be used
   */
  _isMock(apiKey) {
    return !apiKey || 
           apiKey.includes('your_') || 
           apiKey.includes('mock') || 
           process.env.VOBIZ_FORCE_MOCK === 'true' ||
           (process.env.NODE_ENV !== 'production' && process.env.VOBIZ_FORCE_REAL_CALL !== 'true');
  }

  /**
   * Helper to check if mock/simulation mode should be used for parent operations
   */
  _isParentMock() {
    const parentAuthId = defaults.vobiz.parentAuthId;
    return this._isMock(parentAuthId);
  }

  /**
   * Create a SubAccount for a merchant
   * POST /accounts/{auth_id}/sub-accounts/
   */
  async createSubAccount(name) {
    if (this._isParentMock()) {
      const mockAuthId = `mock-auth-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const mockAuthToken = `mock-token-${Math.random().toString(36).substring(2, 15)}`;
      console.log(`[VoBiz Service Mock] Creating sub-account: ${name} (authId: ${mockAuthId})`);
      return {
        authId: mockAuthId,
        authToken: mockAuthToken,
        name: name
      };
    }
    const client = this._getParentClient();
    try {
      const payload = {
        name: name,
        enabled: true
      };
      
      const response = await client.post(`/accounts/${defaults.vobiz.parentAuthId}/sub-accounts/`, payload);
      
      const resData = response.data;
      const authId = resData?.auth_credentials?.auth_id || resData?.sub_account?.auth_id || resData?.auth_id;
      const authToken = resData?.auth_credentials?.auth_token || resData?.sub_account?.auth_token || resData?.auth_token;
      const subAccountName = resData?.sub_account?.name || resData?.name;
      
      if (authId) {
         return {
           authId: authId,
           authToken: authToken,
           name: subAccountName
         };
      }
      return resData;
    } catch (err) {
      console.error('Vobiz createSubAccount Error:', err.response?.data || err.message);
      throw new Error(this._getErrorMessage(err, 'Failed to create Vobiz Sub-Account'));
    }
  }

  /**
   * List available phone numbers to purchase
   * GET /Account/{auth_id}/inventory/numbers
   */
  async listAvailableNumbers(countryISO = 'IN', type = 'local', pattern = '') {
    if (this._isParentMock()) {
      console.log(`[VoBiz Service Mock] Listing available numbers for ${countryISO}`);
      return [
        { number: '+919999900001', country_iso: countryISO, type },
        { number: '+919999900002', country_iso: countryISO, type },
        { number: '+919999900003', country_iso: countryISO, type }
      ];
    }
    const client = this._getParentClient();
    try {
      const params = {
        country_iso: countryISO,
        type: type,
        page: 1,
        per_page: 25
      };
      if (pattern) {
        params.pattern = pattern;
      }
      
      const response = await client.get(`/Account/${defaults.vobiz.parentAuthId}/inventory/numbers`, { params });
      return response.data;
    } catch (err) {
      console.error('Vobiz listAvailableNumbers Error:', err.response?.data || err.message);
      throw new Error(this._getErrorMessage(err, 'Failed to list available phone numbers'));
    }
  }

  /**
   * Buy a specific phone number under the parent account
   * POST /Account/{auth_id}/numbers/purchase-from-inventory
   */
  async buyNumber(number) {
    if (this._isParentMock()) {
      console.log(`[VoBiz Service Mock] Buying number ${number}`);
      return { success: true, number };
    }
    const client = this._getParentClient();
    try {
      const e164 = number.startsWith('+') ? number : `+${number}`;
      const response = await client.post(`/Account/${defaults.vobiz.parentAuthId}/numbers/purchase-from-inventory`, {
        e164: e164
      });
      return response.data;
    } catch (err) {
      console.error('Vobiz buyNumber Error:', err.response?.data || err.message);
      throw new Error(this._getErrorMessage(err, 'Failed to purchase phone number'));
    }
  }

  /**
   * Assign a purchased number to a subaccount
   * POST /Account/{auth_id}/Number/{e164}/
   */
  async assignNumberToSubAccount(number, subAccountAuthId) {
    if (this._isParentMock()) {
      console.log(`[VoBiz Service Mock] Assigning number ${number} to subaccount ${subAccountAuthId}`);
      return { success: true };
    }
    const client = this._getParentClient();
    try {
      const e164 = number.startsWith('+') ? number : `+${number}`;
      const payload = {
        subaccount: subAccountAuthId
      };
      
      const response = await client.post(`/Account/${defaults.vobiz.parentAuthId}/Number/${encodeURIComponent(e164)}/`, payload);
      return response.data;
    } catch (err) {
      console.error('Vobiz assignNumberToSubAccount Error:', err.response?.data || err.message);
      throw new Error(this._getErrorMessage(err, 'Failed to assign phone number to sub-account'));
    }
  }

  /**
   * Unrent a phone number
   * DELETE /Account/{auth_id}/Number/{e164}/
   */
  async unrentNumber(number) {
    if (this._isParentMock()) {
      console.log(`[VoBiz Service Mock] Unrenting number ${number}`);
      return { success: true };
    }
    const client = this._getParentClient();
    try {
      const e164 = number.startsWith('+') ? number : `+${number}`;
      const response = await client.delete(`/Account/${defaults.vobiz.parentAuthId}/Number/${encodeURIComponent(e164)}/`);
      return response.data;
    } catch (err) {
      console.error('Vobiz unrentNumber Error:', err.response?.data || err.message);
      throw new Error(this._getErrorMessage(err, 'Failed to unrent phone number'));
    }
  }

  /**
   * Automatically creates or retrieves the "AILIVE_INBOUND" Voice Application 
   * in the merchant sub-account, and links the phone number to it.
   */
  async setupInboundRouting({ authId, authToken, number }) {
    const isMock = this._isMock(authId);

    if (isMock) {
      console.log(`[VoBiz Service Mock] Setup inbound routing for number ${number} with mock authId ${authId}`);
      return { success: true };
    }

    try {
      const client = this._getClient(authId, authToken);
      
      // 1. Check if application already exists
      let appId = null;
      let apps = [];
      try {
        const listResponse = await client.get(`/Account/${authId}/Application/`);
        apps = listResponse.data?.objects || listResponse.data || [];
      } catch (listErr) {
        console.warn(`[VoBiz Service] List via /Application/ failed (${listErr.message}), trying /applications/`);
        try {
          const listResponse = await client.get(`/Account/${authId}/applications/`);
          apps = listResponse.data?.objects || listResponse.data || [];
        } catch (listErr2) {
          console.error('[VoBiz Service] Failed to list applications with both formats:', listErr2.message);
        }
      }

      if (Array.isArray(apps)) {
        const existingApp = apps.find(app => app.app_name === 'AILIVE_INBOUND');
        if (existingApp) {
          appId = existingApp.app_id || existingApp.id;
          console.log(`[VoBiz Service] Found existing Application "AILIVE_INBOUND" with ID: ${appId}`);
        }
      }

      // 2. If application doesn't exist, create it
      if (!appId) {
        const appName = 'AILIVE_INBOUND';
        const answerUrl = `https://${defaults.ws.host}/api/v1/vobiz/answer`;
        console.log(`[VoBiz Service] Creating Application "${appName}" with answerUrl: ${answerUrl}`);
        
        let createAppResponse;
        try {
          createAppResponse = await client.post(`/Account/${authId}/Application/`, {
            name: appName,
            app_name: appName,
            answer_url: answerUrl,
            answer_method: 'POST'
          });
        } catch (createErr) {
          console.warn(`[VoBiz Service] Create via /Application/ failed (${createErr.message}), trying /applications/`);
          createAppResponse = await client.post(`/Account/${authId}/applications/`, {
            name: appName,
            app_name: appName,
            answer_url: answerUrl,
            answer_method: 'POST'
          });
        }
        
        appId = createAppResponse.data?.app_id || createAppResponse.data?.id;
        if (!appId) {
          throw new Error('Application creation did not return app_id or id');
        }
        console.log(`[VoBiz Service] Successfully created Application "AILIVE_INBOUND" with ID: ${appId}`);
      }

      // 3. Link the phone number to this application
      const e164 = number.startsWith('+') ? number : `+${number}`;
      console.log(`[VoBiz Service] Linking phone number ${e164} to Application ${appId}`);
      
      let linkResponse;
      try {
        linkResponse = await client.post(`/Account/${authId}/Application/${appId}/`, {
          numbers: [e164]
        });
      } catch (err1) {
        console.warn(`[VoBiz Service] Link via Application sub-resource failed (${err1.message}), trying /Number/`);
        try {
          linkResponse = await client.post(`/Account/${authId}/Number/${encodeURIComponent(e164)}/`, {
            app_id: appId
          });
        } catch (err2) {
          console.warn(`[VoBiz Service] Link via /Number/ failed (${err2.message}), trying /numbers/`);
          linkResponse = await client.post(`/Account/${authId}/numbers/${encodeURIComponent(e164)}/`, {
            app_id: appId
          });
        }
      }
      
      console.log(`[VoBiz Service] Successfully linked number ${e164} to Application.`);
      return { success: true, appId };
    } catch (err) {
      console.error('[VoBiz Service] setupInboundRouting failed:', err.response ? err.response.data : err.message);
      return {
        success: false,
        error: err.response ? JSON.stringify(err.response.data) : err.message
      };
    }
  }

  /**
   * Hang up an active call via VoBiz REST API
   * DELETE https://api.vobiz.ai/api/v1/Account/{auth_id}/Call/{call_uuid}/
   * Terminates the call immediately. No request body needed.
   *
   * @param {object} params
   * @param {string} params.authId - VoBiz Auth ID (X-Auth-ID)
   * @param {string} params.authToken - VoBiz Auth Token (X-Auth-Token)
   * @param {string} params.callUuid - The VoBiz call UUID to terminate
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async hangupCall({ authId, authToken, callUuid }) {
    if (!callUuid) {
      console.warn('[VoBiz Hangup] No call UUID provided — skipping API call.');
      return { success: false, error: 'No call UUID' };
    }

    // In mock/dev mode, skip the actual API call
    if (!authId || authId.includes('your_') || authId.includes('mock')) {
      console.log(`[VoBiz Hangup Mock] Would hang up call ${callUuid}`);
      return { success: true };
    }

    try {
      const url = `${this.apiUrl}/Account/${authId}/Call/${callUuid}/`;
      console.log(`[VoBiz Hangup] Hanging up call ${callUuid} via DELETE ${url}`);

      await axios.delete(url, {
        headers: {
          'X-Auth-ID': authId,
          'X-Auth-Token': authToken,
        },
        timeout: 10000,
      });

      console.log(`[VoBiz Hangup] Call ${callUuid} terminated successfully.`);
      return { success: true };
    } catch (error) {
      const errMsg = error.response?.data || error.message;
      console.error(`[VoBiz Hangup] Failed to hang up call ${callUuid}:`, errMsg);
      return { success: false, error: typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg) };
    }
  }
}

module.exports = new VobizService();
