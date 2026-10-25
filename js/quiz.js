// Vragen laden en sessies samenstellen.
import { record, isDue, dueAt } from './store.js';

let INDEX = null;
const CACHE = new Map();   // hoofdstuk -> vragen[]
export const QMAP = new Map(); // id -> vraag

export async function loadIndex() {
  if (!INDEX) {
    const res = await fetch('data/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('data/index.json niet gevonden');
    INDEX = (await res.json()).chapters;
  }
  return INDEX;
}

export async function loadChapter(n) {
  if (CACHE.has(n)) return CACHE.get(n);
  const res = await fetch(`data/hoofdstuk-${n}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Hoofdstuk ${n} kon niet worden geladen`);
  const list = await res.json();
  list.forEach(q => QMAP.set(q.id, q));
  CACHE.set(n, list);
  return list;
}

export async function loadChapters(nums) {
  return (await Promise.all(nums.map(loadChapter))).flat();
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Oefenvolgorde. 'Slim': foutenvijver, dan vragen die herhaald moeten worden (oudste afspraak eerst),
 *  dan nog niet geziene vragen, dan de rest (die nog even mag wachten). */
export function practiceOrder(pool, smart) {
  if (!smart) return shuffle(pool).map(q => q.id);
  const now = Date.now();
  const pond = [], due = [], fresh = [], rest = [];
  for (const q of shuffle(pool)) {
    const r = record(q.id);
    if (r && r.p) pond.push(q);
    else if (!r) fresh.push(q);
    else if (isDue(r, now)) due.push(q);
    else rest.push(q);
  }
  due.sort((a, b) => dueAt(record(a.id)) - dueAt(record(b.id)));
  rest.sort((a, b) => dueAt(record(a.id)) - dueAt(record(b.id)));
  return [...pond, ...due, ...fresh, ...rest].map(q => q.id);
}

/** Examenvragen. Met spread=true gelijkmatig verdeeld over de hoofdstukken in de pool
 *  (naar rato van het aantal vragen per hoofdstuk, minstens 1 per hoofdstuk), anders puur willekeurig. */
export function examQuestions(pool, n, spread = true) {
  if (!spread) return shuffle(pool).slice(0, n).map(q => q.id);
  const groups = new Map();
  for (const q of pool) { if (!groups.has(q.chapter)) groups.set(q.chapter, []); groups.get(q.chapter).push(q); }
  const gs = [...groups.values()];
  n = Math.min(n, pool.length);
  const quota = gs.map(() => 0);
  if (n >= gs.length) quota.fill(1);
  let left = n - quota.reduce((s, x) => s + x, 0);
  // rest naar rato van groepsgrootte (grootste-restmethode), begrensd door de groepsgrootte
  while (left > 0) {
    const room = gs.map((g, i) => g.length - quota[i]);
    const totalRoom = room.reduce((s, x) => s + x, 0);
    if (totalRoom <= 0) break;
    const want = gs.map((g, i) => (room[i] > 0 ? left * g.length / pool.length : 0));
    let given = 0;
    const base = want.map((w, i) => Math.min(Math.floor(w), room[i]));
    base.forEach((v, i) => { quota[i] += v; given += v; });
    left -= given;
    if (left > 0 && given === 0) {
      const order = want.map((w, i) => [w - Math.floor(w) + (room[i] > 0 ? 0 : -1), i]).sort((x, y) => y[0] - x[0]);
      for (const [, i] of order) { if (left <= 0) break; if (quota[i] < gs[i].length) { quota[i]++; left--; } }
    }
  }
  return shuffle(gs.flatMap((g, i) => shuffle(g).slice(0, quota[i]))).map(q => q.id);
}

/** Slaagdrempel: 35/50; bij minder vragen dezelfde verhouding (70%), naar boven afgerond. */
export const passThreshold = (total, mark = 35, of = 50) => Math.ceil(total * mark / of);

export const chapterOf = id => parseInt(id.match(/^hs(\d+)-/)[1], 10);
export const fmtTime = s => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(x).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
