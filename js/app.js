import * as store from './store.js';
import * as quiz from './quiz.js';
import * as sync from './sync.js';
import * as account from './account.js';
import * as theory from './theory.js';
import * as tools from './tools.js';
import * as drill from './drill.js';
import { CONTACT_EMAIL } from './config.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const $dlg = document.getElementById('dlg');
const $toast = document.getElementById('toast');

// ---------------------------------------------------------------- helpers
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = k => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const pctClass = p => (p >= 70 ? 'good' : p >= 50 ? 'mid' : 'bad');
const fmtDate = t => new Date(t).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

let toastT;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => $toast.classList.remove('show'), 2800);
}

function confirmDlg({ title, body, ok = 'OK', cancel = 'Annuleren', danger = false }) {
  return new Promise(resolve => {
    let result = false;
    $dlg.replaceChildren(
      h('h2', {}, title),
      h('div', {}, body),
      h('div', { class: 'actions' },
        cancel && h('button', { onclick: () => $dlg.close() }, cancel),
        h('button', { class: danger ? 'danger solid' : 'primary', onclick: () => { result = true; $dlg.close(); } }, ok)),
    );
    $dlg.addEventListener('close', () => resolve(result), { once: true });
    $dlg.showModal();
  });
}

const THEMES = [
  { id: 'std', name: 'Standaard', sub: 'Donker, met blauwe knoppen.', color: '#0f1419' },
  { id: 'kmar', name: 'KMar', sub: 'Kleurencombinatie KMar', color: '#0e3b6e' },
];
function applyPrefs() {
  const p = store.getPrefs();
  document.body.classList.toggle('dark-figs', p.darkFigs);
  const t = THEMES.find(x => x.id === p.theme) || THEMES[0];
  for (const x of THEMES) document.documentElement.classList.toggle('theme-' + x.id, x.id === t.id && x.id !== 'std');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.color;
}

// ---------------------------------------------------------------- state
let chapters = [];          // [{n,title,count}]
let view = 'setup';         // setup | session | result | stats | sync | learn (start op 'learn' als er theorie is, zie init)
let S = null;               // actieve sessie
let RESULT = null;          // laatste uitslag
let timerInt = null;
let T = null;               // geopende theorie: { chapter, secId, back, seq? }  (seq = gekozen paragrafen 'n:sid' op volgorde)
let OP = null;              // theorievragen: { list: [{ ch, o }], idx, shown }
let FG = null;              // formule-spel
let K = null;               // flashcardronde: { chapter, queue, idx, flip, knew, missed }
let LB = null;              // boek in Leren: null (eerst kiezen) | 'vrza' | 'veron'
let veronChapters = [];     // [{n:'v1', num, title, theory}]

const chapterTitle = n => ([...chapters, ...veronChapters].find(c => c.n === n) || {}).title || '';
const chLabel = n => `H${theory.isVeron(n) ? n.slice(1) : n}`;
const hasTheory = () => chapters.some(c => c.theory) || veronChapters.length > 0;
const saveSession = () => S && store.saveSession(S);

function setView(v) {
  view = v;
  clearInterval(timerInt);
  render();
  window.scrollTo(0, 0);
}

function renderNav() {
  const items = [...(hasTheory() ? [['learn', 'Leren']] : []), ['setup', 'Oefenen'], ['stats', 'Voortgang'], ...(account.backend() === 'geen' ? [] : [['account', account.enabled() && account.loggedIn() ? 'Account ✓' : 'Account']]), ['sync', 'Meer']];   // 'geen' = zonder accounts
  const active = (view === 'session' || view === 'result') ? 'setup' : (view === 'privacy' || view === 'recovery') ? 'account' : (view === 'theory' || view === 'cards' || view === 'fgame' || view === 'opg') ? 'learn' : view;
  $nav.replaceChildren(...items.map(([k, label]) =>
    h('button', { 'aria-current': active === k ? 'page' : null, onclick: () => { if (k === 'learn') LB = null; setView(k === 'setup' && S ? 'session' : k); } }, label)));
}

function render() {
  applyPrefs();
  tools.setToolsVisible(view === 'session' || view === 'fgame');
  tools.setInkKey([view, S && S.idx, FG && FG.n, FG && FG.stage, K && K.idx, T && T.chapter, T && T.secId, OP && OP.idx].join('|'));
  renderNav();
  const fn = { setup: viewSetup, session: viewSession, result: viewResult, stats: viewStats, learn: viewLearn, theory: viewTheory, opg: viewOpgave, cards: viewCards, fgame: viewFGame, sync: viewSync, account: viewAccount, privacy: viewPrivacy, recovery: viewRecovery }[view];
  $app.replaceChildren(fn());
  $app.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- kleine bouwstenen
function figures(q) {
  if (!q.qImages || !q.qImages.length) return null;
  return h('div', { class: 'fig-wrap' }, q.qImages.map(src => h('img', { class: 'fig', src, alt: 'Figuur bij de vraag', loading: 'lazy' })));
}

function original(q) {
  if (!q.qFull) return null;
  const label = 'Toon origineel (bij twijfel over machten of formules)';
  const img = h('img', { class: 'fig', src: q.qFull, alt: 'Originele vraag uit de PDF', loading: 'lazy', hidden: true });
  const btn = h('button', { class: 'linklike small', onclick: () => {
    img.hidden = !img.hidden;
    btn.textContent = img.hidden ? label : 'Verberg origineel';
  } }, label);
  return h('div', { class: 'orig', style: 'margin-top:.7rem' }, btn, h('div', { class: 'fig-wrap' }, img));
}

function explanation(q, open) {
  const imgs = h('div', { class: 'expl-imgs', hidden: true },
    (q.sImages || []).map(src => h('img', { src, alt: 'Originele uitwerking', loading: 'lazy' })));
  const btn = h('button', { class: 'ghost small', onclick: () => {
    imgs.hidden = !imgs.hidden;
    btn.textContent = imgs.hidden ? 'Toon originele uitwerking (met figuren en formules)' : 'Verberg originele uitwerking';
  } }, 'Toon originele uitwerking (met figuren en formules)');
  const paras = (q.explanation || 'Geen toelichting beschikbaar.').split('\n\n').map(t => h('p', {}, t));
  return h('details', { class: 'expl', open }, h('summary', {}, 'Toelichting'),
    h('div', { class: 'expl-body' }, paras, (q.sImages || []).length ? [btn, imgs] : null));
}

const optText = (q, id) => { const o = q.options.find(x => x.id === id); return o ? `${id}. ${o.text}` : '—'; };

// ---------------------------------------------------------------- SETUP
function pondByChapter() {
  const m = {};
  for (const id of store.pondIds()) { const c = quiz.chapterOf(id); m[c] = (m[c] || 0) + 1; }
  return m;
}

function dueByChapter() {
  const m = {};
  for (const id of store.dueIds()) { const c = quiz.chapterOf(id); m[c] = (m[c] || 0) + 1; }
  return m;
}

// ---- een specifieke vraag opzoeken en oefenen
const FIND = { q: '', ready: false, loading: false };
const flat = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
/** 'hs3-45', '3-45', 'h3 45' = één vraag; een los getal = dat nummer in elk hoofdstuk; anders alle woorden in vraag, antwoorden en bron ("mei 2011"). */
function findQuestions(text) {
  const t = flat(text).trim(); if (!t) return [];
  const all = chapters.filter(c => c.count > 0).flatMap(c => quiz.cachedChapter(c.n));
  let m = t.match(/^(?:hs|h|hoofdstuk)\s*(\d+)\s*(?:[-.:\/#]|vraag|v|nr\.?)?\s*(\d+)$/) || t.match(/^(\d+)\s*(?:[-.:\/#]|vraag|v|nr\.?)\s*(\d+)$/);
  if (m) return all.filter(q => q.chapter === +m[1] && q.number === +m[2]);
  if (/^\d{1,3}$/.test(t)) return all.filter(q => q.number === +t);
  const inSource = all.filter(q => flat(q.source).includes(t));   // "mei 2011" = die examendatum, niet 'mei' en '2011' los
  if (inSource.length) return inSource;
  const words = t.split(/\s+/);
  return all.filter(q => { const hay = flat([q.question, ...q.options.map(o => o.text), q.source].join(' ')); return words.every(w => hay.includes(w)); });
}
async function startIds(ids) {
  const p = store.getPrefs();
  try {
    const nums = [...new Set(ids.map(quiz.chapterOf))].sort((a, b) => a - b);
    await ensureTheory(nums); await quiz.loadChapters(nums);
    S = { mode: 'practice', ids, idx: 0, answers: {}, start: Date.now(), dur: p.examMinutes * 60000, chapters: nums };
    saveSession(); setView('session');
  } catch (e) { toast('Laden mislukt: ' + e.message); }
}
function findCard() {
  const box = h('div', { class: 'find-res', 'aria-live': 'polite' });
  const draw = () => {
    const q = FIND.q.trim();
    if (!q) { box.replaceChildren(h('p', { class: 'muted small' }, 'Typ een nummer (bijvoorbeeld 3-45), een stukje van de vraag of een examen (bijvoorbeeld mei 2011).')); return; }
    if (!FIND.ready) { box.replaceChildren(h('p', { class: 'muted small' }, 'Vragen laden…')); return; }
    const res = findQuestions(q);
    if (!res.length) { box.replaceChildren(h('p', { class: 'muted' }, 'Geen vraag gevonden. Probeer een ander woord of een nummer als 3-45.')); return; }
    const shown = res.slice(0, 40);
    box.replaceChildren(...[
      h('div', { class: 'row between' }, h('b', {}, `${res.length} ${res.length === 1 ? 'vraag' : 'vragen'} gevonden`),
        res.length > 1 && h('button', { class: 'ghost small', onclick: () => startIds(quiz.practiceOrder(res, false).map(x => x.id).slice(0, 200)) }, `Oefen alle ${Math.min(res.length, 200)}`)),
      ...shown.map(x => {
        const r = store.record(x.id);
        const st = !r ? h('span', { class: 'badge' }, 'nieuw') : r.l ? h('span', { class: 'badge green' }, 'laatst goed') : h('span', { class: 'badge red' }, 'laatst fout');
        return h('div', { class: 'find-row' },
          h('div', { class: 'find-t' }, h('b', {}, `H${x.chapter} · vraag ${x.number}`), ' ', st,
            h('div', { class: 'small' }, x.question.length > 140 ? x.question.slice(0, 140) + '…' : x.question),
            x.source && h('div', { class: 'small muted' }, x.source)),
          h('button', { class: 'primary small', onclick: () => startIds([x.id]) }, 'Oefen'));
      }),
      res.length > shown.length && h('p', { class: 'muted small' }, `De eerste ${shown.length} staan hierboven. Maak je zoekopdracht specifieker, of oefen ze allemaal.`)].filter(Boolean));
  };
  const input = h('input', { type: 'search', class: 'find-in', placeholder: 'Zoek op nummer, tekst of examen…', 'aria-label': 'Zoek een vraag', value: FIND.q, autocomplete: 'off',
    oninput: e => { FIND.q = e.target.value; draw(); } });
  if (!FIND.ready && !FIND.loading) {
    FIND.loading = true;
    quiz.loadChapters(chapters.filter(c => c.count > 0).map(c => c.n)).then(() => { FIND.ready = true; FIND.loading = false; draw(); }).catch(() => { FIND.loading = false; });
  }
  draw();
  return h('details', { class: 'card find', open: !!FIND.q.trim() }, h('summary', {}, h('b', {}, '🔎 Een specifieke vraag oefenen')), h('div', { style: 'margin-top:.7rem' }, input, box));
}

function startReview() {
  store.setPrefs({ sel: chapters.filter(c => c.count > 0).map(c => c.n), mode: 'practice', onlyDue: true, onlyPond: false, smart: true });
  startSession();
}

function viewSetup() {
  const p = store.getPrefs();
  const avail = chapters.filter(c => c.count > 0);
  const sel = new Set((p.sel || avail.map(c => c.n)).filter(n => avail.some(c => c.n === n)));
  const pond = pondByChapter();
  const due = dueByChapter();
  const dueTotal = store.dueIds().length;
  const saveSel = () => { store.setPrefs({ sel: [...sel] }); render(); };

  const selCount = [...sel].reduce((s, n) => s + (chapters.find(c => c.n === n)?.count || 0), 0);
  const selPond = [...sel].reduce((s, n) => s + (pond[n] || 0), 0);
  const selDue = [...sel].reduce((s, n) => s + (due[n] || 0), 0);
  const exam = p.mode === 'exam';
  const poolSize = exam ? selCount : p.onlyPond ? selPond : p.onlyDue ? selDue : selCount;
  const examN = Math.min(p.examCount, selCount);

  const resume = S && h('div', { class: 'notice' },
    h('p', {}, S.mode === 'exam' ? `Je hebt een examen bezig (vraag ${S.idx + 1} van ${S.ids.length}).` : `Je hebt een oefenronde bezig (vraag ${S.idx + 1} van ${S.ids.length}).`),
    h('div', { class: 'row' },
      h('button', { class: 'primary', onclick: () => setView('session') }, 'Hervatten'),
      h('button', { class: 'danger', onclick: async () => {
        if (await confirmDlg({ title: 'Sessie weggooien?', body: 'De antwoorden van deze sessie gaan verloren.', ok: 'Weggooien', danger: true })) {
          S = null; store.clearSession(); render();
        }
      } }, 'Weggooien')));

  const chapRows = chapters.map(c => {
    const disabled = c.count === 0;
    const pc = pond[c.n] || 0;
    return h('label', { class: 'check' + (disabled ? ' disabled' : '') },
      h('input', { type: 'checkbox', checked: !disabled && sel.has(c.n), disabled, onchange: e => { e.target.checked ? sel.add(c.n) : sel.delete(c.n); saveSel(); } }),
      h('span', { class: 't' }, h('b', {}, `H${c.n}`), ' · ', c.title),
      disabled ? h('span', { class: 'badge' }, 'nog geen vragen')
        : [(due[c.n] || 0) > 0 && h('span', { class: 'badge blue', title: 'Nu te herhalen' }, `${due[c.n]} herhalen`),
          pc > 0 && h('span', { class: 'badge red', title: 'In de foutenvijver' }, `${pc} fout`), h('span', { class: 'badge' }, `${c.count} vragen`)]);
  });

  return h('div', {},
    resume,
    dueTotal > 0 && h('div', { class: 'notice review' },
      h('p', {}, h('b', {}, `Vandaag te herhalen: ${dueTotal} ${dueTotal === 1 ? 'vraag' : 'vragen'}`),
        h('span', { class: 'muted small' }, ' – vragen die je eerder beantwoordde en die nu weer aan de beurt zijn, zodat je ze blijft onthouden.')),
      h('button', { class: 'primary', onclick: startReview }, `Herhaling starten (${dueTotal})`)),
    h('h1', {}, 'Oefenen voor het F-examen'),
    goalCard(),
    findCard(),
    h('p', { class: 'muted' }, 'Kies de onderdelen, de modus en start. Je voortgang wordt in deze browser bewaard; via “Synchroniseren” neem je hem mee naar een ander apparaat.'),

    h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, '1. Onderdelen'),
        h('div', { class: 'row' },
          h('button', { class: 'ghost', onclick: () => { avail.forEach(c => sel.add(c.n)); saveSel(); } }, 'Alles'),
          h('button', { class: 'ghost', onclick: () => { sel.clear(); saveSel(); } }, 'Niets'))),
      chapRows),

    h('section', { class: 'card' },
      h('h2', {}, '2. Modus'),
      h('div', { class: 'modes' },
        h('label', { class: 'mode' },
          h('input', { type: 'radio', name: 'mode', checked: !exam, onchange: () => { store.setPrefs({ mode: 'practice' }); render(); } }),
          h('b', {}, '📖 Oefenmodus'), h('span', { class: 'muted small' }, 'Direct feedback en uitleg per vraag.')),
        h('label', { class: 'mode' },
          h('input', { type: 'radio', name: 'mode', checked: exam, onchange: () => { store.setPrefs({ mode: 'exam' }); render(); } }),
          h('b', {}, '📝 Examenmodus'), h('span', { class: 'muted small' }, `${p.examCount} vragen${p.examSpread ? ', gespreid over de onderdelen' : ' (willekeurig)'}, timer, uitslag aan het eind.`))),
      exam
        ? h('div', { class: 'row', style: 'margin-top:1rem' },
          h('label', { for: 'mins' }, 'Tijdslimiet (minuten):'),
          h('input', { id: 'mins', type: 'number', min: 1, max: 300, value: p.examMinutes, onchange: e => store.setPrefs({ examMinutes: Math.min(300, Math.max(1, parseInt(e.target.value, 10) || 90)) }) }),
          selCount > 0 && selCount < p.examCount && h('span', { class: 'status err' }, `Let op: de selectie bevat maar ${selCount} vragen; het examen wordt korter (slagen = 70%).`),
          h('label', { class: 'check', style: 'width:100%' },
            h('input', { type: 'checkbox', checked: p.examSpread, onchange: e => { store.setPrefs({ examSpread: e.target.checked }); render(); } }),
            h('span', { class: 't' }, 'Vragen gespreid over de gekozen onderdelen ',
              h('span', { class: 'muted small' }, '(naar rato van het aantal vragen per hoofdstuk, zoals een echt examen alle stof raakt; de officiële verdeling is niet bekend, dit is een benadering)'))))
        : h('div', { style: 'margin-top:1rem' },
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: p.onlyPond, onchange: e => { store.setPrefs({ onlyPond: e.target.checked, ...(e.target.checked ? { onlyDue: false } : {}) }); render(); } }),
            h('span', { class: 't' }, 'Alleen eerder foute vragen oefenen'),
            h('span', { class: `badge${selPond ? ' red' : ''}` }, `${selPond} in foutenvijver`)),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: p.onlyDue, onchange: e => { store.setPrefs({ onlyDue: e.target.checked, ...(e.target.checked ? { onlyPond: false } : {}) }); render(); } }),
            h('span', { class: 't' }, 'Alleen vragen die nu herhaald moeten worden'),
            h('span', { class: `badge${selDue ? ' blue' : ''}` }, `${selDue} aan de beurt`)),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: p.smart, onchange: e => { store.setPrefs({ smart: e.target.checked }); render(); } }),
            h('span', { class: 't' }, 'Slimme volgorde ', h('span', { class: 'muted small' }, '(eerst foutenvijver, dan herhaling, dan nieuwe vragen, dan de rest)'))))),

    h('section', { class: 'card' },
      h('h2', {}, '3. Weergave'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: p.darkFigs, onchange: e => { store.setPrefs({ darkFigs: e.target.checked }); render(); } }),
        h('span', { class: 't' }, 'Schema’s en figuren donker weergeven'))),

    h('div', { class: 'row' },
      h('button', { class: 'primary', style: 'min-width:12rem', disabled: poolSize === 0, onclick: startSession },
        exam ? `Examen starten (${examN} vragen)` : `Oefenen starten (${poolSize} vragen)`),
      poolSize === 0 && h('span', { class: 'muted small' },
        sel.size === 0 ? 'Kies minstens één onderdeel.' : p.onlyDue ? 'Niets te herhalen in deze selectie. Goed bezig! 🎉' : 'Geen vragen in deze selectie – de foutenvijver is leeg.')));
}

