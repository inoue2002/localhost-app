# Localhost LAN Chat (Offline)

A zero-dependency LAN chat app that works offline on the same Wi‑Fi/LAN. Uses Server-Sent Events (SSE) for realtime updates—no external services required.

## Run

- Start on your Mac:
  - `make start` (or `PORT=3000 node server.js`)
- On other devices (same Wi‑Fi), open:
  - `http://<MacのIP>:3000` (例: `http://192.168.2.10:3000`)
  - ヒント: `make ip` でIPを確認、または `ipconfig getifaddr en0`。

If macOS firewall prompts, allow incoming connections for Node.

## How it works

- `server.js`: HTTP server + SSE endpoint `/events` and POST `/chat`.
- `public/index.html`: Minimal UI. Subscribes via `EventSource`, posts with `fetch`.
- Binds to `0.0.0.0` so others on the LAN can connect.

## Project layout

- `public/` — static assets (index.html)
- `server.js` — app server
- `Makefile` — helper tasks

## Notes

- Fully offline: only requires that all devices are on the same network (Wi‑Fi tethering or macOS Internet Sharing also可)。
- Messages are in-memory only. Restart clears history. Persisting chat would require a small store (file/SQLite).

