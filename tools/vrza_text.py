"""Zet een stuk van een VRZA-PDF (van kopje tot kopje, eventueel over meerdere pagina's) om naar HTML:
echte tekst (koppen, alinea's, opsommingen, antwoordopties, tabellen, vet/cursief, super- en subscript),
met figuren en losse formules als afbeelding. Gebruikt door build_theory_vrza.py.

Vet staat in deze PDF's niet in het lettertype, maar als tweede (omlijnde) tekenlaag; cursief als schuine matrix.
"""
import html
import re
import unicodedata
from statistics import median

import pdfplumber
import numpy as np
import pymupdf
from strip_nav import find_icons

FIG_DPI = 150
NAV = re.compile(r'(Antwoord gevonden\?|Naar de uitwerking|Terug naar de opgave|Naar de volgende opgave|Terug naar de vraag)')
BULLETS = ('•', '', '', '▪', '◦', '', '')
OPTION = re.compile(r'^[A-Da-d][.)]\s')


# Symbol-lettertype: tekens staan op U+F020..F0FF; omzetten naar echte Unicode (Ω, λ, π, °, ...)
_SYM_LO = (' !∀#∃%&∋()∗+,−./0123456789:;<=>?≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_‾'
           'αβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}∼')
_SYM_HI = '€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…|―↵ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√⋅¬∧∨⇔⇐⇑⇒⇓◊〈®©™∑'
SYMBOL = {chr(0xF020 + i): ch for i, ch in enumerate(_SYM_LO)}
SYMBOL.update({chr(0xF0A0 + i): ch for i, ch in enumerate(_SYM_HI)})


def plain(c):
    """Wiskundige letters (𝐸, 𝑈) en Symbol-tekens naar gewone tekens, zodat kopiëren en zoeken werkt."""
    if '\U0001D400' <= c <= '\U0001D7FF':
        return unicodedata.normalize('NFKC', c)
    if c in SYMBOL:
        return SYMBOL[c]
    return {'\uf0b7': '•', '\uf0a7': '▪', '\u2212': '−', '\u20d7': ''}.get(c, c)


