const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
// Note: keep zero dependencies for offline environments

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = '0.0.0.0'; // listen on all interfaces for LAN access
const STATIC_DIR = (function(){
  const dist = path.join(__dirname, 'web', 'dist');
  try { if (fs.existsSync(dist)) return dist; } catch {}
  return path.join(__dirname, 'public');
})();

// Track connected SSE clients
const clients = new Set();

// Quiz state (in-memory)
const quiz = {
  mode: 'buzzer', // 'buzzer' | 'choice'
  isOpen: false,
  // buzzer
  first: null, // { name, ts }
  order: [], // [{ name, ts }]
  pressedBy: new Set(),
  // choice
  question: null, // { text, options: [4], correct: 0-3|null }
  answers: new Map(), // name -> { choice, ts }
};

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
    'Access-Control-Allow-Origin': '*',
  });

  // Initial comment and hello event
  res.write(': connected\n\n');
  sendEvent(res, 'hello', { ts: Date.now() });
  // Push current quiz state on connect
  sendEvent(res, 'quiz_state', publicQuizState());

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

function broadcastQuizState() {
  for (const { res } of clients) {
    try {
      sendEvent(res, 'quiz_state', publicQuizState());
    } catch (_) {}
  }
}

function broadcastBuzz(entry) {
  for (const { res } of clients) {
    try {
      sendEvent(res, 'buzz', entry);
    } catch (_) {}
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
  let filePath = path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
  // Prevent path traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  fs.stat(filePath, (err, stats) => {
    if (err) {
      // SPA fallback (serve index.html) if exists
      const base = path.dirname(filePath);
      const indexFile = path.join(base, 'index.html');
      return fs.readFile(indexFile, (e2, data2) => {
        if (e2) {
          res.writeHead(404);
          return res.end('Not found');
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(data2);
      });
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
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ error: 'empty_message' }));
      }
      const payload = { name, message, ts: Date.now() };
      broadcastChat(payload);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'invalid_json' }));
    }
  }

  // Quiz endpoints
  if (url.pathname === '/quiz/config' && method === 'POST') {
    // Configure multiple-choice question
    try {
      const data = await readJson(req);
      const text = String(data.text || '').trim().slice(0, 200);
      const options = Array.isArray(data.options)
        ? data.options.map((s) => String(s || '').trim().slice(0, 100))
        : [];
      const correct = [0, 1, 2, 3].includes(data.correct) ? data.correct : null;
      if (!text || options.length !== 4 || options.some((s) => !s)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, error: 'invalid_config' }));
      }
      quiz.mode = 'choice';
      quiz.question = { text, options, correct };
      quiz.answers = new Map();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
      broadcastQuizState();
      return;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
    }
  }
  if (url.pathname === '/quiz/open' && method === 'POST') {
    quiz.isOpen = true;
    if (quiz.mode === 'buzzer') {
      quiz.first = null;
      quiz.order = [];
      quiz.pressedBy = new Set();
    } else {
      quiz.answers = new Map();
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true }));
    broadcastQuizState();
    return;
  }
  if (url.pathname === '/quiz/reset' && method === 'POST') {
    quiz.isOpen = false;
    quiz.first = null;
    quiz.order = [];
    quiz.pressedBy = new Set();
    quiz.answers = new Map();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ok: true }));
    broadcastQuizState();
    return;
  }
  if (url.pathname === '/quiz/answer' && method === 'POST') {
    try {
      const data = await readJson(req);
      const name = String((data.name || '')).trim().slice(0, 24) || 'anon';
      const choice = Number(data.choice);
      if (quiz.mode !== 'choice' || !quiz.question) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, reason: 'not_choice' }));
      }
      if (!quiz.isOpen) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, reason: 'closed' }));
      }
      if (!(choice >= 0 && choice < 4)) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, reason: 'invalid_choice' }));
      }
      if (quiz.answers.has(name)) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, reason: 'duplicate' }));
      }
      quiz.answers.set(name, { choice, ts: Date.now() });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
      broadcastQuizState();
      return;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: false, reason: 'invalid_json' }));
    }
  }
  if (url.pathname === '/quiz/buzz' && method === 'POST') {
    readJson(req).then((data) => {
      const name = String((data.name || '')).trim().slice(0, 24) || 'anon';
      if (!quiz.isOpen) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, reason: 'closed' }));
      }
      if (quiz.pressedBy.has(name)) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(JSON.stringify({ ok: false, reason: 'duplicate' }));
      }
      const entry = { name, ts: Date.now() };
      quiz.pressedBy.add(name);
      quiz.order.push(entry);
      if (!quiz.first) {
        quiz.first = entry;
        if (quiz.mode === 'buzzer') {
          // lock on first only for buzzer mode
          quiz.isOpen = false;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true }));
      broadcastBuzz(entry);
      broadcastQuizState();
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: false, reason: 'invalid_json' }));
    });
    return;
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

function publicQuizState() {
  const counts = [0, 0, 0, 0];
  for (const v of quiz.answers.values()) {
    if (v && v.choice >= 0 && v.choice < 4) counts[v.choice] += 1;
  }
  return {
    mode: quiz.mode,
    isOpen: quiz.isOpen,
    first: quiz.first,
    order: quiz.order,
    question: quiz.question,
    counts,
  };
}