async function startSession() {
  const p = store.getPrefs();
  const nums = [...(p.sel || chapters.filter(c => c.count).map(c => c.n))].filter(n => chapters.find(c => c.n === n && c.count)).sort((a, b) => a - b);
  try {
    await ensureTheory(nums);
    let pool = await quiz.loadChapters(nums);
    if (p.mode === 'practice' && p.onlyPond) pool = pool.filter(q => store.isPond(q.id));
    else if (p.mode === 'practice' && p.onlyDue) { const due = new Set(store.dueIds()); pool = pool.filter(q => due.has(q.id)); }
    if (!pool.length) { toast('Geen vragen in deze selectie.'); return; }
    const ids = p.mode === 'exam' ? quiz.examQuestions(pool, p.examCount, p.examSpread) : quiz.practiceOrder(pool, p.smart);
    S = { mode: p.mode, ids, idx: 0, answers: {}, start: Date.now(), dur: p.examMinutes * 60000, chapters: nums };
    saveSession();
    setView('session');
  } catch (e) {
    toast('Laden mislukt: ' + e.message);
  }
}

// ---------------------------------------------------------------- SESSIE (oefenen + examen)
function viewSession() {
  if (!S) return viewSetup();
  return S.mode === 'exam' ? viewExam() : viewPractice();
}

// ---- oefenmodus
function viewPractice() {
  const id = S.ids[S.idx];
  const q = quiz.QMAP.get(id);
  const picked = S.answers[id] || null;
  const answered = !!picked;
  const correct = picked === q.answer;
  const last = S.idx === S.ids.length - 1;

  const opts = q.options.map(o => {
    let cls = 'opt';
    if (answered) cls += o.id === q.answer ? ' right' : (o.id === picked ? ' wrong' : ' dim');
    return h('button', { class: cls, disabled: answered, 'aria-label': `Antwoord ${o.id}: ${o.text}`, onclick: () => answerPractice(q, o.id) },
      h('span', { class: 'l' }, o.id), h('span', { class: 'tx' }, o.text));
  });

  const next = h('button', { class: 'primary', onclick: nextPractice }, last ? 'Afronden' : 'Volgende vraag →');
  if (answered) queueMicrotask(() => next.focus({ preventScroll: true }));

  return h('div', {},
    h('div', { class: 'qhead' },
      h('span', { class: 'qmeta' }, `${S.label ? S.label + ' · ' : ''}Vraag ${S.idx + 1} van ${S.ids.length} · H${q.chapter} · opgave ${q.chapter}-${q.number}`),
      formulaBtn(q.chapter),
      store.isPond(id) && !answered && h('span', { class: 'badge red' }, 'Uit foutenvijver'),
      h('button', { class: 'ghost small', onclick: stopPractice }, 'Stoppen')),
    h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': S.ids.length, 'aria-valuenow': S.idx + (answered ? 1 : 0) },
      h('i', { style: `width:${pct(S.idx + (answered ? 1 : 0), S.ids.length)}%` })),
    h('div', { class: 'card', style: 'margin-top:1rem' },
      h('p', { class: 'stem' }, q.question),
      figures(q),
      h('div', { class: 'opts', role: 'group', 'aria-label': 'Antwoordopties' }, opts),
      original(q),
      answered && h('div', { class: 'banner ' + (correct ? 'ok' : 'no'), role: 'status' },
        correct ? '✅ Goed!' : `❌ Fout — het juiste antwoord is ${q.answer}.`,
        S.wasPond && S.wasPond[id] && correct ? ' Deze vraag is uit de foutenvijver gehaald 🎉' : '',
        !correct ? ' Toegevoegd aan de foutenvijver.' : ''),
      answered && explanation(q, !correct),
      answered && theoryLinks(q, !correct),
      answered && q.source && h('p', { class: 'muted small', style: 'margin:.8rem 0 0' }, 'Eerder voorgekomen: ' + q.source),
      h('div', { class: 'actions' }, answered && next)));
}

function answerPractice(q, optId) {
  if (S.answers[q.id]) return;
  const ok = optId === q.answer;
  S.wasPond = S.wasPond || {};
  S.wasPond[q.id] = store.isPond(q.id);
  S.answers[q.id] = optId;
  store.recordAnswer(q.id, ok, 'practice');
  saveSession();
  render();
}

function nextPractice() {
  if (S.idx >= S.ids.length - 1) return finishPractice();
  S.idx++;
  saveSession();
  render();
  window.scrollTo(0, 0);
}

async function stopPractice() {
  const n = Object.keys(S.answers).length;
  if (n === 0) { S = null; store.clearSession(); setView('setup'); return; }
  finishPractice();
}

function finishPractice() {
  const answered = S.ids.filter(id => S.answers[id]);
  const correct = answered.filter(id => S.answers[id] === quiz.QMAP.get(id).answer).length;
  RESULT = { mode: 'practice', total: S.ids.length, answered: answered.length, correct };
  S = null; store.clearSession();
  setView('result');
}

// ---- examenmodus
function viewExam() {
  const id = S.ids[S.idx];
  const q = quiz.QMAP.get(id);
  const picked = S.answers[id] || null;
  const n = S.ids.length;
  const answeredCount = S.ids.filter(i => S.answers[i]).length;

  const timer = h('span', { class: 'timer', 'aria-live': 'off' }, '--:--');
  const tick = () => {
    const left = Math.round((S.start + S.dur - Date.now()) / 1000);
    timer.textContent = quiz.fmtTime(left);
    timer.classList.toggle('low', left <= 300);
    if (left <= 0) { clearInterval(timerInt); toast('De tijd is om – het examen wordt ingeleverd.'); finishExam(true); }
  };
  clearInterval(timerInt);
  timerInt = setInterval(tick, 1000);
  tick();

  const opts = q.options.map(o => h('button', {
    class: 'opt' + (picked === o.id ? ' picked' : ''), 'aria-pressed': picked === o.id ? 'true' : 'false',
    onclick: () => {
      if (S.answers[id] === o.id) delete S.answers[id]; else S.answers[id] = o.id;
      saveSession(); render();
    },
  }, h('span', { class: 'l' }, o.id), h('span', { class: 'tx' }, o.text)));

  const go = i => { S.idx = i; saveSession(); render(); window.scrollTo(0, 0); };

  return h('div', {},
    h('div', { class: 'qhead' },
      h('span', { class: 'qmeta' }, `Examen · vraag ${S.idx + 1} van ${n} · ${answeredCount} beantwoord`),
      h('div', { class: 'row' }, timer,
        h('button', { class: 'primary', onclick: submitExam }, 'Inleveren'))),
    h('div', { class: 'progress' }, h('i', { style: `width:${pct(answeredCount, n)}%` })),
    h('div', { class: 'card', style: 'margin-top:1rem' },
      h('p', { class: 'stem' }, q.question),
      figures(q),
      h('div', { class: 'opts', role: 'group', 'aria-label': 'Antwoordopties' }, opts),
      original(q),
      h('div', { class: 'actions' },
        h('button', { disabled: S.idx === 0, onclick: () => go(S.idx - 1) }, '← Vorige'),
        h('button', { class: 'right primary', disabled: S.idx === n - 1, onclick: () => go(S.idx + 1) }, 'Volgende →'))),
    h('div', { class: 'card' },
      h('h3', {}, 'Overzicht'),
      h('div', { class: 'navgrid' }, S.ids.map((qid, i) =>
        h('button', { class: (S.answers[qid] ? 'done ' : '') + (i === S.idx ? 'cur' : ''), 'aria-label': `Vraag ${i + 1}${S.answers[qid] ? ' (beantwoord)' : ''}`, onclick: () => go(i) }, String(i + 1)))),
      h('p', { class: 'muted small', style: 'margin:.8rem 0 0' }, 'Blauw = beantwoord. Klik op een gekozen antwoord om het weer te wissen.')));
}

async function submitExam() {
  const open = S.ids.filter(i => !S.answers[i]).length;
  const ok = await confirmDlg({
    title: 'Examen inleveren?',
    body: open ? `Je hebt nog ${open} onbeantwoorde ${open === 1 ? 'vraag' : 'vragen'}. Die tellen als fout.` : 'Alle vragen zijn beantwoord.',
    ok: 'Inleveren', cancel: 'Verder gaan',
  });
  if (ok) finishExam(false);
}

function finishExam() {
  if (!S) return;
  clearInterval(timerInt);
  const total = S.ids.length;
  let score = 0;
  const details = S.ids.map(id => {
    const q = quiz.QMAP.get(id);
    const picked = S.answers[id] || null;
    const ok = picked === q.answer;
    if (ok) score++;
    store.recordAnswer(id, ok, 'exam');
    return { id, picked, ok };
  });
  const need = quiz.passThreshold(total, store.getPrefs().passMark, 50);
  const secs = Math.min(Math.round((Date.now() - S.start) / 1000), Math.round(S.dur / 1000));
  const pass = score >= need;
  store.addExam({ score, total, pass, secs, chapters: S.chapters });
  RESULT = { mode: 'exam', total, score, need, pass, secs, details };
  S = null; store.clearSession();
  setView('result');
}

// ---------------------------------------------------------------- UITSLAG
function viewResult() {
  const r = RESULT;
  if (!r) return viewSetup();
  const back = h('button', { onclick: () => setView('setup') }, 'Terug naar start');
  const practiceWrong = () => {
    store.setPrefs({ onlyPond: true, onlyDue: false, mode: 'practice' });
    startSession();
  };

  if (r.mode === 'practice') {
    const p = pct(r.correct, r.answered);
    const pondN = store.pondIds().length;
    return h('div', {},
      h('div', { class: 'card verdict' },
        h('div', { class: 'muted' }, 'Oefenronde afgerond'),
        h('div', { class: 'big' }, `${r.correct} / ${r.answered}`),
        h('p', { class: 'score' }, r.answered ? `${p}% goed` : 'Geen vragen beantwoord'),
        h('p', { class: 'muted' }, pondN ? `Er staan nog ${pondN} vragen in je foutenvijver.` : 'Je foutenvijver is leeg. 🎉')),
      h('div', { class: 'row' }, back,
        pondN > 0 && h('button', { class: 'primary', onclick: practiceWrong }, `Foute vragen oefenen (${pondN})`),
        h('button', { onclick: () => setView('stats') }, 'Bekijk voortgang')));
  }

  const wrong = r.details.filter(d => !d.ok);
  const byChap = {};
  for (const d of r.details) {
    const c = quiz.chapterOf(d.id);
    byChap[c] = byChap[c] || { n: 0, ok: 0 };
    byChap[c].n++; if (d.ok) byChap[c].ok++;
  }
  return h('div', {},
    h('div', { class: 'card verdict ' + (r.pass ? 'pass' : 'fail') },
      h('div', { class: 'big' }, r.pass ? '🎉 GESLAAGD' : 'NIET GESLAAGD'),
      h('p', { class: 'score' }, `${r.score} van ${r.total} goed (${pct(r.score, r.total)}%)`),
      h('p', { class: 'muted' }, `Slagen vanaf ${r.need} goed · tijd: ${quiz.fmtTime(r.secs)}`)),
    h('div', { class: 'row', style: 'margin-bottom:1rem' }, back,
      wrong.length > 0 && h('button', { class: 'primary', onclick: practiceWrong }, `Foute vragen oefenen (${store.pondIds().length})`)),
    h('section', { class: 'card' },
      h('h2', {}, 'Per onderdeel'),
      h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Onderdeel'), h('th', {}, 'Goed'), h('th', {}, '%'))),
        h('tbody', {}, Object.entries(byChap).map(([c, v]) => h('tr', {},
          h('td', {}, `H${c} · ${chapterTitle(+c)}`), h('td', {}, `${v.ok}/${v.n}`), h('td', { class: 'pct ' + pctClass(pct(v.ok, v.n)) }, pct(v.ok, v.n) + '%')))))),
    h('h2', {}, wrong.length ? `Gemaakte fouten (${wrong.length})` : 'Geen fouten – foutloos!'),
    wrong.map(d => {
      const q = quiz.QMAP.get(d.id);
      return h('div', { class: 'card mistake' },
        h('div', { class: 'qmeta' }, `H${q.chapter} · opgave ${q.chapter}-${q.number}`),
        h('p', { class: 'stem' }, q.question),
        figures(q),
        original(q),
        h('p', {}, h('span', { class: 'yours' }, 'Jouw antwoord: ' + (d.picked ? optText(q, d.picked) : 'niet beantwoord')), h('br'),
          h('span', { class: 'correct' }, 'Goed antwoord: ' + optText(q, q.answer))),
        explanation(q, false),
        theoryLinks(q, true));
    }));
}

// ---------------------------------------------------------------- VOORTGANG
function chapterStats() {
  const recs = store.allRecords();
  const out = {};
  for (const [id, r] of Object.entries(recs)) {
    const c = quiz.chapterOf(id);
    const o = out[c] = out[c] || { a: 0, ok: 0, seen: 0, mastered: 0, pond: 0 };
    o.a += r.a; o.ok += r.ok;
    if (r.a > 0) o.seen++;
    if (r.l) o.mastered++;
    if (r.p) o.pond++;
  }
  return out;
}

