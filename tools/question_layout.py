#!/usr/bin/env python3
"""
Zet de regel- en alinea-indeling van de VRZA-PDF in de vraagteksten (data/hoofdstuk-N.json), zodat de tekst in de
app er net zo uitziet als de vraag in de PDF: alinea's met een witregel, Stelling 1/2, opsommingen en "Juist is:" op
een eigen regel. Woorden veranderen niet; alleen losse figuurlabels die in de tekst beland zijn (bijv. "+ R1 R3 C2 uit")
vallen weg, en alleen als elk woord daarvan in de figuur van de PDF staat. Vragen die al regels hebben blijven zoals ze zijn.

Gebruik: python3 tools/question_layout.py <pad naar RZAM-F> [--schrijf]
Zonder --schrijf alleen een overzicht. Met --schrijf ook data/hoofdstuk-N.json en tools/question_overrides.json bijwerken.
Vereist: poppler-utils (pdftotext).
"""
import html, json, re, sys, types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.modules.setdefault('pdfplumber', types.ModuleType('pdfplumber'))   # extract_vrza importeert het, maar wij gebruiken het niet
sys.path.insert(0, str(ROOT / 'tools'))
import extract_vrza as X

PARA_GAP = 20      # pt tussen de bovenkanten van twee regels; gewone regelafstand ≈ 16, alinea ≈ 24
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
key = lambda s: ' '.join(norm(s).split()[:4])


def bbox_pages(pdf):
    """Per pagina de tekstregels met hun bovenkant (y)."""
    xml = X.run(['pdftotext', '-bbox-layout', str(pdf), '-'])
    pages = []
    for pg in re.findall(r'<page .*?</page>', xml, re.S):
        lines = []
        for y, body in re.findall(r'<line xMin="[\d.]+" yMin="([\d.]+)".*?>(.*?)</line>', pg, re.S):
            words = [X.clean_text(html.unescape(w)) for w in re.findall(r'<word [^>]*>(.*?)</word>', body)]
            lines.append((float(y), ' '.join(words)))
        pages.append(lines)
    return pages


def stem_lines(lines):
    """Zoals X.parse_question, maar de ruwe stamregels (met lege regels)."""
    stem, cur = [], None
    for ln in lines[1:]:
        if cur == 'done' or X.SRC_RE.match(ln): cur = 'done'; continue
        if X.INLINE_OPT_RE.match(ln) or X.OPT_RE.match(ln): cur = 'opt'; continue
        if cur != 'opt' and (ln.strip() or stem): stem.append(ln)
    return stem


def pdf_stems(src):
    out = {}
    for pdf in sorted((Path(src) / '03-VRZA-Examentraining').glob('*.pdf')):
        chap = int(re.search(r'hoofdstuk (\d+)', pdf.name).group(1))
        bb = bbox_pages(pdf)
        cur, ql, qp = None, {}, {}
        for pno, raw in enumerate(X.page_texts(pdf)):
            lines = X.clean_lines(raw)
            kind, n = X.classify(lines)
            if kind == 'q': cur = n; ql[n] = list(lines); qp[n] = [pno]
            elif kind in ('x', 's'): cur = None
            elif kind == 'c' and cur is not None: ql[cur] += [''] + lines; qp[cur].append(pno)
        for n in ql:
            ys = [(p, y, t) for p in qp[n] if p < len(bb) for y, t in bb[p]]
            out[f'hs{chap}-{n}'] = (stem_lines(ql[n]), ys)
    return out


def split_line(ln):
    """Layout-regel -> ((kolom, prozatekst) of None, figuurtekst). Figuurlabels staan ingesprongen of rechts na veel spaties."""
    segs = [(m.start(), m.group()) for m in re.finditer(r'\S+(?: {1,3}\S+)*', ln)]
    if not segs: return None, ''
    if len(segs) > 1 and segs[0][1] in ('•', '-', '–'): segs[:2] = [(segs[0][0], '• ' + segs[1][1])]
    col, first = segs[0]
    if col <= 8 and (re.search(r'[a-zà-ÿ]{3,}', first) or re.match(r'[A-Z][a-z]*( \w+)*[:?]$', first)):
        return (col, first), ' '.join(t for _, t in segs[1:])
    return None, ' '.join(t for _, t in segs)


