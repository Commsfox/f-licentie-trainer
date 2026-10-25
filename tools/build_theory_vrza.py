#!/usr/bin/env python3
"""Maakt uit een VRZA-theoriehoofdstuk ('Hoofdstuk N_volledige tekst') de theorie voor de app:

  data/theorie/hoofdstuk-<N>.json   paragrafen (lvl 1) en subparagrafen (lvl 2) met hun afbeeldingen,
                                    de theorievragen ('opgaven') met uitwerking, en 'qmap' (examenvraag -> paragraaf)
  img/theorie/hs<N>/*.webp          per (sub)paragraaf uitgeknipt, zonder kop- en voettekst

De indeling komt uit de links in de inhoudsopgave van de PDF (elke regel verwijst naar de plek van het kopje),
dus elk stuk begint precies bij zijn kopje en loopt door tot het volgende kopje, ook over pagina's heen.

Gebruik: python tools/build_theory_vrza.py bronnen/THEORIE_HS4_....pdf [meer pdf's]
Het hoofdstuknummer komt uit de bestandsnaam (THEORIE_HS<N>_...). Daarna: python tools/build_index.py
Bestaande 'formulas', 'cards' en 'drill' blijven behouden; hun paragraafverwijzingen worden op titel omgezet.
"""
import collections, json, math, re, shutil, sys
from pathlib import Path

import numpy as np
import pdfplumber
from PIL import Image
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parent))
from strip_nav import find_icons  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DPI = 110
SC = DPI / 72
NUM = re.compile(r'^(\d+(?:\.\d+)+)\.?\s+(.*)$')
OPGAVE = re.compile(r'^Opgave\s+(\d+-\d+)\.?$')
UITWERKING = re.compile(r'^(?:Uitwerking|Antwoord)(?:en)? (?:van|bij) [Oo]pgave\s+(\d+-\d+)\.?$')
OPG_HEAD = re.compile(r'^(Opgaven?\b.*|Uitwerkingen\b.*|Antwoorden (bij|van) de opgaven.*|Hoe werkt dit\??)$')


def norm(s):
    return re.sub(r'[^a-z0-9]+', '', s.lower())


def bare(title):
    """Titel zonder nummer, voor het omzetten van oude paragraafverwijzingen."""
    m = NUM.match(title)
    return norm(m.group(2) if m else title)


# ---------------------------------------------------------------- inhoudsopgave
def toc_entries(pdf):
    """[(titel, x0, pagina-index, top)] uit de links van de inhoudsopgave."""
    rd = PdfReader(str(pdf))
    page_of = {p.indirect_reference.idnum: i for i, p in enumerate(rd.pages)}
    pl = pdfplumber.open(str(pdf))
    out, started = [], False
    for pi in range(min(15, len(rd.pages))):
        links = []
        for a in rd.pages[pi].get('/Annots') or []:
            o = a.get_object()
            d = o.get('/Dest')
            if o.get('/Subtype') != '/Link' or not isinstance(d, list) or len(d) < 4:
                continue
            links.append((o['/Rect'], page_of.get(d[0].idnum), float(d[3] or 0)))
        is_toc = (pl.pages[pi].extract_text() or '').count('.....') >= 5   # verwijzingen in de lopende tekst overslaan
        if not links or not is_toc:
            if started:
                break
            continue
        started = True
        pg = pl.pages[pi]
        H = float(pg.height)
        words = pg.extract_words()
        for rect, dp, dy in sorted(links, key=lambda l: -float(l[0][3])):
            x0, y0, x1, y1 = (float(v) for v in rect)
            top, bot = H - y1, H - y0
            ws = [w for w in words if w['top'] >= top - 1 and w['bottom'] <= bot + 1 and w['x0'] >= x0 - 1 and w['x1'] <= x1 + 1]
            # paginanummer (bijv. 4-33) staat rechts uitgelijnd; 'Opgave 4-1' zelf niet
            ws = [w for w in ws if not (re.fullmatch(r'\.*\d+-\d+', w['text']) and w['x1'] > x1 - 30)]
            lines = []                      # woorden per regel (kleine hoogteverschillen, bijv. een π, negeren)
            for w in sorted(ws, key=lambda w: w['top']):
                if lines and abs(w['top'] - lines[-1][0]) < 4:
                    lines[-1][1].append(w)
                else:
                    lines.append([w['top'], [w]])
            txt = ' '.join(w['text'] for _, l in lines for w in sorted(l, key=lambda w: w['x0']))
            txt = re.sub(r'\s*\.{3,}.*$', '', txt)
            txt = re.sub(r'\s+\.?\s*\d+-$', '', txt)
            txt = re.sub(r'\s+', ' ', re.sub(r'\s+\(pi\)', ' π', txt)).strip()   # het π-teken zit in een symboolfont
            if not txt or dp is None:
                continue
            dtop = float(pl.pages[dp].height) - dy
            out.append([txt, round(ws[0]['x0']) if ws else round(x0), dp, dtop])
    pl.close()
    # titels die over twee regels lopen hebben twee links naar dezelfde plek
    merged = []
    for e in out:
        if merged and (merged[-1][2], round(merged[-1][3])) == (e[2], round(e[3])):
            merged[-1][0] += ' ' + e[0]
        else:
            merged.append(e)
    return merged


