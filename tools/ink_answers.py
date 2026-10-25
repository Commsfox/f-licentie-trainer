"""Tweede controle: het goede antwoord staat vet in de uitwerking. Meet inkt-dichtheid per optieregel."""
import re, sys, json
import numpy as np, pdfplumber, pypdfium2 as pdfium
SOL = re.compile(r'(?:Uitwerking van|Antwoord bij) Opgave\s+(\d+)-(\d+)')
OPT = re.compile(r'^\s*([A-D])\.')
SC = 3.0  # 216 dpi
def run(pdf):
    out = {}
    doc = pdfium.PdfDocument(pdf)
    with pdfplumber.open(pdf) as pl:
        for i, pg in enumerate(pl.pages):
            txt = pg.extract_text() or ''
            m = SOL.search('\n'.join(txt.split('\n')[:12]))
            if not m:
                continue
            key = f'hs{int(m.group(1))}-{int(m.group(2))}'
            if key in out:
                continue
            lines = {}
            for c in pg.chars:
                lines.setdefault(round(c['top'] / 3), []).append(c)
            opts = {}
            for k in sorted(lines):
                cs = sorted(lines[k], key=lambda c: c['x0'])
                t = ''.join(c['text'] for c in cs)
                mm = OPT.match(t)
                if mm and mm.group(1) not in opts:
                    opts[mm.group(1)] = cs
            if len(opts) < 3:
                continue
            img = np.array(doc[i].render(scale=SC).to_pil().convert('L'))
            dens = {}
            for L, cs in opts.items():
                body = [c for c in cs if c['x0'] > cs[0]['x0'] + 14 and c['text'].strip()]
                if len(body) < 3:
                    continue
                x0 = min(c['x0'] for c in body); x1 = max(c['x1'] for c in body)
                t0 = min(c['top'] for c in body); t1 = max(c['bottom'] for c in body)
                reg = img[int(t0 * SC):int(t1 * SC) + 1, int(x0 * SC):int(x1 * SC) + 1]
                ink = (255 - reg.astype(float)).sum() / 255
                dens[L] = ink / max(1, sum(c['size'] ** 2 * 0.0 + (c['x1'] - c['x0']) * c['size'] for c in body)) / SC / SC
            out[key] = dens
    return out
if __name__ == '__main__':
    res = {}
    for p in sys.argv[1:]:
        res.update(run(p))
    json.dump(res, sys.stdout)
