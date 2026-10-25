// Theorie per hoofdstuk: paragrafen (tekst als HTML, figuren als afbeelding), koppeling vraag -> paragraaf, formuleblad,
// en voortgang per paragraaf.
import { record } from './store.js';
import * as store from './store.js';

const CACHE = new Map();   // hoofdstuk -> { ...theorie, bySec }  of null
const LOADING = new Map();

export async function loadTheory(n) {
  if (CACHE.has(n)) return CACHE.get(n);
  if (LOADING.has(n)) return LOADING.get(n);
  const p = (async () => {
    try {
      const res = await fetch(`data/theorie/hoofdstuk-${n}.json`, { cache: 'no-cache' });
      if (!res.ok) { CACHE.set(n, null); return null; }
      const t = await res.json();
      t.bySec = new Map(t.sections.map((s, i) => [s.id, { ...s, i }]));
      // paragraaf -> vragen
      t.qBySec = new Map();
      for (const [qid, secs] of Object.entries(t.qmap || {})) for (const s of secs) {
        if (!t.qBySec.has(s)) t.qBySec.set(s, []);
        t.qBySec.get(s).push(qid);
      }
      t.groups = new Set(t.sections.filter((s, i) => s.lvl === 1 && t.sections[i + 1] && t.sections[i + 1].lvl === 2).map(s => s.id));
      CACHE.set(n, t);
      return t;
    } catch { CACHE.set(n, null); return null; }
  })();
  LOADING.set(n, p);
  return p;
}
export const getTheory = n => CACHE.get(n) || null;

// De tekst zelf (HTML per paragraaf en per opgave) staat los, zodat het menu snel laadt.
const TEXT = new Map();    // hoofdstuk -> { id: html } | null | Promise
export function getText(n, onLoad) {
  const t = TEXT.get(n);
  if (t && !(t instanceof Promise)) return t;
  if (!t) TEXT.set(n, fetch(`data/theorie/tekst-${n}.json`, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    .then(x => { TEXT.set(n, x); onLoad && onLoad(); }));
  return null;
}

export const readKey = (chapter, secId) => `hs${chapter}:${secId}`;

/** Paragrafen die bij een vraag horen (alleen als de theorie geladen is). */
export function sectionsOfQuestion(qid) {
  const m = qid.match(/^hs(\d+)-/); if (!m) return [];
  const t = getTheory(+m[1]); if (!t) return [];
  return (t.qmap[qid] || []).map(id => t.bySec.get(id)).filter(Boolean);
}

/** Statistiek van één paragraaf op basis van de gekoppelde vragen. */
export function sectionStats(t, secId) {
  const ids = t.qBySec.get(secId) || [];
  let seen = 0, mastered = 0, a = 0, ok = 0;
  for (const id of ids) {
    const r = record(id);
    if (!r) continue;
    seen++; a += r.a; ok += r.ok;
    if (r.l) mastered++;
  }
  const total = ids.length, read = store.isRead(readKey(t.chapter, secId));
  const ratio = total ? mastered / total : 0;
  let status;
  if (total === 0) status = read ? 'done' : 'new';
  else if (ratio >= 0.8) status = 'done';
  else if (seen > 0) status = 'busy';
  else status = read ? 'read' : 'new';
  return { total, seen, mastered, a, ok, read, status, ratio };
}
