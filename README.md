# Localhost LAN Chat (Offline)

A zero-dependency LAN mini‑apps set that works offline on the same Wi‑Fi/LAN. Includes a buzzer quiz and simple chat. Uses Server-Sent Events (SSE) for realtime updates—no external services required.

## Run (Production build)

- Start server on your Mac:
  - `make start` (or `PORT=3000 node server.js`)
- On other devices (same Wi‑Fi), open:
  - `http://<MacのIP>:3000` → トップ画面で役割を選択（ゲームマスター / ユーザー）
  - ヒント: `make ip` でIPを確認、または `ipconfig getifaddr en0`。

If macOS firewall prompts, allow incoming connections for Node.

## Run (Dev with React)

- Install deps: `npm install`
- Start API server: `make start`
- Start web dev server: `npm run web:dev` then open `http://localhost:5173`

## How it works

- `server.js`: HTTP server + SSE `/events`; endpoints `/chat`, `/quiz/open`, `/quiz/reset`, `/quiz/buzz`。
- `web/` — React + TypeScript client (Vite). Routes: `/`, `/master`, `/user`。
- `public/` — fallback static assets (legacy, optional)
- Binds to `0.0.0.0` so others on the LAN can connect.

## Project layout

- `public/` — static assets (index.html, master.html, user.html)
- `server.js` — app server
- `Makefile` — helper tasks

## Notes

- Fully offline: only requires that all devices are on the same network (Wi‑Fi tethering or macOS Internet Sharing also可)。
- All state is in-memory only. Restart clears results. Persistence would require a small store (file/SQLite).
