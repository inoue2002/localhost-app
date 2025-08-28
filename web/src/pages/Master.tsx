import React from 'react';
import { Link } from 'react-router-dom';
import { QuizState, openQuiz, resetQuiz, subscribe, setConfig, setAuto, listQuestions, createQuestion, updateQuestion, deleteQuestion, useQuestion, Question } from '@/lib/api';

export default function Master() {
  const [state, setState] = React.useState<QuizState>({ mode:'buzzer', isOpen: false, first: null, order: [], question: null, counts: [0,0,0,0]});
  const [text, setText] = React.useState('');
  const [opts, setOpts] = React.useState<[string,string,string,string]>(['','','','']);
  const [correct, setCorrect] = React.useState<number | null>(0);
  const [autoEnabled, setAutoEnabled] = React.useState(false);
  const [betweenMs, setBetweenMs] = React.useState(5000);
  const [choiceDurationMs, setChoiceDurationMs] = React.useState(15000);
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => subscribe((s)=>{
    setState(s);
    if (s.question) {
      setText(s.question.text);
      setOpts([s.question.options[0]||'', s.question.options[1]||'', s.question.options[2]||'', s.question.options[3]||'']);
      setCorrect(s.question.correct ?? 0);
    }
    if (s.auto) {
      setAutoEnabled(s.auto.enabled);
      setBetweenMs(s.auto.betweenMs);
      setChoiceDurationMs(s.auto.choiceDurationMs);
    }
  }, () => {}), []);

  React.useEffect(() => {
    (async () => {
      try { const data = await listQuestions(); setQuestions(data.questions || []); } catch {}
    })();
  }, []);

  async function saveNew() {
    const res = await createQuestion({ text, options: opts, correct });
    if (res?.ok && res.question) {
      setQuestions((prev)=>[res.question, ...prev]);
      setSelectedId(res.question.id);
    }
  }
  async function saveUpdate() {
    if (!selectedId) return;
    const res = await updateQuestion(selectedId, { text, options: opts, correct });
    if (res?.ok && res.question) {
      setQuestions((prev)=>prev.map(q=> q.id===selectedId? res.question : q));
    }
  }
  async function removeSelected(id: string) {
    await deleteQuestion(id);
    setQuestions((prev)=>prev.filter(q=>q.id!==id));
    if (selectedId === id) { setSelectedId(null); }
  }
  function loadQuestion(q: Question) {
    setSelectedId(q.id);
    setText(q.text);
    setOpts([q.options[0], q.options[1], q.options[2], q.options[3]]);
    setCorrect(q.correct ?? 0);
  }

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
              <button className="btn" onClick={saveNew}>問題DBに保存（新規）</button>
              <button className="btn secondary" onClick={saveUpdate} disabled={!selectedId}>選択中の問題を更新</button>
              <button className="btn secondary" onClick={()=>{ setSelectedId(null); setText(''); setOpts(['','','','']); setCorrect(0); }}>クリア</button>
              <button className="btn secondary" onClick={async()=>{ await setConfig({ text, options: opts, correct }); }}>この内容で一時設定</button>
            </div>
            <div>
              <h4 style={{ margin: '8px 0' }}>問題DB</h4>
              <div className="grid">
                {questions.map((q)=> (
                  <div key={q.id} className="item" style={{ display:'grid', gap:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                      <strong style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.text}</strong>
                      <small className="status">{new Date(q.updatedAt).toLocaleTimeString()}</small>
                    </div>
                    <div className="row">
                      <button className="btn" onClick={()=>loadQuestion(q)}>編集</button>
                      <button className="btn secondary" onClick={async()=>{ await useQuestion(q.id); }}>この問題を使う</button>
                      <button className="btn secondary" onClick={()=>removeSelected(q.id)}>削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <hr style={{ border:'none', borderTop:'1px solid #1b2440' }} />
            <h4 style={{ margin: 0 }}>自動進行</h4>
            <label style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="checkbox" checked={autoEnabled} onChange={async (e)=>{ const v=e.target.checked; setAutoEnabled(v); await setAuto({ enabled: v, betweenMs, choiceDurationMs }); }} />
              有効にする
            </label>
            <label className="row">
              インターバル(ms)
              <input className="input" type="number" value={betweenMs} onChange={(e)=>setBetweenMs(Math.max(0, Number(e.target.value)||0))} />
            </label>
            <label className="row">
              受付時間（四択, ms）
              <input className="input" type="number" value={choiceDurationMs} onChange={(e)=>setChoiceDurationMs(Math.max(1000, Number(e.target.value)||0))} />
            </label>
            <div className="row">
              <button className="btn" onClick={async()=>{ await setAuto({ enabled: autoEnabled, betweenMs, choiceDurationMs }); }}>自動設定を保存</button>
              <button className="btn secondary" onClick={() => openQuiz({ durationMs: state.mode==='choice' ? choiceDurationMs : undefined })}>今すぐ開始</button>
              <button className="btn secondary" onClick={() => resetQuiz()}>リセット</button>
            </div>
            <div className="status">現在のモード: {state.mode} {state.deadlineTs ? `／ 残り ${(Math.max(0, state.deadlineTs - Date.now())/1000).toFixed(0)} 秒` : ''}</div>
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
