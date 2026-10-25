#!/usr/bin/env python3
"""Maakt uit een VRZA-theoriehoofdstuk (PDF 'Volledige tekst') een leesbare paragraaf-indeling:
  data/theorie/hoofdstuk-<N>.json   (paragrafen met paginabereik; koppelingen en formules worden apart bijgevoegd)
  img/theorie/hs<N>/p<NNN>.webp     (één afbeelding per pagina, zonder kop- en voettekst)

Gebruik: python tools/build_theory.py bronnen/THEORIE_HS3_20260330.pdf
Het hoofdstuknummer komt uit de bestandsnaam (THEORIE_HS<N>_...). Bestaande 'qmap' en 'formulas' blijven behouden.
"""
import json, re, subprocess, sys
from pathlib import Path
import pdfplumber
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent.parent
DPI = 110
SKIP = re.compile(r'^(Opgave\s+\d+-\d+|Uitwerking van Opgave.*|Aanwijzingen|Opgaven)$')


def norm(s):
    return re.sub(r'[^a-z0-9]+', '', s.lower())


def parse_toc(pl):
    """Inhoudsopgave -> lijst (niveau, titel). Niveau 1 = paragraaf, 2 = onderdeel."""
    rows = []
    for pi in range(0, 6):
        pg = pl.pages[pi]
        t = pg.extract_text() or ''
        if pi > 0 and 'Inhoudsopgave' not in t and not rows:
            continue
        lines = {}
        for w in pg.extract_words():
            lines.setdefault(round(w['top'] / 3), []).append(w)
        found = False
        if not any('....' in ' '.join(w['text'] for w in ws) for ws in lines.values()):
            break
        for k in sorted(lines):
            ws = sorted(lines[k], key=lambda w: w['x0'])
            txt = ' '.join(w['text'] for w in ws)
            if txt.startswith(('VRZA', '©')) or txt == 'Inhoudsopgave':
                continue
            if re.fullmatch(r'\d+-\d+', txt):
                continue
            m = re.match(r'^(.*?)\s*\.{3,}.*$', txt)
            title = (m.group(1) if m else txt).strip()
            if not title:
                continue
            found = True
            rows.append((round(ws[0]['x0']), title))
    return rows


