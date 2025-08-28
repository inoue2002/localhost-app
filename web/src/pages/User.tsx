import React from 'react';
import { Link } from 'react-router-dom';
import { QuizState, buzz, subscribe } from '@/lib/api';

export default function User() {
  const [state, setState] = React.useState<QuizState>({ isOpen: false, first: null, order: []});
  const [name, setName] = React.useState(() => localStorage.getItem('quiz_name') || '');
  const [pressed, setPressed] = React.useState(false);
  const [msg, setMsg] = React.useState('受付がOpenになるまでお待ちください。');

  React.useEffect(() => {
    const unsub = subscribe((s) => {
      setState(s);
      if (s.first) setMsg(`最初: ${s.first.name} (${new Date(s.first.ts).toLocaleTimeString()})`);
      else setMsg(s.isOpen ? '今すぐ「早押し！」で参加' : '受付がOpenになるまでお待ちください。');
      if (!s.isOpen) setPressed(false);
    });
    return unsub;
  }, []);

  React.useEffect(() => {
    localStorage.setItem('quiz_name', name);
  }, [name]);

  const canBuzz = state.isOpen && !pressed && name.trim().length > 0;

  async function onBuzz() {
    if (!canBuzz) return;
    const res = await buzz(name.trim());
    if (res?.ok) {
      setPressed(true);
      setMsg('送信しました！結果をお待ちください。');
    } else if (res?.reason === 'closed') {
      setMsg('受付は閉じています。');
    } else if (res?.reason === 'duplicate') {
      setMsg('既に押しています。');
    } else {
      setMsg('送信に失敗しました。');
    }
  }

  return (
    <div>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #1b2440', display:'flex', justifyContent:'space-between' }}>
        <div>早押しクイズ | ユーザー <span className="status">{state.isOpen ? 'open' : 'closed'}</span></div>
        <Link to="/">トップ</Link>
      </header>
      <main className="container">
        <div className="card grid">
          <label>
            名前（必須）
            <input className="input" value={name} maxLength={24} onChange={(e)=>setName(e.target.value)} placeholder="例: たろう" />
          </label>
          <button className="btn big" disabled={!canBuzz} onClick={onBuzz}>早押し！</button>
          <div className="status">{msg}</div>
        </div>
      </main>
    </div>
  );
}

