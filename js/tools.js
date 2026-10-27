// Hulpmiddelen tijdens oefenen en examen: rekenmachine (naar het voorbeeld van de Casio fx-82NL) en kladblok.
// Geen eval: de invoer wordt door een eigen kleine parser berekend.

const $ = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};

// ---------------------------------------------------------------- rekenen
const FUNCS = {
  sin: (x, d) => Math.sin(d ? x * Math.PI / 180 : x), cos: (x, d) => Math.cos(d ? x * Math.PI / 180 : x), tan: (x, d) => Math.tan(d ? x * Math.PI / 180 : x),
  asin: (x, d) => (d ? 180 / Math.PI : 1) * Math.asin(x), acos: (x, d) => (d ? 180 / Math.PI : 1) * Math.acos(x), atan: (x, d) => (d ? 180 / Math.PI : 1) * Math.atan(x),
  log: x => Math.log10(x), ln: x => Math.log(x), '√': x => Math.sqrt(x),
};

export function tokenize(src) {
  const t = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      if (src[j] === 'E' && /[-+]?[0-9]/.test(src.slice(j + 1, j + 3))) { j++; if (/[-+]/.test(src[j])) j++; while (j < src.length && /[0-9]/.test(src[j])) j++; }
      const v = Number(src.slice(i, j).replace('E', 'e')); if (!Number.isFinite(v)) throw new Error('syntax');
      t.push({ n: v }); i = j; continue;
    }
    if (src.startsWith('Ans', i)) { t.push({ ans: 1 }); i += 3; continue; }
    const f = Object.keys(FUNCS).sort((a, b) => b.length - a.length).find(k => src.startsWith(k + '(', i));
    if (f) { t.push({ f }); i += f.length; continue; }
    if (c === 'π') { t.push({ n: Math.PI }); i++; continue; }
    if (c === 'e' && src[i + 1] === '^') { t.push({ n: Math.E }); i++; continue; }
    if (src.startsWith('⁻¹', i)) { t.push({ op: 'inv' }); i += 2; continue; }
    if ('+-×÷^()²⌟'.includes(c)) { t.push({ op: c }); i++; continue; }
    throw new Error('syntax');
  }
  return t;
}

export function evaluate(src, { deg = true, ans = 0 } = {}) {
  const t = tokenize(src); let p = 0;
  const peek = () => t[p], isOp = o => t[p] && t[p].op === o;
  const startsFactor = x => x && (x.n !== undefined || x.ans || x.f || x.op === '(');
  function expr() { let v = term(); for (;;) { if (isOp('+')) { p++; v += term(); } else if (isOp('-')) { p++; v -= term(); } else return v; } }
  function term() {
    let v = impl();
    for (;;) {
      if (isOp('×')) { p++; v *= impl(); } else if (isOp('÷')) { p++; const d = impl(); if (d === 0) throw new Error('math'); v /= d; } else return v;
    }
  }
  function impl() { let v = unary(); while (startsFactor(peek())) v *= unary(); return v; }   // 2π, 3(4+1): impliciet vermenigvuldigen
  function unary() { if (isOp('-')) { p++; return -unary(); } if (isOp('+')) { p++; return unary(); } return power(); }
  function power() { let b = postfix(); if (isOp('^')) { p++; b = Math.pow(b, unary()); } return b; }
  function postfix() {
    let v = primary();
    for (;;) { if (isOp('²')) { p++; v = v * v; } else if (isOp('inv')) { p++; if (v === 0) throw new Error('math'); v = 1 / v; } else return v; }
  }
  function primary() {
    const x = t[p++]; if (!x) throw new Error('syntax');
    if (x.n !== undefined) {
      if (!isOp('⌟')) return x.n;
      const num = () => { const y = t[p++]; if (!y || y.n === undefined) throw new Error('syntax'); return y.n; };
      p++; const b = num();
      if (isOp('⌟')) { p++; const c = num(); if (c === 0) throw new Error('math'); return x.n + b / c; }   // 2⌟3⌟4 = 2 3/4
      if (b === 0) throw new Error('math');
      return x.n / b;                                                                                   // 3⌟4 = 3/4
    }
    if (x.ans) return ans;
    if (x.op === '(') { const v = expr(); if (isOp(')')) p++; return v; }
    if (x.f) { const v = expr(); if (isOp(')')) p++; const r = FUNCS[x.f](v, deg); if (!Number.isFinite(r)) throw new Error('math'); return r; }
    throw new Error('syntax');
  }
  const v = expr(); if (p < t.length) throw new Error('syntax');
  if (!Number.isFinite(v)) throw new Error('math');
  return v;
}

