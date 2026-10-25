#!/usr/bin/env python3
"""Bouwt de VERON-theorie (Cursusboek voor het F-examen) voor de app.

De VERON-pdf's zijn scans zonder tekstlaag. Per pagina:
  1. renderen op 300 dpi, doorschijnende achterkant en perforatiegaten wegpoetsen;
  2. OCR met tesseract (nld) naar woorden met positie en zekerheid;
  3. regels die goed gelezen zijn worden tekst, de rest van de inkt (tekeningen, formules,
     tabellen) wordt als figuur uitgeknipt, met de labels die erin of ernaast staan;
  4. koppen als "7.1.1 Titel" verdelen de tekst in (sub)paragrafen.

Uitvoer (zelfde vorm als de VRZA-theorie, zie build_theory_vrza.py):
  data/veron/index.json, data/veron/hoofdstuk-N.json, data/veron/tekst-N.json, img/veron/hN/*.webp

Gebruik: python3 tools/build_theory_veron.py <map met VERON-pdf's> [hoofdstukken, bv. 1,7]
Vereist: tesseract met taal 'nld', pymupdf, numpy, scipy, pillow.
De OCR-uitkomst wordt bewaard in .cache/veron, zodat opnieuw bouwen snel gaat.
"""
import csv, glob, html, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pymupdf
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, '.cache', 'veron')
DATA = os.path.join(ROOT, 'data', 'veron')
IMG = os.path.join(ROOT, 'img', 'veron')
DPI = 300
SCALE = 0.4          # px op 300 dpi -> weergavebreedte in de app


# ---------- 1+2: render, schoonmaken, OCR ----------

def ocr_page(pdf, n, i):
    base = os.path.join(CACHE, f'h{n}', f'p{i:03d}')
    if os.path.exists(base + '.tsv') and os.path.exists(base + '.png'):
        return base
    os.makedirs(os.path.dirname(base), exist_ok=True)
    pix = pymupdf.open(pdf)[i].get_pixmap(dpi=DPI, colorspace=pymupdf.csGRAY)
    a = np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w).copy()
    H, W = a.shape
    a[a > 175] = 255                       # doorschijnende achterkant
    a[:, :int(W * .12)] = 255              # perforatiegaten links
    a[:, int(W * .84):] = 255              # gaten en hoofdstuktab rechts
    a[:int(H * .03)] = 255
    a[int(H * .95):] = 255
    a = deskew(a)
    Image.fromarray(a).save(base + '.png')
    subprocess.run(['tesseract', base + '.png', base, '-l', 'nld', '--psm', '3', '--dpi', str(DPI), 'tsv'],
                   capture_output=True, env={**os.environ, 'OMP_THREAD_LIMIT': '1'})
    return base


def deskew(a):
    """Scans staan vaak een graad scheef; zoek de hoek waarbij de tekstregels het scherpst zijn."""
    small = Image.fromarray(a).reduce(4)
    best, angle = -1, 0.0
    for t in np.arange(-2.5, 2.51, .1):
        r = np.array(small.rotate(t, resample=Image.BILINEAR, fillcolor=255)) < 140
        score = np.var(r.sum(1))
        if score > best:
            best, angle = score, t
    if abs(angle) < .05:
        return a
    return np.array(Image.fromarray(a).rotate(angle, resample=Image.BICUBIC, fillcolor=255))


def read_words(base):
    words = []
    with open(base + '.tsv', newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f, delimiter='\t', quoting=csv.QUOTE_NONE):
            if r['level'] != '5' or not (r['text'] or '').strip():
                continue
            x, y, w, h = int(r['left']), int(r['top']), int(r['width']), int(r['height'])
            words.append(dict(x0=x, y0=y, x1=x + w, y1=y + h, conf=float(r['conf']), t=r['text'].strip(),
                              key=(int(r['block_num']), int(r['par_num']), int(r['line_num']))))
    return words


# ---------- 3: regels, tekst of figuur ----------

GOOD = 60

def good_word(w):
    t = w['t']
    if w['conf'] < GOOD:
        return False
    letters = sum(c.isalnum() for c in t)
    return letters >= max(1, len(t) * .5)


