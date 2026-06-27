const WebSocket = require('ws');

async function testLiveWs() {
  const url = 'wss://api.callkardo.com/ws/vobiz?token=invalid_test_token';
  console.log(`Connecting to live WebSocket at: ${url}...`);

  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[CONNECTED] WebSockets opened successfully (unexpected with invalid token).');
    ws.close();
  });

  ws.on('close', (code, reason) => {
    console.log(`[CLOSED] Connection closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}`);
    if (code === 4002 || code === 4001) {
      console.log('--- DIAGNOSIS: SUCCESS ---');
      console.log('The WebSocket server is reachable and Nginx is correctly configured to proxy and upgrade WebSocket connections. The server returned expected authorization failure code.');
    } else {
      console.log('--- DIAGNOSIS: WARNING ---');
      console.log(`Unexpected close code ${code}. Check server auth behavior.`);
    }
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error('--- DIAGNOSIS: FAILED ---');
    console.error('Failed to establish WebSocket connection. Details:', err.message);
    process.exit(1);
  });
}

testLiveWs();
