// Lokale opslag (localStorage), foutenvijver, statistieken en samenvoeg-logica voor synchronisatie.
//
// Per vraag bewaren we één compact record:  { a: pogingen, ok: goed, t: tijdstip laatste poging,
//                                             l: laatste poging goed (1/0), p: in foutenvijver (1/0),
//                                             b: Leitner-box 0-5 (slim herhalen), d: moment waarop herhaling aan de beurt is }
// Samenvoegen tussen apparaten gebeurt per vraag: het record met de nieuwste tijdstempel wint.
// 'resetAt' zorgt dat een reset op het ene apparaat ook op de andere apparaten doorwerkt.

const KEY = 'flic.v1';
const PKEY = 'flic.prefs';
const SKEY = 'flic.session';

export const DEFAULT_PREFS = {
  examMinutes: 90,
  examCount: 50,
  passMark: 35,      // geslaagd bij >= 35 van 50 (70%)
  smart: true,       // slimme volgorde in oefenmodus
  darkFigs: true,    // figuren donker weergeven
  sel: null,         // geselecteerde hoofdstukken
  onlyPond: false,
  onlyDue: false,    // alleen vragen die nu herhaald moeten worden
  examSpread: true,  // examen gespreid over de gekozen onderdelen
  mode: 'practice',
};

const listeners = new Set();
let state = loadState();
let prefs = loadPrefs();

function safeGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

function loadState() {
  const s = safeGet(KEY);
  if (s && s.v === 1 && s.q) return { v: 1, q: s.q, exams: s.exams || [], rd: s.rd || {}, c: s.c || {}, days: s.days || {}, resetAt: s.resetAt || 0 };
  return { v: 1, q: {}, exams: [], rd: {}, c: {}, days: {}, resetAt: 0 };
}
function loadPrefs() { return { ...DEFAULT_PREFS, ...(safeGet(PKEY) || {}) }; }

function persist(silent) {
  safeSet(KEY, state);
  if (!silent) listeners.forEach(fn => fn());
}

export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getPrefs = () => prefs;
export function setPrefs(patch) { prefs = { ...prefs, ...patch }; safeSet(PKEY, prefs); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---- antwoorden vastleggen -------------------------------------------------
// ---- slim herhalen (Leitner) -----------------------------------------------
// Goed antwoord op een vraag die aan de beurt is: een box hoger, volgende herhaling na 1, 3, 7, 14, 30 dagen.
// Fout: terug naar box 0 en over 10 minuten weer aan de beurt. Een vraag die nog niet aan de beurt was
// (bijv. bij 'alles oefenen') schuift niet op, zodat je een vraag niet kunt 'opkrikken' door hem vaak te zien.
const DAY = 86400000;
export const INTERVAL_DAYS = [1, 3, 7, 14, 30];
export const boxOf = r => (r.b != null ? r.b : (r.l ? 1 : 0));
export const dueAt = r => (r.d != null ? r.d : (r.l ? (r.t || 0) + DAY : (r.t || 0)));
export const isDue = (r, now = Date.now()) => !!r && dueAt(r) <= now;
export const dueIds = (now = Date.now()) => Object.entries(state.q).filter(([, r]) => isDue(r, now)).map(([id]) => id);

export function recordAnswer(id, correct, mode) {
  const r = state.q[id] || { a: 0, ok: 0, t: 0, l: 0, p: 0 };
  const now = Date.now();
  const fresh = r.a === 0;
  const wasDue = fresh || isDue(r, now);
  const oldBox = fresh ? 0 : boxOf(r);
  if (!correct) { r.b = 0; r.d = now + 600000; }
  else if (wasDue) { r.b = Math.min(oldBox + 1, 5); r.d = now + INTERVAL_DAYS[Math.min(r.b, 5) - 1] * DAY; }
  else { r.b = oldBox; r.d = dueAt(r); }
  r.a += 1;
  if (correct) r.ok += 1;
  r.l = correct ? 1 : 0;
  r.t = Math.max(Date.now(), (r.t || 0) + 1);
  if (!correct) r.p = 1;                       // fout -> in de foutenvijver
  else if (mode === 'practice') r.p = 0;       // goed in oefenmodus -> eruit
  state.q[id] = r;
  bumpDay();
  persist();
  return r;
}
export const record = id => state.q[id] || null;
export const hasLocalData = () => Object.keys(state.q).length > 0 || state.exams.length > 0 || Object.keys(state.rd).length > 0 || Object.keys(state.c).length > 0;
/** Wist alleen de lokale kopie (bijv. bij uitloggen). Geen reset-tijdstempel, dus niets wordt elders gewist. */
export function clearLocal() {
  state = { v: 1, q: {}, exams: [], rd: {}, c: {}, days: {}, resetAt: 0 };
  persist(true);
}
export const allRecords = () => state.q;
export const isPond = id => !!(state.q[id] && state.q[id].p);
export const pondIds = () => Object.entries(state.q).filter(([, r]) => r.p).map(([id]) => id);

export function addExam(e) {
  state.exams.push({ id: uid(), t: Date.now(), ...e });
  persist();
}
// ---- gelezen theorie-paragrafen: rd['hs3:s5'] = { t: tijdstip, r: 1|0 } --------
export const isRead = key => !!(state.rd[key] && state.rd[key].r);
export function setRead(key, read) {
  state.rd[key] = { t: Math.max(Date.now(), ((state.rd[key] || {}).t || 0) + 1), r: read ? 1 : 0 };
  persist();
}

// ---- reeks en oefenkalender ------------------------------------------------------
// days['2026-10-22'] = aantal beantwoorde vragen + beoordeelde kaarten op die dag (lokale tijd).
export const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function bumpDay() { const k = dayKey(); state.days[k] = (state.days[k] || 0) + 1; }
export const todayCount = () => state.days[dayKey()] || 0;
export const dayCounts = () => state.days;
/** Reeks (zoals Anki) = aantal opeenvolgende dagen met minstens één beantwoorde vraag of kaart. Is vandaag nog niets gedaan, dan breekt de reeks pas morgen. */
export function streak(goal = 1) {
  const g = Math.max(1, goal | 0);
  const d = new Date(); d.setHours(12, 0, 0, 0);
  let n = 0, first = true;
  for (let i = 0; i < 4000; i++, d.setDate(d.getDate() - 1)) {
    const ok = (state.days[dayKey(d.getTime())] || 0) >= g;
    if (ok) n++; else if (!first) break;
    first = false;
  }
  return n;
}
export function bestStreak(goal = 1) {
  const g = Math.max(1, goal | 0);
  const keys = Object.keys(state.days).filter(k => state.days[k] >= g).sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const t = new Date(k + 'T12:00:00').getTime();
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1;
    prev = t; best = Math.max(best, run);
  }
  return best;
}

