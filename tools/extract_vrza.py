#!/usr/bin/env python3
"""
Haalt vragen + uitwerkingen uit VRZA 'Examentraining'-PDF's en schrijft
data/hoofdstuk-<N>.json + afbeeldingen naar img/examenvragen/hs<N>/.

Gebruik:
    python tools/extract_vrza.py bronnen/HS3_exa_A_20231029.pdf bronnen/HS3_exa_B_20220727.pdf
Het hoofdstuknummer wordt uit de bestandsnaam gehaald (HS<N>_exa_...).
Daarna: python tools/build_index.py   (maakt data/index.json)
Vereist: poppler-utils (pdftotext, pdftoppm), pdfplumber, Pillow.
"""
import json, re, subprocess, sys
from pathlib import Path
import pdfplumber
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
DPI = 110

HEAD_RE = re.compile(r'^\s*(?:\d+\.\d+\.\d+\s+)?Opgave\s+(\d+)-(\d+)\s*$')
SOL_RE = re.compile(r'^\s*(?:\d+\.\d+\.\d+\s+)?(?:Uitwerking van|Antwoord bij) Opgave\s+(\d+)-(\d+)\s*$')
# tikfout in sommige PDF's: "5.5.141 (?:Uitwerking van|Antwoord bij) Opgave 5-" (nummer ontbreekt) -> nummer uit het kopnummer
SOL_RE_NONUM = re.compile(r'^\s*\d+\.\d+\.(\d+)\s+(?:Uitwerking van|Antwoord bij)\s*Opgave\s+\d+-\d*\s*$')
OPT_RE = re.compile(r'^\s*([A-Da-d])\.\s*(.*)$')
INLINE_OPT_RE = re.compile(r'^\s*a\.\s.*\sb\.\s.*\sc\.\s.*\sd\.\s', re.I)
FOOT_RE = re.compile(r'^\s*(©|\d+-\d+\s*$)')
HEADER_RE = re.compile(r'^VRZA-cursus radiozendamateur')
# regel uit de inhoudsopgave: "3.5.23 Uitwerking van Opgave 3-23 ........ 3-90"
TOC_RE = re.compile(r'\.{4,}\s*\d+-\d+\s*$')
SRC_RE = re.compile(r'^\s*\((F-examen|N-examen|examen|F examen|Bron|CEPT)', re.I)


SYMBOL = {0x57: 'Ω', 0x6D: 'µ', 0x77: 'ω', 0x72: 'ρ', 0x6C: 'λ', 0x44: 'Δ', 0x70: 'π',
          0x68: 'η', 0x66: 'φ', 0x71: 'θ', 0x61: 'α', 0x62: 'β', 0x67: 'γ', 0x64: 'δ',
          0x65: 'ε', 0x74: 'τ', 0x73: 'σ', 0x53: 'Σ', 0x46: 'Φ', 0xB0: '°', 0xB1: '±',
          0xD7: '×', 0xA5: '∞', 0xAE: '→'}


def clean_text(t):
    out = []
    for ch in t:
        c = ord(ch)
        if 0xF000 <= c <= 0xF0FF:
            lo = c - 0xF000
            out.append(SYMBOL.get(lo, chr(lo) if 0x20 <= lo < 0x7F else ''))
        else:
            out.append(ch)
    return ''.join(out)


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def page_texts(pdf):
    txt = clean_text(run(['pdftotext', '-layout', str(pdf), '-']))
    pages = txt.split('\f')
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def clean_lines(page):
    out = []
    for ln in page.split('\n'):
        if HEADER_RE.match(ln.strip()) or FOOT_RE.match(ln):
            continue
        out.append(ln.rstrip())
    while out and not out[0].strip():
        out.pop(0)
    while out and not out[-1].strip():
        out.pop()
    return out


def classify(lines):
    if not lines:
        return None, None
    if any(TOC_RE.search(ln) for ln in lines[:10]):
        return 'x', None  # inhoudsopgave: niet aanzien voor de kop van een uitwerking
    m = HEAD_RE.match(lines[0])
    if m:
        return 'q', int(m.group(2))
    m = SOL_RE_NONUM.match(lines[0])  # kopnummer (bv. 18.12.89) is leidend; 'Opgave'-nummer bevat soms tikfouten
    if m:
        return 's', int(m.group(1))
    m = SOL_RE.match(lines[0])
    if m:
        return 's', int(m.group(2))
    if re.match(r'^\s*\d+\.\d+\s+(Opgaven|Uitwerkingen)\s*$', lines[0]):
        return 'x', None  # scheidingspagina tussen opgaven en uitwerkingen
    for ln in lines[:10]:  # kop door figuurtekst verstoord (bv. 12-49)
        m = re.search(r'(?:Uitwerking van|Antwoord bij) Opgave\s+(\d+)-(\d+)', ln)
        if m:
            return 's', int(m.group(2))
    return 'c', None  # vervolgpagina


