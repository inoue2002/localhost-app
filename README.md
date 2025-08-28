# Localhost LAN Chat (Offline)

A zero-dependency LAN mini‑apps set that works offline on the same Wi‑Fi/LAN. Includes a buzzer quiz and simple chat. Uses Server-Sent Events (SSE) for realtime updates—no external services required.

## Run

- Start on your Mac:
  - `make start` (or `PORT=3000 node server.js`)
- On other devices (same Wi‑Fi), open:
  - `http://<MacのIP>:3000` → トップ画面で役割を選択（ゲームマスター / ユーザー）
  - ヒント: `make ip` でIPを確認、または `ipconfig getifaddr en0`。

If macOS firewall prompts, allow incoming connections for Node.

## How it works

- `server.js`: HTTP server + SSE `/events`; endpoints `/chat`, `/quiz/open`, `/quiz/reset`, `/quiz/buzz`。
- `public/index.html`: トップ画面（役割選択）。
- `public/master.html`: マスター用。受付Open/Reset、押した順と最初の人を表示。
- `public/user.html`: ユーザー用。名前入力→「早押し！」。
- Binds to `0.0.0.0` so others on the LAN can connect.

## Project layout

- `public/` — static assets (index.html, master.html, user.html)
- `server.js` — app server
- `Makefile` — helper tasks

## Notes

- Fully offline: only requires that all devices are on the same network (Wi‑Fi tethering or macOS Internet Sharing also可)。
- All state is in-memory only. Restart clears results. Persistence would require a small store (file/SQLite).
