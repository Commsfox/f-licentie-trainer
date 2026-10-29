#!/usr/bin/env python3
"""Zet de opmaak van de examenvragen (regels, opsommingen, alinea's) over uit de VRZA-PDF's.

extract_vrza.py plakt de vraagtekst tot één lange regel, en bij vragen met een schema komen de
labels uit de figuur ertussen ("+ R1 R3 C2 uit C1 in ..."). Dit script leest de vraagpagina's opnieuw
met de positie van elk woord (pdftotext -bbox) en:
  - laat de woorden weg die in de figuur staan (die staan al in de afbeelding);
  - bepaalt per regel of het een afgebroken zin is (samenvoegen), een nieuwe regel (opsomming,
    regel eindigt op ':' of past duidelijk niet vol) of een nieuwe alinea (extra witruimte).
Het resultaat is de vraag met '\\n' (nieuwe regel) en '\\n\\n' (nieuwe alinea).

Veilig: de nieuwe tekst bestaat uit precies dezelfde woorden in dezelfde volgorde als de huidige
'question'; alleen woorden uit de figuur mogen wegvallen. Anders blijft de vraag staan.
Vragen uit tools/question_overrides.json blijven altijd staan.

Gebruik: python3 tools/question_layout.py ../RZAM-F/03-VRZA-Examentraining/*.pdf
"""
import html, json, re, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_vrza as ex
import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
MARK = re.compile(r'^(\d{1,2}[.)]|[a-z][.)]|[IVX]{1,4}[.)]|[-•–·▪])$')
WORD = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')


def bbox_pages(pdf):
    """Per pagina de woorden: [{x0, top, x1, bottom, text}] (zelfde woorden als pdftotext -layout)."""
    out = []
    for pg in ex.run(['pdftotext', '-bbox', str(pdf), '-']).split('<page ')[1:]:
        out.append([{'x0': float(a), 'top': float(b), 'x1': float(c), 'bottom': float(d),
                     'text': ex.clean_text(html.unescape(t))} for a, b, c, d, t in WORD.findall(pg)])
    return out