// ---- flashcards (eigen Leitner-schema, los van de vragen) ---------------------
// c['hs3:c5'] = { a, ok, t, b, d }. 'weet ik' = goed, 'nog niet' = fout (zelfde intervallen als vragen).
export const cardRec = key => state.c[key] || null;
export const cardDue = (key, now = Date.now()) => { const r = state.c[key]; return !r || r.d <= now; };
export function recordCard(key, knew) {
  const now = Date.now();
  const r = state.c[key] || { a: 0, ok: 0, t: 0, b: 0, d: 0 };
  const wasDue = r.a === 0 || r.d <= now;
  if (!knew) { r.b = 0; r.d = now + 600000; }
  else if (wasDue) { r.b = Math.min(r.b + 1, 5); r.d = now + INTERVAL_DAYS[r.b - 1] * DAY; }
  r.a += 1; if (knew) r.ok += 1;
  r.t = Math.max(now, (r.t || 0) + 1);
  state.c[key] = r;
  bumpDay();
  persist();
  return r;
}
export const getExams = () => state.exams.slice().sort((a, b) => b.t - a.t);

export function resetAll() {
  state = { v: 1, q: {}, exams: [], rd: {}, c: {}, days: {}, resetAt: Date.now() };
  persist();
}

// ---- statistieken ----------------------------------------------------------
export function statsFor(questions) {
  let a = 0, ok = 0, seen = 0, mastered = 0, pond = 0;
  for (const q of questions) {
    const r = state.q[q.id];
    if (!r) continue;
    a += r.a; ok += r.ok; seen++;
    if (r.l) mastered++;
    if (r.p) pond++;
  }
  return { total: questions.length, a, ok, seen, mastered, pond };
}
export function totals() {
  let a = 0, ok = 0, pond = 0;
  for (const r of Object.values(state.q)) { a += r.a; ok += r.ok; if (r.p) pond++; }
  const due = dueIds().length;
  return { a, ok, pond, due, exams: state.exams.length, passed: state.exams.filter(e => e.pass).length };
}

// ---- sessie (lopend examen / oefenrondje) ----------------------------------
export const loadSession = () => safeGet(SKEY);
export const saveSession = s => safeSet(SKEY, s);
export const clearSession = () => { try { localStorage.removeItem(SKEY); } catch { /* negeren */ } };

// ---- export / samenvoegen --------------------------------------------------
export function exportData() {
  return { v: 1, app: 'f-licentie-oefenen', exportedAt: Date.now(), resetAt: state.resetAt, q: state.q, exams: state.exams, rd: state.rd, c: state.c, days: state.days };
}