def make_lines(words):
    """Tesseract-regels, en regels uit verschillende blokken die naast elkaar staan samengevoegd
    (bv. kopnummer en koptitel)."""
    by = {}
    for w in words:
        by.setdefault(w['key'], []).append(w)
    lines = []
    pieces = []
    for ws in by.values():
        ws.sort(key=lambda w: w['x0'])
        # tesseract plakt soms een bijschrift naast de tekst aan de tekstregel vast: knip bij grote gaten
        cut = [0] + [i for i in range(1, len(ws)) if ws[i]['x0'] - ws[i - 1]['x1'] > 60] + [len(ws)]
        pieces += [ws[a:b] for a, b in zip(cut, cut[1:])]
    for ws in pieces:
        lines.append(dict(ws=ws, x0=min(w['x0'] for w in ws), x1=max(w['x1'] for w in ws),
                          y0=min(w['y0'] for w in ws), y1=max(w['y1'] for w in ws)))
    lines.sort(key=lambda l: (l['y0'], l['x0']))
    merged = True
    while merged:
        merged = False
        for a in lines:
            for b in lines:
                if a is b or b['x0'] < a['x1'] or not (len(a['ws']) == 1 and NUMTOK.match(a['ws'][0]['t'])):
                    continue
                ov = min(a['y1'], b['y1']) - max(a['y0'], b['y0'])
                ha, hb = a['y1'] - a['y0'], b['y1'] - b['y0']
                if ov > .5 * min(ha, hb) and b['x0'] - a['x1'] < 420 and max(ha, hb) < 2.2 * min(ha, hb):
                    a['ws'] += b['ws']
                    a['x1'], a['y0'], a['y1'] = b['x1'], min(a['y0'], b['y0']), max(a['y1'], b['y1'])
                    lines.remove(b)
                    merged = True
                    break
            if merged:
                break
    for l in lines:
        l['ws'].sort(key=lambda w: w['x0'])
    lines.sort(key=lambda l: (l['y0'], l['x0']))
    return lines


def line_text(ws):
    return ' '.join(w['t'] for w in ws)


def split_text(l, body_h):
    """Bepaal welk deel van een regel betrouwbare tekst is. Slechte woorden aan het eind (vaak een
    formule achter 'met:') worden losgeknipt als inkt voor een figuur."""
    ws = l['ws']
    if len(ws) > 1 and NUMTOK.match(ws[0]['t']) and ws[1]['t'][:1].isupper() and np.mean([w['conf'] for w in ws[1:]]) >= 20:
        return ws          # kop: groter lettertype, OCR is daar minder zeker maar meestal goed
    good = [good_word(w) for w in ws]
    end = len(ws)
    while end > 0 and not good[end - 1]:
        end -= 1
    tail = ws[end:]
    if len(tail) == 1 and tail[0]['y1'] - tail[0]['y0'] < 1.4 * body_h and end and tail[0]['x0'] - ws[end - 1]['x1'] < 45:
        end = len(ws)       # één twijfelachtig woord aan het eind is gewoon tekst
    start = 0
    while start < end and not good[start] and ws[start]['t'] not in BULLETS:
        start += 1
    if start == 1 and ws[0]['y1'] - ws[0]['y0'] < 1.4 * body_h and len(ws) > 1 and ws[1]['x0'] - ws[0]['x1'] < 45:
        start = 0
    keep = ws[start:end]
    if not keep:
        return None
    g = [w for w in keep if good_word(w)]
    chars = sum(len(w['t']) for w in keep)
    if sum(len(w['t']) for w in g) < .7 * chars:
        return None
    alpha = sum(c.isalpha() for w in keep for c in w['t'])
    if alpha < 3 and not re.match(r'^\d', keep[0]['t']):
        return None
    return keep


BULLETS = {'•', '«', '*', '°', '„', '-', '—', '–', 'e', 'o', '©', '®', '>', '»', '¢'}