def join_wrapped(lines):
    return re.sub(r'\s+', ' ', ' '.join(l.strip() for l in lines)).strip()


def parse_question(lines):
    body = lines[1:]
    src = ''
    stem, opts = [], []
    cur = None
    for ln in body:
        if SRC_RE.match(ln):
            src = ln.strip()
            cur = 'src' if src.count('(') > src.count(')') else 'done'
            continue
        if cur == 'src':
            if ln.strip():
                src += ' ' + ln.strip()
                if src.count('(') <= src.count(')'):
                    cur = 'done'
            continue
        if cur == 'done':
            continue
        if INLINE_OPT_RE.match(ln) and not opts:
            parts = re.split(r'\s(?=[b-dB-D]\.\s)', ln.strip())
            for part in parts:
                mm = OPT_RE.match(part)
                if mm:
                    opts.append([mm.group(1).upper(), mm.group(2).strip()])
            cur = 'opt'
            continue
        m = OPT_RE.match(ln)
        if m:
            opts.append([m.group(1).upper(), m.group(2).strip()])
            cur = 'opt'
        elif cur == 'opt' and ln.strip():
            opts[-1][1] += ' ' + ln.strip()
        elif ln.strip() or stem:
            stem.append(ln)
            cur = 'stem'
    stem = join_wrapped(stem) if stem else ''
    src = re.sub(r'\s+', ' ', src).strip()
    if src.startswith('(') and src.endswith(')'):
        src = src[1:-1]
    return stem, [{'id': k, 'text': re.sub(r'\s+', ' ', v).strip()} for k, v in opts], src


ANS_PATTERNS = [
    r'[Hh]et (?:enige )?(?:juiste|goede|correcte) antwoord is\s+([ABCD])\b',
    r'(?:juiste|goede|correcte) antwoord (?:is|wordt)\s+(?:dus\s+)?([ABCD])\b',
    r'[Aa]ntwoord\s+([ABCD])\s+(?:is|wordt)\s+(?:dus\s+)?(?:het\s+)?(?:goed|juist|correct)',
    r'[Dd]e\s+(?:goede|juiste)\s+(?:keuze|optie)\s+is\s+([ABCD])\b',
    r'[Hh]et\s+antwoord\s+is\s+(?:dus\s+)?([ABCD])\b',
    r'[Dd]us\s+(?:het\s+)?antwoord\s+([ABCD])\b',
    r'[Dd]us\s+([ABCD])\s+is\s+(?:goed|juist)',
    # "Antwoord D." / "Antwoord D dus." / "Antwoord D!" (geen dubbele punt: dat is een bespreking van een afleider)
    r'\b[Aa]ntwoord\s+([ABCD])(?=\s*(?:dus)?\s*[.!]|\s+dus\b|\s*$)',
]


def find_answer(sol_text):
    t = re.sub(r'\s+', ' ', sol_text)
    for pat in ANS_PATTERNS:
        hits = re.findall(pat, t)
        if hits:
            return hits[-1], pat
    return None, None


def split_solution(lines):
    """Scheidt de herhaalde vraag/opties van de eigenlijke uitwerking."""
    body = lines[1:]
    idx = None
    for i, ln in enumerate(body):
        if re.match(r'^uitwerr?king\b', ln.strip().lower()):
            idx = i
            break
    return body[idx + 1:] if idx is not None else body


def crop_white(img):
    bg = Image.new(img.mode, img.size, (255, 255, 255))
    bbox = ImageChops.difference(img, bg).getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    pad = 12
    return img.crop((max(0, l - pad), max(0, t - pad),
                     min(img.width, r + pad), min(img.height, b + pad)))