/** Breuk bij een getal (kettingbreuk), noemer maximaal 9999 zoals op de Casio; null als het geen nette breuk is. */
export function toFraction(v) {
  if (!Number.isFinite(v) || Number.isInteger(v)) return null;
  const neg = v < 0, x = Math.abs(v);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, r = x;
  for (let i = 0; i < 20; i++) {
    const a = Math.floor(r);
    [h1, h0] = [a * h1 + h0, h1]; [k1, k0] = [a * k1 + k0, k1];
    if (k1 > 9999) return null;
    if (Math.abs(x - h1 / k1) <= 1e-10 * Math.max(1, x)) return { n: neg ? -h1 : h1, d: k1 };
    const f = r - a; if (f < 1e-12) return null;
    r = 1 / f;
  }
  return null;
}
/** 'imp' = 11/4, 'mix' = 2 3/4 (alleen bij een breuk groter dan 1). */
export function fmtFrac(v, kind = 'imp') {
  const f = toFraction(v); if (!f) return null;
  const sign = f.n < 0 ? '−' : '', n = Math.abs(f.n);
  if (kind === 'mix' && n > f.d) return `${sign}${Math.floor(n / f.d)} ${n % f.d}/${f.d}`;
  return `${sign}${n}/${f.d}`;
}

const PREFIX = { '-12': 'p', '-9': 'n', '-6': 'µ', '-3': 'm', 0: '', 3: 'k', 6: 'M', 9: 'G', 12: 'T' };
const comma = s => s.replace('.', ',');
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = n => String(n).split('').map(c => SUP[c]).join('');
/** Gewone weergave (10 cijfers); ver buiten het bereik wetenschappelijk. */
export function fmt(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e10 || a < 1e-9) { const [m, e] = v.toExponential(9).split('e'); return comma(`${+m}×10${sup(+e)}`); }
  return comma(String(+v.toPrecision(10)));
}
/** Technische notatie (ENG): exponent een veelvoud van 3; shift verplaatst de komma (zoals de ENG-toets). */
export function fmtEng(v, shift = 0) {
  if (v === 0) return '0';
  let e = Math.floor(Math.log10(Math.abs(v)) / 3) * 3 + 3 * shift;
  const m = +(v / Math.pow(10, e)).toPrecision(10);
  const pre = PREFIX[e];
  return comma(`${m}×10${sup(e)}`) + (pre !== undefined && pre !== '' ? `  (${pre})` : '');
}

