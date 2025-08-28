const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = '0.0.0.0'; // listen on all interfaces for LAN access

// Track connected SSE clients
const clients = new Set();

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

function sendEvent(res, event, data) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Initial comment and hello event
  res.write(': connected\n\n');
  sendEvent(res, 'hello', { ts: Date.now() });

  // Keep alive pings
  const ping = setInterval(() => {
    try {
      sendEvent(res, 'ping', { ts: Date.now() });
    } catch (_) {
      // ignore
    }
  }, 30000);

  const client = { res, ping };
  clients.add(client);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

function broadcastChat(payload) {
  for (const { res } of clients) {
    try {
      sendEvent(res, 'chat', payload);
    } catch (_) {
      // ignore broken pipe
    }
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        // ~1MB guard
        req.connection.destroy();
        reject(new Error('payload_too_large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function serveStatic(req, res) {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  let filePath = path.join(__dirname, 'public', urlPath === '/' ? 'index.html' : urlPath);
  // Prevent path traversal
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    if (stats.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404);
        return res.end('Not found');
      }
      const ext = path.extname(filePath).toLowerCase();
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight for POST if needed (same-origin by default)
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/events' && method === 'GET') {
    return handleSSE(req, res);
  }

  if (url.pathname === '/chat' && method === 'POST') {
    try {
      const data = await readJson(req);
      const name = String((data.name || 'anon')).slice(0, 24);
      const message = String((data.message || '')).slice(0, 500);
      if (!message.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'empty_message' }));
      }
      const payload = { name, message, ts: Date.now() };
      broadcastChat(payload);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'invalid_json' }));
    }
  }

  if (url.pathname === '/health' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  return serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  const ips = getLocalIPs();
  const list = ips.map((ip) => `  http://${ip}:${PORT}`).join('\n');
  console.log(`LAN chat listening on:\n${list || '  http://127.0.0.1:' + PORT}`);
});