def render_page(pdf, pageno, out_png, plumb, bbox=None):
    """Rendert alleen het contentgebied (zonder kop/voettekst) naar PNG."""
    pg = plumb.pages[pageno - 1]
    h, w = float(pg.height), float(pg.width)
    top, bottom = 0.0, h
    for wd in pg.extract_words():
        if wd['text'].startswith('VRZA-cursus') and wd['top'] < h * 0.15:
            top = max(top, wd['bottom'] + 2)
        if wd['text'] == '©' and wd['top'] > h * 0.8:
            bottom = min(bottom, wd['top'] - 2)
    x0, x1 = 0.0, w
    if bbox:
        x0, top, x1, bottom = max(0, bbox[0] - 6), max(0, bbox[1] - 6), min(w, bbox[2] + 6), min(h, bbox[3] + 6)
    tmp = out_png.with_suffix('.tmp')
    run(['pdftoppm', '-png', '-r', str(DPI), '-f', str(pageno), '-l', str(pageno),
         '-x', str(int(x0 * DPI / 72)), '-y', str(int(top * DPI / 72)),
         '-W', str(int((x1 - x0) * DPI / 72)), '-H', str(int((bottom - top) * DPI / 72)),
         '-singlefile', str(pdf), str(tmp)])
    src = Path(str(tmp) + '.png')
    img = crop_white(Image.open(src).convert('RGB'))
    img.save(out_png, 'WEBP', quality=82, method=6)
    src.unlink()
    return img.size


def has_graphics(pg, min_vec=3):
    """Heeft de pagina figuren? Negeer logo/kop en decoratieve strips."""
    figs = [i for i in pg.images
            if (i['bottom'] - i['top']) >= 40 and (i['x1'] - i['x0']) >= 30 and i['top'] > 95]
    vec = [c for c in list(pg.curves) + list(pg.lines)
           if c['top'] > 95 and c['bottom'] < float(pg.height) - 60]
    return bool(figs) or len(vec) >= min_vec


def figure_bbox(pg):
    """Bounding box van de figuur(en) op een vraagpagina (zonder kop, bronregel en 'naar de uitwerking'-icoon)."""
    limit = float(pg.height)
    words = pg.extract_words()
    for i, wd in enumerate(words):
        if wd['text'] == 'Antwoord' and i + 1 < len(words) and words[i + 1]['text'].startswith('gevonden'):
            limit = wd['top'] - 2
            break
    figs = [i for i in pg.images
            if (i['bottom'] - i['top']) >= 40 and (i['x1'] - i['x0']) >= 30
            and i['top'] > 95 and i['top'] < limit - 5]
    if not figs:
        vec = [c for c in list(pg.curves) + list(pg.lines) + list(pg.rects)
               if c['top'] > 95 and c['bottom'] < limit - 5 and (c['x1'] - c['x0']) < float(pg.width) * 0.9]
        if len(vec) < 3:
            return None
        x0, x1 = min(c['x0'] for c in vec), max(c['x1'] for c in vec)
        top, bottom = min(c['top'] for c in vec), max(c['bottom'] for c in vec)
        for wd in pg.extract_words():   # labels rond het schema meenemen
            if x0 - 45 <= wd['x0'] and wd['x1'] <= x1 + 45 and top - 14 <= wd['top'] and wd['bottom'] <= bottom + 14:
                x0, x1 = min(x0, wd['x0']), max(x1, wd['x1'])
                top, bottom = min(top, wd['top']), max(bottom, wd['bottom'])
        return (x0, top, x1, bottom)
    return (min(i['x0'] for i in figs), min(i['top'] for i in figs),
            max(i['x1'] for i in figs), max(i['bottom'] for i in figs))


