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
  chrono: false,     // oefenen in vaste volgorde van de vragenbank (zoals in de pdf)
  darkFigs: true,    // figuren donker weergeven
  sel: null,         // geselecteerde hoofdstukken
  onlyPond: false,
  onlyDue: false,    // alleen vragen die nu herhaald moeten worden
  examSpread: true,  // examen gespreid over de gekozen onderdelen
  mode: 'practice',
  theme: 'std',      // kleurenthema: 'std' (standaard) of 'kmar'
};

const listeners = new Set();
let state = loadState();
let prefs = loadPrefs();

function safeGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

function loadState() {
  const s = safeGet(KEY);
  if (s && s.v === 1 && s.q) return { v: 1, q: s.q, exams: s.exams || [], rd: s.rd || {}, c: s.c || {}, days: s.days || {}, hist: s.hist || [], tr: s.tr || {}, resetAt: s.resetAt || 0 };
  return { v: 1, q: {}, exams: [], rd: {}, c: {}, days: {}, hist: [], tr: {}, resetAt: 0 };
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
export const dueIds = (now = Date.now()) => Object.entries(state.q).filter(([, r]) => r.a > 0 && isDue(r, now)).map(([id]) => id);

export function recordAnswer(id, correct, mode, sid) {
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
  if (sid) logEvent(sid, mode, id, correct);
  bumpDay();
  persist();
  return r;
}
// Een record met a = 0 is een 'grafsteen': de vraag is teruggedraaid (zie undoExam) en telt als nooit gezien.
export const record = id => (state.q[id] && state.q[id].a > 0 ? state.q[id] : null);
export const hasLocalData = () => Object.keys(state.q).length > 0 || state.exams.length > 0 || Object.keys(state.rd).length > 0 || Object.keys(state.c).length > 0;
/** Wist alleen de lokale kopie (bijv. bij uitloggen). Geen reset-tijdstempel, dus niets wordt elders gewist. */
export function clearLocal() {
  state = { v: 1, q: {}, exams: [], rd: {}, c: {}, days: {}, hist: [], resetAt: 0 };
  persist(true);
}
export const allRecords = () => state.q;
export const isPond = id => !!(state.q[id] && state.q[id].p);
export const pondIds = () => Object.entries(state.q).filter(([, r]) => r.p).map(([id]) => id);

export function addExam(e) {
  const x = { id: uid(), t: Date.now(), ...e };
  state.exams.push(x);
  persist();
  return x.id;
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
// ---- trend van de verwachte examenscore: één meting per dag (de laatste van die dag) ----
export const trend = () => state.tr;
export function recordTrend(value) {
  const k = dayKey(), v = Math.round(value);
  if (state.tr[k] && state.tr[k][0] === v) return;
  state.tr[k] = [v, Date.now()];
  const keys = Object.keys(state.tr).sort();
  while (keys.length > 400) delete state.tr[keys.shift()];
  persist(true);
}
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
// c['hs3:c5'] = { a, ok, t, b, d, l }. 'weet ik' = goed, 'nog niet' = fout (zelfde intervallen als vragen).
// Theorievragen gebruiken hetzelfde schema met sleutel 'hs3:o3-1'; l = laatste poging goed (1/0).
export const cardRec = key => state.c[key] || null;
export const cardDue = (key, now = Date.now()) => { const r = state.c[key]; return !r || r.d <= now; };
export function recordCard(key, knew) {
  const now = Date.now();
  const r = state.c[key] || { a: 0, ok: 0, t: 0, b: 0, d: 0 };
  const wasDue = r.a === 0 || r.d <= now;
  if (!knew) { r.b = 0; r.d = now + 600000; }
  else if (wasDue) { r.b = Math.min(r.b + 1, 5); r.d = now + INTERVAL_DAYS[r.b - 1] * DAY; }
  r.a += 1; if (knew) r.ok += 1;
  r.l = knew ? 1 : 0;
  r.t = Math.max(now, (r.t || 0) + 1);
  state.c[key] = r;
  bumpDay();
  persist();
  return r;
}
// ---- geschiedenis: elke oefenronde en elk examen, zodat je er één kunt verwijderen -------------------
// hist = [{ id, t, mode: 'practice'|'exam', a: [[vraag-id, 1|0], ...], ex?: examen-id, del?: 1 }]. Alleen de laatste ± 1500 antwoorden worden bewaard.
const HIST_MAX_EVENTS = 1500;
function logEvent(sid, mode, id, correct) {
  let h = state.hist.find(x => x.id === sid);
  if (!h) { h = { id: sid, t: Date.now(), mode: mode === 'exam' ? 'exam' : 'practice', a: [] }; state.hist.push(h); }
  if (h.del) return;
  h.a.push([id, correct ? 1 : 0]);
  let total = state.hist.reduce((n, x) => n + x.a.length, 0);
  while (total > HIST_MAX_EVENTS && state.hist.length > 1 && state.hist[0].id !== sid) total -= state.hist.shift().a.length;
}
export function linkExam(sid, examId) { const h = state.hist.find(x => x.id === sid); if (h) { h.ex = examId; persist(); } }
/** Alles wat je gedaan hebt, nieuwste eerst. Oude examens uit de tijd vóór de geschiedenis staan er ook in (legacy: true). */
export function getHistory() {
  const out = [];
  const linked = new Set(state.hist.filter(h => h.ex).map(h => h.ex));
  for (const h of state.hist) {
    if (h.del || !h.a.length) continue;
    const ok = h.a.reduce((n, [, c]) => n + c, 0);
    const exam = h.ex ? state.exams.find(e => e.id === h.ex && !e.del) : null;
    out.push({ kind: 'session', id: h.id, t: h.t, mode: h.mode, n: h.a.length, ok, exam });
  }
  for (const e of state.exams) if (!e.del && !linked.has(e.id)) out.push({ kind: 'exam', id: e.id, t: e.t, mode: 'exam', n: e.total, ok: e.score, exam: e, legacy: true });
  return out.sort((a, b) => b.t - a.t);
}
/** Verwijdert een oefenronde of examen uit de geschiedenis en uit je statistieken. Aantallen (beantwoord en goed) worden exact teruggedraaid;
 *  de 'laatst goed/fout'-stand komt uit je andere antwoorden op die vraag. Geeft het aantal aangepaste vragen terug. */
export function deleteSession(sid) {
  const h = state.hist.find(x => x.id === sid && !x.del);
  if (!h) return 0;
  const per = new Map();
  for (const [id, c] of h.a) { const o = per.get(id) || { n: 0, c: 0 }; o.n++; o.c += c; per.set(id, o); }
  const last = new Map();   // laatste overgebleven antwoord per vraag, in volgorde van de geschiedenis
  for (const x of state.hist) if (x !== h && !x.del) for (const [id, c] of x.a) last.set(id, c);
  const now = Date.now(); let k = 0;
  for (const [id, o] of per) {
    const r = state.q[id]; if (!r || !(r.a > 0)) continue;
    k++; const t = now + k;
    r.a -= o.n; r.ok = Math.max(0, r.ok - o.c);
    if (r.a <= 0) { state.q[id] = { a: 0, ok: 0, t, l: 0, p: 0 }; continue; }
    const l = (last.has(id) ? last.get(id) : (r.ok / r.a >= 0.5 ? 1 : 0)) ? 1 : 0;
    state.q[id] = { a: r.a, ok: r.ok, t, l, p: l ? 0 : 1, b: l ? Math.max(1, Math.min(5, r.b || 1)) : 0, d: now + (l ? DAY : 600000) };
  }
  if (h.ex) { const e = state.exams.find(x => x.id === h.ex); if (e) { e.del = 1; e.dt = now; } }
  h.del = 1; h.a = [];
  persist();
  return k;
}

export const getExams = () => state.exams.filter(e => !e.del).sort((a, b) => b.t - a.t);

/** Draait een examen terug (bijv. per ongeluk geopend of ingeleverd): het examen verdwijnt uit de lijst en de vragen
 *  die erbij hoorden tellen niet meer mee. De gegevens van de vragen zelf worden bewerkt, niet gewist, zodat dit ook
 *  naar je andere apparaten doorgaat (samenvoegen kiest steeds de nieuwste versie). Geeft het aantal vragen terug. */
export function undoExam(id) {
  const e = state.exams.find(x => x.id === id && !x.del);
  if (!e) return 0;
  const now = Date.now(); let n = 0;
  for (const [qid, r] of Object.entries(state.q)) {
    // bij het inleveren worden alle vragen vlak voor het opslaan van het examen vastgelegd
    if (!r || !(r.a > 0) || (r.t || 0) < e.t - 5000 || (r.t || 0) > e.t + 100) continue;
    n++;
    const t = now + n;
    r.a -= 1;
    if (r.l) r.ok = Math.max(0, r.ok - 1);   // laatste antwoord goed = dat was het examenantwoord
    if (r.a <= 0) { state.q[qid] = { a: 0, ok: 0, t, l: 0, p: 0 }; continue; }
    // eerder geoefend: de oude toestand is niet bewaard, dus schat hem in op basis van wat er over is
    const l = r.ok / r.a >= 0.5 ? 1 : 0;
    state.q[qid] = { a: r.a, ok: r.ok, t, l, p: l ? 0 : 1, b: l ? 1 : 0, d: now + (l ? DAY : 600000) };
  }
  e.del = 1; e.dt = now;
  persist();
  return n;
}

export function resetAll() {
  state = { v: 1, q: {}, exams: [], rd: {}, c: {}, days: {}, hist: [], tr: {}, resetAt: Date.now() };
  persist();
}

// ---- statistieken ----------------------------------------------------------
export function statsFor(questions) {
  let a = 0, ok = 0, seen = 0, mastered = 0, pond = 0;
  for (const q of questions) {
    const r = state.q[q.id];
    if (!r || !(r.a > 0)) continue;
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
  const ex = state.exams.filter(e => !e.del);
  return { a, ok, pond, due, exams: ex.length, passed: ex.filter(e => e.pass).length };
}

// ---- sessie (lopend examen / oefenrondje) ----------------------------------
export const loadSession = () => safeGet(SKEY);
export const saveSession = s => safeSet(SKEY, s);
export const clearSession = () => { try { localStorage.removeItem(SKEY); } catch { /* negeren */ } };

// ---- export / samenvoegen --------------------------------------------------
export function exportData() {
  return { v: 1, app: 'f-licentie-oefenen', exportedAt: Date.now(), resetAt: state.resetAt, q: state.q, exams: state.exams, rd: state.rd, c: state.c, days: state.days, hist: state.hist, tr: state.tr };
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
  for (const e of [...(a.exams || []), ...(b.exams || [])]) if (e && e.id && e.t > resetAt && !(ex.get(e.id) || {}).del) ex.set(e.id, e);   // een teruggedraaid examen blijft teruggedraaid
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
      if (!c[k] || r.t > c[k].t) c[k] = { a: r.a | 0, ok: r.ok | 0, t: r.t, b: r.b | 0, d: r.d || 0, ...(r.l != null ? { l: r.l ? 1 : 0 } : {}) };
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
  const hm = new Map();
  for (const h of [...(a.hist || []), ...(b.hist || [])]) {
    if (!h || !h.id || h.t <= resetAt) continue;
    const o = hm.get(h.id);
    if (!o || (h.del && !o.del) || (!o.del && !h.del && h.a.length > o.a.length)) hm.set(h.id, { ...h });   // verwijderd blijft verwijderd
  }
  let hist = [...hm.values()].sort((x, y) => x.t - y.t), tot = hist.reduce((n, x) => n + x.a.length, 0);
  while (tot > HIST_MAX_EVENTS && hist.length > 1) tot -= hist.shift().a.length;
  const tr = {};   // trend: per dag de verwachte examenscore (in tienden van procenten) met tijdstip; de nieuwste meting wint
  for (const src of [a.tr || {}, b.tr || {}]) {
    for (const [k, v] of Object.entries(src)) {
      if (!Array.isArray(v) || (resetAt && k < cut)) continue;
      if (!tr[k] || (v[1] || 0) > tr[k][1]) tr[k] = [v[0] | 0, v[1] || 0];
    }
  }
  return { v: 1, resetAt, q, rd, c, days, hist, tr, exams: [...ex.values()].sort((x, y) => x.t - y.t) };
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
  return { questions: Object.values(data.q || {}).filter(r => r && r.a > 0).length, exams: (data.exams || []).filter(e => !e.del).length };
}

// ---- compacte, deelbare codering (voor de overdraag-link) ------------------
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

function pack(d) {
  return {
    v: 1, r: d.resetAt || 0,
    q: Object.fromEntries(Object.entries(d.q).map(([id, r]) => [id, [r.a, r.ok, r.t, r.l, r.p, r.b ?? null, r.d ?? null]])),
    e: (d.exams || []).map(e => [e.id, e.t, e.score, e.total, e.pass ? 1 : 0, e.secs || 0, e.del ? 1 : 0]),
    g: Object.entries(d.rd || {}).map(([k, v]) => [k, v.t, v.r]),
    k: Object.entries(d.c || {}).map(([k, r]) => [k, r.a, r.ok, r.t, r.b, r.d, r.l ?? null]),
    n: d.days || {},
    s: Object.entries(d.tr || {}).map(([k, v]) => [k, v[0], v[1]]),
  };
}
function unpack(p) {
  return {
    v: 1, resetAt: p.r || 0,
    q: Object.fromEntries(Object.entries(p.q || {}).map(([id, a]) => [id, { a: a[0], ok: a[1], t: a[2], l: a[3], p: a[4], ...(a[5] != null ? { b: a[5], d: a[6] || 0 } : {}) }])),
    rd: Object.fromEntries((p.g || []).map(a => [a[0], { t: a[1], r: a[2] }])),
    c: Object.fromEntries((p.k || []).map(a => [a[0], { a: a[1], ok: a[2], t: a[3], b: a[4], d: a[5], ...(a[6] != null ? { l: a[6] } : {}) }])),
    days: p.n || {},
    tr: Object.fromEntries((p.s || []).map(a => [a[0], [a[1], a[2]]])),
    exams: (p.e || []).map(a => ({ id: a[0], t: a[1], score: a[2], total: a[3], pass: !!a[4], secs: a[5], ...(a[6] ? { del: 1 } : {}) })),
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