def page_blocks(base, body_h):
    words = read_words(base)
    img = np.array(Image.open(base + '.png'))
    H, W = img.shape
    lines = make_lines(words)
    text, erase = [], []
    foot = min([l['y0'] for l in lines if l['y0'] > H * .7 and re.search(r'Cursusboek|Pagina \d+ van|^VERON\b', line_text(l['ws']))],
               default=H)
    for l in lines:
        t = line_text(l['ws'])
        if l['y0'] >= foot - 10 or re.match(r'^Aantekening\s*:?$', t):
            erase.append(l)
            continue
        keep = split_text(l, body_h)
        h = l['y1'] - l['y0']
        if keep and h < 3.2 * body_h:
            tl = dict(ws=keep, x0=keep[0]['x0'], x1=max(w['x1'] for w in keep),
                      y0=min(w['y0'] for w in keep), y1=max(w['y1'] for w in keep))
            text.append(tl)
    # inkt die niet onder een tekstregel valt
    ink = img < 140
    ink[max(0, foot - 15):] = False
    for l in erase:
        ink[max(0, l['y0'] - 6):l['y1'] + 6, max(0, l['x0'] - 6):l['x1'] + 6] = False
    for l in text:
        for w in l['ws']:      # per woord: een regel die doorloopt tot in een figuur mag die niet doorsnijden
            ink[max(0, w['y0'] - 5):w['y1'] + 5, max(0, w['x0'] - 5):w['x1'] + 5] = False
    ink = ndimage.binary_opening(ink, np.ones((2, 2)))
    # verbinden op een grof raster (4x4 px per cel) gaat veel sneller dan op volle resolutie
    h4, w4 = H // 4, W // 4
    small = ink[:h4 * 4, :w4 * 4].reshape(h4, 4, w4, 4).any(axis=(1, 3))
    lab, k = ndimage.label(ndimage.binary_dilation(small, np.ones((8, 8))))
    figs = []
    for sl in ndimage.find_objects(lab):
        y0, y1, x0, x1 = sl[0].start * 4, sl[0].stop * 4, sl[1].start * 4, sl[1].stop * 4
        sub = ink[y0:y1, x0:x1]
        if sub.sum() < 250 or (x1 - x0 < 70 and y1 - y0 < 70):
            continue
        ys, xs = np.nonzero(sub)
        figs.append([x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max()])
    ink_box = {id(f): list(f) for f in figs}     # alleen de inkt, zonder opgenomen labels
    # een 'figuur' van één regel hoogte die toch redelijk gelezen is, is gewoon tekst (bv. U = I * R)
    for f in list(figs):
        if f[3] - f[1] > 3.5 * body_h:
            continue
        inw = [w for w in words if f[0] - 5 <= (w['x0'] + w['x1']) / 2 <= f[2] + 5 and f[1] - 5 <= (w['y0'] + w['y1']) / 2 <= f[3] + 5]
        if not inw or np.mean([w['conf'] for w in inw]) < 50:
            continue
        rows = []
        for w in sorted(inw, key=lambda w: (w['y0'] + w['y1']) / 2):
            c = (w['y0'] + w['y1']) / 2
            if rows and abs(c - rows[-1][0]) < .6 * body_h:
                rows[-1][1].append(w)
            else:
                rows.append([c, [w]])
        if all(sum(w['x1'] - w['x0'] for w in r) > .5 * (max(w['x1'] for w in r) - min(w['x0'] for w in r)) for _, r in rows) \
                and sum(w['x1'] - w['x0'] for _, r in rows for w in r) > .45 * (f[2] - f[0]) * len(rows):
            for _, r in rows:
                r.sort(key=lambda w: w['x0'])
                text.append(dict(ws=r, x0=r[0]['x0'], x1=max(w['x1'] for w in r),
                                 y0=min(w['y0'] for w in r), y1=max(w['y1'] for w in r)))
            figs.remove(f)
    # bijschriften (Figuur 1.10 ...) met hun vervolgregels; ze staan vaak naast de lopende tekst
    text.sort(key=lambda l: (l['y0'], l['x0']))
    caps = []
    for l in list(text):
        if l not in text or not re.match(r'^(Figuur|Fig\.|Tabel)\s*\d', line_text(l['ws'])):
            continue
        group, last = [l], l
        for m in text:
            if m is not l and m['y0'] > last['y0'] and m['y0'] - last['y1'] < .6 * body_h \
                    and l['x0'] - 150 < m['x0'] < l['x1'] + 30 and m['x1'] - m['x0'] < 1.6 * (l['x1'] - l['x0']) + 400 \
                    and not re.match(r'^(Figuur|Fig\.|Tabel)\s*\d', line_text(m['ws'])):
                group.append(m)
                last = m
        for m in group:
            text.remove(m)
        caps.append(dict(kind='cap', ws=[w for m in group for w in m['ws']], x0=l['x0'], y0=l['y0'],
                         x1=max(m['x1'] for m in group), y1=last['y1']))
    # labels in en naast figuren horen bij de figuur; figuren die elkaar raken worden één
    col = max((l['x1'] - l['x0'] for l in text), default=W * .6)
    # linkerkantlijnen van echte tekstregels: een korte regel die daarop begint is tekst, geen label
    lefts = [l['x0'] for l in text if sum(w['conf'] >= 75 for w in l['ws']) >= 4]
    changed = True
    while changed:
        changed = False
        for f in figs:
            for l in list(text):
                if re.match(r'^(Figuur|Fig\.|Tabel)\s*\d', line_text(l['ws'])):
                    continue
                pad = 28
                xo = min(f[2] + pad, l['x1']) - max(f[0] - pad, l['x0'])
                yo = min(f[3] + pad, l['y1']) - max(f[1] - pad, l['y0'])
                wide = l['x1'] - l['x0'] > .4 * col or sum(w['conf'] >= 75 and sum(c.isalpha() for c in w['t']) >= 2 for w in l['ws']) >= 3
                inside = l['x0'] >= f[0] - 10 and l['x1'] <= f[2] + 10 and l['y0'] >= f[1] - 10 and l['y1'] <= f[3] + 10
                fi = ink_box.get(id(f), f)
                aligned = any(abs(l['x0'] - p) < 15 for p in lefts) and not (
                    l['x0'] >= fi[0] - 10 and l['x1'] <= fi[2] + 10 and l['y0'] >= fi[1] - 10 and l['y1'] <= fi[3] + 10)
                headlike = bool(NUMTOK.match(l['ws'][0]['t'])) and len(l['ws']) > 1 and l['ws'][1]['t'][:1].isupper()
                if xo > 0 and yo > 0 and (inside or not (wide or headlike or aligned)):
                    f[:] = [min(f[0], l['x0']), min(f[1], l['y0']), max(f[2], l['x1']), max(f[3], l['y1'])]
                    text.remove(l)
                    changed = True
            for g in figs:
                xo = min(f[2], g[2]) - max(f[0], g[0])
                stacked = xo > .5 * min(f[2] - f[0], g[2] - g[0]) and min(f[3], g[3]) + 2 * body_h > max(f[1], g[1])
                if g is not f and (stacked or (xo + 20 > 0 and min(f[3], g[3]) + 20 > max(f[1], g[1]))):
                    f[:] = [min(f[0], g[0]), min(f[1], g[1]), max(f[2], g[2]), max(f[3], g[3])]
                    a_, b_ = ink_box.get(id(f), f), ink_box.get(id(g), g)
                    ink_box[id(f)] = [min(a_[0], b_[0]), min(a_[1], b_[1]), max(a_[2], b_[2]), max(a_[3], b_[3])]
                    figs.remove(g)
                    changed = True
                    break
    blocks = [dict(kind='line', **l) for l in text] + caps
    for f in figs:
        blocks.append(dict(kind='fig', x0=f[0], y0=f[1], x1=f[2], y1=f[3]))
    blocks.sort(key=lambda b: (b['y0'], b['x0']))
    return blocks, img