def main(pdf):
    pdf = Path(pdf)
    chap = int(re.search(r'HS(\d+)', pdf.name).group(1))
    pl = pdfplumber.open(pdf)
    rows = parse_toc(pl)
    xs = sorted({x for x, _ in rows})
    # samenvoegen van afgebroken titels (inspringing links van het niveau ervoor, bijv. 'schakelaars')
    merged = []
    for x, t in rows:
        if merged and x < merged[-1][0] and x not in (xs[0],) and t[:1].islower():
            merged[-1] = (merged[-1][0], merged[-1][1] + ' ' + t)
        else:
            merged.append((x, t))
    entries = []
    top_x = xs[0]
    for x, t in merged:
        if x == top_x:
            continue          # hoofdstuktitel
        lvl = 1 if x < 130 else 2
        entries.append({'lvl': lvl, 'title': t})
    # zoek elke titel in de tekst (monotoon vooruit)
    n_pages = len(pl.pages)
    page_lines = []
    for pg in pl.pages:
        L = {}
        for w in pg.extract_words():
            L.setdefault(round(w['top'] / 3), []).append(w)
        page_lines.append([(min(w['top'] for w in ws), ' '.join(w['text'] for w in sorted(ws, key=lambda w: w['x0']))) for _, ws in sorted(L.items())])
    pos = 5  # index van eerste pagina na inhoudsopgave (0-based): zoek vanaf pagina 5
    first_body = next(i for i in range(0, 12) if any(re.match(r'^\d+\s*\S', l[1]) and 'Wat leer' in ' '.join(x[1] for x in page_lines[i]) for l in page_lines[i][:6]))
    pos = first_body
    located = []
    for e in entries:
        if SKIP.match(e['title']):
            continue
        key = norm(e['title'])
        hit = None
        for pi in range(pos, n_pages):
            for y, line in page_lines[pi]:
                if y < 40:
                    continue
                if norm(line) == key:
                    hit = (pi, y); break
            if hit:
                break
        if hit is None:
            print('NIET GEVONDEN:', e['title']); continue
        pos = hit[0]
        located.append({**e, 'page0': hit[0], 'y0': hit[1]})
    # 'Uitwerkingen van de opgaven' is één afsluitend onderdeel (de tekst-opgaven met uitwerking)
    cut = next((i for i, e in enumerate(located) if e['lvl'] == 1 and e['title'].startswith('Uitwerkingen')), None)
    if cut is not None:
        located = located[:cut + 1]
    parent = ''
    for e in located:
        if e['lvl'] == 1:
            parent = e['title']
        elif e['title'] == 'Inleiding':
            e['title'] = f'{parent}: inleiding'
    secs = []
    for i, e in enumerate(located):
        nxt = located[i + 1] if i + 1 < len(located) else None
        end = (nxt['page0'] - (1 if nxt['y0'] < 80 else 0)) if nxt else n_pages - 1
        secs.append({'id': f's{i + 1}', 'title': e['title'], 'lvl': e['lvl'], 'p0': e['page0'], 'p1': max(end, e['page0'])})
    # onderdelen die direct op 'Uitwerkingen van de opgaven' volgen (Inleiding + uitwerkingen) weglaten uit de kopjes
    out_dir = ROOT / 'img' / 'theorie' / f'hs{chap}'
    out_dir.mkdir(parents=True, exist_ok=True)
    used = sorted({p for s in secs for p in range(s['p0'], s['p1'] + 1)})
    for pi in used:
        pg = pl.pages[pi]
        h, w = float(pg.height), float(pg.width)
        top, bottom = 0.0, h
        for wd in pg.extract_words():
            if wd['text'].startswith('VRZA-cursus') and wd['top'] < h * 0.15:
                top = max(top, wd['bottom'] + 2)
            if wd['text'] == '©' and wd['top'] > h * 0.85:
                bottom = min(bottom, wd['top'] - 2)
        tmp = out_dir / 'tmp'
        subprocess.run(['pdftoppm', '-png', '-r', str(DPI), '-f', str(pi + 1), '-l', str(pi + 1),
                        '-x', '0', '-y', str(int(top * DPI / 72)), '-W', str(int(w * DPI / 72)), '-H', str(int((bottom - top) * DPI / 72)),
                        '-singlefile', str(pdf), str(tmp)], check=True)
        im = Image.open(str(tmp) + '.png').convert('RGB')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bbox = ImageChops.difference(im, bg).getbbox()
        if bbox:
            pad = 10
            im = im.crop((0, max(0, bbox[1] - pad), im.width, min(im.height, bbox[3] + pad)))
        im.save(out_dir / f'p{pi + 1:03d}.webp', 'WEBP', quality=78, method=6)
        Path(str(tmp) + '.png').unlink()
    for s in secs:
        s['pages'] = [f'p{p + 1:03d}' for p in range(s['p0'], s['p1'] + 1)]
        del s['p0'], s['p1']
    f = ROOT / 'data' / 'theorie' / f'hoofdstuk-{chap}.json'
    f.parent.mkdir(parents=True, exist_ok=True)
    old = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    data = {'chapter': chap, 'dir': f'img/theorie/hs{chap}', 'sections': secs,
            'qmap': old.get('qmap', {}), 'formulas': old.get('formulas', []), 'cards': old.get('cards', []), 'drill': old.get('drill', [])}
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Hoofdstuk {chap}: {len(secs)} paragrafen, {len(used)} pagina\'s')
    for s in secs:
        print(' ', s['id'], s['lvl'], s['title'], s['pages'][0], '-', s['pages'][-1])


if __name__ == '__main__':
    main(sys.argv[1])
