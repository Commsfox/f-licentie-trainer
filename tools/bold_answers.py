"""Leest het vetgedrukte antwoord (de VRZA zet het goede antwoord vet in de uitwerking)."""
import re, sys, json, pdfplumber
from pathlib import Path
SOL = re.compile(r'(?:Uitwerking van|Antwoord bij) Opgave\s+(\d+)-(\d+)')
OPT = re.compile(r'^\s*([A-D])\.\s')
def run(pdf):
    out = {}
    with pdfplumber.open(pdf) as doc:
        for pg in doc.pages:
            txt = pg.extract_text() or ''
            heads = [m for m in SOL.finditer('\n'.join(txt.split('\n')[:12]))]
            if not heads:
                continue
            ch, n = int(heads[0].group(1)), int(heads[0].group(2))
            if f'hs{ch}-{n}' in out:
                continue
            lines = {}
            for c in pg.chars:
                lines.setdefault(round(c['top'] / 3), []).append(c)
            bold = []
            for k in sorted(lines):
                cs = sorted(lines[k], key=lambda c: c['x0'])
                t = ''.join(c['text'] for c in cs)
                m = OPT.match(t)
                if not m:
                    continue
                if any('Bold' in c['fontname'] for c in cs[1:4]):
                    bold.append(m.group(1))
            out[f'hs{ch}-{n}'] = bold
    return out
if __name__ == '__main__':
    res = {}
    for p in sys.argv[1:]:
        res.update(run(p))
    json.dump(res, sys.stdout)