def structure(entries):
    """Niveau per kopje: 4.2 -> 1, 4.2.1 -> 2, 4.2.1.1 -> 3; ongenummerd = één dieper dan het laatste genummerde."""
    res, last = [], 0
    for title, x, p, top in entries:
        m = NUM.match(title)
        if m:
            lvl = m.group(1).count('.')
            if lvl == 0:
                continue                      # hoofdstuktitel
            last = lvl
            res.append({'num': m.group(1), 'title': m.group(2).strip(), 'lvl': lvl, 'p': p, 'top': top})
        else:
            if re.match(r'^\d+\s', title):
                continue                      # 'N Hoofdstuktitel'
            res.append({'num': '', 'title': title, 'lvl': last + 1, 'p': p, 'top': top})
    return res


# ---------------------------------------------------------------- pagina's renderen en knippen
class Pages:
    def __init__(self, pdf):
        self.pdf = pdf
        self.pl = pdfplumber.open(str(pdf))
        self.cache = {}
        self.cols = self._columns()

    def _columns(self):
        xs0, xs1 = [], []
        for pg in self.pl.pages[5:]:
            for w in pg.extract_words():
                if 120 < w['top'] < float(pg.height) - 90:
                    xs0.append(w['x0']); xs1.append(w['x1'])
        return (max(0, np.percentile(xs0, 0.5) - 14), min(float(self.pl.pages[0].width), np.percentile(xs1, 99.5) + 14))

    def bounds(self, pi):
        """(boven, onder) van het inhoudsgebied in punten: onder de koptekst/logo, boven de ©-voettekst."""
        pg = self.pl.pages[pi]
        H = float(pg.height)
        top, bot = 0.0, H
        for w in pg.extract_words():
            if w['top'] < H * 0.15 and (w['text'].startswith('VRZA-cursus') or w['text'].startswith('Hoofdstuk') or '_volledige' in w['text']):
                top = max(top, w['bottom'] + 6)
            if w['top'] > H * 0.85 and w['text'].startswith('©'):
                bot = min(bot, w['top'] - 4)
        for im in pg.images:
            if im['top'] < H * 0.12:
                top = max(top, im['bottom'] + 4)
        return top, bot

    def image(self, pi):
        if pi not in self.cache:
            pg = self.pl.pages[pi]
            im = pg.to_image(resolution=DPI).original.convert('RGB')
            a = np.array(im)
            for w in pg.extract_words():            # %%%%-regels (scheidingsteken uit de bron) wegpoetsen
                if re.fullmatch(r'%{3,}', w['text']):
                    a[int(w['top'] * SC) - 2:int(w['bottom'] * SC) + 2, int(w['x0'] * SC) - 2:int(w['x1'] * SC) + 2] = 255
            self.cache = {pi: Image.fromarray(a)}   # één pagina tegelijk in het geheugen
        return self.cache[pi]

    def words(self, pi, top, bot):
        return [w['text'] for w in self.pl.pages[pi].extract_words() if top <= w['top'] < bot]

    def region(self, start, end):
        """Stukken (pagina, boven, onder) van start=(p, top) tot end=(p, top)."""
        (p0, t0), (p1, t1) = start, end
        out = []
        for pi in range(p0, p1 + 1):
            top, bot = self.bounds(pi)
            a = max(top, t0 - 3) if pi == p0 else top
            b = min(bot, t1 - 3) if pi == p1 else bot
            if b - a > 4:
                out.append((pi, a, b))
        return out

    def crop(self, pi, a, b):
        im = self.image(pi)
        x0, x1 = self.cols
        c = im.crop((int(x0 * SC), int(a * SC), int(x1 * SC), int(b * SC)))
        arr = np.asarray(c).min(axis=2) < 235
        rows = np.where(arr.any(axis=1))[0]
        if not len(rows):
            return None
        return c.crop((0, max(0, rows[0] - 8), c.width, min(c.height, rows[-1] + 9)))


