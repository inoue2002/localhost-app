import React from 'react';
import { Link } from 'react-router-dom';
import { QuizState, openQuiz, resetQuiz, subscribe } from '@/lib/api';

export default function Master() {
  const [state, setState] = React.useState<QuizState>({ isOpen: false, first: null, order: []});

  React.useEffect(() => subscribe(setState, () => {}), []);

  return (
    <div>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #1b2440', display:'flex', justifyContent:'space-between' }}>
        <div>早押しクイズ | マスター <span className="badge">{state.isOpen ? 'open' : 'closed'}</span></div>
        <Link to="/">トップ</Link>
      </header>
      <main style={{ padding: 16 }}>
        <div className="row">
          <button className="btn" onClick={() => openQuiz()}>受付開始（Open）</button>
          <button className="btn secondary" onClick={() => resetQuiz()}>リセット（結果クリア）</button>
        </div>
        <section style={{ marginTop: 16 }}>
          <h3>最初に押した人</h3>
          <div className="item">{state.first ? `${state.first.name} (${new Date(state.first.ts).toLocaleTimeString()})` : '未決定'}</div>
        </section>
        <section style={{ marginTop: 16 }}>
          <h3>押した順</h3>
          <div className="grid">
            {state.order.map((it, i) => (
              <div key={i} className="item">{i + 1}. {it.name} ({new Date(it.ts).toLocaleTimeString()})</div>
            ))}
          </div>
        </section>
        <p className="status" style={{ marginTop: 12 }}>参加者は「/user」で名前を入れて「早押し」してください。</p>
      </main>
    </div>
  );
}

