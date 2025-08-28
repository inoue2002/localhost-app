import React from 'react';
import { Link } from 'react-router-dom';

export default function Top() {
  return (
    <div className="container">
      <section className="card">
        <h1 style={{ margin: 0, fontSize: 20 }}>オフラインLAN</h1>
        <p style={{ marginTop: 8 }}>
          同じWi‑Fi内で遊べるミニアプリ。役割を選んで開始。
        </p>
        <div className="grid" style={{ marginTop: 12 }}>
          <Link className="btn" to="/master">ゲームマスター</Link>
          <Link className="btn secondary" to="/user">ユーザー</Link>
        </div>
      </section>
    </div>
  );
}