# ---------- 4: tekst opbouwen, koppen, paragrafen ----------

CONT = r'(,|\ben|\bvan|\bde|\bhet|-)$'    # kop loopt door op de volgende regel
HEAD = re.compile(r'^(\d{1,2}(?:\.\d{1,2}){0,4})\.?$')
NUMTOK = re.compile(r'^\d{1,3}(\.\d{1,3}){0,4}\.?$')

def esc(s):
    return html.escape(s, quote=False)


def clean_text(t):
    t = t.replace('|', 'I').replace('’', "'").replace('‘', "'")
    t = re.sub(r'\s+([,.;:!?)])', r'\1', t)
    t = re.sub(r'([(])\s+', r'\1', t)
    return t


def heading_of(l, n, body_left, body_h, seen, last):
    ws = l['ws']
    if len(ws) > 2 and re.match(r'^\d+(\.\d+)+\.$', ws[0]['t']) and re.match(r'^\d$', ws[1]['t']):
        ws = [dict(ws[0], t=ws[0]['t'] + ws[1]['t'])] + ws[2:]      # "1.7.5. 1 Ruis"
    tok = ws[0]['t']
    if not re.match(r'^\d{1,3}(\.\d{1,3}){0,4}\.?$', tok) or len(ws) < 2:
        return None
    title = clean_text(line_text(ws[1:]))
    tab = ws[1]['x0'] - ws[0]['x1'] > 90            # tab tussen nummer en titel: kenmerk van een kop
    if tab and title[:1].islower():
        title = ('I' + title[1:]) if title[0] == 'l' else title[0].upper() + title[1:]   # "lonosfeer"
    if len(title) > 70 or not re.search(r'[A-Za-z]{2}', title) or not title[0].isupper() or re.search(r'\.(\s|$)', title):
        return None
    if ws[0]['x0'] > body_left - 40 and not tab:
        return None
    key = heading_key(tok.rstrip('.'), n, last)
    if not key or key in seen or any(k > 20 for k in key):
        return None
    return '.'.join(map(str, key)), title, key


