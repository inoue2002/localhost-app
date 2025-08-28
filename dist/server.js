import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';
import os from 'os';
// Optional QR output
let qrcode = null;
try {
    qrcode = require('qrcode-terminal');
}
catch { }
const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';
const STATIC_DIR = (() => {
    const dist = path.join(__dirname, '..', 'web', 'dist');
    try {
        if (fs.existsSync(dist))
            return dist;
    }
    catch { }
    return path.join(__dirname, '..', 'public');
})();
const DATA_DIR = path.join(__dirname, '..', 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const clients = new Set();
const quiz = {
    mode: 'buzzer',
    isOpen: false,
    // buzzer
    first: null,
    order: [],
    pressedBy: new Set(),
    // choice
    question: null,
    answers: new Map(),
    // timers / auto
    deadlineTs: null,
    auto: { enabled: false, betweenMs: 5000, choiceDurationMs: 15000 },
    _timers: { closeTimer: null, nextTimer: null },
    _play: { order: [], idx: -1 },
};
function getLocalIPs() {
    const nets = os.networkInterfaces();
    const addrs = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal)
                addrs.push(net.address);
        }
    }
    return addrs;
}
async function ensureDataStore() {
    try {
        await fsp.mkdir(DATA_DIR, { recursive: true });
    }
    catch { }
    try {
        await fsp.access(QUESTIONS_FILE);
    }
    catch {
        await fsp.writeFile(QUESTIONS_FILE, JSON.stringify({ questions: [] }, null, 2), 'utf-8');
    }
}
async function loadQuestions() {
    try {
        const raw = await fsp.readFile(QUESTIONS_FILE, 'utf-8');
        const data = JSON.parse(raw);
        return Array.isArray(data.questions) ? data.questions : [];
    }
    catch {
        return [];
    }
}
async function saveQuestions(questions) { await fsp.writeFile(QUESTIONS_FILE, JSON.stringify({ questions }, null, 2), 'utf-8'); }
function newId() { return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`; }
function getQuestionById(id, list) { return list.find(q => q.id === id) || null; }
function shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
function sendAll(event, data) {
    for (const c of clients) {
        try {
            c.send(event, data);
        }
        catch { }
    }
}
function publicQuizState() {
    const counts = [0, 0, 0, 0];
    for (const v of quiz.answers.values()) {
        if (v && v.choice >= 0 && v.choice < 4)
            counts[v.choice] += 1;
    }
    return { mode: quiz.mode, isOpen: quiz.isOpen, first: quiz.first, order: quiz.order, question: quiz.question, counts, deadlineTs: quiz.deadlineTs, auto: quiz.auto };
}
function clearTimer(key) { if (quiz._timers[key]) {
    clearTimeout(quiz._timers[key]);
    quiz._timers[key] = null;
} }
function openRound(durationMs) {
    quiz.isOpen = true;
    if (quiz.mode === 'buzzer') {
        quiz.first = null;
        quiz.order = [];
        quiz.pressedBy = new Set();
        quiz.deadlineTs = null;
        clearTimer('closeTimer');
    }
    else {
        quiz.answers = new Map();
        const ms = Number(durationMs || quiz.auto.choiceDurationMs || 0);
        if (ms > 0) {
            quiz.deadlineTs = Date.now() + ms;
            clearTimer('closeTimer');
            quiz._timers.closeTimer = setTimeout(() => closeRound(), ms);
        }
        else {
            quiz.deadlineTs = null;
        }
    }
    sendAll('quiz_state', publicQuizState());
}
function closeRound() {
    quiz.isOpen = false;
    quiz.deadlineTs = null;
    clearTimer('closeTimer');
    sendAll('quiz_state', publicQuizState());
    if (quiz.auto.enabled)
        scheduleNextOpen();
}
async function ensureNextQuestion() {
    const all = await loadQuestions();
    if (!all.length)
        return false;
    if (!quiz._play.order.length) {
        quiz._play = { order: all.map(q => q.id), idx: -1 };
    }
    let nextIdx = (quiz._play.idx || 0) + 1;
    if (nextIdx >= quiz._play.order.length)
        nextIdx = 0;
    const id = quiz._play.order[nextIdx];
    const found = getQuestionById(id, all) || all[0];
    quiz._play.idx = nextIdx;
    quiz.mode = 'choice';
    quiz.question = { text: found.text, options: found.options, correct: found.correct };
    quiz.answers = new Map();
    return true;
}
function scheduleNextOpen() {
    clearTimer('nextTimer');
    const wait = Math.max(0, Number(quiz.auto.betweenMs || 0));
    quiz._timers.nextTimer = setTimeout(async () => { if (quiz.mode === 'choice') {
        await ensureNextQuestion();
        openRound(quiz.auto.choiceDurationMs);
    }
    else {
        openRound();
    } }, wait);
}
const app = new Hono();
// CORS preflight
app.options('*', (c) => c.body(null, 204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }));
// SSE
app.get('/events', (c) => {
    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const send = (event, data) => {
                controller.enqueue(enc.encode(`event: ${event}\n`));
                controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
            };
            // hello + initial state
            controller.enqueue(enc.encode(': connected\n\n'));
            send('hello', { ts: Date.now() });
            send('quiz_state', publicQuizState());
            const client = { send };
            clients.add(client);
            const ping = setInterval(() => { try {
                send('ping', { ts: Date.now() });
            }
            catch { } }, 30000);
            const onAbort = () => { clearInterval(ping); clients.delete(client); };
            c.req.raw.signal?.addEventListener('abort', onAbort);
        },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' } });
});
// Chat (kept for completeness)
app.post('/chat', async (c) => {
    try {
        const body = await c.req.json();
        const name = String(body.name || 'anon').slice(0, 24);
        const message = String(body.message || '').slice(0, 500);
        if (!message.trim())
            return c.json({ error: 'empty_message' }, 400, { 'Access-Control-Allow-Origin': '*' });
        const payload = { name, message, ts: Date.now() };
        sendAll('chat', payload);
        return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' });
    }
    catch {
        return c.json({ error: 'invalid_json' }, 400, { 'Access-Control-Allow-Origin': '*' });
    }
});
// Quiz config & control
app.post('/quiz/config', async (c) => {
    try {
        const b = await c.req.json();
        const text = String(b.text || '').trim().slice(0, 200);
        const options = Array.isArray(b.options) ? b.options.map((s) => String(s || '').trim().slice(0, 100)) : [];
        const correct = [0, 1, 2, 3].includes(b.correct) ? b.correct : null;
        if (!text || options.length !== 4 || options.some((s) => !s))
            return c.json({ ok: false, error: 'invalid_config' }, 400, { 'Access-Control-Allow-Origin': '*' });
        quiz.mode = 'choice';
        quiz.question = { text, options, correct };
        quiz.answers = new Map();
        sendAll('quiz_state', publicQuizState());
        return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' });
    }
    catch {
        return c.json({ ok: false, error: 'invalid_json' }, 400, { 'Access-Control-Allow-Origin': '*' });
    }
});
app.post('/quiz/open', async (c) => { const b = await c.req.json().catch(() => ({})); const durationMs = Number(b.durationMs || 0); openRound(durationMs > 0 ? durationMs : undefined); return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' }); });
app.post('/quiz/reset', (c) => { quiz.isOpen = false; quiz.first = null; quiz.order = []; quiz.pressedBy = new Set(); quiz.answers = new Map(); quiz.deadlineTs = null; clearTimer('closeTimer'); sendAll('quiz_state', publicQuizState()); return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' }); });
app.post('/quiz/auto', async (c) => { try {
    const b = await c.req.json();
    quiz.auto.enabled = !!b.enabled;
    if (b.betweenMs != null)
        quiz.auto.betweenMs = Math.max(0, Number(b.betweenMs));
    if (b.choiceDurationMs != null)
        quiz.auto.choiceDurationMs = Math.max(1000, Number(b.choiceDurationMs));
    clearTimer('nextTimer');
    if (quiz.auto.enabled && !quiz.isOpen)
        scheduleNextOpen();
    return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' });
}
catch {
    return c.json({ ok: false }, 400, { 'Access-Control-Allow-Origin': '*' });
} });
app.post('/quiz/buzz', async (c) => { try {
    const b = await c.req.json();
    const name = String(b.name || '').trim().slice(0, 24) || 'anon';
    if (!quiz.isOpen)
        return c.json({ ok: false, reason: 'closed' }, 200, { 'Access-Control-Allow-Origin': '*' });
    if (quiz.pressedBy.has(name))
        return c.json({ ok: false, reason: 'duplicate' }, 200, { 'Access-Control-Allow-Origin': '*' });
    const entry = { name, ts: Date.now() };
    quiz.pressedBy.add(name);
    quiz.order.push(entry);
    if (!quiz.first) {
        quiz.first = entry;
        if (quiz.mode === 'buzzer') {
            quiz.isOpen = false;
            clearTimer('closeTimer');
            quiz.deadlineTs = null;
            sendAll('quiz_state', publicQuizState());
            if (quiz.auto.enabled)
                scheduleNextOpen();
        }
    }
    sendAll('buzz', entry);
    sendAll('quiz_state', publicQuizState());
    return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' });
}
catch {
    return c.json({ ok: false, reason: 'invalid_json' }, 400, { 'Access-Control-Allow-Origin': '*' });
} });
app.post('/quiz/answer', async (c) => { try {
    const b = await c.req.json();
    const name = String(b.name || '').trim().slice(0, 24) || 'anon';
    const choice = Number(b.choice);
    if (quiz.mode !== 'choice' || !quiz.question)
        return c.json({ ok: false, reason: 'not_choice' }, 200, { 'Access-Control-Allow-Origin': '*' });
    if (!quiz.isOpen)
        return c.json({ ok: false, reason: 'closed' }, 200, { 'Access-Control-Allow-Origin': '*' });
    if (!(choice >= 0 && choice < 4))
        return c.json({ ok: false, reason: 'invalid_choice' }, 400, { 'Access-Control-Allow-Origin': '*' });
    if (quiz.answers.has(name))
        return c.json({ ok: false, reason: 'duplicate' }, 200, { 'Access-Control-Allow-Origin': '*' });
    quiz.answers.set(name, { choice, ts: Date.now() });
    sendAll('quiz_state', publicQuizState());
    return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' });
}
catch {
    return c.json({ ok: false, reason: 'invalid_json' }, 400, { 'Access-Control-Allow-Origin': '*' });
} });
// Questions DB
app.get('/questions', async (c) => { await ensureDataStore(); const list = await loadQuestions(); return c.json({ questions: list }, 200, { 'Access-Control-Allow-Origin': '*' }); });
app.post('/questions', async (c) => { try {
    await ensureDataStore();
    const b = await c.req.json();
    const text = String(b.text || '').trim().slice(0, 2000);
    const options = (Array.isArray(b.options) ? b.options.map((s) => String(s || '').trim().slice(0, 200)) : []);
    const correct = [0, 1, 2, 3].includes(b.correct) ? b.correct : null;
    if (!text || options.length !== 4 || options.some((s) => !s))
        return c.json({ ok: false, error: 'invalid' }, 400, { 'Access-Control-Allow-Origin': '*' });
    const now = Date.now();
    const q = { id: newId(), text, options: [options[0], options[1], options[2], options[3]], correct, createdAt: now, updatedAt: now };
    const list = await loadQuestions();
    list.push(q);
    await saveQuestions(list);
    return c.json({ ok: true, question: q }, 200, { 'Access-Control-Allow-Origin': '*' });
}
catch {
    return c.json({ ok: false }, 400, { 'Access-Control-Allow-Origin': '*' });
} });
app.put('/questions/:id', async (c) => { try {
    await ensureDataStore();
    const id = c.req.param('id');
    const b = await c.req.json();
    const list = await loadQuestions();
    const idx = list.findIndex(q => q.id === id);
    if (idx === -1)
        return c.json({ ok: false, error: 'not_found' }, 404, { 'Access-Control-Allow-Origin': '*' });
    if (b.text != null)
        list[idx].text = String(b.text).trim().slice(0, 2000);
    if (Array.isArray(b.options))
        list[idx].options = b.options.map((s) => String(s || '').trim().slice(0, 200)).slice(0, 4);
    if ([0, 1, 2, 3].includes(b.correct))
        list[idx].correct = b.correct;
    list[idx].updatedAt = Date.now();
    await saveQuestions(list);
    return c.json({ ok: true, question: list[idx] }, 200, { 'Access-Control-Allow-Origin': '*' });
}
catch {
    return c.json({ ok: false }, 400, { 'Access-Control-Allow-Origin': '*' });
} });
app.delete('/questions/:id', async (c) => { await ensureDataStore(); const id = c.req.param('id'); const list = await loadQuestions(); const next = list.filter(q => q.id !== id); await saveQuestions(next); return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' }); });
app.post('/questions/:id/use', async (c) => { await ensureDataStore(); const id = c.req.param('id'); const list = await loadQuestions(); const found = list.find(q => q.id === id); if (!found)
    return c.json({ ok: false, error: 'not_found' }, 404, { 'Access-Control-Allow-Origin': '*' }); quiz.mode = 'choice'; quiz.question = { text: found.text, options: found.options, correct: found.correct }; quiz.answers = new Map(); sendAll('quiz_state', publicQuizState()); return c.json({ ok: true }, 200, { 'Access-Control-Allow-Origin': '*' }); });
// Playlist control
app.post('/quiz/playlist', async (c) => { try {
    const b = await c.req.json();
    const all = await loadQuestions();
    let ids = Array.isArray(b.ids) ? b.ids.map(String) : all.map(q => q.id);
    if (b.shuffle)
        ids = shuffle(ids);
    quiz._play = { order: ids, idx: -1 };
    return c.json({ ok: true, count: ids.length }, 200, { 'Access-Control-Allow-Origin': '*' });
}
catch {
    return c.json({ ok: false }, 400, { 'Access-Control-Allow-Origin': '*' });
} });
app.post('/quiz/next', async (c) => { const ok = await ensureNextQuestion(); if (ok) {
    sendAll('quiz_state', publicQuizState());
    return c.json({ ok: true, question: quiz.question }, 200, { 'Access-Control-Allow-Origin': '*' });
}
else {
    return c.json({ ok: false, error: 'no_question' }, 404, { 'Access-Control-Allow-Origin': '*' });
} });
// Health
app.get('/health', (c) => c.json({ ok: true }));
// Static files (web/dist or public)
app.get('*', async (c) => {
    const urlPath = new URL(c.req.url).pathname;
    let filePath = path.join(STATIC_DIR, urlPath === '/' ? 'index.html' : urlPath);
    const staticRoot = STATIC_DIR;
    if (!filePath.startsWith(staticRoot))
        return c.text('Bad request', 400);
    try {
        const st = await fsp.stat(filePath).catch(() => null);
        if (!st) {
            // SPA fallback
            const base = path.dirname(filePath);
            const indexFile = path.join(base, 'index.html');
            const data2 = await fsp.readFile(indexFile).catch(() => null);
            if (!data2)
                return c.text('Not found', 404);
            const ab = data2.buffer.slice(data2.byteOffset, data2.byteOffset + data2.byteLength);
            return new Response(ab, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        const fp = st.isDirectory() ? path.join(filePath, 'index.html') : filePath;
        const data = await fsp.readFile(fp);
        const ext = path.extname(fp).toLowerCase();
        const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
        const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        return new Response(ab, { headers: { 'Content-Type': types[ext] || 'application/octet-stream' } });
    }
    catch {
        return c.text('Not found', 404);
    }
});
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
    const ips = getLocalIPs();
    const list = ips.map((ip) => `  http://${ip}:${PORT}`).join('\n');
    console.log(`Hono server listening on:\n${list || '  http://127.0.0.1:' + PORT}`);
    if (qrcode) {
        console.log('\nQR codes for mobile access:');
        const targets = ips.length ? ips.map((ip) => `http://${ip}:${PORT}`) : [`http://127.0.0.1:${PORT}`];
        for (const url of targets) {
            console.log(`\nFor ${url}:`);
            try {
                qrcode.generate(url, { small: true });
            }
            catch { }
        }
    }
});
