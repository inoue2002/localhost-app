import React from 'react';
import { Link } from 'react-router-dom';
import { QuizState, openQuiz, resetQuiz, subscribe, setConfig } from '@/lib/api';

export default function Master() {
  const [state, setState] = React.useState<QuizState>({ mode:'buzzer', isOpen: false, first: null, order: [], question: null, counts: [0,0,0,0]});
  const [text, setText] = React.useState('');
  const [opts, setOpts] = React.useState<[string,string,string,string]>(['','','','']);
  const [correct, setCorrect] = React.useState<number | null>(0);

  React.useEffect(() => subscribe((s)=>{
    setState(s);
    if (s.question) {
      setText(s.question.text);
      setOpts([s.question.options[0]||'', s.question.options[1]||'', s.question.options[2]||'', s.question.options[3]||'']);
      setCorrect(s.question.correct ?? 0);
    }
  }, () => {}), []);

  return (
    <div>
      <header style={{ padding: '12px 16px', borderBottom: '1px solid #1b2440', display:'flex', justifyContent:'space-between' }}>
        <div>早押しクイズ | マスター <span className="badge">{state.isOpen ? 'open' : 'closed'}</span></div>
        <Link to="/">トップ</Link>
      </header>
      <main style={{ padding: 16 }}>
        <section className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>問題設定（四択）</h3>
          <div className="grid">
            <label>問題文
              <textarea style={{ width:'100%', minHeight: 64 }} value={text} onChange={(e)=>setText(e.target.value)} />
            </label>
            {['A','B','C','D'].map((label, i) => (
              <label key={i} style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="radio" name="correct" checked={correct===i} onChange={()=>setCorrect(i)} />
                <span style={{ width: 18 }}>{label}</span>
                <input className="input" value={opts[i]}
                  onChange={(e)=>{
                    const v = e.target.value; setOpts((prev)=>{
                      const next = [...prev] as [string,string,string,string]; next[i]=v; return next;
                    });
                  }} />
              </label>
            ))}
            <div className="row">
              <button className="btn" onClick={async()=>{ await setConfig({ text, options: opts, correct }); }}>保存/更新</button>
              <button className="btn secondary" onClick={()=>{ setText(''); setOpts(['','','','']); setCorrect(0); }}>クリア</button>
            </div>
            <div className="row">
              <button className="btn" onClick={() => openQuiz()}>受付開始（Open）</button>
              <button className="btn secondary" onClick={() => resetQuiz()}>リセット（結果クリア）</button>
            </div>
            <div className="status">現在のモード: {state.mode}</div>
          </div>
        </section>
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
        {state.question && (
          <section style={{ marginTop: 16 }}>
            <h3>回答数</h3>
            <div className="grid">
              {['A','B','C','D'].map((label, i) => (
                <div key={i} className="item">{label}. {state.question!.options[i]} — {state.counts[i]}件</div>
              ))}
            </div>
          </section>
        )}
        <p className="status" style={{ marginTop: 12 }}>参加者は「/user」で名前を入れて「早押し」してください。</p>
      </main>
    </div>
  );
}