def heading_key(tok, n, last):
    """Kopnummer, met reparatie van typische OCR-fouten: weggevallen punten ("71.2" = 7.1.2,
    "7.11.2" = 7.1.1.2) en een 7 die als 1 gelezen is ("1.2.2" in H7)."""
    parts = tok.split('.')
    orig = tuple(int(p) for p in parts) if all(len(p) <= 2 for p in parts) else None
    if orig and orig[0] == n and follows(last, orig):
        return orig
    digits = tok.replace('.', '')
    starts = [digits]
    if not digits.startswith(str(n)):
        starts.append(str(n) + digits[1:])
    cands = []
    for d in starts:
        if not d.startswith(str(n)):
            continue
        rest = d[len(str(n)):]
        for split in splits(rest):
            key = (n,) + split
            if 2 <= len(key) <= 5 and follows(last, key):
                cands.append(key)
    if cands:
        cands.sort(key=lambda k: (abs(len(k) - len(parts)), len(k)))
        return cands[0]
    if orig and orig[0] == n and len(orig) > 1:
        return orig            # pagina's staan soms niet op volgorde; nummer zelf ziet er goed uit
    return None


def splits(d):
    """Alle manieren om een cijferreeks in delen van 1 of 2 cijfers te knippen (zonder voorloopnul)."""
    if not d:
        return [()]
    out = []
    for k in (1, 2):
        if len(d) >= k and d[0] != '0':
            out += [(int(d[:k]),) + r for r in splits(d[k:])]
    return out


def follows(last, key):
    """Kan 'key' de volgende kop na 'last' zijn? Een kop die OCR mist mag overgeslagen worden."""
    if last is None:
        return all(k <= 2 for k in key[1:])
    for i in range(len(key)):
        if i >= len(last):
            return all(k <= 2 for k in key[i:]) and key[i] >= 1
        if key[i] != last[i]:
            return last[i] < key[i] <= last[i] + 2 and all(k <= 2 for k in key[i + 1:])
    return False