// ---------------------------------------------------------------- positie en formaat
// Beide panelen zweven vrij: versleep ze aan de kop, en pak een rand of hoek vast om het formaat te bepalen.
// Positie en formaat worden onthouden. De rest van de pagina verandert niet mee.
const SKEY = 'flic.toolbox';
const boxes = (() => { try { return JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { return {}; } })();
const saveBoxes = () => { try { localStorage.setItem(SKEY, JSON.stringify(boxes)); } catch { /* negeren */ } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const panels = [];
let zTop = 50;
const MINW = 260, MINH = 220;
function applyBox(el) {
  const m = el.dataset.m, d = boxes[m] || (boxes[m] = {});
  const vw = innerWidth, vh = innerHeight, wide = vw >= 768;
  const w = clamp(d.w || (m === 'calc' ? (wide ? 460 : 400) : (wide ? 560 : 400)), MINW, Math.max(MINW, vw - 8));
  el.style.setProperty('--tw', w + 'px');
  el.style.setProperty('--ts', m === 'calc' ? clamp(Math.min(w / 400, d.h ? d.h / 520 : 9), 0.45, 3) : clamp(w / 400, 0.7, 3));
  let h;
  if (m === 'pad') { h = clamp(d.h || Math.round(vh * (wide ? 0.6 : 0.5)), MINH, Math.max(MINH, vh - 8)); el.style.setProperty('--th', h + 'px'); }
  else h = d.h ? Math.min(d.h, el.offsetHeight || d.h) : (el.offsetHeight || 420);
  const c = +el.dataset.casc || 0;
  const x = clamp(d.x ?? (vw - w - 12 - c), 0, Math.max(0, vw - w));
  const y = clamp(d.y ?? (vh - h - 12 - c), 0, Math.max(0, vh - Math.min(h, vh)));
  el.style.left = x + 'px'; el.style.top = y + 'px';
  if (el.fit) requestAnimationFrame(el.fit);
}
const front = el => { el.style.zIndex = ++zTop; };
const startDrag = (hnd, e, el, fn) => {
  e.preventDefault(); hnd.setPointerCapture(e.pointerId);
  const r = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY;
  const move = ev => fn(r, ev.clientX - x0, ev.clientY - y0);
  const up = () => { hnd.removeEventListener('pointermove', move); hnd.removeEventListener('pointerup', up); hnd.removeEventListener('pointercancel', up); saveBoxes(); };
  hnd.addEventListener('pointermove', move); hnd.addEventListener('pointerup', up); hnd.addEventListener('pointercancel', up);
};
function makeMovable(el, m) {
  el.dataset.m = m; panels.push(el);
  el.addEventListener('pointerdown', () => front(el), true);
  const head = el.querySelector('.thead');
  head.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, select')) return;
    startDrag(head, e, el, (r, dx, dy) => { const d = boxes[m]; d.w = Math.round(r.width); d.x = Math.round(r.left + dx); d.y = Math.round(r.top + dy); if (m === 'pad') d.h = Math.round(r.height); applyBox(el); });
  });
  const dirs = m === 'calc' ? ['l', 'r'] : ['l', 'r', 't', 'b', 'tl', 'tr', 'bl', 'br'];
  for (const dir of dirs) {
    const hnd = $('div', { class: 'rz rz-' + dir, 'aria-hidden': 'true' });
    hnd.addEventListener('pointerdown', e => startDrag(hnd, e, el, (r, dx, dy) => {
      const d = boxes[m]; let x = r.left, y = r.top, w = r.width, h = r.height;
      if (dir.includes('r')) w = r.width + dx;
      if (dir.includes('l')) { w = r.width - dx; }
      w = clamp(w, MINW, innerWidth - 8); if (dir.includes('l')) x = r.right - w;
      if (m === 'pad') {
        if (dir.includes('b')) h = r.height + dy;
        if (dir.includes('t')) h = r.height - dy;
        h = clamp(h, MINH, innerHeight - 8); if (dir.includes('t')) y = r.bottom - h;
        d.h = Math.round(h);
      }
      if (m === 'calc') delete d.h;
      d.w = Math.round(w); d.x = Math.round(x); d.y = Math.round(y); applyBox(el);
    }));
    el.append(hnd);
  }
  applyBox(el);
}
addEventListener('resize', () => panels.forEach(applyBox));

