#!/usr/bin/env python3
"""Koppelt examenvragen aan theorie-paragrafen (woordovereenkomst, TF-IDF) en schrijft 'qmap' in data/theorie/hoofdstuk-N.json.
Gebruik: python tools/map_questions.py <hoofdstuk> bronnen/THEORIE_HS<N>_....pdf [--show]
Controleer het resultaat (--show) en corrigeer met tools/theory_overrides.json: {"hs3-12": ["s11"], ...}"""
import json, math, re, subprocess, sys, collections
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
STOP = set('de het een en van in is op te dat die dan als voor met door aan zijn er niet ook of om maar bij uit naar wordt worden over dit deze kan kun je u jij we wij ze zij zo nog nu wel meer dus ten toe heeft hebben hun haar onder tussen alle geen'.split())

def toks(s):
    s = s.lower()
    return [w for w in re.findall(r'[a-zà-ÿ0-9]{3,}', s) if w not in STOP]

def stem(w):  # grove verkleining: enkelvoud/meervoud en verkleinwoorden
    for suf in ('en', 's', 'e'):
        if w.endswith(suf) and len(w) > 5: return w[:-len(suf)]
    return w

def section_texts(chap, pdf, secs):
    raw = subprocess.run(['pdftotext', '-layout', str(pdf), '-'], capture_output=True, text=True).stdout
    lines = raw.split('\n')
    norm = lambda s: re.sub(r'[^a-z0-9]+', '', s.lower())
    pos, starts = 0, []
    first_body = next(i for i, l in enumerate(lines) if 'Wat leer je in dit hoofdstuk' in l and '....' not in l)
    pos = first_body
    for s in secs:
        key = norm(s['title'].split(': inleiding')[0]) if ': inleiding' not in s['title'] else norm('Inleiding')
        for i in range(pos, len(lines)):
            n = norm(lines[i])
            if n.endswith(key) and re.match(r'^\s*(\d+(\.\d+)*\s+)?\S', lines[i]) and len(n) < len(key) + 8:
                starts.append(i); pos = i + 1; break
        else:
            starts.append(None)
    out = {}
    for k, s in enumerate(secs):
        if starts[k] is None: out[s['id']] = ''; continue
        nxt = next((starts[j] for j in range(k + 1, len(secs)) if starts[j] is not None), len(lines))
        out[s['id']] = '\n'.join(lines[starts[k]:nxt])
    return out

def main():
    chap, pdf = int(sys.argv[1]), sys.argv[2]
    f = ROOT / 'data' / 'theorie' / f'hoofdstuk-{chap}.json'
    th = json.loads(f.read_text(encoding='utf-8'))
    secs = th['sections']
    group = {s['id'] for i, s in enumerate(secs) if s['lvl'] == 1 and i + 1 < len(secs) and secs[i + 1]['lvl'] == 2}
    cand = [s for s in secs if s['id'] not in group and not s['title'].startswith('Uitwerkingen') and s['title'] not in ('Wat leer je in dit hoofdstuk?',)]
    txt = section_texts(chap, pdf, secs)
    docs = {s['id']: collections.Counter(stem(w) for w in toks(txt[s['id']] + ' ' + (s['title'] + ' ') * 6)) for s in cand}
    df = collections.Counter(w for d in docs.values() for w in d)
    N = len(docs)
    idf = {w: math.log((N + 1) / (c + 0.5)) for w, c in df.items()}
    def vec(c): 
        v = {w: (1 + math.log(n)) * idf.get(w, 0) for w, n in c.items()}
        nr = math.sqrt(sum(x * x for x in v.values())) or 1
        return {w: x / nr for w, x in v.items()}
    dv = {k: vec(c) for k, c in docs.items()}
    qs = json.loads((ROOT / 'data' / f'hoofdstuk-{chap}.json').read_text(encoding='utf-8'))
    ov_f = ROOT / 'tools' / 'theory_overrides.json'
    ov = json.loads(ov_f.read_text(encoding='utf-8')) if ov_f.exists() else {}
    qmap, show = {}, '--show' in sys.argv
    title = {s['id']: s['title'] for s in secs}
    for q in qs:
        if q['id'] in ov: qmap[q['id']] = ov[q['id']]; continue
        c = collections.Counter(stem(w) for w in toks(q['question'] + ' ' + ' '.join(o['text'] for o in q['options']) + ' ' + (q['question'] + ' ') * 2 + q['explanation']))
        qv = vec(c)
        sc = sorted(((sum(x * dv[k].get(w, 0) for w, x in qv.items()), k) for k in dv), reverse=True)
        best = [sc[0][1]]
        if len(sc) > 1 and sc[1][0] > 0.85 * sc[0][0] and sc[1][0] > 0.05: best.append(sc[1][1])
        qmap[q['id']] = best
        if show: print(q['id'], '|', q['question'][:70], '=>', ' ; '.join(f'{b} {title[b][:35]}' for b in best), round(sc[0][0], 2))
    th['qmap'] = qmap
    f.write_text(json.dumps(th, ensure_ascii=False, indent=1), encoding='utf-8')
    print(len(qmap), 'vragen gekoppeld')

main()