def build_chapter(pdf, n, title_hint):
    d = pymupdf.open(pdf)
    with ThreadPoolExecutor(4) as ex:
        bases = list(ex.map(lambda i: ocr_page(pdf, n, i), range(len(d))))
    allw = [w for b in bases for w in read_words(b) if good_word(w) and len(w['t']) >= 4 and w['t'].isalpha() and w['t'].islower()]
    body_h = float(np.median([w['y1'] - w['y0'] for w in allw])) if allw else 30
    os.makedirs(os.path.join(IMG, f'h{n}'), exist_ok=True)

    sections = []           # {id,num,title,lvl,parts:[html]}
    cur = None
    chapter_title = title_hint
    seen = set()
    last = None
    figno = {}

    def new_section(num, title, lvl):
        nonlocal cur
        cur = dict(id='s' + num.replace('.', '-'), key=tuple(int(p) for p in num.split('.')), num=num, title=f'{num} {title}'.strip(), lvl=lvl, parts=[], para=None)
        sections.append(cur)

    pending = []            # figuren die na de lopende alinea komen (tekst loopt vaak naast de figuur door)

    def flush():
        if cur and cur['para']:
            kind, ls = cur['para']
            txt = clean_text(join_lines(ls))
            if kind == 'li':
                cur['parts'].append(f'<ul><li>{esc(txt)}</li></ul>')
            else:
                cur['parts'].append(f'<p>{esc(txt)}</p>')
            cur['para'] = None
        for part in pending:
            cur['parts'].append(part)
        pending.clear()

    def figure(b, img):
        x0, y0, x1, y1 = max(0, b['x0'] - 8), max(0, b['y0'] - 8), b['x1'] + 8, b['y1'] + 8
        crop = Image.fromarray(img[y0:y1, x0:x1])
        k = figno.get(cur['id'], 0) + 1
        figno[cur['id']] = k
        name = f'{cur["id"]}-f{k}.webp'
        crop.save(os.path.join(IMG, f'h{n}', name), quality=80, method=6)
        w, h = crop.size
        cls = 'teq' if h < 4 * body_h and w < 1400 else 'tfig'
        return (f'<img class="{cls}" src="img/veron/h{n}/{name}" width="{round(w * SCALE)}" '
                f'height="{round(h * SCALE)}" alt="" loading="lazy">')

    new_section(str(n), 'Inleiding', 1)
    for pi, base in enumerate(bases):
        blocks, img = page_blocks(base, body_h)
        img = img.copy()       # tekst die als tekst in de app komt niet nog eens in een figuur laten zien
        for x in blocks:
            for w in x.get('ws', ()):
                img[max(0, w['y0'] - 3):w['y1'] + 3, max(0, w['x0'] - 3):w['x1'] + 3] = 255
        lines = [b for b in blocks if b['kind'] == 'line']
        lefts = sorted(b['x0'] for b in lines if b['x1'] - b['x0'] > 900)
        body_left = lefts[len(lefts) // 3] if lefts else 800
        right = max((b['x1'] for b in lines), default=2000)
        prev = None
        for b in blocks:
            if b['kind'] == 'fig':
                pending.append(figure(b, img))
                continue
            if b['kind'] == 'cap':
                cap = f'<div class="cap">{esc(clean_text(line_text(b["ws"])))}</div>'
                if pending:
                    pending.append(cap)
                else:
                    cur['parts'].append(cap)
                continue
            if cur.get('head') and -5 < b['y0'] - cur['head'][0] < .75 * body_h:
                # tweede regel van een kop die niet op één regel paste
                extra = clean_text(line_text(b['ws']))
                if cur['head'][2] == 'sec':
                    cur['title'] += ' ' + extra
                else:
                    cur['parts'][-1] = cur['parts'][-1].replace('</h3>', ' ' + esc(extra) + '</h3>')
                cur['head'] = (b['y1'], b['x0'], cur['head'][2]) if re.search(CONT, extra) else None
                continue
            cur['head'] = None
            hd = heading_of(b, n, body_left, body_h, seen, last)
            if hd:
                flush()
                num, title, key = hd
                seen.add(key)
                last = key
                depth = len(key)
                if depth == 1:
                    pass        # hoofdstuktitel komt uit de bestandsnaam (OCR mist vaak het grote nummer)
                elif depth <= 3:
                    new_section(num, title, depth - 1)
                else:
                    cur['parts'].append(f'<h3>{esc(num)} {esc(title)}</h3>')
                if depth > 1 and re.search(CONT, title):
                    cur['head'] = (b['y1'], b['ws'][1]['x0'], 'sec' if depth <= 3 else 'h3')
                prev = None
                continue
            first = b['ws'][0]['t']
            is_li = first in BULLETS and len(b['ws']) > 1 and b['ws'][1]['x0'] - b['ws'][0]['x1'] > 12
            if prev is None:
                # eerste regel op de pagina (of na een kop): loopt de alinea van de vorige pagina door?
                carry = (cur['para'] and cur['para'][0] == 'p' and not is_li
                         and not re.search(r'[.:!?]$', line_text(cur['para'][1][-1])) and b['ws'][0]['t'][:1].islower())
                new_par = not carry
            else:
                new_par = (is_li or b['y0'] - prev['y1'] > .9 * body_h
                           or (prev['x1'] < right - 250 and re.search(r'[.:!?]$', line_text(prev['ws'])))
                           or b['x0'] > body_left + 60 and prev['x0'] <= body_left + 30)
            if new_par:
                flush()
                cur['para'] = ('li' if is_li else 'p', [b['ws'][1:] if is_li else b['ws']])
            else:
                cur['para'][1].append(b['ws'])
            prev = b
    flush()

    # De scans staan niet altijd op volgorde (in H1 staat 1.8.6.2-1.8.12 vóór 1.7): sorteer op nummer.
    sections.sort(key=lambda s: s['key'])
    tekst, secs = {}, []
    for i, s in enumerate(sections):
        body = '\n'.join(s['parts'])
        body = body.replace('</ul>\n<ul>', '\n')
        if s['num'] == str(n) and not body:
            continue
        title = s['title'] if s['num'] != str(n) else 'Inleiding'
        group = s['lvl'] == 1 and i + 1 < len(sections) and sections[i + 1]['lvl'] == 2
        if group and body:
            # tekst onder een paragraafkop met subparagrafen: als eigen 'inleiding' onder die kop
            secs.append(dict(id=s['id'], num=s['num'], title=title, lvl=1, text=0))
            sid, title, lvl = s['id'] + '-0', f'{title} (inleiding)', 2
        else:
            sid, lvl = s['id'], s['lvl']
        tekst[sid] = body
        secs.append(dict(id=sid, num=s['num'], title=title, lvl=lvl, text=len(re.sub('<[^>]+>', '', body))))
    return chapter_title, secs, tekst


def join_lines(ls):
    out = ''
    for ws in ls:
        t = line_text(ws)
        if out.endswith('-') and t[:1].islower() and not re.search(r'[A-Z]{2,}-$', out):
            out = out[:-1] + t           # afgebroken woord
        elif out.endswith('-'):
            out += t
        else:
            out = (out + ' ' + t).strip()
    return out


def main():
    src = sys.argv[1]
    only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
    os.makedirs(DATA, exist_ok=True)
    idx_path = os.path.join(DATA, 'index.json')
    index = json.load(open(idx_path)) if os.path.exists(idx_path) else {'chapters': []}
    chapters = {c['n']: c for c in index['chapters']}
    for pdf in sorted(glob.glob(os.path.join(src, 'Hoofdstuk*.pdf')), key=lambda p: int(re.search(r'Hoofdstuk (\d+)', p).group(1))):
        m = re.search(r'Hoofdstuk (\d+)\.\s*(.*?)[;.]*\.pdf$', os.path.basename(pdf))
        n = int(m.group(1))
        if only and str(n) not in only:
            continue
        for f in glob.glob(os.path.join(IMG, f'h{n}', '*.webp')):
            os.remove(f)
        title, secs, tekst = build_chapter(pdf, n, m.group(2).strip().replace('Propogatie', 'Propagatie'))
        json.dump(dict(chapter=n, dir=f'img/veron/h{n}', sections=secs, opgaven=[], qmap={}, formulas=[], cards=[], drill=[]),
                  open(os.path.join(DATA, f'hoofdstuk-{n}.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
        json.dump(tekst, open(os.path.join(DATA, f'tekst-{n}.json'), 'w'), ensure_ascii=False, indent=0)
        chapters[n] = dict(n=n, title=title, theory=True)
        print(f'Hoofdstuk {n}: {title}: {len(secs)} (sub)paragrafen, '
              f'{sum(t.count("<img") for t in tekst.values())} afbeeldingen', flush=True)
    index['chapters'] = [chapters[k] for k in sorted(chapters)]
    json.dump(index, open(idx_path, 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