ITEM = re.compile(r'(•|[1-9][.)]|[IV]+[.)])\s')
NEWLINE = re.compile(r'(Stelling|Bewering)\s*\d|[1-9][.)]\s|[IV]+[.)]\s|(Wat|Welke|Juist|Dan|Dit)\b.{0,30}[:?]$|•\s')


def blocks(stem, ys):
    """Alinea's (lijst van regels) en alle figuurtekst."""
    bl, cur, fig, i = [], [], [], 0
    for ln in stem + ['']:
        p, f = split_line(ln)
        if f: fig.append(f)
        if p is None:
            if cur: bl.append(cur); cur = []
            continue
        y = None   # bovenkant van deze regel opzoeken in de bbox-regels
        for j in range(i, len(ys)):
            if key(ys[j][2]) == key(p[1]) or key(ys[j][2]).startswith(key(p[1])):
                y, i = ys[j][:2], j + 1; break
        if cur and y and cur[-1][2] and y[0] == cur[-1][2][0] and y[1] - cur[-1][2][1] > PARA_GAP:
            bl.append(cur); cur = []
        cur.append((p[0], p[1].strip(), y))
    out = []
    for b in bl:
        parts, p, pc = [], [], 0
        for col, s, _ in b:
            if p and ((ITEM.match(p[-1]) and not ITEM.match(s) and col < pc) or NEWLINE.match(s)
                      or (re.search(r'[.:?!;]$', p[-1]) and len(p[-1]) < 72)):   # korte regel met leesteken = bewuste afbreking
                parts.append(p); p = []
            p.append(s); pc = col
        parts.append(p)
        out.append([norm(' '.join(x)) for x in parts])
    return out, set(' '.join(fig).split())


def label(w):
    """Woord dat een figuurlabel kan zijn: geen gewoon woord en geen woord met een leesteken aan het eind."""
    return w in ('in', 'uit') or not (re.fullmatch(r'[a-zà-ÿ]{2,},?', w) or re.search(r'[.:?!]$', w))


def relayout(q, bl, figw):
    """Afbrekingen op de plaatsen waar PDF-regels exact in q staan. Geeft (nieuwe tekst of None, weggelaten tekst)."""
    pos, pieces = 0, []
    for para in bl:
        for j, line in enumerate(para):
            m = re.compile(r'(?<!\S)' + re.escape(line) + r'(?!\S)').search(q, pos)
            if m: pieces.append((m.start(), m.end(), j == 0)); pos = m.end()
    if not pieces: return None, []
    out, last, dropped = '', 0, []

    def gap(t):
        t = norm(t)
        if t and all(w in figw and label(w) for w in t.split()): dropped.append(t); return ''
        return t
    for k, (a, b, newpara) in enumerate(pieces):
        g = gap(q[last:a])
        if g and k and not re.search(r'[.:?]$', out): out += ' ' + g; g = ''   # hoort nog bij de vorige regel
        if k: out += '\n\n' if newpara else '\n'
        if g: out += g + ' '
        out += q[a:b]; last = b
    g = gap(q[last:])
    if g: out += ' ' + g
    return re.sub(r' +• ', '\n• ', out).strip(), dropped


def main(src, write):
    st = pdf_stems(src)
    files = sorted((ROOT / 'data').glob('hoofdstuk-*.json'), key=lambda p: int(re.search(r'\d+', p.name).group()))
    data = {p: json.load(open(p, encoding='utf-8')) for p in files}
    new = {}
    for qs in data.values():
        for q in qs:
            if q['id'] not in st or '\n' in q['question']: continue
            n, dropped = relayout(q['question'], *blocks(*st[q['id']]))
            if n and n != q['question']:
                new[q['id']] = n
                if dropped: print('figuurtekst weg:', q['id'], '|', ' | '.join(dropped))
    print(f'{len(new)} vragen krijgen regels uit de PDF')
    if not write: return
    for p, qs in data.items():
        for q in qs:
            if q['id'] in new: q['question'] = new[q['id']]
        open(p, 'w', encoding='utf-8').write(json.dumps(qs, ensure_ascii=False, indent=1))
    p = ROOT / 'tools/question_overrides.json'
    ov = json.load(open(p, encoding='utf-8'))
    for k, v in new.items():
        ov[k] = {**ov[k], 'question': v} if isinstance(ov.get(k), dict) else v
    open(p, 'w', encoding='utf-8').write(json.dumps(ov, ensure_ascii=False, indent=1) + '\n')


if __name__ == '__main__':
    main(sys.argv[1], '--schrijf' in sys.argv)
