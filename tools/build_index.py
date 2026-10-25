#!/usr/bin/env python3
"""Maakt data/index.json uit alle data/hoofdstuk-*.json (aantal vragen per onderdeel)."""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TITLES = {
    1: "De zendamateur in actie", 2: "Basiskennis",
    3: "Lading, spanning, stroom en weerstand", 4: "Condensatoren en spoelen",
    5: "Wisselstroom en wisselspanning", 6: "Transformatoren en opbouw van spoelen",
    7: "Halfgeleiding, halfgeleiderdioden en enkele toepassingen",
    8: "Versterkende elementen, hun instelling en basisschakelingen",
    9: "Versterkerschakelingen",
    10: "Terugkoppeling, op-amps, oscillatoren, laagspanningsvoedingen",
    11: "Digitale techniek", 12: "Radio: modulatie en zenders",
    13: "Radio: ontvangers, fasevergrendelde lus, digitale radio",
    14: "Antennes, transmissielijnen en voortplanting van elektromagnetische golven",
    15: "Meten en meetinstrumenten", 16: "Storing en immuniteit", 17: "Veiligheid",
    18: "Nationale en internationale regelgeving",
}
chapters = []
for n, title in TITLES.items():
    f = ROOT / 'data' / f'hoofdstuk-{n}.json'
    count = len(json.loads(f.read_text(encoding='utf-8'))) if f.exists() else 0
    chapters.append({"n": n, "title": title, "count": count, "theory": (ROOT / 'data' / 'theorie' / f'hoofdstuk-{n}.json').exists()})
(ROOT / 'data' / 'index.json').write_text(
    json.dumps({"chapters": chapters}, ensure_ascii=False, indent=1), encoding='utf-8')
print({c['n']: c['count'] for c in chapters if c['count']})
