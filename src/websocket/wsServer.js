const { WebSocketServer } = require('ws');
const http = require('http');
const vobizSocketHandler = require('./vobizSocket');
const webSocketHandler = require('./webSocket');
const defaults = require('../config/defaults');

const port = defaults.ws.port;

function startWebSocketServer(server = null) {
  let wss;

  if (server) {
    // Share existing HTTP server port (typically 3000)
    console.log('Attaching WebSocket server to existing HTTP server...');
    wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

      if (pathname === '/ws/vobiz') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.isWebcall = false;
          wss.emit('connection', ws, request);
        });
      } else if (pathname === '/ws/webcall') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          ws.isWebcall = true;
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });
  } else {
    // Standalone WS Server (port 8000)
    console.log(`Starting standalone WebSocket server on port ${port}...`);
    const httpServer = http.createServer((req, res) => {
      res.writeHead(404);
      res.end();
    });

    wss = new WebSocketServer({ server: httpServer });

    setupWss(wss);

    httpServer.listen(port, () => {
      console.log(`WebSocket standalone server listening on port ${port}`);
    });
    return httpServer;
  }

  setupWss(wss);
  return wss;
}

function setupWss(wss) {
  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    if (ws.isWebcall) {
      webSocketHandler.handleConnection(ws, req);
    } else {
      vobizSocketHandler.handleConnection(ws, req);
    }
  });

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        console.log('Terminating dead WebSocket connection...');
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });
}

// Support executing directly as a standalone process
if (require.main === module) {
  startWebSocketServer();
}

module.exports = {
  startWebSocketServer,
};
