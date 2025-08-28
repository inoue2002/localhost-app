# Web (React + TypeScript)

Dev
- Install: `npm install` (at repo root, enables workspace install)
- Run dev: `npm run web:dev` (Vite on 5173, proxies API to 3000)
- Start server: In another terminal `make start`

Build
- `npm run web:build` → outputs `web/dist/`
- Server serves `web/dist` if present (fallback to `public/`)

Routes
- `/` トップ（役割選択）
- `/master` マスター画面（受付Open/Reset、結果表示）
- `/user` ユーザー画面（名前→早押し）

Network notes
- 同一LAN内でのみアクセス可。iPhoneテザリングAPでも動作。
- 開発時は http://localhost:5173 で表示し、APIは http://localhost:3000 へプロキシされます。