def save(img, path, strip=False):
    if strip:
        a = np.array(img)
        boxes = find_icons(a)
        for y0, y1, x1 in boxes:
            a[max(0, y0 - 4):y1 + 4, :min(a.shape[1], x1 + 6)] = 255
        if boxes:
            img = Image.fromarray(a)
            rows = np.where((a.min(axis=2) < 235).any(axis=1))[0]
            if not len(rows):
                return False
            img = img.crop((0, max(0, rows[0] - 8), img.width, min(img.height, rows[-1] + 9)))
    img.save(path, 'WEBP', quality=80, method=6)
    return True


# ---------------------------------------------------------------- koppeling examenvraag -> paragraaf
STOP = set('de het een en van in is op te dat die dan als voor met door aan zijn er niet ook of om maar bij uit naar wordt worden over dit deze kan kun je u jij we wij ze zij zo nog nu wel meer dus ten toe heeft hebben hun haar onder tussen alle geen'.split())


def toks(s):
    out = []
    for w in re.findall(r'[a-zà-ÿ0-9]{3,}', s.lower()):
        if w in STOP:
            continue
        for suf in ('en', 's', 'e'):
            if w.endswith(suf) and len(w) > 5:
                w = w[:-len(suf)]
                break
        out.append(w)
    return out


def map_questions(chap, secs, texts, overrides):
    qf = ROOT / 'data' / f'hoofdstuk-{chap}.json'
    if not qf.exists():
        return {}
    cand = [s for s in secs if s['id'] in texts and not s.get('group') and not s['title'].startswith('Wat leer je')]
    docs = {s['id']: collections.Counter(toks(texts[s['id']] + ' ' + (s['title'] + ' ') * 6)) for s in cand}
    df = collections.Counter(w for d in docs.values() for w in d)
    idf = {w: math.log((len(docs) + 1) / (c + 0.5)) for w, c in df.items()}

    def vec(c):
        v = {w: (1 + math.log(n)) * idf.get(w, 0) for w, n in c.items()}
        nr = math.sqrt(sum(x * x for x in v.values())) or 1
        return {w: x / nr for w, x in v.items()}
    dv = {k: vec(c) for k, c in docs.items()}
    qmap = {}
    for q in json.loads(qf.read_text(encoding='utf-8')):
        if q['id'] in overrides:
            qmap[q['id']] = overrides[q['id']]
            continue
        qv = vec(collections.Counter(toks(' '.join([q['question']] * 3 + [o['text'] for o in q['options']] + [q['explanation']]))))
        sc = sorted(((sum(x * dv[k].get(w, 0) for w, x in qv.items()), k) for k in dv), reverse=True)
        if not sc:
            continue
        best = [sc[0][1]]
        if len(sc) > 1 and sc[1][0] > 0.85 * sc[0][0] and sc[1][0] > 0.05:
            best.append(sc[1][1])
        qmap[q['id']] = best
    return qmap


