export type QuizState = {
  mode: 'buzzer' | 'choice';
  isOpen: boolean;
  first: { name: string; ts: number } | null;
  order: { name: string; ts: number }[];
  question: { text: string; options: string[]; correct: number | null } | null;
  counts: [number, number, number, number];
};

export function openQuiz() {
  return fetch('/quiz/open', { method: 'POST' });
}
export function resetQuiz() {
  return fetch('/quiz/reset', { method: 'POST' });
}
export async function buzz(name: string) {
  const res = await fetch('/quiz/buzz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return res.json().catch(() => ({}));
}

export async function setConfig(data: { text: string; options: [string, string, string, string]; correct: number | null }) {
  const res = await fetch('/quiz/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json().catch(() => ({}));
}

export async function answer(name: string, choice: number) {
  const res = await fetch('/quiz/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, choice })
  });
  return res.json().catch(() => ({}));
}

export function subscribe(onState: (s: QuizState) => void, onBuzz?: (e: {name:string;ts:number}) => void) {
  const es = new EventSource('/events');
  es.addEventListener('quiz_state', (ev) => {
    try { onState(JSON.parse((ev as MessageEvent).data)); } catch {}
  });
  if (onBuzz) es.addEventListener('buzz', (ev) => {
    try { onBuzz(JSON.parse((ev as MessageEvent).data)); } catch {}
  });
  return () => es.close();
}