class Doc:
    def __init__(self, pdf):
        self.pl = pdfplumber.open(str(pdf))
        self.mu = pymupdf.open(str(pdf))
        self._pages = {}
        self.col = self._column()

    def _column(self):
        xs0, xs1 = [], []
        for pg in self.pl.pages[5:40]:
            for w in pg.extract_words():
                if 120 < w['top'] < float(pg.height) - 90:
                    xs0.append(w['x0']); xs1.append(w['x1'])
        xs0.sort(); xs1.sort()
        return xs0[len(xs0) // 100], xs1[-len(xs1) // 100 - 1]

    # ------------------------------------------------------------ per pagina
    def bounds(self, pi):
        pg = self.pl.pages[pi]
        H = float(pg.height)
        top, bot = 0.0, H
        for w in pg.extract_words():
            if w['top'] < H * 0.15 and (w['text'].startswith('VRZA-cursus') or '_volledige' in w['text'] or w['text'].startswith('Hoofdstuk')):
                top = max(top, w['bottom'] + 6)
            if w['top'] > H * 0.85 and w['text'].startswith('©'):
                bot = min(bot, w['top'] - 4)
        for im in pg.images:
            if im['top'] < H * 0.12:
                top = max(top, im['bottom'] + 4)
        return top, bot

    def page(self, pi):
        if pi in self._pages:
            return self._pages[pi]
        pg = self.pl.pages[pi]
        top, bot = self.bounds(pi)
        # vet: tekens die ook als omlijnde laag (render mode 1/2) getekend zijn
        bold = set()
        for sp in self.mu[pi].get_texttrace():
            if sp['type'] in (1, 2):
                for ch in sp['chars']:
                    x0, y0, x1, y1 = ch[3]
                    bold.add((round(x0), round(y1)))
        chars = []
        for c in pg.chars:
            if not (top <= c['top'] and c['bottom'] <= bot + 1):
                continue
            k = (round(c['x0']), round(c['bottom']))
            b = any((k[0] + dx, k[1] + dy) in bold for dx in (-1, 0, 1) for dy in (-1, 0, 1))
            chars.append({'t': plain(c['text']), 'x0': c['x0'], 'x1': c['x1'], 'top': c['top'], 'bottom': c['bottom'],
                          'size': c['size'], 'b': b, 'i': abs(c['matrix'][2]) > 0.1,
                          'math': 'CambriaMath' in c['fontname'] or 'Symbol' in c['fontname'] and c['text'] not in BULLETS})
        tables = []
        for t in pg.find_tables():
            x0, y0, x1, y1 = t.bbox
            if y1 < top or y0 > bot:
                continue
            rows = t.extract()
            cells = sum(1 for r in rows for c in r if c and c.strip())
            if len(rows) >= 2 and len(rows[0]) >= 2 and cells >= 3:
                tables.append({'bbox': t.bbox, 'rows': rows, 'kind': 'table', 'grid': table_grid(t, rows)})
            elif cells and len(''.join(c or '' for r in rows for c in r)) > 60:
                tables.append({'bbox': t.bbox, 'rows': rows, 'kind': 'box'})
        for t in tables:
            # tabellen vol formules (bijv. logische schakelingen) blijven een afbeelding
            x0, y0, x1, y1 = t['bbox']
            inside = [c for c in chars if x0 <= c['x0'] and c['x1'] <= x1 and y0 <= c['top'] and c['bottom'] <= y1]
            if t['kind'] == 'table' and inside and sum(c['math'] for c in inside) > 0.15 * len(inside):
                t['kind'] = 'img'
            elif t['kind'] == 'table':
                t['grid']['rows'] = [[(''.join(plain(ch) for ch in txt), rs, cs) for txt, rs, cs in r] for r in t['grid']['rows']]
        figs = self._figures(pg, top, bot, [t['bbox'] for t in tables])
        self._pages = {pi: {'chars': chars, 'tables': tables, 'figs': figs, 'top': top, 'bot': bot}}
        return self._pages[pi]

    def inner_figures(self, pi, box):
        """Figuren binnen een omkaderd tekstblok, zonder het kader zelf."""
        return self._figures(self.pl.pages[pi], box[1], box[3], [], box)

    def _figures(self, pg, top, bot, tables, box=None):
        inside = lambda b, r, m=2: b[0] >= r[0] - m and b[1] >= r[1] - m and b[2] <= r[2] + m and b[3] <= r[3] + m
        items = []
        def frame(b):
            if not box:
                return False
            bw, bh = box[2] - box[0], box[3] - box[1]
            w, h = b[2] - b[0], b[3] - b[1]
            return not inside(b, box, 3) or (w > 0.8 * bw and h < 3) or (h > 0.8 * bh and w < 3) or (w > 0.8 * bw and h > 0.8 * bh)
        for im in pg.images:
            b = (im['x0'], im['top'], im['x1'], im['bottom'])
            if b[1] < top - 2 or b[3] > bot + 2 or frame(b):
                continue
            if (b[2] - b[0]) < 45 and (b[3] - b[1]) < 45:
                continue                        # navigatie-icoontjes
            items.append([*b, 10])
        for o in list(pg.curves) + list(pg.lines) + list(pg.rects):
            b = (o['x0'], o['top'], o['x1'], o['bottom'])
            if b[1] < top - 2 or b[3] > bot + 2 or any(inside(b, t) for t in tables) or frame(b):
                continue
            w, h = b[2] - b[0], b[3] - b[1]
            if h < 1.5 and w > 0.8 * (self.col[1] - self.col[0]):
                continue                        # lange scheidingslijn
            items.append([*b, 1])
        # samenvoegen tot clusters
        clusters = []
        for it in sorted(items, key=lambda x: x[1]):
            for c in clusters:
                if it[0] < c[2] + 14 and it[2] > c[0] - 14 and it[1] < c[3] + 14 and it[3] > c[1] - 14:
                    c[0], c[1], c[2], c[3] = min(c[0], it[0]), min(c[1], it[1]), max(c[2], it[2]), max(c[3], it[3])
                    c[4] += it[4]
                    break
            else:
                clusters.append(list(it))
        changed = True
        while changed:
            changed = False
            for i in range(len(clusters)):
                for j in range(i + 1, len(clusters)):
                    a, b = clusters[i], clusters[j]
                    if a[0] < b[2] + 14 and a[2] > b[0] - 14 and a[1] < b[3] + 14 and a[3] > b[1] - 14:
                        a[:4] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3])]
                        a[4] += b[4]
                        del clusters[j]
                        changed = True
                        break
                if changed:
                    break
        res = [c[:4] for c in clusters if c[4] >= 3 and (c[3] - c[1]) > 12]
        # drie of meer even hoge stukken naast elkaar (bijv. een tabel met gekleurde kolommen) zijn één figuur
        for a_ in list(res):
            row = [b for b in res if abs(b[1] - a_[1]) < 6 and abs(b[3] - a_[3]) < 6]
            if len(row) >= 3 and a_ in res:
                for b in row:
                    res.remove(b)
                res.append([min(b[0] for b in row), min(b[1] for b in row), max(b[2] for b in row), max(b[3] for b in row)])
        return res

    # ------------------------------------------------------------ afbeelding van een gebied
    def is_nav(self, pi, box):
        """Navigatieknop van de PDF ('Naar de uitwerking' e.d.): laag plaatje met gekleurde pijl-icoontjes."""
        if box[3] - box[1] >= 90:
            return False
        r = pymupdf.Rect(box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4) & self.mu[pi].rect
        pix = self.mu[pi].get_pixmap(clip=r, dpi=FIG_DPI)
        from PIL import Image
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        return bool(find_icons(np.asarray(im).copy()))

    def crop(self, pi, box, path):
        x0, y0, x1, y1 = box
        r = pymupdf.Rect(x0 - 4, y0 - 4, x1 + 4, y1 + 4) & self.mu[pi].rect
        pix = self.mu[pi].get_pixmap(clip=r, dpi=FIG_DPI)
        from PIL import Image
        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        if (y1 - y0) < 90 and find_icons(np.asarray(im).copy()):
            return None                         # navigatieknop van de PDF ('Naar de uitwerking' e.d.)
        im.save(path, 'WEBP', quality=82, method=6)
        return im.size