# ---------------------------------------------------------------- hoofdstuk
def build(pdf):
    pdf = Path(pdf)
    chap = int(re.search(r'HS(\d+)', pdf.name).group(1))
    heads = structure(toc_entries(pdf))
    P = Pages(pdf)
    n_pages = len(P.pl.pages)
    out_dir = ROOT / 'img' / 'theorie' / f'hs{chap}'
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    # elk kopje loopt tot het volgende kopje (van welk niveau dan ook)
    for i, h in enumerate(heads):
        nxt = heads[i + 1] if i + 1 < len(heads) else None
        h['end'] = (nxt['p'], nxt['top']) if nxt else (n_pages - 1, 10_000)
        h['start'] = (h['p'], h['top'])

    # niveau 3 en dieper hoort bij de bovenliggende subparagraaf
    items = []
    for h in heads:
        if h['lvl'] >= 3 and items:
            items[-1]['end'] = h['end']
        else:
            items.append(dict(h))

    secs, opgaven, uitw = [], {}, {}
    texts = {}
    last_l1 = None
    in_exercises = False
    k = 0
    for i, it in enumerate(items):
        title = it['title']
        full = f"{it['num']} {title}".strip()
        m_o, m_u = OPGAVE.match(title), UITWERKING.match(title)
        if m_o or m_u or OPG_HEAD.match(title):
            in_exercises = True
            parts = P.region(it['start'], it['end'])
            if m_o or m_u:
                imgs = []
                for j, (pi, a, b) in enumerate(parts):
                    c = P.crop(pi, a, b)
                    name = f"{'o' if m_o else 'u'}{(m_o or m_u).group(1)}-{j}"
                    if c is not None and save(c, out_dir / f'{name}.webp', strip=True):
                        imgs.append(name)
                (opgaven if m_o else uitw)[(m_o or m_u).group(1)] = {'num': it['num'], 'imgs': imgs,
                                                                     'sec': last_l1, 'k': k}
            continue
        if it['lvl'] == 1:
            in_exercises = False
        if in_exercises:
            continue
        k += 1
        sid = f's{k}'
        is_group = it['lvl'] == 1 and i + 1 < len(items) and items[i + 1]['lvl'] == 2 and not OPGAVE.match(items[i + 1]['title'])
        parts = P.region(it['start'], it['end'])
        imgs, words = [], []
        for j, (pi, a, b) in enumerate(parts):
            c = P.crop(pi, a, b)
            words += P.words(pi, a, b)
            if c is None:
                continue
            name = f'{sid}-{j}'
            save(c, out_dir / f'{name}.webp')
            imgs.append(name)
        texts[sid] = ' '.join(words)
        if it['lvl'] == 1:
            last_l1 = sid
        if is_group:
            # een paragraaf met subparagrafen: de tekst vóór de eerste subparagraaf wordt een eigen 'Inleiding'
            secs.append({'id': sid, 'num': it['num'], 'title': full, 'lvl': 1, 'pages': [], 'group': True})
            tall = sum(Image.open(out_dir / f'{n}.webp').height for n in imgs)
            if tall > 70:
                k += 1
                iid = f's{k}'
                for n in imgs:
                    (out_dir / f'{n}.webp').rename(out_dir / f'{iid}-{n.split("-")[1]}.webp')
                secs.append({'id': iid, 'num': it['num'], 'title': f"{full}: inleiding", 'lvl': 2,
                             'pages': [f'{iid}-{n.split("-")[1]}' for n in imgs]})
                texts[iid] = texts.pop(sid)
            else:
                for n in imgs:
                    (out_dir / f'{n}.webp').unlink()
            continue
        secs.append({'id': sid, 'num': it['num'], 'title': full, 'lvl': it['lvl'] if it['lvl'] <= 2 else 2, 'pages': imgs})

    # opgaven die tussen de theorie staan (zoals in H2) horen bij de paragraaf ervoor;
    # opgaven achteraan (na alle theorie) horen bij het hele hoofdstuk
    ex = []
    for key in sorted(opgaven, key=lambda s: int(s.split('-')[1])):
        o = opgaven[key]
        ex.append({'id': f'o{key}', 'title': f'Opgave {key}', 'sec': o['sec'] if o['k'] < k else None,
                   'q': o['imgs'], 's': uitw.get(key, {}).get('imgs', [])})

    f = ROOT / 'data' / 'theorie' / f'hoofdstuk-{chap}.json'
    f.parent.mkdir(parents=True, exist_ok=True)
    old = json.loads(f.read_text(encoding='utf-8')) if f.exists() else {}
    remap = {}
    if old.get('sections'):
        by_title = {bare(s['title'].split(': inleiding')[0]) + (':i' if ': inleiding' in s['title'] else ''): s['id'] for s in secs}
        for s in old['sections']:
            key = bare(s['title'].split(': inleiding')[0]) + (':i' if ': inleiding' in s['title'] else '')
            if key in by_title:
                remap[s['id']] = by_title[key]
    fix = lambda sid: remap.get(sid, sid)
    cards = [{**c, 'sec': fix(c['sec'])} for c in old.get('cards', [])]
    drill = [{**d, 'sec': fix(d['sec'])} for d in old.get('drill', [])]
    ov_f = ROOT / 'tools' / 'theory_overrides.json'
    ov_all = json.loads(ov_f.read_text(encoding='utf-8')) if ov_f.exists() else {}
    overrides = {q: [fix(s) for s in v] for q, v in ov_all.items() if q.startswith(f'hs{chap}-')}
    qmap = map_questions(chap, secs, texts, overrides)
    for s in secs:
        s.pop('group', None)
    data = {'chapter': chap, 'dir': f'img/theorie/hs{chap}', 'sections': secs, 'opgaven': ex,
            'qmap': qmap, 'formulas': old.get('formulas', []), 'cards': cards, 'drill': drill}
    f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    if remap:
        print(f'  {len(remap)} van {len(old["sections"])} oude paragrafen omgezet')
    n_img = len(list(out_dir.glob('*.webp')))
    print(f'Hoofdstuk {chap}: {len(secs)} (sub)paragrafen, {len(ex)} opgaven ({sum(1 for e in ex if e["s"])} met uitwerking), '
          f'{len(qmap)} examenvragen gekoppeld, {n_img} afbeeldingen')
    return data


if __name__ == '__main__':
    for p in sys.argv[1:]:
        build(p)