def process(pdf, chap, img_dir, store):
    pages = page_texts(pdf)
    plumb = pdfplumber.open(str(pdf))
    cur_kind, cur_n = None, None
    qpages, spages, qlines, slines = {}, {}, {}, {}
    for pno, raw in enumerate(pages, start=1):
        lines = clean_lines(raw)
        kind, n = classify(lines)
        if kind is None:
            continue
        if kind == 'q':
            cur_kind, cur_n = 'q', n
            qpages.setdefault(n, []).append(pno)
            qlines[n] = list(lines)
        elif kind == 'x':
            cur_kind, cur_n = None, None
        elif kind == 's':
            cur_kind, cur_n = 's', n
            spages.setdefault(n, []).append(pno)
            slines[n] = list(lines)
        elif cur_kind and cur_n is not None:
            tp, tl = (qpages, qlines) if cur_kind == 'q' else (spages, slines)
            if cur_n in tp:
                tp[cur_n].append(pno)
                tl[cur_n].extend(lines)
    for n in sorted(qpages):
        stem, opts, src = parse_question(qlines[n])
        qid = f'hs{chap}-{n}'
        entry = {
            'id': qid, 'chapter': chap, 'number': n,
            'question': stem, 'options': opts, 'source': src,
            'answer': None, 'explanation': '', 'qImages': [], 'sImages': [],
            'qFigure': False, 'sFigure': False,
        }
        need_fig = (any(has_graphics(plumb.pages[p - 1]) for p in qpages[n])
                    or len(opts) < 4 or any(not o['text'] for o in opts))
        if need_fig:
            entry['qFigure'] = True
            for k, p in enumerate(qpages[n]):
                fn = f'{qid}-q{k}.webp'
                bb = figure_bbox(plumb.pages[p - 1])
                render_page(pdf, p, img_dir / fn, plumb, bb)
                entry['qImages'].append(f'img/examenvragen/hs{chap}/{fn}')
        # volledige originele vraagpagina (voor als machten/formules in de tekst verloren gaan)
        fn = f'{qid}-qf.webp'
        render_page(pdf, qpages[n][0], img_dir / fn, plumb)
        entry['qFull'] = f'img/examenvragen/hs{chap}/{fn}'
        if n in slines:
            expl = split_solution(slines[n])
            ans, pat = find_answer('\n'.join(expl))
            entry['answer'] = ans
            entry['_pat'] = pat
            paras, buf = [], []
            for ln in expl:
                if ln.strip():
                    buf.append(ln.strip())
                elif buf:
                    paras.append(' '.join(buf))
                    buf = []
            if buf:
                paras.append(' '.join(buf))
            entry['explanation'] = '\n\n'.join(paras)
            entry['sFigure'] = any(has_graphics(plumb.pages[p - 1], 3) for p in spages[n])
            for k, p in enumerate(spages[n]):
                fn = f'{qid}-s{k}.webp'
                render_page(pdf, p, img_dir / fn, plumb)
                entry['sImages'].append(f'img/examenvragen/hs{chap}/{fn}')
        store[qid] = entry
    plumb.close()


def main(paths):
    by_chap = {}
    for p in paths:
        p = Path(p)
        m = re.search(r'HS(\d+)_exa', p.name)
        if not m:
            print('Hoofdstuk niet te herleiden uit', p.name)
            continue
        by_chap.setdefault(int(m.group(1)), []).append(p)
    for chap, pdfs in by_chap.items():
        img_dir = ROOT / 'img' / 'examenvragen' / f'hs{chap}'
        img_dir.mkdir(parents=True, exist_ok=True)
        store = {}
        for pdf in pdfs:
            print('Verwerken', pdf.name)
            process(pdf, chap, img_dir, store)
        items = [store[k] for k in sorted(store, key=lambda k: store[k]['number'])]
        ov_path = ROOT / 'tools' / 'answer_overrides.json'
        ov = json.loads(ov_path.read_text(encoding='utf-8')) if ov_path.exists() else {}
        qo_path = ROOT / 'tools' / 'question_overrides.json'
        qo = json.loads(qo_path.read_text(encoding='utf-8')) if qo_path.exists() else {}
        items = [e for e in items if ov.get(e['id']) != 'SKIP']
        for e in items:
            if e['id'] in ov:
                e['answer'] = ov[e['id']]
            if e['id'] in qo:
                v = qo[e['id']]
                if isinstance(v, dict):
                    e.update(v)
                else:
                    e['question'] = v
            e['explanation'] = re.split(r'\s*\d+\.\d+\.\d+ (?:Uitwerking van|Antwoord bij)\s*Opgave', e['explanation'])[0].strip()
            for o in e['options']:
                o['text'] = re.split(r'\s*(?:Opmerking|Let op)\b', o['text'])[0].strip()
            e.pop('_pat', None)
        out = ROOT / 'data' / f'hoofdstuk-{chap}.json'
        out.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding='utf-8')
        miss = [e['number'] for e in items if not e['answer']]
        print(f'Hoofdstuk {chap}: {len(items)} vragen, '
              f'{len(miss)} zonder gedetecteerd antwoord: {miss}')


if __name__ == '__main__':
    main(sys.argv[1:] or [str(p) for p in (ROOT / 'bronnen').glob('HS*_exa_*.pdf')])