# ---------------------------------------------------------------- tekstregels
def make_lines(chars):
    big = [c for c in chars if c['size'] >= 8.5]
    small = [c for c in chars if c['size'] < 8.5]
    lines = []
    for c in sorted(big, key=lambda c: (round(c['bottom']), c['x0'])):
        for L in lines:
            if abs(L['bottom'] - c['bottom']) < 2.5:
                L['c'].append(c); L['x0'] = min(L['x0'], c['x0']); L['x1'] = max(L['x1'], c['x1']); L['top'] = min(L['top'], c['top'])
                break
        else:
            lines.append({'c': [c], 'bottom': c['bottom'], 'top': c['top'], 'x0': c['x0'], 'x1': c['x1']})
    for c in small:
        mid = (c['top'] + c['bottom']) / 2
        L = next((L for L in lines if L['top'] - 4 <= mid <= L['bottom'] + 3 and L['x0'] - 20 <= c['x0'] <= L['x1'] + 20), None)
        if L is None:
            lines.append({'c': [c], 'bottom': c['bottom'], 'top': c['top'], 'x0': c['x0'], 'x1': c['x1']})
        else:
            L['c'].append(c); L['x0'] = min(L['x0'], c['x0']); L['x1'] = max(L['x1'], c['x1'])
    for L in lines:
        L['c'].sort(key=lambda c: c['x0'])
        sizes = [c['size'] for c in L['c'] if c['t'].strip()]
        L['size'] = max(sizes) if sizes else 12
        L['text'] = ''.join(c['t'] for c in L['c']).strip()
    return sorted([L for L in lines if L['text']], key=lambda L: L['bottom'])