function viewStats() {
  const t = store.totals();
  const cs = chapterStats();
  const withQ = chapters.filter(c => c.count > 0);
  const weak = withQ.map(c => ({ c, s: cs[c.n] })).filter(x => x.s && x.s.a >= 5)
    .sort((x, y) => pct(x.s.ok, x.s.a) - pct(y.s.ok, y.s.a))[0];
  const exams = store.getExams().slice(0, 10);

  return h('div', {},
    h('h1', {}, 'Voortgang'),
    goalCard(),
    heatmapCard(),
    h('div', { class: 'cards' },
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(t.a)), h('div', { class: 'k' }, 'vragen beantwoord')),
      h('div', { class: 'stat' }, h('div', { class: 'n pct ' + (t.a ? pctClass(pct(t.ok, t.a)) : '') }, t.a ? pct(t.ok, t.a) + '%' : '–'), h('div', { class: 'k' }, 'goed (algemeen)')),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(t.pond)), h('div', { class: 'k' }, 'in foutenvijver')),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(t.due)), h('div', { class: 'k' }, 'nu te herhalen')),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, `${t.passed}/${t.exams}`), h('div', { class: 'k' }, 'examens geslaagd'))),

    weak && pct(weak.s.ok, weak.s.a) < 70 && h('div', { class: 'notice' },
      `Zwakste plek: H${weak.c.n} · ${weak.c.title} (${pct(weak.s.ok, weak.s.a)}% goed). Daar kun je het meest winnen.`),

    h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, 'Per onderdeel'),
        h('div', { class: 'legend' },
          h('span', {}, h('i', { style: 'background:var(--green)' }), 'beheerst (laatste antwoord goed)'),
          h('span', {}, h('i', { style: 'background:rgba(77,163,255,.5)' }), 'gezien'))),
      withQ.map(c => {
        const s = cs[c.n] || { a: 0, ok: 0, seen: 0, mastered: 0, pond: 0 };
        const sp = pct(s.ok, s.a);
        return h('div', { class: 'chap' },
          h('div', { class: 'row between' },
            h('b', {}, `H${c.n} · ${c.title}`),
            s.a ? h('span', { class: 'pct ' + pctClass(sp) }, `${sp}% goed`) : h('span', { class: 'muted small' }, 'nog niet geoefend')),
          h('div', { class: 'bar', role: 'img', 'aria-label': `${s.mastered} van ${c.count} vragen beheerst` },
            h('i', { class: 'seen', style: `width:${pct(s.seen, c.count)}%` }),
            h('i', { class: 'mast', style: `width:${pct(s.mastered, c.count)}%` })),
          c.theory && theory.getTheory(c.n) && h('details', { class: 'secs' }, h('summary', {}, 'Per paragraaf'), sectionRows(theory.getTheory(c.n), 'stats')),
          h('div', { class: 'row between small muted' },
            h('span', {}, `Beheerst ${s.mastered}/${c.count} · gezien ${s.seen}/${c.count} · ${s.ok}/${s.a} goed`),
            s.pond > 0 && h('button', { class: 'linklike small', onclick: () => {
              store.setPrefs({ sel: [c.n], onlyPond: true, onlyDue: false, mode: 'practice' }); startSession();
            } }, `Oefen ${s.pond} foute`)));
      }),
      chapters.some(c => c.count === 0) && h('p', { class: 'muted small', style: 'margin:.8rem 0 0' },
        'Nog geen vragen voor: ' + chapters.filter(c => c.count === 0).map(c => 'H' + c.n).join(', ') + '. Voeg ze toe met tools/extract_vrza.py (zie README).')),

    h('section', { class: 'card' },
      h('h2', {}, 'Laatste examens'),
      exams.length === 0 ? h('p', { class: 'muted' }, 'Nog geen examens gemaakt.') :
        h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Datum'), h('th', {}, 'Score'), h('th', {}, 'Uitslag'), h('th', {}, 'Tijd'))),
          h('tbody', {}, exams.map(e => h('tr', {}, h('td', {}, fmtDate(e.t)), h('td', {}, `${e.score}/${e.total}`),
            h('td', { class: e.pass ? 'correct' : 'yours' }, e.pass ? 'Geslaagd' : 'Gezakt'), h('td', {}, quiz.fmtTime(e.secs || 0))))))),

    h('section', { class: 'card' },
      h('h2', {}, 'Gegevens'),
      h('p', { class: 'muted small' }, 'Alle voortgang staat lokaal in deze browser. Een reset wist ook de gesynchroniseerde gegevens op je andere apparaten (zodra die synchroniseren).'),
      h('button', { class: 'danger', onclick: resetAll }, 'Alle voortgang wissen…')));
}

async function resetAll() {
  const ok = await confirmDlg({
    title: 'Alle voortgang wissen?',
    body: h('p', {}, 'Je statistieken, foutenvijver en examenhistorie worden definitief verwijderd. Dit kan niet ongedaan worden gemaakt.'),
    ok: 'Ja, alles wissen', danger: true,
  });
  if (!ok) return;
  S = null; store.clearSession(); store.resetAll();
  toast('Voortgang gewist.');
  render();
}

// ---------------------------------------------------------------- SYNCHRONISEREN
let statusEl = null;
function statusText(s) {
  if (!s || s.state === 'off') return ['', ''];
  if (s.state === 'busy' || s.state === 'pending') return ['Bezig met synchroniseren…', ''];
  if (s.state === 'error') return ['Synchroniseren mislukt: ' + s.message, 'err'];
  return [(s.kind === 'account' ? 'Opgeslagen in je account om ' : 'Gesynchroniseerd om ') + new Date(s.last).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }), 'ok'];
}
function paintStatus(s) {
  if (!statusEl || !statusEl.isConnected) return;
  const [txt, cls] = statusText(s);
  statusEl.textContent = txt;
  statusEl.className = 'status ' + cls;
}