export function mergeData(a, b) {
  const resetAt = Math.max(a.resetAt || 0, b.resetAt || 0);
  const q = {};
  for (const src of [a.q || {}, b.q || {}]) {
    for (const [id, r] of Object.entries(src)) {
      if (!r || (r.t || 0) <= resetAt) continue;
      if (!q[id] || r.t > q[id].t) q[id] = { a: r.a | 0, ok: r.ok | 0, t: r.t, l: r.l ? 1 : 0, p: r.p ? 1 : 0, ...(r.b != null ? { b: r.b | 0, d: r.d || 0 } : {}) };
    }
  }
  const ex = new Map();
  for (const e of [...(a.exams || []), ...(b.exams || [])]) if (e && e.id && e.t > resetAt) ex.set(e.id, e);
  const rd = {};
  for (const src of [a.rd || {}, b.rd || {}]) {
    for (const [k, v] of Object.entries(src)) {
      if (!v || (v.t || 0) <= resetAt) continue;
      if (!rd[k] || v.t > rd[k].t) rd[k] = { t: v.t, r: v.r ? 1 : 0 };
    }
  }
  const c = {};
  for (const src of [a.c || {}, b.c || {}]) {
    for (const [k, r] of Object.entries(src)) {
      if (!r || (r.t || 0) <= resetAt) continue;
      if (!c[k] || r.t > c[k].t) c[k] = { a: r.a | 0, ok: r.ok | 0, t: r.t, b: r.b | 0, d: r.d || 0 };
    }
  }
  const days = {};
  const cut = dayKey(resetAt);
  for (const src of [a.days || {}, b.days || {}]) {
    for (const [k, n] of Object.entries(src)) {
      if (resetAt && k < cut) continue;
      days[k] = Math.max(days[k] || 0, n | 0);
    }
  }
  return { v: 1, resetAt, q, rd, c, days, exams: [...ex.values()].sort((x, y) => x.t - y.t) };
}

/** Voegt externe data samen met de lokale data. Geeft een samenvatting terug. */
export function mergeRemote(remote) {
  if (!remote || remote.v !== 1) throw new Error('Onbekend bestandsformaat.');
  const before = JSON.stringify(state);
  state = mergeData(state, remote);
  const changed = JSON.stringify(state) !== before;
  if (changed) persist();
  return { changed, questions: Object.keys(state.q).length, exams: state.exams.length };
}

export function summarize(data) {
  return { questions: Object.keys(data.q || {}).length, exams: (data.exams || []).length };
}

// ---- compacte, deelbare codering (voor de overdraag-link) ------------------
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

function pack(d) {
  return {
    v: 1, r: d.resetAt || 0,
    q: Object.fromEntries(Object.entries(d.q).map(([id, r]) => [id, [r.a, r.ok, r.t, r.l, r.p, r.b ?? null, r.d ?? null]])),
    e: (d.exams || []).map(e => [e.id, e.t, e.score, e.total, e.pass ? 1 : 0, e.secs || 0]),
    g: Object.entries(d.rd || {}).map(([k, v]) => [k, v.t, v.r]),
    k: Object.entries(d.c || {}).map(([k, r]) => [k, r.a, r.ok, r.t, r.b, r.d]),
    n: d.days || {},
  };
}
function unpack(p) {
  return {
    v: 1, resetAt: p.r || 0,
    q: Object.fromEntries(Object.entries(p.q || {}).map(([id, a]) => [id, { a: a[0], ok: a[1], t: a[2], l: a[3], p: a[4], ...(a[5] != null ? { b: a[5], d: a[6] || 0 } : {}) }])),
    rd: Object.fromEntries((p.g || []).map(a => [a[0], { t: a[1], r: a[2] }])),
    c: Object.fromEntries((p.k || []).map(a => [a[0], { a: a[1], ok: a[2], t: a[3], b: a[4], d: a[5] }])),
    days: p.n || {},
    exams: (p.e || []).map(a => ({ id: a[0], t: a[1], score: a[2], total: a[3], pass: !!a[4], secs: a[5] })),
  };
}

export async function encodeShare(d = exportData()) {
  const json = new TextEncoder().encode(JSON.stringify(pack(d)));
  if (typeof CompressionStream !== 'undefined') {
    const cs = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    return 'g.' + b64u(new Uint8Array(await new Response(cs).arrayBuffer()));
  }
  return 'r.' + b64u(json);
}
export async function decodeShare(str) {
  const kind = str.slice(0, 2), body = unb64u(str.slice(2));
  let bytes = body;
  if (kind === 'g.') {
    const ds = new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'));
    bytes = new Uint8Array(await new Response(ds).arrayBuffer());
  } else if (kind !== 'r.') throw new Error('Ongeldige code.');
  return unpack(JSON.parse(new TextDecoder().decode(bytes)));
}