def _smooth_words(cs):
    """Vet/cursief per woord gelijk trekken (de PDF wisselt soms per letter)."""
    word = []
    def flush():
        if len(word) > 1:
            for k in ('b', 'i'):
                v = sum(c[k] for c in word) * 2 >= len(word)
                for c in word:
                    c[k] = v
        word.clear()
    prev = None
    for c in cs:
        if not c['t'].strip() or (prev is not None and c['x0'] - prev['x1'] > 0.22 * c['size']):
            flush()
        if c['t'].strip():
            word.append(c)
        prev = c
    flush()


def line_html(L):
    _smooth_words(L['c'])
    out, state, buf = [], None, []
    prev = None
    for c in L['c']:
        pos = ''
        if c['size'] < L['size'] * 0.8:
            if c['bottom'] < L['bottom'] - 1.5:
                pos = 'sup'
            elif c['top'] > L['top'] + 2:
                pos = 'sub'
        st = (c['b'] and c['t'].strip() != '', c['i'] and c['t'].strip() != '', pos)
        if prev is not None and c['t'] != ' ' and prev['t'] != ' ' and c['x0'] - prev['x1'] > 0.22 * c['size'] and not pos:
            buf.append(' ')
        if st != state and c['t'].strip():
            if buf:
                out.append((state, ''.join(buf)))
            state, buf = st, []
        buf.append(c['t'])
        prev = c
    if buf:
        out.append((state, ''.join(buf)))
    res = []
    for st, t in out:
        t = html.escape(t)
        if st:
            b, i, pos = st
            if pos:
                t = f'<{pos}>{t}</{pos}>'
            if i:
                t = f'<i>{t}</i>'
            if b:
                t = f'<b>{t}</b>'
        res.append(t)
    s = ''.join(res)
    s = re.sub(r'(\s+)(</(?:sup|sub|i|b)>)', r'\2\1', s)
    s = re.sub(r'</b>(\s*)<b>', r'\1', s)
    s = re.sub(r'</i>(\s*)<i>', r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()


def is_bold(L):
    cs = [c for c in L['c'] if c['t'].strip()]
    return cs and sum(c['b'] for c in cs) >= 0.9 * len(cs)


def is_math(L):
    cs = [c for c in L['c'] if c['t'].strip()]
    return bool(cs) and sum(c['math'] for c in cs) >= 0.3 * len(cs)


# ---------------------------------------------------------------- een gebied naar HTML
def _blocks(doc, pi, chars, figs, tabs, ctx, depth=0):
    """Blokken (y, html) van één pagina(deel): tekst, figuren, formules, tabellen en kaders."""
    blocks = []
    inbox = lambda c, r, m=1: r[0] - m <= c['x0'] and c['x1'] <= r[2] + m and r[1] - m <= c['top'] and c['bottom'] <= r[3] + m
    # navigatieknoppen ('Naar de uitwerking' e.d.) zijn geen figuur
    nav = [(L['top'], L['bottom']) for L in make_lines(chars) if NAV.search(L['text'])]
    figs = [list(f) for f in figs if not any(f[1] < nb + 12 and f[3] > nt - 12 and f[3] - f[1] < 80 for nt, nb in nav)]
    figs = [f for f in figs if not doc.is_nav(pi, f)]
    # een 'figuur' die vooral uit tekst bestaat is een omkaderd tekstblok: tekst als tekst, figuren erin apart
    for f in [f for f in figs if depth == 0 and sum(1 for c in chars if inbox(c, f, 1) and c['t'].isalpha() and not c['math']) > 200]:
        figs.remove(f)
        inner = [c for c in chars if inbox(c, f, 1)]
        chars = [c for c in chars if not inbox(c, f, 1)]
        sub = _blocks(doc, pi, inner, [list(x) for x in doc.inner_figures(pi, f)], [], ctx, 1)
        blocks.append((f[1], '<div class="tbox">' + '\n'.join(h_ for _, h_ in sorted(sub, key=lambda x: x[0])) + '</div>'))
    # tekst die bij een figuur hoort (labels) zit in de afbeelding
    for f in figs:
        # labels net buiten de lijnen meenemen
        near = [c for c in chars if f[0] - 30 <= c['x0'] and c['x1'] <= f[2] + 30 and f[1] - 12 <= c['top'] and c['bottom'] <= f[3] + 12]
        for c in near:
            f[0], f[1], f[2], f[3] = min(f[0], c['x0']), min(f[1], c['top']), max(f[2], c['x1']), max(f[3], c['bottom'])
        # en korte regels (hele labels) die de figuur dan nog raken
        for _ in range(4):
            grown = False
            for L in make_lines(chars):
                if f[0] <= L['x0'] and L['x1'] <= f[2] and f[1] <= L['top'] and L['bottom'] <= f[3]:
                    continue
                # een regel die dwars door de figuur loopt, hoort erbij (bijv. een tabel met tekstkolommen)
                through = f[1] - 2 <= L['top'] and L['bottom'] <= f[3] + 2 and L['x0'] < f[2] and L['x1'] > f[0]
                if len(L['text']) > 25 and not through:
                    continue
                if L['x1'] >= f[0] - 30 and L['x0'] <= f[2] + 30 and L['bottom'] >= f[1] - 12 and L['top'] <= f[3] + 12:
                    f[0], f[1], f[2], f[3] = min(f[0], L['x0']), min(f[1], L['top']), max(f[2], L['x1']), max(f[3], L['bottom'])
                    grown = True
            if not grown:
                break
    rest = [c for c in chars if not any(inbox(c, f, 2) for f in figs) and not any(inbox(c, t['bbox'], 2) for t in tabs)]
    lines = [L for L in make_lines(rest) if not NAV.search(L['text'])]
    # losse symbooltjes (bijv. een vector-E met pijltje) horen bij de tekstregel waar ze in staan
    EQNR = re.compile(r'\(\s*\d+(\.\d+)*-\d+\s*\)')
    hosts = [L for L in lines if len(re.sub(r'\W', '', L['text'])) >= 12 and not EQNR.fullmatch(L['text']) and not is_math(L)]
    for L in lines:
        if L in hosts or not (is_math(L) or len(L['text']) <= 3):
            continue
        mid = (L['top'] + L['bottom']) / 2
        host = next((M for M in hosts if M['top'] - 5 <= mid <= M['bottom'] + 2 and M['x0'] - 5 <= L['x0'] and L['x1'] <= M['x1'] + 5), None)
        if host:
            host['c'] = sorted(host['c'] + L['c'], key=lambda c: c['x0'])
            host['text'] = ''.join(c['t'] for c in host['c']).strip()
            L['text'] = ''
    lines = [L for L in lines if L['text']]
    # losse formules (regels met vooral wiskundetekens) als afbeelding, aaneengesloten regels samen
    eq, keep = [], []
    for L in lines:
        if is_math(L) and not OPTION.match(L['text']):
            if eq and L['top'] - eq[-1][3] < 8:
                e = eq[-1]; e[0], e[1], e[2], e[3] = min(e[0], L['x0']), min(e[1], L['top']), max(e[2], L['x1']), max(e[3], L['bottom'])
            else:
                eq.append([L['x0'], L['top'], L['x1'], L['bottom']])
        else:
            keep.append(L)
    # vergelijkingsnummers zoals ( 4.2-1) naast een formule horen bij de formule
    for L in keep:
        if re.fullmatch(r'\(\s*\d+(\.\d+)*-\d+\s*\)', L['text']):
            for e in eq:
                if e[1] - 12 <= (L['top'] + L['bottom']) / 2 <= e[3] + 12:
                    e[2] = max(e[2], L['x1']); e[1] = min(e[1], L['top']); e[3] = max(e[3], L['bottom'])
                    L['text'] = ''
                    break
    # tellers/noemers (korte regels net boven of onder een formule) horen erbij
    for L in keep:
        if len(L['text']) < 8:
            for e in eq:
                if e[1] - 14 <= (L['top'] + L['bottom']) / 2 <= e[3] + 14 and L['x0'] >= e[0] - 5 and L['x1'] <= e[2] + 5:
                    e[1] = min(e[1], L['top']); e[3] = max(e[3], L['bottom'])
                    L['text'] = ''
                    break
    keep = [L for L in keep if L['text']]
    # tekstregels die binnen een formule vallen (breukstrepen, indices) horen erbij
    lines = [L for L in keep if not any(e[1] - 1 <= (L['top'] + L['bottom']) / 2 <= e[3] + 1 and L['x0'] >= e[0] - 40 and L['x1'] <= e[2] + 60 and len(L['text']) < 25 for e in eq)]
    for f in figs + eq:
        ctx['n'] += 1
        name = f"{ctx['prefix']}-f{ctx['n']}"
        size = doc.crop(pi, f, ctx['dir'] / f'{name}.webp')
        if size is None:
            ctx['n'] -= 1
            continue
        w, h = size
        cls = 'tfig' if f in figs else 'teq'
        blocks.append((f[1], f'<img class="{cls}" src="{ctx['rel']}/{name}.webp" width="{w}" height="{h}" alt="" loading="lazy">'))
    for t in tabs:
        if t['kind'] == 'box':
            inner = [c for c in chars if inbox(c, t['bbox'], 2)]
            body = paragraphs(make_lines(inner), doc.col[1])
            blocks.append((t['bbox'][1], f'<div class="tbox">{body}</div>'))
        else:
            blocks.append((t['bbox'][1], ('TABLE', t['grid'])))
    for para_top, h_ in paragraphs(lines, doc.col[1], split=True):
        blocks.append((para_top, h_))
    return blocks


def region_html(doc, parts, fig_dir, prefix, skip_title=None):
    """parts = [(pagina, boven, onder)]. Geeft HTML terug; figuren komen als <img> in fig_dir/<prefix>-fN.webp."""
    blocks = []      # (volgorde, html)
    ctx = {'n': 0, 'prefix': prefix, 'dir': fig_dir, 'rel': 'img/' + fig_dir.as_posix().split('/img/', 1)[-1]}
    for pno, (pi, a, b) in enumerate(parts):
        P = doc.page(pi)
        within = lambda y0, y1: y0 >= a - 2 and y1 <= b + 2
        tabs = [t for t in P['tables'] if a - 2 <= (t['bbox'][1] + t['bbox'][3]) / 2 <= b + 2]
        figs = [f for f in P['figs'] if within(f[1], f[3])] + [list(t['bbox']) for t in tabs if t['kind'] == 'img']
        tabs = [t for t in tabs if t['kind'] != 'img']
        chars = [c for c in P['chars'] if a - 1 <= c['top'] < b]
        blocks += [((pno, y), h_) for y, h_ in _blocks(doc, pi, chars, figs, tabs, ctx)]
    blocks.sort(key=lambda x: x[0])
    # een tabel die op de volgende pagina doorloopt wordt één tabel
    out = []
    for _, h in blocks:
        if isinstance(h, tuple) and out and isinstance(out[-1], tuple) and out[-1][1]['ncol'] == h[1]['ncol']:
            out[-1] = ('TABLE', {'ncol': h[1]['ncol'], 'rows': out[-1][1]['rows'] + h[1]['rows']})
        else:
            out.append(h)
    out = [table_html(h[1]) if isinstance(h, tuple) else h for h in out]
    # alinea's die over een paginagrens doorlopen samenvoegen
    merged = []
    for h in out:
        if merged and merged[-1].startswith('<p>') and merged[-1].endswith('</p>') and h.startswith('<p>') and re.match(r'<p>[a-z(]', h) \
                and not re.search(r'[.:!?]</p>$', merged[-1]):
            merged[-1] = merged[-1][:-4] + ' ' + h[3:]
        else:
            merged.append(h)
    if skip_title and merged:
        first = re.sub(r'\W+', '', re.sub(r'<[^>]+>', '', merged[0])).lower()
        want = re.sub(r'\W+', '', skip_title).lower() if isinstance(skip_title, str) else ''
        if want and first.startswith(want[:25]) and len(first) < len(want) + 30:
            merged = merged[1:]
    return '\n'.join(merged)


def table_grid(t, rows):
    """Cellen met rij- en kolombreedte (samengevoegde cellen) uit een pdfplumber-tabel."""
    xs = sorted({round(c[0]) for c in t.cells})
    ys = sorted({round(c[1]) for c in t.cells})
    out = []
    for i, r in enumerate(t.rows):
        cur = []
        for j, bb in enumerate(r.cells):
            if bb is None:
                continue
            cs = max(1, sum(1 for x in xs if bb[0] - 1 <= x < bb[2] - 1))
            rs = max(1, sum(1 for y in ys if bb[1] - 1 <= y < bb[3] - 1))
            txt = rows[i][j] if j < len(rows[i]) else ''
            cur.append((txt or '', rs, cs))
        out.append(cur)
    return {'ncol': len(xs), 'rows': out}


def table_html(g):
    def td(c):
        txt, rs, cs = c
        at = (f' rowspan="{rs}"' if rs > 1 else '') + (f' colspan="{cs}"' if cs > 1 else '')
        return f'<td{at}>' + html.escape(txt.strip()).replace(chr(10), '<br>') + '</td>'
    return '<div class="ttable"><table>' + ''.join('<tr>' + ''.join(td(c) for c in r) + '</tr>' for r in g['rows']) + '</table></div>'


def paragraphs(lines, col_r, split=False):
    """Regels -> alinea's, koppen, opsommingen en antwoordopties."""
    if not lines:
        return [] if split else ''
    gaps = [lines[i + 1]['top'] - lines[i]['bottom'] for i in range(len(lines) - 1) if 0 < lines[i + 1]['top'] - lines[i]['bottom'] < 12]
    lead = median(gaps) if gaps else 3
    res, cur = [], None

    def flush():
        nonlocal cur
        if cur:
            kind, top, parts = cur
            body = ' '.join(parts)
            if kind == 'li':
                res.append((top, f'<ul><li>{body}</li></ul>'))
            elif kind == 'h3':
                res.append((top, f'<h3>{body}</h3>'))
            elif kind == 'h4':
                res.append((top, f'<h4>{body}</h4>'))
            elif kind == 'cap':
                res.append((top, f'<p class="cap">{body}</p>'))
            elif kind == 'topt':
                res.append((top, f'<p class="topt">{body}</p>'))
            else:
                res.append((top, f'<p>{body}</p>'))
        cur = None

    prev = None
    for L in lines:
        h_ = line_html(L)
        t = L['text']
        gap = L['top'] - prev['bottom'] if prev else 99
        if t[:1] in BULLETS:
            flush()
            h_ = re.sub(r'^(<[bi]>)?[•▪◦]\s*', r'\1', h_)
            cur = ['li', L['top'], [h_]]
        elif OPTION.match(t):
            flush()
            cur = ['topt', L['top'], [h_]]
        elif is_bold(L) and len(t) < 140 and L['size'] >= 11:
            if cur and cur[0] in ('h3', 'h4') and gap < lead + 3:
                cur[2].append(re.sub(r'</?b>', '', h_))
            else:
                flush()
                cur = ['h3' if re.match(r'^\d+(\.\d+)+\s', t) else 'h4', L['top'], [re.sub(r'</?b>', '', h_)]]
        elif re.match(r'^(Figuur|Tabel|Foto)\s', t) and L['size'] <= 10.5:
            flush()
            cur = ['cap', L['top'], [h_]]
        elif cur and cur[0] in ('p', 'li', 'cap') and gap < lead + 2.5 and abs(L['size'] - prev['size']) < 1.5 \
                and not (cur[0] == 'li' and L['x0'] < prev['x0'] - 25):
            cur[2].append(h_)
        else:
            flush()
            cur = ['p', L['top'], [h_]]
        prev = L
    flush()
    # opeenvolgende <ul> samenvoegen
    out = []
    for top, h_ in res:
        if out and out[-1][1].endswith('</ul>') and h_.startswith('<ul>'):
            out[-1] = (out[-1][0], out[-1][1][:-5] + h_[4:])
        else:
            out.append((top, h_))
    return out if split else '\n'.join(h for _, h in out)