function viewSync() {
  const cfg = sync.getCfg();
  const connected = !!cfg.token;
  statusEl = h('p', { class: 'status' });
  if (connected && cfg.last) paintStatus({ state: 'ok', last: cfg.last });

  const tokenInput = h('input', { type: 'password', id: 'tok', placeholder: 'ghp_…', autocomplete: 'off', 'aria-label': 'GitHub token' });
  const linkOut = h('div', {});
  const codeIn = h('textarea', { placeholder: 'Plak hier een overdraag-link of code…', 'aria-label': 'Overdraagcode' });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importFile });

  const gistCard = connected
    ? h('div', {},
      h('p', {}, '✅ Dit apparaat is gekoppeld aan je privé-gist. Wijzigingen worden automatisch gesynchroniseerd en opgehaald wanneer je terugkeert naar deze pagina.'),
      statusEl,
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: async () => { try { const r = await sync.syncNow(); if (r && r.changed) { toast('Nieuwe gegevens opgehaald.'); } } catch { /* status toont de fout */ } } }, 'Nu synchroniseren'),
        h('button', { class: 'danger', onclick: async () => {
          if (await confirmDlg({ title: 'Verbinding verbreken?', body: 'Het token wordt van dit apparaat verwijderd. Je gist en je lokale voortgang blijven bestaan.', ok: 'Verbreken' })) { sync.disconnect(); render(); }
        } }, 'Verbinding verbreken')))
    : h('div', {},
      h('p', {}, 'Automatisch synchroniseren via een ', h('b', {}, 'privé GitHub Gist'), ' van jezelf. Je hebt hiervoor geen server nodig.'),
      h('ol', { class: 'small' },
        h('li', {}, 'Maak een ', h('a', { href: 'https://github.com/settings/tokens/new?scopes=gist&description=F-licentie%20oefenapp', target: '_blank', rel: 'noopener' }, 'classic token met alleen de scope “gist”'), ' (geen vervaldatum, of een lange).'),
        h('li', {}, 'Plak het token hieronder en klik op Verbinden. Doe dit op elk apparaat met hetzelfde token.')),
      h('div', { class: 'row' }, tokenInput,
        h('button', { class: 'primary', onclick: async () => {
          const v = tokenInput.value.trim();
          if (!v) return;
          statusEl.textContent = 'Verbinden…'; statusEl.className = 'status';
          try { await sync.connect(v); toast('Gekoppeld en gesynchroniseerd.'); render(); }
          catch (e) { statusEl.textContent = 'Koppelen mislukt: ' + e.message; statusEl.className = 'status err'; }
        } }, 'Verbinden')),
      statusEl,
      h('p', { class: 'muted small' }, 'Het token wordt alleen in de localStorage van dit apparaat bewaard en rechtstreeks naar api.github.com gestuurd. Gebruik het alleen op apparaten die je vertrouwt.'));

  return h('div', {},
    h('h1', {}, 'Meer'),
    account.enabled() && !account.loggedIn() && h('div', { class: 'notice' }, 'Het makkelijkst: ', h('button', { class: 'linklike', onclick: () => setView('account') }, 'maak een account'), ' en log overal in met hetzelfde e-mailadres. Onderstaande opties werken ook zonder account.'),
    h('p', { class: 'muted' }, 'Kies wat het beste past. Gegevens worden altijd ', h('i', {}, 'samengevoegd'), ' (per vraag wint de nieuwste poging), dus je raakt niets kwijt als je op meerdere apparaten oefent.'),

    h('section', { class: 'card' }, h('h2', {}, 'Optie 1 · Automatisch (eigen GitHub Gist)'), gistCard),

    h('section', { class: 'card' },
      h('h2', {}, 'Optie 2 · Overdraag-link'),
      h('p', { class: 'muted small' }, 'Maakt één link met je voortgang erin. Mail of appt hem naar jezelf en open hem op het andere apparaat.'),
      h('div', { class: 'row' },
        h('button', { onclick: async () => {
          const code = await store.encodeShare();
          const url = location.origin + location.pathname + '#sync=' + code;
          const inp = h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Overdraag-link', style: 'width:100%', onfocus: e => e.target.select() });
          linkOut.replaceChildren(inp,
            h('div', { class: 'row', style: 'margin-top:.5rem' },
              h('button', { onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Link gekopieerd.'); } catch { inp.select(); toast('Selecteer en kopieer de link handmatig.'); } } }, 'Kopiëren'),
              navigator.share && h('button', { onclick: () => navigator.share({ title: 'F-licentie voortgang', url }).catch(() => {}) }, 'Delen…'),
              h('span', { class: 'muted small' }, `${url.length} tekens`)));
        } }, 'Link maken')),
      linkOut,
      h('details', { style: 'margin-top:1rem' }, h('summary', {}, 'Heb je een code of link ontvangen?'),
        codeIn,
        h('div', { class: 'actions' }, h('button', { onclick: async () => {
          const raw = codeIn.value.trim();
          const code = raw.includes('#sync=') ? raw.split('#sync=')[1] : raw;
          await importShare(code);
        } }, 'Samenvoegen')))),

    h('section', { class: 'card' },
      h('h2', {}, 'Optie 3 · Back-upbestand'),
      h('div', { class: 'row' },
        h('button', { onclick: exportFile }, 'Downloaden (.json)'),
        h('button', { onclick: () => fileIn.click() }, 'Bestand importeren…'), fileIn),
      h('p', { class: 'muted small', style: 'margin:.6rem 0 0' }, 'Handig als back-up. Importeren voegt samen met wat er al is.')),

    h('section', { class: 'card' },
      h('h2', {}, 'Optie 4 · Thema’s'),
      h('p', { class: 'muted small' }, 'Kies de kleuren van de app. Je keuze wordt op dit apparaat bewaard.'),
      h('div', { class: 'themepick' }, THEMES.map(t => h('button', { 'aria-pressed': String((store.getPrefs().theme || 'std') === t.id),
        onclick: () => { store.setPrefs({ theme: t.id }); render(); } },
        h('span', { class: 'sw sw-' + t.id, 'aria-hidden': 'true' }, h('b'), h('b')),
        h('span', { class: 'tn' }, t.name),
        h('span', { class: 'muted small' }, t.sub))))));
}

function exportFile() {
  const blob = new Blob([JSON.stringify(store.exportData(), null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `f-licentie-voortgang-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function importFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const sum = store.summarize(data);
    if (await confirmDlg({ title: 'Bestand importeren?', body: `Bevat ${sum.questions} vragen en ${sum.exams} examens. Dit wordt samengevoegd met je huidige voortgang.`, ok: 'Samenvoegen' })) {
      store.mergeRemote(data); toast('Voortgang samengevoegd.'); render();
    }
  } catch { toast('Dit bestand kon niet worden gelezen.'); }
  e.target.value = '';
}

async function importShare(code) {
  try {
    const data = await store.decodeShare(code);
    const sum = store.summarize(data);
    const ok = await confirmDlg({
      title: 'Voortgang van een ander apparaat',
      body: `Gevonden: ${sum.questions} vragen en ${sum.exams} examens. Samenvoegen met je huidige voortgang?`,
      ok: 'Samenvoegen',
    });
    if (ok) { store.mergeRemote(data); toast('Voortgang samengevoegd.'); render(); }
  } catch { toast('Deze code of link is ongeldig.'); }
}

// ---------------------------------------------------------------- ACCOUNT
let accMode = 'login';        // login | register
let recoveryToken = null;

function viewAccount() {
  if (!account.enabled()) {
    return h('div', {}, h('h1', {}, 'Account'),
      h('div', { class: 'card' },
        h('p', {}, 'Inloggen is op deze site nog niet ingesteld.'),
        h('p', { class: 'muted small' }, 'Beheerder: zet in js/config.js het adres van je server (PB_URL) of de Supabase-gegevens; zie de README. Intussen kun je de opties onder “Meer” gebruiken om voortgang mee te nemen.')));
  }
  return account.loggedIn() ? viewAccountIn() : viewAccountOut();
}

function field(label, id, input) { return h('div', { class: 'field' }, h('label', { for: id }, label), input); }

function viewAccountOut() {
  const reg = accMode === 'register';
  const email = h('input', { type: 'email', id: 'em', required: true, autocomplete: 'username', placeholder: 'naam@voorbeeld.nl' });
  const pw = h('input', { type: 'password', id: 'pw', required: true, minlength: 8, autocomplete: reg ? 'new-password' : 'current-password' });
  const agree = reg && h('input', { type: 'checkbox', id: 'agree', required: true });
  const msg = h('p', { class: 'status', role: 'alert' });
  const btn = h('button', { class: 'primary', type: 'submit' }, reg ? 'Account aanmaken' : 'Inloggen');
  const say = (t, cls) => { msg.textContent = t; msg.className = 'status ' + (cls || ''); };

  const form = h('form', {
    onsubmit: async e => {
      e.preventDefault();
      btn.disabled = true; say('');
      try {
        if (reg) {
          const r = await account.signUp(email.value.trim(), pw.value);
          if (!r.session) { say('Account aangemaakt. Bevestig je e-mailadres via de mail die je hebt gekregen en log daarna in.', 'ok'); btn.disabled = false; return; }
        } else {
          await account.signIn(email.value.trim(), pw.value);
        }
        await afterLogin();
      } catch (err) { say(err.message, 'err'); btn.disabled = false; }
    },
  },
    field('E-mailadres', 'em', email),
    field(reg ? 'Wachtwoord (minimaal 8 tekens)' : 'Wachtwoord', 'pw', pw),
    reg && h('label', { class: 'check', for: 'agree' }, agree,
      h('span', { class: 't small' }, 'Ik heb de ', h('button', { type: 'button', class: 'linklike', onclick: () => setView('privacy') }, 'privacyverklaring'), ' gelezen.')),
    h('div', { class: 'row' }, btn,
      !reg && account.canRecover() && h('button', { type: 'button', class: 'linklike', onclick: async () => {
        if (!email.value.trim()) { say('Vul eerst je e-mailadres in.', 'err'); return; }
        try { await account.recover(email.value.trim()); say('Als dit e-mailadres bij een account hoort, is er een mail met een herstellink verstuurd.', 'ok'); }
        catch (err) { say(err.message, 'err'); }
      } }, 'Wachtwoord vergeten?')),
    !reg && !account.canRecover() && h('p', { class: 'muted small' }, 'Wachtwoord vergeten? Vraag de beheerder van deze site om een nieuw wachtwoord voor je in te stellen.'),
    msg);

  return h('div', {},
    h('h1', {}, 'Account'),
    h('p', { class: 'muted' }, 'Log in om je voortgang op elk apparaat te bewaren en te hervatten.'),
    h('div', { class: 'card' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Inloggen of registreren' },
        h('button', { 'aria-pressed': String(!reg), onclick: () => { accMode = 'login'; render(); } }, 'Inloggen'),
        h('button', { 'aria-pressed': String(reg), onclick: () => { accMode = 'register'; render(); } }, 'Registreren')),
      form),
    h('p', { class: 'muted small' }, 'Zonder account blijft je voortgang gewoon in deze browser staan. ',
      h('button', { class: 'linklike', onclick: () => setView('privacy') }, 'Privacyverklaring')));
}

async function afterLogin() {
  const u = account.getUser();
  const owner = account.getOwner();
  if (owner && owner !== u.id) {                       // ander account dan het vorige op dit apparaat
    store.clearLocal(); store.clearSession(); S = null;
  } else if (!owner && store.hasLocalData()) {        // voortgang van vóór het inloggen
    const keep = await confirmDlg({
      title: 'Voortgang op dit apparaat gevonden',
      body: h('p', {}, 'Op dit apparaat staat voortgang van vóór je inlog. Wil je die toevoegen aan je account?'),
      ok: 'Toevoegen aan account', cancel: 'Niet toevoegen',
    });
    if (!keep) { store.clearLocal(); store.clearSession(); S = null; }
  }
  account.setOwner(u.id);
  try { await sync.syncNow(); toast('Ingelogd – voortgang gesynchroniseerd.'); }
  catch (e) { toast('Ingelogd, maar synchroniseren mislukte: ' + e.message); }
  render();
}

function viewAccountIn() {
  const u = account.getUser();
  statusEl = h('p', { class: 'status' });
  const last = sync.lastSync();
  if (last) paintStatus({ state: 'ok', last, kind: 'account' });
  return h('div', {},
    h('h1', {}, 'Account'),
    h('div', { class: 'card' },
      h('p', {}, 'Ingelogd als ', h('b', {}, u.email)),
      h('p', { class: 'muted small' }, 'Je voortgang wordt automatisch opgeslagen en op elk apparaat opgehaald waar je inlogt.'),
      statusEl,
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: async () => {
          try { const r = await sync.syncNow(); toast(r && r.changed ? 'Nieuwe gegevens opgehaald.' : 'Alles is up-to-date.'); if (r && r.changed) render(); }
          catch { /* status toont de fout */ }
        } }, 'Nu synchroniseren'),
        h('button', { onclick: logout }, 'Uitloggen'))),
    changePasswordCard(),
    h('div', { class: 'card' },
      h('h2', {}, 'Privacy en gegevens'),
      h('p', { class: 'small muted' }, 'Je kunt je account en alle bijbehorende gegevens op elk moment verwijderen.'),
      h('div', { class: 'row' },
        h('button', { onclick: () => setView('privacy') }, 'Privacyverklaring'),
        h('button', { class: 'danger', onclick: removeAccount }, 'Account verwijderen…'))));
}

function changePasswordCard() {
  const oldPw = h('input', { type: 'password', id: 'op', required: true, autocomplete: 'current-password' });
  const newPw = h('input', { type: 'password', id: 'nw', required: true, minlength: 8, autocomplete: 'new-password' });
  const msg = h('p', { class: 'status', role: 'alert' });
  const say = (t, c) => { msg.textContent = t; msg.className = 'status ' + (c || ''); };
  return h('details', { class: 'card' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Wachtwoord wijzigen'),
    h('form', { style: 'margin-top:.8rem', onsubmit: async e => {
      e.preventDefault(); say('');
      try { await account.changePassword(oldPw.value, newPw.value); oldPw.value = ''; newPw.value = ''; say('Wachtwoord gewijzigd.', 'ok'); }
      catch (err) { say(err.message, 'err'); }
    } },
    field('Huidig wachtwoord', 'op', oldPw), field('Nieuw wachtwoord (minimaal 8 tekens)', 'nw', newPw),
    h('button', { class: 'primary', type: 'submit' }, 'Opslaan'), msg));
}

async function logout() {
  let synced = true;
  try { await sync.syncNow(); } catch { synced = false; }
  const ok = await confirmDlg({
    title: 'Uitloggen?',
    body: h('p', {}, synced
      ? 'Je voortgang staat veilig in je account. De lokale kopie op dit apparaat wordt gewist.'
      : 'Let op: synchroniseren is mislukt. Voortgang die nog niet is opgeslagen, gaat verloren als je nu uitlogt.'),
    ok: 'Uitloggen', danger: !synced,
  });
  if (!ok) return;
  await account.signOut();
  store.clearLocal(); store.clearSession(); S = null; account.setOwner(null);
  toast('Uitgelogd.');
  render();
}

async function removeAccount() {
  const ok = await confirmDlg({
    title: 'Account definitief verwijderen?',
    body: h('p', {}, 'Je account en al je opgeslagen voortgang worden verwijderd. Dit kan niet ongedaan worden gemaakt. De kopie op dit apparaat wordt ook gewist.'),
    ok: 'Ja, verwijder alles', danger: true,
  });
  if (!ok) return;
  try {
    await account.deleteAccount();
    store.clearLocal(); store.clearSession(); S = null;
    toast('Je account is verwijderd.');
    render();
  } catch (e) { toast('Verwijderen mislukt: ' + e.message); }
}

function viewRecovery() {
  const pw = h('input', { type: 'password', id: 'np', required: true, minlength: 8, autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', id: 'np2', required: true, minlength: 8, autocomplete: 'new-password' });
  const msg = h('p', { class: 'status', role: 'alert' });
  return h('div', {},
    h('h1', {}, 'Nieuw wachtwoord instellen'),
    h('div', { class: 'card' }, h('form', {
      onsubmit: async e => {
        e.preventDefault();
        if (pw.value !== pw2.value) { msg.textContent = 'De wachtwoorden zijn niet gelijk.'; msg.className = 'status err'; return; }
        try {
          await account.setPassword(recoveryToken, pw.value);
          recoveryToken = null; accMode = 'login';
          toast('Wachtwoord gewijzigd. Log nu in.');
          setView('account');
        } catch (err) { msg.textContent = err.message; msg.className = 'status err'; }
      },
    }, field('Nieuw wachtwoord (minimaal 8 tekens)', 'np', pw), field('Herhaal wachtwoord', 'np2', pw2),
    h('button', { class: 'primary', type: 'submit' }, 'Wachtwoord opslaan'), msg)));
}

function viewPrivacy() {
  return h('div', {},
    h('h1', {}, 'Privacyverklaring'),
    h('div', { class: 'card' },
      h('p', { class: 'muted small' }, 'Deze oefenapp is een privé-initiatief van een medecursist en niet gelieerd aan de VRZA. Beperk je gegevens: er wordt niets meer opgeslagen dan nodig is.'),
      h('h3', {}, 'Welke gegevens worden opgeslagen?'),
      h('p', {}, 'Alleen als je een account aanmaakt: je e-mailadres, je wachtwoord (versleuteld, ook de beheerder kan het niet lezen) en je oefenvoortgang (welke vragen je hebt beantwoord, of ze goed waren, je foutenvijver en je examenscores).'),
      h('h3', {}, 'Waarvoor?'),
      h('p', {}, 'Uitsluitend om je voortgang op meerdere apparaten te kunnen bewaren en hervatten. Er is geen tracking, geen reclame en er worden geen gegevens verkocht of gedeeld.'),
      h('h3', {}, 'Waar staan ze?'),
      h('p', {}, 'Bij ' + account.hostLabel() + '. Zonder account blijft alles uitsluitend in je eigen browser (localStorage) en verlaat het je apparaat niet.'),
      h('h3', {}, 'Hoe lang?'),
      h('p', {}, 'Tot je je account verwijdert. Dat kan zelf, onder Account → “Account verwijderen”; je e-mailadres en voortgang worden dan gewist.'),
      h('h3', {}, 'Je rechten en contact'),
      h('p', {}, 'Je kunt inzage, correctie of verwijdering vragen via ', CONTACT_EMAIL, '.'),
      h('h3', {}, 'Vragen en uitwerkingen'),
      h('p', {}, 'De examenvragen en uitwerkingen zijn afkomstig uit de cursus van de VRZA en uitsluitend bedoeld om mee te oefenen.')),
    h('button', { onclick: () => setView('account') }, '← Terug'));
}

// ---------------------------------------------------------------- toetsenbord
document.addEventListener('keydown', e => {
  if (e.target.closest?.('.tpanel')) return;
  if (view !== 'session' || !S || $dlg.open) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const id = S.ids[S.idx], q = quiz.QMAP.get(id);
  const k = e.key.toLowerCase();
  const letter = { '1': 'A', '2': 'B', '3': 'C', '4': 'D', a: 'A', b: 'B', c: 'C', d: 'D' }[k];
  if (letter && q.options.some(o => o.id === letter)) {
    if (S.mode === 'practice') answerPractice(q, letter);
    else { if (S.answers[id] === letter) delete S.answers[id]; else S.answers[id] = letter; saveSession(); render(); }
    e.preventDefault();
  } else if (S.mode === 'practice' && S.answers[id] && (k === 'enter' || k === 'arrowright')) {
    nextPractice(); e.preventDefault();
  } else if (S.mode === 'exam' && k === 'arrowright' && S.idx < S.ids.length - 1) { S.idx++; saveSession(); render(); }
  else if (S.mode === 'exam' && k === 'arrowleft' && S.idx > 0) { S.idx--; saveSession(); render(); }
});


// ---------------------------------------------------------------- THEORIE & LEREN
const ensureTheory = nums => Promise.all(nums.filter(n => chapters.find(c => c.n === n && c.theory)).map(theory.loadTheory));
const STATUS = { new: ['○', 'nog niet gelezen'], read: ['📖', 'gelezen'], busy: ['🟡', 'bezig'], done: ['✅', 'beheerst'] };

async function openTheory(chapter, secId, back) {
  const th = await theory.loadTheory(chapter);
  if (!th) { toast('Voor dit hoofdstuk is nog geen theorie toegevoegd.'); return; }
  if (theory.isVeron(chapter)) {
    T = { chapter, secId: secId || null, jump: !!secId, back: back || 'learn' };
    setView('theory');
    return;
  }
  let sid = secId || th.sections[0].id;
  if (th.groups.has(sid)) sid = (childrenOf(th, sid)[0] || {}).id || sid;   // een paragraaf-kop opent bij zijn eerste subparagraaf
  T = { chapter, secId: sid, back: back || (view === 'theory' ? (T && T.back) || 'learn' : view) };
  setView('theory');
}

function theoryLinks(q, emphasize) {
  const secs = theory.sectionsOfQuestion(q.id);
  if (!secs.length) return null;
  return h('div', { class: 'tlinks' + (emphasize ? ' em' : '') },
    h('span', {}, emphasize ? '📖 Lees hierover: ' : '📖 Theorie: '),
    secs.map(s => h('button', { class: 'linklike', onclick: () => openTheory(q.chapter, s.id, view) }, s.title)));
}

function formulaBtn(chapter) {
  const th = theory.getTheory(chapter);
  if (!th || !(th.formulas || []).length) return null;
  return h('button', { class: 'ghost small', onclick: () => showFormulas(chapter) }, 'Formules');
}

function showFormulas(chapter) {
  const th = theory.getTheory(chapter);
  if (!th) return;
  $dlg.replaceChildren(
    h('div', { class: 'formulas' },
      h('h2', {}, `Formules · H${chapter}`),
      th.formulas.map(g => h('div', { class: 'fgroup' }, h('h3', {}, g.title),
        h('table', {}, h('tbody', {}, g.items.map(i => h('tr', {}, h('td', { class: 'f' }, i.f), h('td', { class: 'muted small' }, i.t))))))),
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:1rem' }, h('button', { class: 'primary', onclick: () => $dlg.close() }, 'Sluiten'))));
  $dlg.showModal();
}

async function startSectionPractice(chapter, secId) {
  const th = theory.getTheory(chapter);
  const ids = (th && th.qBySec.get(secId)) || [];
  if (!ids.length) { toast('Er zijn geen vragen aan deze paragraaf gekoppeld.'); return; }
  await quiz.loadChapter(chapter);
  const pool = ids.map(id => quiz.QMAP.get(id)).filter(Boolean);
  S = { mode: 'practice', ids: quiz.practiceOrder(pool, true), idx: 0, answers: {}, start: Date.now(), dur: 0, chapters: [chapter], label: th.bySec.get(secId).title };
  saveSession();
  setView('session');
}

function startChapterExam(chapter) {
  store.setPrefs({ sel: [chapter], mode: 'exam' });
  startSession();
}

/** Lijst met paragrafen + status + knoppen Lees/Oefen. */
function sectionRows(th, back) {
  return th.sections.map(s => {
    if (th.groups.has(s.id)) return h('div', { class: 'sec group' }, h('b', {}, s.title));
    const st = theory.sectionStats(th, s.id);
    const [icon, label] = STATUS[st.status];
    return h('div', { class: 'sec lvl' + s.lvl },
      h('span', { class: 'ic', title: label, 'aria-label': label }, icon),
      h('span', { class: 'tt' }, s.title,
        st.total ? h('span', { class: 'muted small' }, ` · ${st.mastered}/${st.total} beheerst`) : null),
      h('span', { class: 'btns' },
        h('button', { class: 'ghost small', onclick: () => openTheory(th.chapter, s.id, back) }, 'Lees'),
        st.total > 0 && h('button', { class: 'small', onclick: () => startSectionPractice(th.chapter, s.id) }, `Oefen ${st.total}`)));
  });
}


// ---------------------------------------------------------------- dagdoel, reeks en flashcards
// ---------------------------------------------------------------- heatmap (activiteit per dag)
let hmWeeks = 26;   // 13 | 26 | 52
const DAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const MND_KORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
function heatmapCard() {
  const counts = store.dayCounts();
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - (today.getDay() + 6) % 7 - (hmWeeks - 1) * 7);   // maandag van de eerste week
  const days = [];   // {d, k, c} van start t/m vandaag
  for (let i = 0; ; i++) { const d = new Date(start); d.setDate(start.getDate() + i); if (d > today) break; const k = store.dayKey(d.getTime()); days.push({ d, k, c: counts[k] || 0 }); }
  const total = days.reduce((a, x) => a + x.c, 0), active = days.filter(x => x.c > 0);
  const best = active.reduce((m, x) => (x.c > (m ? m.c : 0) ? x : m), null);
  const max = Math.max(1, best ? best.c : 1);
  const lvl = c => (c ? 1 + Math.min(3, Math.floor((c / max) * 3.999)) : 0);
  const label = x => `${DAGEN[(x.d.getDay() + 6) % 7]} ${x.d.getDate()} ${MND_KORT[x.d.getMonth()]} ${x.d.getFullYear()}: ${x.c ? x.c + ' geoefend' : 'niets gedaan'}`;
  const det = h('p', { class: 'small muted hm-det', 'aria-live': 'polite' }, best ? `Drukste dag: ${label(best)}. Tik op een vakje voor de details.` : 'Nog geen activiteit in deze periode.');
  let selEl = null;
  const cells = [], months = [];
  days.forEach((x, i) => {
    const col = Math.floor((i + (start.getDay() === 1 ? 0 : 0)) / 7);   // start is altijd een maandag
    const el = h('span', { class: 'hc l' + lvl(x.c) + (x.k === store.dayKey() ? ' today' : ''), title: label(x),
      onclick: () => { if (selEl) selEl.classList.remove('sel'); selEl = el; el.classList.add('sel'); det.textContent = label(x); } });
    cells.push(el);
    if (x.d.getDate() <= 7 && (x.d.getDay() + 6) % 7 === 0 || (i === 0)) months.push(h('span', { class: 'hm-m', style: `grid-column:${col + 1}` }, MND_KORT[x.d.getMonth()]));
  });
  // gemiddelde per weekdag over de getoonde periode (dagen zonder activiteit tellen mee)
  const wd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }));
  days.forEach(x => { const w = wd[(x.d.getDay() + 6) % 7]; w.sum += x.c; w.n++; });
  const avg = wd.map(w => (w.n ? w.sum / w.n : 0)), amax = Math.max(0.0001, ...avg);
  const wrap = h('div', { class: 'hm-wrap' },
    h('div', { class: 'hm', style: `--wk:${hmWeeks}` },
      h('div', { class: 'hm-months' }, ...months),
      h('div', { class: 'hm-grid' }, ...cells)));
  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });
  return h('section', { class: 'card' },
    h('div', { class: 'row between' }, h('h2', {}, 'Activiteit'),
      h('div', { class: 'row hm-range', role: 'group', 'aria-label': 'Periode' },
        [[13, '3 mnd'], [26, '6 mnd'], [52, '12 mnd']].map(([w, t]) => h('button', { class: 'ghost small' + (hmWeeks === w ? ' on' : ''), 'aria-pressed': String(hmWeeks === w), onclick: () => { hmWeeks = w; render(); } }, t)))),
    h('p', { class: 'small muted', style: 'margin:.2rem 0 .6rem' }, 'Elke dag is een vakje: hoe donkerder groen, hoe meer vragen en kaarten je die dag deed.'),
    wrap,
    h('div', { class: 'hm-legend small muted' }, 'minder', ...[0, 1, 2, 3, 4].map(l => h('i', { class: 'hc l' + l })), 'meer'),
    det,
    h('div', { class: 'cards' },
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(active.length)), h('div', { class: 'k' }, `actieve dagen van ${days.length}`)),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, String(total)), h('div', { class: 'k' }, 'geoefend in totaal')),
      h('div', { class: 'stat' }, h('div', { class: 'n' }, active.length ? String(Math.round(total / active.length)) : '–'), h('div', { class: 'k' }, 'gemiddeld per actieve dag'))),
    h('h3', { style: 'margin:1rem 0 .4rem' }, 'Gemiddeld per weekdag'),
    h('div', { class: 'wd' }, avg.map((a, i) => h('div', { class: 'wd-c', title: `${DAGEN[i]}: gemiddeld ${a.toFixed(1).replace('.', ',')} per dag` },
      h('span', { class: 'wd-n small muted' }, a < 10 ? a.toFixed(1).replace('.', ',') : String(Math.round(a))),
      h('span', { class: 'wd-b' }, h('i', { style: `height:${Math.max(2, Math.round(a / amax * 100))}%` })),
      h('span', { class: 'small muted' }, DAGEN[i].slice(0, 2))))));
}

let calOpen = false;
let calOff = 0;   // maanden terug t.o.v. nu
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function goalCard() {
  const counts = store.dayCounts();
  const st = store.streak(), best = store.bestStreak(), n = store.todayCount();
  const now = new Date(); const m = new Date(now.getFullYear(), now.getMonth() - calOff, 1);
  const first = (m.getDay() + 6) % 7;                       // maandag = 0
  const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const max = Math.max(1, ...Object.values(counts));
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(h('span', { class: 'cd empty' }));
  for (let d = 1; d <= dim; d++) {
    const k = store.dayKey(new Date(m.getFullYear(), m.getMonth(), d, 12).getTime());
    const c = counts[k] || 0;
    const lvl = c ? 1 + Math.min(3, Math.floor((c / max) * 3.999)) : 0;
    cells.push(h('span', { class: `cd l${lvl}` + (k === store.dayKey() ? ' today' : ''), title: `${d} ${MAANDEN[m.getMonth()]}: ${c} geoefend` }, String(d)));
  }
  const strip = [];
  for (let i = 13; i >= 0; i--) {
    const k = store.dayKey(Date.now() - i * 86400000);
    const c = counts[k] || 0;
    strip.push(h('i', { class: 'dot' + (c ? ' on' : '') + (i === 0 ? ' today' : ''), title: `${k}: ${c} geoefend` }));
  }
  const head = h('div', { class: 'row between goal-line' },
    h('b', {}, st > 0 ? `🔥 ${st}` : '–', h('span', { class: 'small muted', style: 'font-weight:400' }, st > 0 ? (st === 1 ? ' dag' : ' dagen') + ' op rij' : ' geen reeks')),
    h('span', { class: 'dots' }, ...strip),
    h('button', { class: 'ghost small', 'aria-expanded': String(calOpen), 'aria-label': 'Kalender', onclick: () => { calOpen = !calOpen; render(); } }, calOpen ? '▴' : '▾'));
  if (!calOpen) return h('section', { class: 'goal compact' }, head);
  return h('section', { class: 'card goal' }, head,
    h('div', { class: 'row between cal-head' },
      h('button', { class: 'ghost small', 'aria-label': 'Vorige maand', onclick: () => { calOff++; render(); } }, '‹'),
      h('span', { class: 'small' }, `${MAANDEN[m.getMonth()]} ${m.getFullYear()}`),
      h('button', { class: 'ghost small', 'aria-label': 'Volgende maand', disabled: calOff === 0, onclick: () => { calOff--; render(); } }, '›')),
    h('div', { class: 'cal' }, ...['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(x => h('span', { class: 'cd hd' }, x)), ...cells),
    h('div', { class: 'small muted' }, `Vandaag: ${n} geoefend · beste reeks: ${best} ${best === 1 ? 'dag' : 'dagen'} · een dag telt zodra je minstens één vraag of kaart doet`));
}

const cardKey = (ch, c) => `hs${ch}:${c.id}`;
function cardStats(ch) {
  const th = theory.getTheory(ch); const cards = (th && th.cards) || [];
  let due = 0, fresh = 0, known = 0;
  for (const c of cards) {
    const r = store.cardRec(cardKey(ch, c));
    if (!r) { fresh++; due++; } else if (store.cardDue(cardKey(ch, c))) due++;
    if (r && r.b >= 3) known++;
  }
  return { total: cards.length, due, fresh, known };
}
function startCards(ch, all) {
  const th = theory.getTheory(ch);
  let list = (th.cards || []).filter(c => all || store.cardDue(cardKey(ch, c)));
  list = list.map(c => ({ c, r: Math.random() })).sort((x, y) => {
    const fx = store.cardRec(cardKey(ch, x.c)) ? 1 : 0, fy = store.cardRec(cardKey(ch, y.c)) ? 1 : 0;
    return fx - fy || x.r - y.r;     // eerst nieuwe, dan de rest door elkaar
  }).map(x => x.c);
  if (!list.length) return toast('Geen kaarten aan de beurt.');
  K = { chapter: ch, queue: list.slice(), idx: 0, flip: false, knew: 0, missed: 0, retried: new Set() };
  setView('cards');
}
function rateCard(knew) {
  const c = K.queue[K.idx], key = cardKey(K.chapter, c);
  store.recordCard(key, knew);
  if (knew) K.knew++; else { K.missed++; if (!K.retried.has(c.id)) { K.retried.add(c.id); K.queue.push(c); } }
  K.idx++; K.flip = false;
  render();
}
let cardKeysBound = false;
function bindCardKeys() {
  if (cardKeysBound) return; cardKeysBound = true;
  document.addEventListener('keydown', e => {
    if (view !== 'cards' || !K || K.idx >= K.queue.length || e.target.closest('input,select,textarea,dialog')) return;
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!K.flip) { K.flip = true; render(); } }
    else if (K.flip && (e.key === 'ArrowRight' || e.key === '2')) rateCard(true);
    else if (K.flip && (e.key === 'ArrowLeft' || e.key === '1')) rateCard(false);
  });
}
function viewCards() {
  bindCardKeys();
  if (!K) return viewLearn();
  const th = theory.getTheory(K.chapter);
  const back = h('button', { class: 'ghost', onclick: () => { K = null; setView('learn'); } }, '← Leren');
  if (K.idx >= K.queue.length) {
    const cs = cardStats(K.chapter);
    return h('div', {}, back, h('h1', {}, 'Kaarten klaar'),
      h('section', { class: 'card' },
        h('p', {}, `${K.knew}× “weet ik”, ${K.missed}× “nog niet”.`),
        h('p', { class: 'muted' }, cs.due ? `Nog ${cs.due} kaarten aan de beurt.` : 'Alle kaarten zijn voor nu gedaan. Kaarten die je kent komen vanzelf terug (na 1, 3, 7, 14, 30 dagen).'),
        goalCard(),
        h('div', { class: 'row' }, cs.due > 0 && h('button', { class: 'primary', onclick: () => startCards(K.chapter, false) }, 'Verder met kaarten'),
          h('button', { onclick: () => startCards(K.chapter, true) }, 'Alle kaarten oefenen'),
          h('button', { class: 'ghost', onclick: () => { K = null; setView('learn'); } }, 'Terug'))));
  }
  const c = K.queue[K.idx];
  const sec = th.sections.find(x => x.id === c.sec);
  return h('div', {}, back,
    h('div', { class: 'row between' }, h('b', {}, `Kaart ${K.idx + 1} van ${K.queue.length}`), sec && h('span', { class: 'badge' }, sec.title)),
    h('div', { class: 'bar', style: 'margin:.5rem 0' }, h('i', { class: 'seen', style: `width:${pct(K.idx, K.queue.length)}%` })),
    h('div', { class: 'flash' + (K.flip ? ' flipped' : ''), role: 'button', tabindex: '0', 'aria-label': K.flip ? 'Antwoord' : 'Toon antwoord',
      onclick: () => { if (!K.flip) { K.flip = true; render(); } } },
      h('div', { class: 'fq' }, c.q),
      K.flip ? h('div', { class: 'fa' }, c.a) : h('div', { class: 'hint muted small' }, 'Tik om het antwoord te tonen (spatie)')),
    K.flip && h('div', { class: 'row rate' },
      h('button', { class: 'danger', onclick: () => rateCard(false) }, 'Nog niet'),
      h('button', { class: 'primary', onclick: () => rateCard(true) }, 'Weet ik')),
    K.flip && sec && h('p', {}, h('button', { class: 'ghost small', onclick: () => openTheory(K.chapter, sec.id, 'cards') }, 'Lees de theorie hierover')),
    h('div', { class: 'small muted' }, `Vandaag: ${store.todayCount()} geoefend`));
}

// ---------------------------------------------------------------- formule-spel
const FG_LEN = 10;
const fgKey = (ch, it) => `hs${ch}:f:${it.id}`;
function fgUnlocked(ch) {
  const th = theory.getTheory(ch);
  return (th.drill || []).filter(it => { const st = theory.sectionStats(th, it.sec); return st.read || st.seen > 0; });
}
/** Formules waar minstens één vraag uit de vragenbank (de examenpool) over gaat; zie tools/map_drill.py. */
function fgExamItems(ch) {
  const th = theory.getTheory(ch);
  return (th.drill || []).filter(it => it.exam && it.exam.length);
}
function fgPool(ch) {
  const th = theory.getTheory(ch);
  let pool = th.drill;
  if (FG.exam) { const e = fgExamItems(ch); if (e.length) pool = e; }
  if (FG.onlyRead) { const ids = new Set(fgUnlocked(ch).map(i => i.id)); const r = pool.filter(i => ids.has(i.id)); if (r.length) pool = r; }
  return pool;
}
function fgBest(ch) { try { return (JSON.parse(localStorage.getItem('flic.fbest')) || {})[ch] || 0; } catch { return 0; } }
function fgSaveBest(ch, score) { try { const b = JSON.parse(localStorage.getItem('flic.fbest')) || {}; if (score > (b[ch] || 0)) { b[ch] = score; localStorage.setItem('flic.fbest', JSON.stringify(b)); return true; } } catch { /* negeren */ } return false; }
async function openFormulaGame(ch) {
  try { await quiz.loadChapter(ch); } catch { /* zonder vragen: geen examenfilter */ }
  const un = fgUnlocked(ch);
  FG = { chapter: ch, stage: 'start', onlyRead: un.length >= 3, lives: true, mode: 'mix', exam: false };
  setView('fgame');
}
function fgStart() {
  const th = theory.getTheory(FG.chapter);
  const pool = fgPool(FG.chapter);
  Object.assign(FG, { stage: 'play', pool, all: th.drill, n: 0, hearts: FG.lives ? 3 : null, score: 0, combo: 0, bestCombo: 0, ok: 0, helped: 0, missed: new Map(), recent: [], cur: null, picked: null });
  fgNext();
  render();
}
const pickOf = arr => arr[Math.floor(Math.random() * arr.length)];
function fgNext() {
  const now = Date.now();
  const w = FG.pool.map(it => { const r = store.cardRec(fgKey(FG.chapter, it)); return !r ? 4 : r.d <= now ? 3 : 1; });
  const cand = FG.pool.filter(it => FG.pool.length < 4 || !FG.recent.includes(it.id));
  let sum = 0; const ws = cand.map(it => { const x = w[FG.pool.indexOf(it)]; sum += x; return x; });
  let r = Math.random() * sum, item = cand[cand.length - 1];
  for (let i = 0; i < cand.length; i++) { r -= ws[i]; if (r <= 0) { item = cand[i]; break; } }
  FG.recent = [item.id, ...FG.recent].slice(0, 2);
  const has = k => FG.pool.filter(it => it[k] && (!Array.isArray(it[k]) || it[k].length)), hasAll = k => FG.all.filter(it => it[k] && (!Array.isArray(it[k]) || it[k].length));
  const choose = list => { const r = pickOf(list.filter(it => !FG.recent.includes(it.id)).concat(list.length < 3 ? list : [])) || list[0]; FG.recent = [r.id, ...FG.recent].slice(0, 3); return r; };
  if (FG.mode === 'units' || (FG.mode === 'mix' && Math.random() < 0.12)) FG.cur = drill.unitQuestion();
  else if (FG.mode === 'rewrite') { const l = has('rewrite'); FG.cur = drill.makeQuestion(choose(l.length ? l : hasAll('rewrite')), FG.all, 'rewrite'); }
  else if (FG.mode === 'calc') { const l = has('gen'); FG.cur = drill.makeQuestion(choose(l.length ? l : hasAll('gen')), FG.all, 'calc'); }
  else if (FG.mode === 'pick') { const l = has('gen').filter(it => it.f); FG.cur = drill.makeQuestion(choose(l.length ? l : hasAll('gen').filter(it => it.f)), FG.all, 'pick'); }
  else if (FG.mode === 'build') { const l = FG.pool.filter(drill.buildable); FG.cur = drill.makeBuild(choose(l.length ? l : FG.all.filter(drill.buildable)), FG.all); }
  else if (FG.mode === 'know') FG.cur = drill.makeQuestion(item, FG.all, ['name', 'where', 'cloze']);
  else FG.cur = drill.makeQuestion(item, FG.all);
  FG.picked = null;
}
function fgPeek() {
  if (FG.picked != null) return showFormulaOrPrefix();
  if (!FG.cur.peeked) { FG.cur.peeked = true; render(); }
  showFormulaOrPrefix();
}
function showFormulaOrPrefix() {
  if (FG.cur.type !== 'units') return showFormulas(FG.chapter);
  $dlg.replaceChildren(h('div', { class: 'formulas' }, h('h2', {}, 'Voorvoegsels'),
    h('table', {}, h('tbody', {}, [['G', 'giga', '10⁹ (× 1.000.000.000)'], ['M', 'mega', '10⁶ (× 1.000.000)'], ['k', 'kilo', '10³ (× 1000)'], ['', '(geen)', '1'], ['m', 'milli', '10⁻³ (÷ 1000)'], ['µ', 'micro', '10⁻⁶ (÷ 1.000.000)'], ['n', 'nano', '10⁻⁹ (÷ 1.000.000.000)'], ['p', 'pico', '10⁻¹²']].map(r => h('tr', {}, h('td', { class: 'f' }, r[0] || '—'), h('td', {}, r[1]), h('td', { class: 'muted small' }, r[2]))))),
    h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:1rem' }, h('button', { class: 'primary', onclick: () => $dlg.close() }, 'Sluiten'))));
  $dlg.showModal();
}
function fgAnswer(i) {
  if (FG.picked != null) return;
  const q = FG.cur, o = q.options[i]; FG.picked = i;
  const tp = q.tips || 0, helped = !!q.peeked || tp > 0;
  // Met hulp (formulelijst) goed: maar 5 punten, geen bonus, reeks blijft staan; telt voor het herhaalschema als "nog niet gekend".
  store.recordCard(fgKey(FG.chapter, q.item), o.ok && !helped);
  q.points = 0;
  if (o.ok && helped) { FG.ok++; FG.helped = (FG.helped || 0) + 1; q.points = q.hints ? [10, 8, 6, 4, 3][tp] : 5; FG.score += q.points; }
  else if (o.ok) { FG.ok++; FG.combo++; FG.bestCombo = Math.max(FG.bestCombo, FG.combo); q.points = 10 + 2 * Math.min(FG.combo, 10); FG.score += q.points; }
  else { FG.combo = 0; if (FG.hearts != null) FG.hearts--; FG.missed.set(q.item.id, q.item); if (helped) FG.helped = (FG.helped || 0) + 1; }
  render();
}
// ---- formule bouwen
const fgAccepted = q => [q.item.f, ...(q.item.rewrite || []).map(r => r.a)].map(drill.formulaTokens).filter(Boolean);
function fgBuildFinish(ok, giveUp) {
  const q = FG.cur, b = q.build; FG.picked = 0; q.ok = ok; q.points = 0;
  store.recordCard(fgKey(FG.chapter, q.item), ok && b.tips === 0 && b.wrong === 0);
  if (ok) {
    FG.ok++;
    if (b.tips === 0 && b.wrong === 0) { FG.combo++; FG.bestCombo = Math.max(FG.bestCombo, FG.combo); q.points = 10 + 2 * Math.min(FG.combo, 10); }
    else { FG.helped = (FG.helped || 0) + 1; q.points = Math.max(2, [10, 7, 4][Math.min(2, b.tips)] - 2 * b.wrong); }
    FG.score += q.points;
  } else {
    FG.combo = 0; FG.missed.set(q.item.id, q.item);
    if (!giveUp && FG.hearts != null) FG.hearts--;   // de uitwerking vragen kost geen leven, drie keer fout wel
  }
  render();
}
function fgBuildCheck() {
  const q = FG.cur, b = q.build, mine = b.placed.map(i => b.tiles[i].t);
  if (fgAccepted(q).some(a => drill.sameFormula(a, mine))) return fgBuildFinish(true);
  b.wrong++; b.msg = 'Nog niet helemaal. Kijk nog eens naar de volgorde en de blokjes.';
  if (b.wrong >= 3) { b.placed = fgBuildSolution(q); return fgBuildFinish(false); }
  render();
}
function fgBuildSolution(q) {   // de blokjes in de goede volgorde
  const b = q.build, used = new Set(), ids = [];
  for (const t of b.tokens) { const k = b.tiles.find(x => x.t === t && !used.has(x.id)); used.add(k.id); ids.push(k.id); }
  return ids;
}
function fgBuildTip() {
  const q = FG.cur, b = q.build; if (FG.picked != null || b.tips >= q.hints.length) return;
  b.tips++; b.msg = '';
  if (b.tips === 2) {   // het eerste deel van de formule alvast neerleggen
    const sol = fgBuildSolution(q), k = Math.ceil(sol.length / 2);
    b.placed = sol.slice(0, k); b.locked = k;
  }
  if (b.tips === 3) { b.placed = fgBuildSolution(q); return fgBuildFinish(false, true); }
  render();
}
function fgTip() {
  const q = FG.cur; if (FG.picked != null || (q.tips || 0) >= q.hints.length) return;
  q.tips = (q.tips || 0) + 1; render();
}
function fgAfter() {
  FG.n++;
  if (FG.n >= FG_LEN || (FG.hearts != null && FG.hearts <= 0)) { FG.stage = 'end'; FG.record = fgSaveBest(FG.chapter, FG.score); }
  else fgNext();
  render();
}
let fgKeysBound = false;
function bindFgKeys() {
  if (fgKeysBound) return; fgKeysBound = true;
  document.addEventListener('keydown', e => {
    if (view !== 'fgame' || !FG || FG.stage !== 'play' || e.target.closest('input,select,textarea,dialog,.tpanel') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (FG.picked == null && FG.cur.options && /^[1-4]$/.test(e.key) && FG.cur.options[+e.key - 1] && !(FG.cur.tips >= 4 && FG.cur.elim && FG.cur.elim.includes(FG.cur.options[+e.key - 1].text))) fgAnswer(+e.key - 1);
    else if (FG.picked != null && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) { e.preventDefault(); fgAfter(); }
  });
}
function viewFGame() {
  bindFgKeys();
  if (!FG) return viewLearn();
  const ch = FG.chapter, th = theory.getTheory(ch);
  const back = h('button', { class: 'ghost', onclick: () => { FG = null; setView('learn'); } }, '← Leren');
  if (FG.stage === 'start') {
    const un = fgUnlocked(ch), total = th.drill.length, exN = fgExamItems(ch).length;
    const avail = fgPool(ch).length;
    const modes = [
      ['mix', '🎲 Alles door elkaar', 'Van alles wat: formules herkennen, invullen, omwerken en rekenen. Het meest afwisselend; dit is de standaard.', 'Welke formule hoort bij “Wet van Ohm”?'],
      ['know', '🧠 Formules kennen', 'Alleen herkennen en invullen, zonder rekenen. Goed om de formules en waar ze bij horen te leren.', 'P = I² · ___  →  R'],
      ['pick', '🧭 Welke formule?', 'Je krijgt een opgave en moet zelf bedenken welke formule erbij hoort, zonder dat de formule er al staat. Met tips die je stap voor stap krijgt als je vastloopt.', '12 V over 470 Ω: welke formule los je dit mee op?'],
      ['build', '🧩 Formule bouwen', 'Je krijgt alleen de naam en bouwt de formule zelf uit losse blokjes, met een paar blokjes te veel. Tips: waar het over gaat, het begin, en als laatste de uitwerking.', 'Bouw: Wet van Ohm  →  U = I · R'],
      ['calc', '🧮 Rekenen', 'Alleen rekenopgaven met willekeurige getallen. Gebruik je rekenmachine, net als op het examen.', '12 V over 470 Ω, hoe groot is de stroom?'],
      ['rewrite', '🔁 Omwerken', 'Een formule omschrijven naar een andere grootheid. Hier lopen veel cursisten op vast.', 'P = U² / R  →  U = ?'],
      ['units', '📏 Eenheden omrekenen', 'Omrekenen tussen mA, A, µA, kΩ, MΩ enzovoort. Dit gaat niet over een bepaald hoofdstuk.', '4,7 kΩ = ? Ω'],
    ];
    const cur = modes.find(m => m[0] === FG.mode);
    return h('div', {}, back, h('h1', {}, `Formule-spel · H${ch}`),
      h('section', { class: 'card' },
        h('h2', {}, 'Wat is dit?'),
        h('p', {}, 'Een spel van 10 vragen om de formules van dit hoofdstuk echt te onthouden, en te weten waar ze bij horen en hoe je ze gebruikt. Per goed antwoord krijg je 10 punten, met een bonus als je meerdere goede antwoorden achter elkaar hebt.'),
        h('p', { class: 'muted small' }, '📋 Even twijfelen? Je kunt tijdens een vraag de formulelijst bekijken, maar dan levert een goed antwoord maar 5 punten op, zonder bonus. Je rekenmachine en kladblok (rechtsonder) mag je altijd gebruiken. Formules die je vaak fout hebt komen vaker terug, en elke ronde telt mee voor je reeks.')),
      h('section', { class: 'card' },
        h('h2', {}, '1. Wat wil je oefenen?'),
        h('div', { class: 'fmodes', role: 'radiogroup' }, modes.map(([v, t, d, ex]) =>
          h('label', { class: 'mode' },
            h('input', { type: 'radio', name: 'fgmode', value: v, checked: FG.mode === v, onchange: () => { FG.mode = v; render(); } }),
            h('b', {}, t), h('span', { class: 'muted small' }, d), h('span', { class: 'ex' }, 'Voorbeeld: ' + ex))))),
      h('section', { class: 'card' },
        h('h2', {}, '2. Opties'),
        FG.mode !== 'units' && exN > 0 && h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: FG.exam, onchange: e => { FG.exam = e.target.checked; render(); } }),
          h('span', { class: 't' }, h('b', {}, '🎯 Alleen examenstof'), h('br'), h('span', { class: 'muted small' }, `Alleen formules waar vragen uit de examenpool over gaan (${exN} van ${total}). Formules die in geen enkele vraag voorkomen, slaan we over.`))),
        FG.mode !== 'units' && h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: FG.onlyRead, onchange: e => { FG.onlyRead = e.target.checked; render(); } }),
          h('span', { class: 't' }, h('b', {}, 'Alleen wat ik al heb behandeld'), h('br'), h('span', { class: 'muted small' }, 'Formules uit paragrafen die je hebt gelezen of geoefend. Uit = alle formules van het hoofdstuk.'))),
        FG.mode !== 'units' && FG.onlyRead && un.length === 0 && h('p', { class: 'notice' }, 'Je hebt in dit hoofdstuk nog geen paragraaf gelezen of geoefend, dus je krijgt voorlopig alle formules.'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: FG.lives, onchange: e => { FG.lives = e.target.checked; render(); } }),
          h('span', { class: 't' }, h('b', {}, 'Spelen met 3 levens'), h('br'), h('span', { class: 'muted small' }, 'Bij drie fouten is de ronde afgelopen. Uit = rustig oefenen, altijd 10 vragen.')))),
      h('section', { class: 'card' },
        h('p', {}, h('b', {}, cur[1]), ` · 10 vragen · ${FG.mode === 'units' ? 'alle voorvoegsels' : `${avail} van ${total} formules`} · ${FG.lives ? '3 levens' : 'zonder levens'}`,
          fgBest(ch) ? ` · jouw record: ${fgBest(ch)} punten` : ''),
        h('div', { class: 'row' }, h('button', { class: 'primary', onclick: fgStart }, '🎮 Start'))));
  }
  if (FG.stage === 'end') {
    const missed = [...FG.missed.values()];
    return h('div', {}, back, h('h1', {}, FG.hearts != null && FG.hearts <= 0 ? 'Geen levens meer' : 'Ronde klaar'),
      h('section', { class: 'card' },
        h('div', { class: 'cards' },
          h('div', { class: 'stat' }, h('div', { class: 'n' }, String(FG.score)), h('div', { class: 'k' }, 'punten')),
          h('div', { class: 'stat' }, h('div', { class: 'n' }, `${FG.ok}/${FG.n}`), h('div', { class: 'k' }, 'goed')),
          h('div', { class: 'stat' }, h('div', { class: 'n' }, String(FG.bestCombo)), h('div', { class: 'k' }, 'beste reeks'))),
        FG.helped > 0 && h('p', { class: 'muted small' }, `Formulelijst gebruikt bij ${FG.helped} vraag${FG.helped === 1 ? '' : 'en'} (halve punten).`),
        FG.record && h('p', {}, '🏆 Nieuw record!'),
        !FG.record && fgBest(ch) > 0 && h('p', { class: 'muted' }, `Jouw record: ${fgBest(ch)} punten.`),
        missed.length > 0 && h('div', {}, h('h3', {}, 'Nog even herhalen'),
          h('table', {}, h('tbody', {}, missed.map(it => h('tr', {}, h('td', {}, it.name), h('td', { class: 'f' }, it.f || ''),
            h('td', {}, h('button', { class: 'ghost small', onclick: () => openTheory(ch, it.sec, 'fgame') }, 'Theorie'))))))),
        missed.length === 0 && h('p', {}, 'Foutloos! 🎉'),
        h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'primary', onclick: fgStart }, 'Nog een ronde'),
          h('button', { class: 'ghost', onclick: () => { FG.stage = 'start'; render(); } }, 'Opties'))));
  }
  const q = FG.cur, answered = FG.picked != null, ok = answered && (q.build ? q.ok : q.options[FG.picked].ok);
  const elim = t => !answered && q.elim && (q.tips || 0) >= 4 && q.elim.includes(t);
  const opts = (q.options || []).map((o, i) => {
    let cls = 'opt';
    if (answered) cls += o.ok ? ' right' : (i === FG.picked ? ' wrong' : ' dim');
    else if (elim(o.text)) cls += ' dim';
    return h('button', { class: cls, disabled: answered || elim(o.text), onclick: () => fgAnswer(i) },
      h('span', { class: 'l' }, String(i + 1)), h('span', { class: 'tx' + (q.mono ? ' f' : '') }, o.text));
  });
  const b = q.build, hinted = q.hints && !answered;
  const tipsLeft = q.hints ? q.hints.length - (b ? b.tips : (q.tips || 0)) : 0;
  const shown = q.hints ? q.hints.slice(0, b ? Math.min(b.tips, 2) : (q.tips || 0)) : [];
  const tipBox = q.hints && (shown.length > 0 || hinted) && h('div', { class: 'tips' },
    shown.map(t => h('p', { class: 'tip' }, '💡 ' + t)),
    hinted && tipsLeft > 0 && h('button', { class: 'ghost small', onclick: b ? fgBuildTip : fgTip },
      b && b.tips === 2 ? '🏳️ Toon de uitwerking (0 punten)' : `💡 Geef me een tip (${shown.length === 0 ? 'eerste' : 'volgende'})`),
    hinted && h('span', { class: 'muted small' }, shown.length ? '  Met tips levert een goed antwoord minder punten op.' : '  Lukt het niet? Een tip kost een paar punten.'));
  const tileUI = b && h('div', {},
    h('div', { class: 'built', 'aria-label': 'Jouw formule' },
      b.placed.length ? b.placed.map((id, i) => h('button', { class: 'tile placed' + (i < b.locked ? ' lock' : '') + (answered ? (ok ? ' good' : ' bad') : ''), disabled: answered || i < b.locked, 'aria-label': `${b.tiles[id].t} verwijderen`,
        onclick: () => { b.placed.splice(i, 1); b.msg = ''; render(); } }, b.tiles[id].t))
        : h('span', { class: 'muted small' }, 'Tik op de blokjes hieronder om de formule op te bouwen.')),
    !answered && h('div', { class: 'tiles', role: 'group', 'aria-label': 'Blokjes' },
      b.tiles.filter(t => !b.placed.includes(t.id)).map(t => h('button', { class: 'tile', onclick: () => { b.placed.push(t.id); b.msg = ''; render(); } }, t.t))),
    !answered && b.msg && h('p', { class: 'notice', role: 'status' }, b.msg),
    !answered && h('div', { class: 'row', style: 'margin-top:.6rem' },
      h('button', { class: 'primary', disabled: b.placed.length < 3, onclick: fgBuildCheck }, 'Controleer'),
      h('button', { class: 'ghost', disabled: b.placed.length <= b.locked, onclick: () => { b.placed.length = b.locked; b.msg = ''; render(); } }, 'Wis'),
      b.wrong > 0 && h('span', { class: 'muted small' }, `Poging ${b.wrong + 1} van 3`)));
  const last = FG.n + 1 >= FG_LEN || (FG.hearts != null && FG.hearts <= 1 && answered && !ok);
  const next = h('button', { class: 'primary', onclick: fgAfter }, last ? 'Afronden' : 'Volgende →');
  if (answered) queueMicrotask(() => next.focus({ preventScroll: true }));
  return h('div', {}, back,
    h('div', { class: 'row between', style: 'margin:.4rem 0' },
      h('b', {}, `Vraag ${FG.n + 1} van ${FG_LEN}`, h('span', { class: 'muted small' }, ' · ' + ({ mix: 'door elkaar', know: 'formules kennen', pick: 'welke formule', build: 'formule bouwen', calc: 'rekenen', rewrite: 'omwerken', units: 'eenheden' }[FG.mode]))),
      h('span', {}, FG.hearts != null ? '❤️'.repeat(Math.max(0, FG.hearts)) + '🖤'.repeat(Math.max(0, 3 - FG.hearts)) : ''),
      h('span', { class: 'badge' + (FG.combo >= 3 ? ' blue' : '') }, FG.combo >= 2 ? `🔥 ${FG.combo}× · ${FG.score}` : `${FG.score} punten`)),
    h('div', { class: 'progress' }, h('i', { style: `width:${pct(FG.n + (answered ? 1 : 0), FG_LEN)}%` })),
    h('div', { class: 'card', style: 'margin-top:1rem' },
      q.tag && h('p', { class: 'muted small', style: 'margin:0 0 .4rem' }, q.tag),
      q.sub && h('p', { class: 'muted small', style: 'margin:0 0 .4rem' }, q.calc ? `🧮 Rekenen · ${q.sub}` : q.sub),
      h('p', { class: 'stem' }, q.prompt, b && h('b', {}, ' ' + `“${q.item.name}”`)),
      q.ask && h('p', { class: 'stem', style: 'font-weight:600' }, q.ask),
      q.formula && h('div', { class: 'bigf' }, q.formula),
      b ? tileUI : h('div', { class: 'opts', role: 'group', 'aria-label': 'Antwoordopties' }, opts),
      tipBox,
      !answered && !q.hints && h('p', { style: 'margin:.8rem 0 0' }, h('button', { class: 'ghost small', onclick: fgPeek },
        q.type === 'units' ? '📋 Voorvoegsels bekijken (halve punten)' : '📋 Formulelijst bekijken (halve punten)'),
        q.peeked && h('span', { class: 'muted small' }, '  Hulp gebruikt: dit antwoord levert maximaal 5 punten op.')),
      answered && h('div', { class: 'banner ' + (ok ? 'ok' : 'no'), role: 'status' }, ok ? '✅ Goed!' : (b && b.tips >= 3 ? '🏳️ Dit is de uitwerking.' : '❌ Niet goed.'), ' ', q.explain,
        ok ? ` (+${q.points} punten${q.peeked || q.tips || (b && (b.tips || b.wrong)) ? ', met hulp' : ''})` : ''),
      answered && h('p', { style: 'margin:.5rem 0 0' }, h('button', { class: 'ghost small', onclick: showFormulaOrPrefix }, q.type === 'units' ? '📋 Voorvoegsels' : '📋 Formulelijst')),
      answered && !ok && q.type !== 'units' && h('p', {}, h('button', { class: 'ghost small', onclick: () => openTheory(ch, q.item.sec, 'fgame') }, 'Lees de theorie hierover')),
      h('div', { class: 'actions' }, answered && next)));
}

// ---------------------------------------------------------------- Leren: keuzemenu per hoofdstuk en (sub)paragraaf
const learnOpen = new Set();   // uitgeklapte hoofdstukken in het keuzemenu
const learnChapters = () => (LB === 'veron' ? veronChapters : chapters).filter(c => c.theory && theory.getTheory(c.n));
const readable = th => th.sections.filter(s => !th.groups.has(s.id) && s.text);
const secKey = (n, sid) => `${n}:${sid}`;

/** Onderliggende subparagrafen van een paragraaf-kop (groep). */
function childrenOf(th, gid) {
  const i = th.sections.findIndex(s => s.id === gid);
  const out = [];
  for (let k = i + 1; k < th.sections.length && th.sections[k].lvl === 2; k++) out.push(th.sections[k]);
  return out;
}

function learnSel() {
  const p = store.getPrefs();
  const k = LB === 'veron' ? 'learnSelVeron' : 'learnSel';
  if (Array.isArray(p[k])) return new Set(p[k]);
  return new Set(learnChapters().flatMap(c => readable(theory.getTheory(c.n)).map(s => secKey(c.n, s.id))));
}
const saveLearnSel = sel => { store.setPrefs({ [LB === 'veron' ? 'learnSelVeron' : 'learnSel']: [...sel] }); render(); };

/** Gekozen paragrafen in leesvolgorde. */
function learnSeq(sel) {
  return learnChapters().flatMap(c => readable(theory.getTheory(c.n)).filter(s => sel.has(secKey(c.n, s.id))).map(s => secKey(c.n, s.id)));
}

/** Theorievragen die bij de keuze horen: opgaven bij een gekozen paragraaf, of (staan ze achteraan) bij een gekozen hoofdstuk. */
function learnOpgaven(sel) {
  const out = [];
  for (const c of learnChapters()) {
    const th = theory.getTheory(c.n);
    const any = readable(th).some(s => sel.has(secKey(c.n, s.id)));
    for (const o of th.opgaven || []) {
      const ids = o.sec ? [o.sec, ...childrenOf(th, o.sec).map(s => s.id)] : null;
      if (ids ? ids.some(id => sel.has(secKey(c.n, id))) : any) out.push({ ch: c.n, o });
    }
  }
  return out;
}

function startLearning(sel) {
  const seq = learnSeq(sel);
  if (!seq.length) return;
  if (LB === 'veron') {
    const chs = [...new Set(seq.map(k => k.split(':')[0]))];
    const first = chs.find(n => !chapterRead(n)) || chs[0];
    T = { chapter: first, secId: null, back: 'learn', seq: chs };
    setView('theory');
    return;
  }
  const first = seq.find(k => { const [n, sid] = k.split(':'); return !store.isRead(theory.readKey(theory.chapterKey(n), sid)); }) || seq[0];
  const [n, sid] = first.split(':');
  T = { chapter: theory.chapterKey(n), secId: sid, back: 'learn', seq };
  setView('theory');
}

function startOpgaven(list) {
  if (!list.length) return;
  OP = { list, idx: 0, shown: false, done: [] };
  setView('opg');
}

function learnChapterRow(c, sel) {
  const th = theory.getTheory(c.n);
  const secs = readable(th);
  const keys = secs.map(s => secKey(c.n, s.id));
  const nSel = keys.filter(k => sel.has(k)).length;
  const nRead = secs.filter(s => store.isRead(theory.readKey(c.n, s.id))).length;
  const open = learnOpen.has(c.n);
  const setAll = (ks, on) => { ks.forEach(k => on ? sel.add(k) : sel.delete(k)); saveLearnSel(sel); };
  const cb = h('input', { type: 'checkbox', checked: nSel === keys.length, onchange: e => setAll(keys, e.target.checked) });
  cb.indeterminate = nSel > 0 && nSel < keys.length;
  const nOpg = (th.opgaven || []).length;
  if (theory.isVeron(c.n)) {
    // VERON lees je per hoofdstuk: één regel met keuzevakje en een Lees-knop
    return h('div', { class: 'lchap' }, h('div', { class: 'lchap-head' },
      h('label', { class: 'check' }, cb,
        h('span', { class: 't' }, h('b', {}, chLabel(c.n)), ' · ', c.title),
        h('span', { class: 'badge' + (nRead === keys.length ? ' green' : ''), title: 'Gelezen paragrafen' }, nRead === keys.length ? '✓ gelezen' : `${nRead}/${keys.length} gelezen`)),
      h('button', { class: 'ghost small', onclick: () => openTheory(c.n, null, 'learn') }, 'Lees')));
  }
  const head = h('div', { class: 'lchap-head' },
    h('label', { class: 'check' }, cb,
      h('span', { class: 't' }, h('b', {}, chLabel(c.n)), ' · ', c.title),
      nSel > 0 && nSel < keys.length && h('span', { class: 'badge blue' }, `${nSel} van ${keys.length} gekozen`),
      h('span', { class: 'badge', title: 'Gelezen (sub)paragrafen' }, `${nRead}/${keys.length} gelezen`),
      nOpg > 0 && h('span', { class: 'badge' }, `${nOpg} theorievragen`)),
    h('button', { class: 'ghost small', 'aria-expanded': String(open), 'aria-label': (open ? 'Inklappen' : 'Uitklappen') + ' ' + chLabel(c.n),
      onclick: () => { open ? learnOpen.delete(c.n) : learnOpen.add(c.n); render(); } }, open ? '▴' : '▾'));
  if (!open) return h('div', { class: 'lchap' }, head);
  const rows = th.sections.map(s => {
    if (th.groups.has(s.id)) {
      const ks = childrenOf(th, s.id).filter(x => x.text).map(x => secKey(c.n, x.id));
      const n = ks.filter(k => sel.has(k)).length;
      const g = h('input', { type: 'checkbox', checked: ks.length > 0 && n === ks.length, onchange: e => setAll(ks, e.target.checked) });
      g.indeterminate = n > 0 && n < ks.length;
      return h('label', { class: 'check lsec group' }, g, h('span', { class: 't' }, h('b', {}, s.title)));
    }
    if (!s.text) return null;
    const k = secKey(c.n, s.id);
    const st = theory.sectionStats(th, s.id);
    const [icon, label] = STATUS[st.status];
    return h('div', { class: 'lsec-row lvl' + s.lvl },
      h('label', { class: 'check lsec' },
        h('input', { type: 'checkbox', checked: sel.has(k), onchange: e => { e.target.checked ? sel.add(k) : sel.delete(k); saveLearnSel(sel); } }),
        h('span', { class: 'ic', title: label, 'aria-label': label }, icon),
        h('span', { class: 't' }, s.title, st.total ? h('span', { class: 'muted small' }, ` · ${st.mastered}/${st.total} vragen beheerst`) : null)),
      h('button', { class: 'ghost small', onclick: () => openTheory(c.n, s.id, 'learn') }, 'Lees'));
  });
  return h('div', { class: 'lchap open' }, head, h('div', { class: 'lsecs' }, rows));
}

const BRON = {
  vrza: 'Bron: VRZA-cursus radiozendamateur (hoofdstukteksten).',
  veron: 'Bron: VERON, Cursusboek voor het F-examen, 5e druk. De tekst is met tekstherkenning uit de scans gehaald; bij twijfel over een getal of formule geldt het boek.',
};
const BOOKS = [
  { id: 'vrza', name: 'VRZA', logo: 'img/logo/vrza.png', sub: 'Cursus radiozendamateur, met theorievragen en koppeling aan de examenvragen' },
  { id: 'veron', name: 'VERON', logo: 'img/logo/veron.png', sub: 'Cursusboek voor het F-examen (5e druk)' },
];

/** Leren begint met de keuze van het boek. */
function viewLearnPick() {
  const stat = id => {
    const list = (id === 'veron' ? veronChapters : chapters).filter(c => c.theory && theory.getTheory(c.n));
    const secs = list.flatMap(c => readable(theory.getTheory(c.n)).map(s => theory.readKey(c.n, s.id)));
    return { chs: list.length, total: secs.length, read: secs.filter(store.isRead).length };
  };
  return h('div', {},
    h('h1', {}, 'Leren'),
    goalCard(),
    h('p', { class: 'muted' }, 'Kies uit welk boek je de theorie wilt leren.'),
    h('div', { class: 'bookpick' }, BOOKS.map(b => {
      const st = stat(b.id);
      return h('button', { class: 'book card', disabled: !st.chs, onclick: () => { LB = b.id; render(); window.scrollTo(0, 0); } },
        h('img', { src: b.logo, alt: `Logo ${b.name}` }),
        h('span', { class: 'bname' }, b.name),
        h('span', { class: 'muted small' }, b.sub),
        h('span', { class: 'badge' }, st.chs ? `${st.chs} hoofdstukken · ${st.read}/${st.total} gelezen` : 'nog niet beschikbaar'));
    })));
}

function viewLearn() {
  if (!LB) return viewLearnPick();
  const veron = LB === 'veron';
  const withT = learnChapters();
  const sel = learnSel();
  const seq = learnSeq(sel);
  const opg = learnOpgaven(sel);
  const opgPond = opg.filter(x => opgWrong(x.ch, x.o));
  const unread = seq.filter(k => { const [n, sid] = k.split(':'); return !store.isRead(theory.readKey(theory.chapterKey(n), sid)); }).length;
  const extras = withT.filter(c => { const th = theory.getTheory(c.n); return (th.cards || []).length || (th.formulas || []).length || (th.drill || []).length; });
  const allKeys = withT.flatMap(c => readable(theory.getTheory(c.n)).map(s => secKey(c.n, s.id)));
  const book = BOOKS.find(b => b.id === LB);
  return h('div', {},
    h('div', { class: 'row between', style: 'margin-bottom:.4rem' },
      h('button', { class: 'ghost small', onclick: () => { LB = null; render(); } }, '← Ander boek')),
    h('h1', { class: 'bookhead' }, h('img', { src: book.logo, alt: '' }), `Leren · ${book.name}`),
    h('p', { class: 'muted' }, veron
      ? 'Kies de hoofdstukken die je wilt leren en lees ze als een boek: elk hoofdstuk staat in zijn geheel op één pagina. Oefen daarna de examenvragen onder Oefenen.'
      : 'Kies per hoofdstuk en (sub)paragraaf wat je wilt leren (klap een hoofdstuk open met ▾). Lees de theorie, maak daarna de theorievragen en oefen de examenvragen. Een paragraaf is “beheerst” als je minstens 80% van de gekoppelde examenvragen bij je laatste poging goed had.'),
    h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h2', {}, veron ? '1. Hoofdstukken' : '1. Hoofdstukken en paragrafen'),
        h('div', { class: 'row' },
          h('button', { class: 'ghost', onclick: () => { allKeys.forEach(k => sel.add(k)); saveLearnSel(sel); } }, 'Alles'),
          h('button', { class: 'ghost', onclick: () => { sel.clear(); saveLearnSel(sel); } }, 'Niets'))),
      withT.map(c => learnChapterRow(c, sel))),
    h('section', { class: 'card' },
      h('h2', {}, '2. Aan de slag'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', disabled: !seq.length, onclick: () => startLearning(sel) },
          unread && unread < seq.length ? `Verder lezen (${unread} van ${seq.length} nog niet gelezen)` : veron ? `Theorie lezen (${new Set(seq.map(k => k.split(':')[0])).size} hoofdstukken)` : `Theorie lezen (${seq.length} ${seq.length === 1 ? 'paragraaf' : 'paragrafen'})`),
        !veron && h('button', { disabled: !opg.length, onclick: () => startOpgaven(opg) }, `Theorievragen maken (${opg.length})`),
        !veron && opgPond.length > 0 && h('button', { onclick: () => startOpgaven(opgPond) }, `Foute theorievragen (${opgPond.length})`)),
      !seq.length && h('p', { class: 'muted small' }, veron ? 'Kies minstens één hoofdstuk.' : 'Kies minstens één paragraaf.')),
    extras.length > 0 && h('section', { class: 'card' },
      h('h2', {}, 'Extra’s'),
      extras.map(c => {
        const th = theory.getTheory(c.n);
        const cs = cardStats(c.n);
        return h('div', { class: 'row', style: 'margin:.3rem 0' },
          h('b', { style: 'min-width:2.5rem' }, `H${c.n}`),
          cs.total > 0 && h('button', { onclick: () => cs.due ? startCards(c.n, false) : startCards(c.n, true) }, cs.due ? `Flashcards (${cs.due})` : 'Flashcards herhalen'),
          formulaBtn(c.n),
          (th.drill && th.drill.length > 0) && h('button', { onclick: () => openFormulaGame(c.n) }, '🎮 Formule-spel'),
          c.count > 0 && h('button', { class: 'ghost', onclick: () => startChapterExam(c.n) }, 'Hoofdstukexamen'));
      })),
    h('p', { class: 'muted small' }, BRON[LB]));
}

/** De theorietekst (HTML die tools/build_theory_vrza.py uit de VRZA-PDF's maakt). */
function theoryText(ch, id) {
  const all = theory.getText(ch, render);
  if (!all) return h('p', { class: 'muted' }, 'Tekst laden…');
  const el = h('div', { class: 'ttext' });
  el.innerHTML = all[id] || '<p class="muted">Geen tekst gevonden.</p>';
  return el;
}

const topHeight = () => (document.querySelector('.top') || { offsetHeight: 0 }).offsetHeight;
function setTopHeight() { document.documentElement.style.setProperty('--toph', topHeight() + 'px'); }
window.addEventListener('resize', setTopHeight);

/** Het leesvenster: een papieren pagina in een eigen scrollvak, zodat de tekst los staat van de rest van de app. */
let paperScroll = { key: null, top: 0 };
function paper(key, ...kids) {
  const box = h('div', { class: 'tviewer', tabindex: '0', 'aria-label': 'Theorietekst',
    onscroll: e => { paperScroll = { key, top: e.target.scrollTop }; } },
    h('div', { class: 'tpaper' }, kids));
  // na een herteken (bijv. ‘gelezen’ aanklikken) dezelfde plek houden; een nieuwe pagina begint bovenaan
  const fresh = paperScroll.key !== key;
  const top = fresh ? 0 : paperScroll.top;
  paperScroll = { key, top };
  requestAnimationFrame(() => {
    setTopHeight();
    box.scrollTop = top;
    // nieuwe pagina: het leesvenster vult het scherm onder de menubalk (titel en knoppen staan erboven en eronder)
    if (fresh) window.scrollTo(0, box.getBoundingClientRect().top + window.scrollY - topHeight() - 8);
  });
  return box;
}

const chapterRead = n => { const th = theory.getTheory(n); return !!th && readable(th).every(s => store.isRead(theory.readKey(n, s.id))); };

/** VERON: het hele hoofdstuk als één doorlopende tekst, met de (sub)paragrafen als koppen. */
function viewVeronChapter() {
  const n = T.chapter, th = theory.getTheory(n);
  const all = theory.getText(n, render);
  const secs = readable(th);
  const read = chapterRead(n);
  const list = T.seq || veronChapters.filter(c => theory.getTheory(c.n)).map(c => c.n);
  const here = list.indexOf(n);
  const prev = list[here - 1], next = list[here + 1];
  const go = x => { if (!theory.getTheory(x)) return openTheory(x, null, T.back); T = { ...T, chapter: x, secId: null, jump: false }; render(); window.scrollTo(0, 0); };
  const setRead = on => { secs.forEach(s => store.setRead(theory.readKey(n, s.id), on)); render(); };
  const anchor = id => `p-${id}`;
  const jump = id => { const box = document.querySelector('.tviewer'), el = document.getElementById(anchor(id)); if (box && el) box.scrollTop = el.offsetTop - 12; };
  let body;
  if (!all) body = h('p', { class: 'muted' }, 'Tekst laden…');
  else {
    body = h('div', { class: 'ttext' });
    for (const s of th.sections) {
      const intro = /\(inleiding\)$/.test(s.title);
      if (!intro) body.append(h(s.lvl === 1 ? 'h3' : 'h4', { id: anchor(s.id) }, s.title));
      else body.append(h('span', { id: anchor(s.id) }));
      if (s.text && all[s.id]) { const d = h('div'); d.innerHTML = all[s.id]; body.append(...d.childNodes); }
    }
    if (T.jump && T.secId) { const id = T.secId; T.jump = false; requestAnimationFrame(() => requestAnimationFrame(() => jump(id))); }
  }
  const nav = h('select', { class: 'tjump', 'aria-label': 'Ga naar paragraaf', onchange: e => { e.target.value && jump(e.target.value); } },
    h('option', { value: '' }, 'Ga naar paragraaf…'),
    th.sections.filter(s => !/\(inleiding\)$/.test(s.title)).map(s => h('option', { value: s.id }, (s.lvl === 2 ? '\u00a0\u00a0\u00a0' : '') + s.title)));
  const bar = h('div', { class: 'row between tbar' },
    h('div', { class: 'row' },
      prev && h('button', { class: 'ghost', onclick: () => go(prev) }, '← Vorig hoofdstuk'),
      next && h('button', { class: read ? 'ghost' : 'primary', onclick: () => { if (!read) setRead(true); go(next); } }, read ? 'Volgend hoofdstuk →' : 'Gelezen, volgend hoofdstuk →')),
    h('button', { class: read ? '' : 'primary', onclick: () => setRead(!read) }, read ? '✓ Hoofdstuk gelezen (klik om te wissen)' : 'Markeer hoofdstuk als gelezen'));
  return h('div', {},
    h('div', { class: 'row between', style: 'margin-bottom:.4rem' },
      h('button', { class: 'ghost small', onclick: () => setView(T.back === 'theory' ? 'learn' : T.back) }, '← Terug'),
      T.seq && T.seq.length > 1 && h('span', { class: 'muted small' }, `Hoofdstuk ${here + 1} van ${T.seq.length}`),
      h('span', { class: 'qmeta' }, `VERON · ${chLabel(n)}`)),
    h('div', { class: 'row between', style: 'align-items:center' },
      h('h1', { style: 'margin:.2rem 0' }, `${chLabel(n)} · ${chapterTitle(n)}`), nav),
    paper(`veron:${n}`, h('div', { class: 'tpaper-head' }, `VERON · Cursusboek F-examen · Hoofdstuk ${n.slice(1)}`), h('h2', { class: 'tpaper-title' }, chapterTitle(n)), body),
    bar,
    h('p', { class: 'muted small' }, BRON.veron));
}

// ---- theorievragen: meerkeuze wordt nagekeken, open vragen beoordeel je zelf na de uitwerking.
// Resultaten staan bij de kaarten (store.recordCard) onder 'hs3:o3-1'; laatst fout = foutenvijver.
const opgKey = (ch, o) => `hs${ch}:${o.id}`;
const opgWrong = (ch, o) => { const r = store.cardRec(opgKey(ch, o)); return !!r && r.l === 0; };
// antwoorden die niet vet in de uitwerking staan
const OPG_ANSWER = { 'o2-1': 'C', 'o8-9': 'B', 'o17-11': 'A' };

/** Juiste letter van een meerkeuze-theorievraag: vetgedrukte optie in de uitwerking, anders 'Antwoord X' in de tekst. */
function opgAnswer(o, sol) {
  if (OPG_ANSWER[o.id]) return OPG_ANSWER[o.id];
  const bold = new Set([...sol.matchAll(/<p class="topt">\s*(?:<b>\s*([A-Da-d])\.|([A-Da-d])\.\s*<b>)/g)].map(m => (m[1] || m[2]).toUpperCase()));
  if (bold.size === 1) return [...bold][0];
  const said = new Set([...sol.split('<h4>Uitwerking</h4>').pop().matchAll(/[Aa]ntwoord\s*:?\s*([A-D])\b/g)].map(m => m[1]));
  return said.size === 1 ? [...said][0] : null;
}

function answerOpgave(ch, o, ok, letter) {
  store.recordCard(opgKey(ch, o), ok);
  OP.done[OP.idx] = { ok, letter };
  render();
}

function viewOpgave() {
  if (!OP || !OP.list.length) return viewLearn();
  const { ch, o } = OP.list[OP.idx];
  const th = theory.getTheory(ch);
  const n = OP.list.length;
  const go = i => { OP.idx = i; OP.shown = false; render(); window.scrollTo(0, 0); };
  const sec = o.sec && th.bySec.get(o.sec);
  const done = OP.done[OP.idx];
  const all = theory.getText(ch, render);
  const q = theoryText(ch, `${o.id}:q`);
  const choices = [...q.querySelectorAll('.topt')];
  const answer = all && choices.length ? opgAnswer(o, all[`${o.id}:s`] || '') : null;
  // meerkeuze: de opties uit de tekst worden knoppen
  if (answer) for (const el of choices) {
    const letter = (el.textContent.trim().match(/^([A-Da-d])\./) || [])[1];
    if (!letter) continue;
    const L = letter.toUpperCase();
    el.classList.add('tchoice');
    if (done) el.classList.add(L === answer ? 'right' : L === done.letter ? 'wrong' : 'dim');
    else Object.assign(el, { tabIndex: 0, role: 'button',
      onclick: () => answerOpgave(ch, o, L === answer, L),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); answerOpgave(ch, o, L === answer, L); } } });
  }
  const showSol = done || OP.shown;
  const score = OP.done.filter(Boolean), good = score.filter(d => d.ok).length;
  return h('div', {},
    h('div', { class: 'row between', style: 'margin-bottom:.4rem' },
      h('button', { class: 'ghost small', onclick: () => { OP = null; setView('learn'); } }, '← Leren'),
      h('span', { class: 'qmeta' }, `Theorievraag ${OP.idx + 1} van ${n} · ${chLabel(ch)} · ${chapterTitle(ch)}${score.length ? ` · ${good} van ${score.length} goed` : ''}`)),
    h('h1', { style: 'margin-top:.2rem' }, o.title, !done && opgWrong(ch, o) ? h('span', { class: 'badge red', style: 'margin-left:.6rem' }, 'Uit foutenvijver') : null),
    sec && h('p', { class: 'muted small' }, 'Hoort bij: ', h('button', { class: 'linklike', onclick: () => openTheory(ch, sec.id, 'opg') }, sec.title)),
    q,
    answer && !done && h('p', { class: 'muted small' }, 'Klik op het antwoord dat jij goed vindt.'),
    done && h('div', { class: 'banner ' + (done.ok ? 'ok' : 'no'), role: 'status' },
      done.ok ? '✅ Goed!' : answer ? `❌ Fout — het juiste antwoord is ${answer}.` : '❌ Fout.',
      done.ok ? '' : ' Toegevoegd aan de foutenvijver.'),
    showSol
      ? h('div', {}, h('h2', {}, 'Uitwerking'), theoryText(ch, `${o.id}:s`))
      : !answer && h('div', { class: 'row' }, h('button', { class: 'primary', disabled: !o.s, onclick: () => { OP.shown = true; render(); } }, o.s ? 'Toon uitwerking' : 'Geen uitwerking beschikbaar')),
    // open vraag: na de uitwerking zelf beoordelen
    !answer && OP.shown && !done && all && h('div', { class: 'row' },
      h('span', {}, 'Had je het goed?'),
      h('button', { class: 'primary', onclick: () => answerOpgave(ch, o, true) }, '✅ Goed'),
      h('button', { onclick: () => answerOpgave(ch, o, false) }, '❌ Fout')),
    h('div', { class: 'row between tbar' },
      h('button', { class: 'ghost', disabled: OP.idx === 0, onclick: () => go(OP.idx - 1) }, '← Vorige'),
      OP.idx < n - 1
        ? h('button', { class: done ? 'primary' : '', onclick: () => go(OP.idx + 1) }, 'Volgende →')
        : h('button', { class: 'primary', onclick: () => {
          if (score.length) toast(`Theorievragen: ${good} van ${score.length} goed.`);
          OP = null; setView('learn');
        } }, 'Klaar')));
}

function viewTheory() {
  if (!T) return viewLearn();
  const th = theory.getTheory(T.chapter);
  if (!th) return viewLearn();
  if (theory.isVeron(T.chapter)) return viewVeronChapter();
  const sec = th.bySec.get(T.secId) || th.sections[0];
  const key = theory.readKey(T.chapter, sec.id);
  const read = store.isRead(key);
  const st = theory.sectionStats(th, sec.id);
  // vorige/volgende: binnen de gekozen paragrafen (ook over hoofdstukken heen), anders binnen het hoofdstuk
  const here = T.seq ? T.seq.indexOf(secKey(T.chapter, sec.id)) : -1;
  const step = d => {
    if (here >= 0) { const k = T.seq[here + d]; return k && { ch: theory.chapterKey(k.split(':')[0]), id: k.split(':')[1] }; }
    const all = readable(th), i = all.findIndex(s => s.id === sec.id), x = all[i + d];
    return x && { ch: T.chapter, id: x.id };
  };
  const prev = step(-1), next = step(1);
  const go = x => { T.chapter = x.ch; T.secId = x.id; render(); window.scrollTo(0, 0); };
  const toggle = () => { store.setRead(key, !read); render(); };
  const bar = pos => h('div', { class: 'row between tbar' },
    h('div', { class: 'row' },
      prev && h('button', { class: 'ghost', onclick: () => go(prev) }, '← Vorige'),
      next && h('button', { class: read || pos === 'top' ? 'ghost' : 'primary', onclick: () => { if (pos === 'bottom' && !read) store.setRead(key, true); go(next); } }, pos === 'bottom' && !read ? 'Gelezen, volgende →' : 'Volgende →')),
    h('div', { class: 'row' },
      h('button', { class: read ? '' : 'primary', onclick: toggle }, read ? '✓ Gelezen (klik om te wissen)' : 'Markeer als gelezen'),
      st.total > 0 && h('button', { onclick: () => startSectionPractice(T.chapter, sec.id) }, `Oefen deze paragraaf (${st.total})`),
      pos === 'top' && formulaBtn(T.chapter)));
  return h('div', {},
    h('div', { class: 'row between', style: 'margin-bottom:.4rem' },
      h('button', { class: 'ghost small', onclick: () => setView(T.back === 'theory' ? 'learn' : T.back) }, '← Terug'),
      here >= 0 && h('span', { class: 'muted small' }, `${here + 1} van ${T.seq.length}`),
      h('span', { class: 'qmeta' }, `${chLabel(T.chapter)} · ${chapterTitle(T.chapter)}`)),
    h('h1', { style: 'margin-top:.2rem' }, sec.title),
    st.total > 0 && h('p', { class: 'muted small' }, `${STATUS[st.status][0]} ${st.mastered} van ${st.total} bijbehorende vragen beheerst`),
    bar('top'),
    paper(`${T.chapter}:${sec.id}`, h('div', { class: 'tpaper-head' }, `VRZA · ${chLabel(T.chapter)} · ${chapterTitle(T.chapter)}`), theoryText(T.chapter, sec.id)),
    bar('bottom'),
    h('p', { class: 'muted small' }, theory.isVeron(T.chapter) ? BRON.veron : BRON.vrza));
}

// ---------------------------------------------------------------- opstarten
async function restoreSession() {
  const s = store.loadSession();
  if (!s || !Array.isArray(s.ids) || !s.ids.length) return;
  try {
    const cn = [...new Set(s.ids.map(quiz.chapterOf))];
    await quiz.loadChapters(cn);
    await ensureTheory(cn);
    if (s.ids.every(id => quiz.QMAP.has(id))) S = s; else store.clearSession();
  } catch { /* sessie blijft dan gewoon weg */ }
}

async function handleHashImport() {
  const m = location.hash.match(/^#sync=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  await importShare(m[1]);
}

async function init() {
  applyPrefs();
  $app.replaceChildren(h('p', { class: 'muted' }, 'Laden…'));
  try {
    chapters = await quiz.loadIndex();
  } catch (e) {
    $app.replaceChildren(h('div', { class: 'card' }, h('h2', {}, 'Vragen niet gevonden'),
      h('p', {}, 'Het bestand data/index.json kon niet worden geladen. Draai je de app via een webserver (of GitHub Pages) en niet via file://?'),
      h('p', { class: 'muted small' }, String(e.message))));
    return;
  }
  veronChapters = await theory.loadVeronIndex();
  await Promise.all([ensureTheory(chapters.filter(c => c.theory).map(c => c.n)), ...veronChapters.map(c => theory.loadTheory(c.n))]);
  await restoreSession();
  if (hasTheory()) view = 'learn';   // eerst leren, dan oefenen
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('type') === 'recovery' && hp.get('access_token')) {
    recoveryToken = hp.get('access_token');
    history.replaceState(null, '', location.pathname + location.search);
    view = 'recovery';
  }
  const dot = document.getElementById('syncdot');
  const paintDot = s => {
    if (!dot) return;
    if (!sync.isActive()) { dot.hidden = true; return; }
    const m = { pending: ['⏳', 'Wijzigingen worden opgeslagen…'], busy: ['⏳', 'Synchroniseren…'], ok: ['✓', 'Alles is opgeslagen en gesynchroniseerd'], error: ['⚠', 'Synchroniseren mislukt, je voortgang staat wel op dit apparaat: ' + (s.message || '')] }[s.state];
    if (!m) return;
    dot.hidden = false; dot.textContent = m[0]; dot.title = m[1]; dot.setAttribute('aria-label', m[1]); dot.dataset.s = s.state;
  };
  if (sync.isActive()) paintDot({ state: 'ok' });
  sync.onSyncStatus(s => {
    paintStatus(s);
    paintDot(s);
    if (s.state === 'ok' && s.changed && (view === 'stats' || view === 'setup')) render();
    if (s.state === 'error' && view === 'account' && account.enabled() && !account.loggedIn()) render();
  });
  sync.startAutoSync();
  render();
  handleHashImport();
}

init();