// ---------------------------------------------------------------- rekenmachine
const tileBtn = () => $('button', { type: 'button', class: 'ghost small tilebtn', hidden: true, 'aria-label': 'Naast elkaar zetten', title: 'Naast elkaar zetten', onclick: () => tile() }, '◫');
function buildCalc(onClose, other) {
  let ex = '', res = '', ans = 0, deg = true, second = false, fresh = false, lastV = null, engShift = 0, err = false, rmode = 'dec', hadFrac = false;
  const disp = $('div', { class: 'cx' }), out = $('div', { class: 'cr' }), mode = $('div', { class: 'cm' });
  const draw = () => {
    disp.textContent = ex.replace(/\^\((-?\d+)\)/g, (_, e) => sup(e)).replace(/\^(-?\d+)(?![\d.])/g, (_, e) => sup(e)).replace(/(\d+)⌟(\d+)⌟(\d+)/g, '$1 $2⁄$3').replace(/(\d+)⌟(\d+)/g, '$1⁄$2').replace(/\./g, ',') || '0'; out.textContent = err ? 'Fout' : res; mode.textContent = `${deg ? 'DEG' : 'RAD'}${second ? ' · 2nd' : ''}`;
    disp.scrollLeft = disp.scrollWidth;
  };
  const ins = s => {
    if (err) { ex = ''; err = false; res = ''; }
    if (fresh) { ex = /^[+\-×÷^²]|^⁻¹/.test(s) ? 'Ans' : ''; res = ''; fresh = false; }
    if (!ex && s.startsWith('×')) s = s.slice(1);   // '×10³' aan het begin van een som: gewoon 10³
    ex += s; draw();
  };
  const showRes = () => (rmode !== 'dec' && fmtFrac(lastV, rmode)) || fmt(lastV);
  const equals = () => {
    if (!ex) return;
    try {
      lastV = evaluate(ex, { deg, ans }); ans = lastV; err = false; engShift = -1;
      hadFrac = ex.includes('⌟'); rmode = hadFrac && toFraction(lastV) ? (/⌟\d+⌟/.test(ex) ? 'mix' : 'imp') : 'dec';
      res = showRes();
    } catch { err = true; lastV = null; }
    fresh = true; draw();
  };
  const press = k => {
    const f2 = { sin: 'asin', cos: 'acos', tan: 'atan' };
    switch (k) {
      case 'AC': ex = ''; res = ''; err = false; fresh = false; draw(); return;
      case 'DEL': if (fresh) { fresh = false; } ex = ex.replace(/(asin\(|acos\(|atan\(|sin\(|cos\(|tan\(|log\(|ln\(|√\(|Ans|10\^\(|e\^\(|⁻¹|.)$/u, ''); draw(); return;
      case '=': equals(); return;
      case '2nd': second = !second; draw(); render(); return;
      case 'DEG': deg = !deg; draw(); render(); return;
      case 'a b/c': ins('⌟'); return;
      case 'x³': ins('^(3)'); break;
      case 'x⁻²': ins('^(-2)'); break;
      case 'x⁻³': ins('^(-3)'); break;
      case '10ˣ': ins(!fresh && /[\d.)π²]$/.test(ex) ? '×10^(' : '10^('); break;   // 5 10ˣ 3) = 5×10³
      case 'eˣ': ins('e^('); break;
      case '×10³': case '×10⁶': case '×10⁻³': case '×10⁻⁶': case '×10⁻⁹': ins(`×10^(${PW[k]})`); break;
      case 'S⇔D': {   // decimaal → breuk → gemengd getal → decimaal
        if (lastV == null || err) return;
        if (!toFraction(lastV)) { rmode = 'dec'; res = fmt(lastV); draw(); return; }
        rmode = rmode === 'dec' ? 'imp' : rmode === 'imp' && Math.abs(lastV) > 1 ? 'mix' : 'dec';
        res = showRes(); fresh = true; draw(); return;
      }
      case 'ENG': if (lastV != null) { rmode = 'dec'; engShift++; res = fmtEng(lastV, engShift - 0); fresh = true; draw(); } return;
      case 'sin': case 'cos': case 'tan': ins((second ? f2[k] : k) + '('); break;
      case 'log': ins(second ? '10^(' : 'log('); break;
      case 'ln': ins(second ? 'e^(' : 'ln('); break;
      case '√': ins('√('); break;
      case 'x²': ins('²'); break;
      case 'x⁻¹': ins('⁻¹'); break;
      case 'xʸ': ins('^'); break;
      case 'EXP': ins('E'); break;
      case ',': ins('.'); break;
      case 'Ans': ins('Ans'); break;
      default: ins(k);
    }
    if (second && ['sin', 'cos', 'tan', 'log', 'ln'].includes(k)) { second = false; draw(); render(); }
  };
  const PW = { '×10³': 3, '×10⁶': 6, '×10⁻³': -3, '×10⁻⁶': -6, '×10⁻⁹': -9 };
  const rows = [['2nd', 'DEG', 'ENG', 'DEL', 'AC'], ['sin', 'cos', 'tan', 'log', 'ln'], ['x²', 'xʸ', '√', 'x⁻¹', 'π'], ['x³', 'x⁻²', 'x⁻³', '10ˣ', 'eˣ'], ['×10³', '×10⁶', '×10⁻³', '×10⁻⁶', '×10⁻⁹'], ['7', '8', '9', '(', ')'], ['4', '5', '6', '×', '÷'], ['1', '2', '3', '+', '-'], ['0', ',', 'EXP', 'Ans', '='], ['a b/c', 'S⇔D']];
  const lbl = { '-': '−', sin: () => (second ? 'sin⁻¹' : 'sin'), cos: () => (second ? 'cos⁻¹' : 'cos'), tan: () => (second ? 'tan⁻¹' : 'tan'), log: () => (second ? '10ˣ' : 'log'), ln: () => (second ? 'eˣ' : 'ln') };
  const keys = $('div', { class: 'ck' });
  const render = () => keys.replaceChildren(...rows.flat().map(k => {
    const l = lbl[k]; const txt = typeof l === 'function' ? l() : (l || k);
    const cls = k === 'a b/c' ? 'wide3' : k === 'S⇔D' ? 'wide2' : k === '=' ? 'eq' : /^[0-9,]$/.test(k) ? 'num' : ['AC', 'DEL'].includes(k) ? 'clr' : '';
    return $('button', { type: 'button', class: cls + (k === '2nd' && second ? ' on' : ''), onclick: () => press(k) }, txt);
  }));
  render(); draw();
  const panel = $('div', { class: 'tpanel calc', role: 'dialog', 'aria-label': 'Rekenmachine', tabindex: '-1' },
    $('div', { class: 'thead' }, $('b', {}, 'Rekenmachine'), mode, tileBtn(), other('✏️', 'Kladblok'), $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Sluiten', onclick: onClose }, '✕')),
    $('div', { class: 'cdisp' }, disp, out), keys);
  panel.addEventListener('keydown', e => {
    const m = { Enter: '=', '=': '=', Backspace: 'DEL', Delete: 'AC', '*': '×', '/': '÷', '.': ',', ',': ',', '-': '-', '+': '+', '(': '(', ')': ')', '^': 'xʸ', e: 'EXP', E: 'EXP', _: 'a b/c', f: 'a b/c', s: 'S⇔D' };
    if (e.key === 'Escape') return onClose();
    const k = /^[0-9]$/.test(e.key) ? e.key : m[e.key];
    if (k) { e.preventDefault(); press(k); }
  });
  return panel;
}

// ---------------------------------------------------------------- kladblok
function buildPad(onClose, other) {
  const strokes = []; let cur = null, color = 'auto', size = 3, eraser = false;
  const cv = $('canvas', { class: 'pad-cv', 'aria-label': 'Kladblok: teken met je vinger of muis' });
  const ink = () => (color === 'auto' ? getComputedStyle(document.body).color : color);
  const draw = () => {
    const ctx = cv.getContext('2d'), r = devicePixelRatio || 1;
    ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.lineCap = ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.globalCompositeOperation = s.er ? 'destination-out' : 'source-over'; ctx.strokeStyle = s.c; ctx.fillStyle = s.c; ctx.lineWidth = s.w;
      ctx.beginPath(); s.p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.p.length === 1) { ctx.arc(s.p[0][0], s.p[0][1], s.w / 2, 0, 7); ctx.fill(); } else ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
  const fit = () => {
    const r = devicePixelRatio || 1, b = cv.getBoundingClientRect();
    if (!b.width) return; cv.width = Math.round(b.width * r); cv.height = Math.round(b.height * r); draw();
  };
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); cur = { c: ink(), w: eraser ? size * 5 : size, er: eraser, p: [pos(e)] }; strokes.push(cur); draw(); });
  cv.addEventListener('pointermove', e => { if (!cur) return; cur.p.push(pos(e)); draw(); });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  new ResizeObserver(fit).observe(cv);
  const tool = (label, on, aria) => $('button', { type: 'button', class: 'ghost small', 'aria-label': aria || label, onclick: on }, label);
  const sw = (c, txt) => $('button', { type: 'button', class: 'sw', style: `background:${c === 'auto' ? 'var(--text)' : c}`, 'aria-label': txt, onclick: () => { color = c; eraser = false; sync(); } });
  const bPen = tool('✏️', () => { eraser = false; sync(); }, 'Pen'), bEr = tool('Gum', () => { eraser = true; sync(); });
  const sync = () => { bPen.classList.toggle('on', !eraser); bEr.classList.toggle('on', eraser); };
  sync();
  const panel = $('div', { class: 'tpanel pad', role: 'dialog', 'aria-label': 'Kladblok' },
    $('div', { class: 'thead' }, $('b', {}, 'Kladblok'),
      $('span', { class: 'tools' }, bPen, sw('auto', 'Wit/zwart'), sw('#4da3ff', 'Blauw'), sw('#f85149', 'Rood'), sw('#3fb950', 'Groen'), bEr,
        tool('↶', () => { strokes.pop(); draw(); }, 'Ongedaan maken'), tool('Wis', () => { strokes.length = 0; draw(); }, 'Alles wissen')),
      tileBtn(), other('🧮', 'Rekenmachine'),
      $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Sluiten', onclick: onClose }, '✕')),
    cv);
  panel.fit = fit; panel.redraw = draw;
  return panel;
}

// ---------------------------------------------------------------- aanzetten
let calc, pad, fab, visible = false;
const opened = { calc: false, pad: false };
const el = k => (k === 'calc' ? calc : pad);
function toggle(k) {
  opened[k] = !opened[k];
  const e = el(k); e.hidden = !opened[k];
  if (opened[k]) {
    e.dataset.casc = opened[k === 'calc' ? 'pad' : 'calc'] ? '30' : '0';
    applyBox(e); front(e);
    if (opened.calc && opened.pad) tile();            // tweede paneel erbij: meteen netjes naast/onder elkaar
    if (k === 'pad') pad.fit(); else calc.focus();
  }
  refresh();
}
/** Zet beide panelen naast elkaar (breed scherm of liggend) of onder elkaar (staand), zodat je ze tegelijk ziet. */
function tile() {
  const vw = innerWidth, vh = innerHeight, g = 4, side = vw >= vh * 1.1;
  const cw = side ? Math.round((vw - 3 * g) / 2) : vw - 2 * g, ch = side ? vh - 2 * g : Math.round((vh - 3 * g) / 2);
  const put = (k, x, y) => { const d = boxes[k] || (boxes[k] = {}); Object.assign(d, { x, y, w: cw, h: ch }); el(k).dataset.casc = '0'; applyBox(el(k)); front(el(k)); };
  put('pad', g, g);
  put('calc', side ? 2 * g + cw : g, side ? g : 2 * g + ch);
  saveBoxes();
}
function refresh() {
  fab.hidden = !visible || opened.calc || opened.pad;
  document.querySelectorAll('.tpanel .tilebtn').forEach(b => { b.hidden = !(opened.calc && opened.pad); });
  document.querySelectorAll('.tpanel .swbtn').forEach(b => b.classList.toggle('on', opened[b.dataset.k]));
}
export function initTools() {
  if (fab) return;
  const other = k => (icon, label) => $('button', { type: 'button', class: 'ghost small swbtn', 'data-k': k, 'aria-label': label + ' openen/sluiten', title: label, onclick: () => toggle(k) }, icon);
  calc = buildCalc(() => toggle('calc'), (i, l) => other('pad')(i, l));
  pad = buildPad(() => toggle('pad'), (i, l) => other('calc')(i, l));
  calc.hidden = pad.hidden = true;
  fab = $('div', { class: 'tfab', hidden: true },
    $('button', { type: 'button', 'aria-label': 'Rekenmachine', title: 'Rekenmachine', onclick: () => toggle('calc') }, '🧮'),
    $('button', { type: 'button', 'aria-label': 'Kladblok', title: 'Kladblok', onclick: () => toggle('pad') }, '✏️'));
  document.body.append(fab, calc, pad);
  makeMovable(calc, 'calc'); makeMovable(pad, 'pad');
}
/** Knoppen tonen/verbergen; bij verbergen sluiten de panelen ook (de tekening blijft bewaard). */
export function setToolsVisible(on) {
  initTools(); if (!inkCv) buildInk(); visible = on;
  if (!on) for (const k of ['calc', 'pad']) if (opened[k]) { opened[k] = false; el(k).hidden = true; }
  document.body.classList.toggle('has-tools', on);
  refresh();
}

// ---------------------------------------------------------------- pen over het hele scherm
// Schrijf met je pen (of muis) waar je wilt, ook over de vraag heen. Met "alleen pen" scrolt en tikt je vinger gewoon door.
// De tekening hoort bij de pagina (scrolt mee) en verdwijnt bij de volgende vraag of weergave.
const ink = { on: false, strokes: [], cur: null, key: '', color: 'auto', size: 3, eraser: false, penOnly: true, lastPen: 0, touch: null };
try { Object.assign(ink, JSON.parse(localStorage.getItem('flic.ink')) || {}, { on: false }); } catch { /* negeren */ }
let inkCv, inkBar, inkBtn;
const inkSave = () => { try { localStorage.setItem('flic.ink', JSON.stringify({ color: ink.color, size: ink.size, penOnly: ink.penOnly })); } catch { /* negeren */ } };
function inkDraw() {
  if (!inkCv) return;
  const ctx = inkCv.getContext('2d'), r = devicePixelRatio || 1, sx = scrollX, sy = scrollY;
  ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, inkCv.width, inkCv.height); ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of ink.strokes) {
    ctx.globalCompositeOperation = s.er ? 'destination-out' : 'source-over'; ctx.strokeStyle = ctx.fillStyle = s.c;
    if (s.p.length === 1) { const [x, y, w] = s.p[0]; ctx.beginPath(); ctx.arc(x - sx, y - sy, w / 2, 0, 7); ctx.fill(); continue; }
    for (let i = 1; i < s.p.length; i++) {
      const a = s.p[i - 1], b = s.p[i]; ctx.lineWidth = b[2];
      ctx.beginPath(); ctx.moveTo(a[0] - sx, a[1] - sy); ctx.lineTo(b[0] - sx, b[1] - sy); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}
let inkRaf = 0; const inkSoon = () => { if (!inkRaf) inkRaf = requestAnimationFrame(() => { inkRaf = 0; inkDraw(); }); };
function inkFit() { const r = devicePixelRatio || 1; inkCv.width = Math.round(innerWidth * r); inkCv.height = Math.round(innerHeight * r); inkDraw(); }
const inkColor = () => (ink.color === 'auto' ? getComputedStyle(document.body).color : ink.color);
function inkPoint(e) {
  const p = e.pointerType === 'pen' && e.pressure > 0 ? 0.5 + e.pressure : 1;
  const w = (ink.eraser ? ink.size * 6 : ink.size) * p;
  return [e.clientX + scrollX, e.clientY + scrollY, w];
}
function inkPointerDown(e) {
  if (e.pointerType === 'pen') ink.lastPen = performance.now();
  const touch = e.pointerType === 'touch';
  if (touch && (ink.penOnly || performance.now() - ink.lastPen < 700)) {
    if (performance.now() - ink.lastPen < 700) return;             // handpalm tijdens het schrijven negeren
    ink.touch = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId }; inkCv.setPointerCapture(e.pointerId); return;
  }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault(); inkCv.setPointerCapture(e.pointerId);
  ink.cur = { c: inkColor(), er: ink.eraser, p: [inkPoint(e)], id: e.pointerId }; ink.strokes.push(ink.cur); inkDraw();
}
function inkPointerMove(e) {
  if (e.pointerType === 'pen') ink.lastPen = performance.now();
  if (ink.touch && ink.touch.id === e.pointerId) {
    const dx = e.clientX - ink.touch.x, dy = e.clientY - ink.touch.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) ink.touch.moved = true;
    if (ink.touch.moved) { scrollBy(-dx, -dy); ink.touch.x = e.clientX; ink.touch.y = e.clientY; }
    return;
  }
  if (!ink.cur || ink.cur.id !== e.pointerId) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) ink.cur.p.push(inkPoint(ev));
  inkSoon();
}
function inkPointerUp(e) {
  if (ink.touch && ink.touch.id === e.pointerId) {
    const t = ink.touch; ink.touch = null;
    if (!t.moved && performance.now() - t.t < 450 && e.type === 'pointerup') {          // tik: doorgeven aan wat eronder zit
      inkCv.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      inkCv.style.pointerEvents = '';
      if (el && typeof el.click === 'function') { el.click(); if (el.focus) try { el.focus({ preventScroll: true }); } catch { /* negeren */ } }
    }
    return;
  }
  if (ink.cur && ink.cur.id === e.pointerId) ink.cur = null;
}
function inkSet(on) {
  ink.on = on; inkCv.hidden = !on; inkBar.hidden = !on; inkBtn.hidden = on;
  document.body.classList.toggle('ink-on', on);
  if (on) inkFit();
}
function buildInk() {
  inkCv = $('canvas', { class: 'inkcv', hidden: true, 'aria-label': 'Schrijflaag over het scherm' });
  inkCv.addEventListener('pointerdown', inkPointerDown); inkCv.addEventListener('pointermove', inkPointerMove);
  inkCv.addEventListener('pointerup', inkPointerUp); inkCv.addEventListener('pointercancel', inkPointerUp);
  inkCv.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('resize', () => ink.on && inkFit()); addEventListener('scroll', inkSoon, { passive: true });
  const sw = (c, label) => $('button', { type: 'button', class: 'sw', 'data-c': c, style: `background:${c === 'auto' ? 'var(--text)' : c}`, 'aria-label': label, onclick: () => { ink.color = c; ink.eraser = false; inkSave(); sync(); } });
  const bPen = $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Pen', onclick: () => { ink.eraser = false; sync(); } }, '✏️');
  const bEr = $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Gum', onclick: () => { ink.eraser = true; sync(); } }, 'Gum');
  const bTh = $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Dikte', onclick: () => { ink.size = ink.size >= 7 ? 2 : ink.size + 2; inkSave(); sync(); } }, '');
  const bPo = $('button', { type: 'button', class: 'ghost small', title: 'Alleen pen: je vinger scrolt en tikt gewoon door', onclick: () => { ink.penOnly = !ink.penOnly; inkSave(); sync(); } }, '');
  const sync = () => {
    bPen.classList.toggle('on', !ink.eraser); bEr.classList.toggle('on', ink.eraser);
    bTh.textContent = '●'.repeat(1) + ' ' + ink.size; bTh.style.fontSize = '.85rem';
    bPo.textContent = ink.penOnly ? '🖊 alleen pen' : '🖊 ook vinger'; bPo.classList.toggle('on', ink.penOnly);
    inkBar.querySelectorAll('.sw').forEach(b => b.classList.toggle('sel', !ink.eraser && b.dataset.c === ink.color));
  };
  inkBar = $('div', { class: 'inkbar', hidden: true, role: 'toolbar', 'aria-label': 'Schrijven over het scherm' },
    bPen, sw('auto', 'Wit/zwart'), sw('#4da3ff', 'Blauw'), sw('#f85149', 'Rood'), sw('#3fb950', 'Groen'), bEr, bTh,
    $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Ongedaan maken', onclick: () => { ink.strokes.pop(); inkDraw(); } }, '↶'),
    $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Alles wissen', onclick: () => { ink.strokes.length = 0; inkDraw(); } }, 'Wis'),
    bPo,
    $('button', { type: 'button', class: 'ghost small', 'aria-label': 'Schrijven stoppen', onclick: () => inkSet(false) }, '✕'));
  inkBtn = $('button', { type: 'button', class: 'inkbtn', title: 'Schrijven over het scherm', 'aria-label': 'Schrijven over het scherm', onclick: () => inkSet(true) }, '🖊️');
  document.body.append(inkCv, inkBtn, inkBar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ink.on && !e.target.closest('.tpanel')) inkSet(false); });
  sync();
}
/** Bij een andere vraag of weergave verdwijnt de tekening (de laag blijft aan als je 'm aan had). */
export function setInkKey(k) {
  if (!inkCv) buildInk();
  if (k !== ink.key) { ink.key = k; if (ink.strokes.length) { ink.strokes.length = 0; inkDraw(); } }
}