def rows_of(words):
    """Woorden -> regels [top, bottom, [woorden]]. Sub- en superscript (kleinere letters) horen bij de regel waar ze tegenaan staan."""
    if not words:
        return []
    hs = sorted(w['bottom'] - w['top'] for w in words)
    med = hs[len(hs) // 2]
    big = [w for w in words if w['bottom'] - w['top'] >= 0.85 * med]
    small = [w for w in words if w['bottom'] - w['top'] < 0.85 * med]
    rows = []
    for w in sorted(big, key=lambda w: (w['top'], w['x0'])):
        for r in rows:
            if w['top'] < r[1] - 2 and w['bottom'] > r[0] + 2:
                r[2].append(w)
                break
        else:
            rows.append([w['top'], w['bottom'], [w]])
    for w in small:
        near = [r for r in rows if w['top'] < r[1] + 1 and w['bottom'] > r[0] - 1]
        if near:
            min(near, key=lambda r: abs((r[0] + r[1]) / 2 - (w['top'] + w['bottom']) / 2))[2].append(w)
        else:
            rows.append([w['top'], w['bottom'], [w]])
    for r in rows:
        r[2].sort(key=lambda w: w['x0'])
    return sorted(rows, key=lambda r: r[0])


def txt(r):
    """Tekst van een regel; een index direct tegen het woord ervoor (R + 1) wordt weer één woord (R1)."""
    out = ''
    for a, b in zip([None] + r[2], r[2]):
        out += ('' if a is None else '' if b['x0'] - a['x1'] < 0.8 else ' ') + b['text']
    return out


def segments(ws):
    """Woorden van één regel in stukken die door een groot gat (kolom of figuur) gescheiden zijn."""
    segs = [[ws[0]]]
    for a, b in zip(ws, ws[1:]):
        if b['x0'] - a['x1'] > 18:
            segs.append([])
        segs[-1].append(b)
    return segs


def sentence(seg):
    """Lijkt dit stuk op een zin (en niet op een label uit een schema)?"""
    ws = [w['text'] for w in seg]
    return len(ws) >= 3 and any(re.fullmatch(r'[a-zà-ÿ]{4,}[.,:?]?', w) for w in ws)


def stem_rows(words, n, fig):
    """De regels van de vraag (na de kop 'Opgave N-M', voor de eerste optie of bron), zonder figuurwoorden."""
    if fig:
        x0, t0, x1, b0 = fig
        inside = lambda w: x0 - 2 <= (w['x0'] + w['x1']) / 2 <= x1 + 2 and t0 - 2 <= (w['top'] + w['bottom']) / 2 <= b0 + 2
    rows = rows_of(words)
    i = next((k for k, r in enumerate(rows) if re.search(rf'Opgave\s+\d+-{n}$', txt(r))), None)
    if i is None:
        return None
    out, skipped = [], False
    for r in rows[i + 1:]:
        t = txt(r)
        if ex.OPT_RE.match(t) or ex.SRC_RE.match(t) or ex.INLINE_OPT_RE.match(t):
            return out
        if fig:   # labels uit de figuur weglaten, tekst naast de figuur houden
            last = out[-1] if out else None
            goes_on = lambda seg: (last is not None and abs(seg[0]['x0'] - last[2][0]['x0']) < 2
                                   and r[0] - last[0] < 1.6 * (last[1] - last[0]))
            keep = [w for seg in segments(r[2]) for w in seg
                    if sentence(seg) or goes_on(seg) or not all(inside(x) for x in seg)]
            if not keep:
                skipped = True
                continue
            main = max(keep, key=lambda w: w['bottom'] - w['top'])
            r = [main['top'], main['bottom'], keep]
        out.append([r[0], r[1], r[2], skipped])
        skipped = False
    return None   # opties staan op een volgende pagina


def layout(rows):
    """Regels -> tekst met ' ' (afgebroken zin), '\\n' (nieuwe regel) of '\\n\\n' (nieuwe alinea)."""
    if not rows:
        return None
    if any(b['x0'] - a['x1'] > 18 for r in rows for a, b in zip(r[2], r[2][1:])):
        return None   # nog tekst in twee kolommen: niet zeker wat bij elkaar hoort
    blocks, cur = [], [0]
    for k in range(1, len(rows)):
        h = rows[k - 1][1] - rows[k - 1][0]
        if rows[k][0] - rows[k - 1][0] > 1.6 * h and not rows[k][3]:   # na een weggelaten figuurregel: geen alinea
            blocks.append(cur)
            cur = []
        cur.append(k)
    blocks.append(cur)
    sep = {}
    for b in blocks:
        right = max(rows[k][2][-1]['x1'] for k in b)
        left = min(rows[k][2][0]['x0'] for k in b)
        if b[0]:
            sep[b[0]] = '\n\n'
        for a, k in zip(b, b[1:]):
            prev, first = rows[a][2][-1], rows[k][2][0]
            if MARK.match(first['text']) or prev['text'].endswith(':') or first['x0'] > left + 8:
                sep[k] = '\n'
            elif prev['x1'] + 4 + (first['x1'] - first['x0']) > right:
                sep[k] = ' '        # het volgende woord paste niet meer: afgebroken zin
            else:
                sep[k] = '\n'
    text = txt(rows[0])
    for k in range(1, len(rows)):
        text += sep[k] + txt(rows[k])
    return text


def process(pdf, chap, found):
    pages = ex.page_texts(pdf)
    words = bbox_pages(pdf)
    plumb = pdfplumber.open(str(pdf))
    for pno, raw in enumerate(pages):
        kind, n = ex.classify(ex.clean_lines(raw))
        if kind != 'q' or pno >= len(words):
            continue
        pg = plumb.pages[pno]
        fig = ex.figure_bbox(pg) if ex.has_graphics(pg) else None
        t = layout(stem_rows(words[pno], n, fig))
        if t:
            found[f'hs{chap}-{n}'] = t
    plumb.close()


def subseq(small, big):
    it = iter(big)
    return all(w in it for w in small)


def main(paths):
    by_chap = {}
    for p in map(Path, paths):
        m = re.search(r'hoofdstuk (\d+)\.', p.name) or re.search(r'HS(\d+)_exa', p.name)
        if m:
            by_chap.setdefault(int(m.group(1)), []).append(p)
    qo = json.loads((ROOT / 'tools' / 'question_overrides.json').read_text(encoding='utf-8'))
    tot = changed = cleaned = 0
    skipped = []
    for chap, pdfs in sorted(by_chap.items()):
        found = {}
        for pdf in pdfs:
            process(pdf, chap, found)
        f = ROOT / 'data' / f'hoofdstuk-{chap}.json'
        items = json.loads(f.read_text(encoding='utf-8'))
        for q in items:
            tot += 1
            new = found.get(q['id'])
            if not new or q['id'] in qo:
                continue
            old_w, new_w = q['question'].split(), new.split()
            if new_w != old_w:
                if not (q.get('qFigure') and subseq(new_w, old_w) and len(new_w) >= 3):
                    skipped.append(q['id'])
                    continue
                cleaned += 1
            if new != q['question']:
                q['question'] = new
                changed += 1
        f.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{tot} vragen: {changed} aangepast, waarvan {cleaned} zonder figuurtekst; '
          f'{len(skipped)} overgeslagen (tekst wijkt af): {" ".join(skipped)}')


if __name__ == '__main__':
    main(sys.argv[1:])
