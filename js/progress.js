// Realistische voortgangsschatting: hoeveel vragen van een examen zou je nu goed hebben?
//
// Per vraag schatten we de kans dat je hem nu goed beantwoordt:
//   - nooit gezien: gokkans (1 uit 4 antwoorden = 25%);
//   - gezien: hangt af van de Leitner-box (hoe vaak goed, verspreid over dagen). Eén keer goed geeft maar 55%,
//     want dat kan toeval of kortetermijngeheugen zijn; pas in de hoogste boxen komt de kans richting 94%;
//   - te laat voor herhaling: de kans zakt langzaam terug richting de gokkans (maximaal de helft van de winst).
// Het gemiddelde over de hele vragenbank × aantal examenvragen is de verwachte score. Omdat een examen 50 willekeurige
// vragen is, geeft een binomiale verdeling de bandbreedte en de kans om de slaagdrempel te halen.
// Dit is een indicatie: de aannames hieronder zijn geschat, niet gemeten.
import { INTERVAL_DAYS, boxOf, dueAt } from './store.js';

const DAY = 86400000;
export const GUESS = 0.25;
export const P_BOX = [0.35, 0.55, 0.70, 0.80, 0.88, 0.94];

export function pKnow(r, now = Date.now()) {
  if (!r || !(r.a > 0)) return GUESS;
  const b = Math.min(5, boxOf(r));
  let p = P_BOX[b];
  const over = (now - dueAt(r)) / DAY;
  if (b > 0 && over > 0) p = GUESS + (p - GUESS) * Math.max(0.5, 1 - 0.5 * over / INTERVAL_DAYS[b - 1]);
  return p;
}

/** Kans op minstens `need` goede antwoorden uit n vragen, elk met kans p. */
export function tailProb(n, p, need) {
  if (need <= 0) return 1;
  if (need > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let pmf = Math.pow(1 - p, n), cum = 0;   // k = 0
  for (let k = 0; k <= n; k++) {
    if (k >= need) cum += pmf;
    pmf *= (n - k) / (k + 1) * p / (1 - p);
  }
  return Math.min(1, Math.max(0, cum));
}

/**
 * @param chapters [{n, count}] hoofdstukken met vragen
 * @param records  store.allRecords()
 * @param chapterOf  id -> hoofdstuknummer
 * @returns {{byCh, p, expected, lo, hi, passP, seen, total, n, need}}
 */
export function estimate(chapters, records, chapterOf, { n = 50, need = 35, now = Date.now() } = {}) {
  const byCh = {};
  for (const c of chapters) byCh[c.n] = { n: c.n, total: c.count, seen: 0, stable: 0, sum: 0 };
  for (const [id, r] of Object.entries(records)) {
    if (!r || !(r.a > 0)) continue;
    const o = byCh[chapterOf(id)];
    if (!o) continue;
    o.seen++;
    if (boxOf(r) >= 3) o.stable++;
    o.sum += pKnow(r, now);
  }
  let sum = 0, total = 0, seen = 0;
  for (const o of Object.values(byCh)) {
    const unseen = Math.max(0, o.total - o.seen);
    o.p = o.total ? (o.sum + unseen * GUESS) / o.total : GUESS;
    sum += o.sum + unseen * GUESS; total += o.total; seen += o.seen;
  }
  const p = total ? sum / total : GUESS;
  const mean = n * p, sd = Math.sqrt(n * p * (1 - p));
  return {
    byCh, p, n, need, seen, total,
    expected: mean,
    lo: Math.max(0, Math.round(mean - 1.28 * sd)),
    hi: Math.min(n, Math.round(mean + 1.28 * sd)),
    passP: tailProb(n, p, need),
  };
}
