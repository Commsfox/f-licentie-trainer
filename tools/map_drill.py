#!/usr/bin/env python3
"""Koppelt elke formule uit 'drill' aan de oefenvragen die haar toetsen.

Een formule telt als examenstof als er minstens één vraag uit de vragenbank over gaat. De vragenbank
is de examenpool, dus elke vraag telt. De koppeling gaat per paragraaf (qmap) én op trefwoorden in
de vraag, opties en uitleg, omdat de automatische paragraafkoppeling soms naast de juiste paragraaf valt.
Resultaat: veld 'exam' (lijst vraag-id's) bij elk drill-item.   Gebruik: python3 tools/map_drill.py"""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent

KW = {
 3: {
  'ohm': r'wet van ohm|\bohm\b.*(spanning|stroom)|stroom .*(spanning|weerstand)',
  'charge': r'lading|coulomb|ampère ?uur|\bah\b',
  'pui': r'vermogen|\bwatt\b',
  'pir': r'vermogen|\bwatt\b',
  'pur': r'vermogen|\bwatt\b',
  'energy': r'energie|arbeid|joule|kwh|wattuur',
  'units': r'eenheid|milli|micro|kilo|mega',
  'serie': r'serie',
  'par': r'parallel',
  'par2': r'parallel',
  'div': r'spanningsdeler|spanningsverdeler',
  'kirI': r'kirchhoff|knooppunt|stromen',
  'kirU': r'kirchhoff|lus\b|spanningen',
  'wire': r'draad|koper|soortelijke|weerstand van',
  'area': r'doorsnede|diameter|draad',
  'klem': r'klemspanning|inwendige weerstand|emk',
  'bel': r'inwendige weerstand|belasting|bron',
  'aanp': r'aanpassing|maximaal vermogen',
  'accu': r'accu|batterij|capaciteit',
  'rend': r'rendement',
  'volt': r'voltmeter|gevoeligheid',
  'shunt': r'shunt|ampèremeter|ampere ?meter',
 },
 4: {
  'efield': r'veldsterkte|volt per meter|v/m|elektrisch veld',
  'hfield': r'magnetisch veld|veldlijnen|afscherm',
  'qit': r'lading|coulomb',
  'qcu': r'lading|coulomb',
  'cplate': r'plaatafstand|oppervlak.*plaat|diëlectric|diëlektric|capaciteit',
  'breakdown': r'doorslag',
  'lind': r'windingen|zelfinductie|spoel',
  'lcurr': r'schakelaar.*spoel|spoel.*stroom|stroom.*spoel|inschakel',
  'taurc': r'ontlad|oplad|tijdconstante|rc',
  'taurl': r'tijdconstante|spoel.*weerstand',
  'cpar': r'parallel',
  'cser': r'serie|vervangingswaarde',
  'lpar': r'parallel',
  'lser': r'serie',
 },
 6: {
  'tU': r'windingen.*spanning|spanning.*windingen|wikkeling.*\bv\b|transformator.*\bv\b',
  'tI': r'windingen.*stroom|stroom.*windingen|\bi1\b|\bi2\b|primaire stroom|ampèremeter',
  'tP': r'dissip|vermogen|watt|ideale transformator',
  'tZ': r'impedantie|luidspreker|aanpassing|capaciteit',
  'tN': r'impedantie|luidspreker|aanpassing',
  'eta': r'rendement|opgenomen',
  'auto': r'variac|autotransformator|autotrafo',
  'verl': r'lamellen|kernverlies|verlies|wervel|hysterese',
  'hf': r'huid|skin|hf|poederijzer|afschermbus|aluminium|ferriet',
 },
 17: {
  'stroom': r'\bma\b|milliamp|hartstilstand|fibrill|spierverstijving',
  'kleur': r'geel|blauw|bruin|kleur',
  'klasse': r'klasse (i|ii|iii)\b|dubbele isolatie|selv',
  'zeker': r'zekering|ptc|tco|varistor|gasarrestor|bleeder',
  'lek': r'lekstroom|y-condensator|y-cond',
  'veilig': r'veilige afstand|veldsterkte|eirp|v/m',
  'veld': r'sar\b|w/kg|icnirp|opwarming',
  'hoogte': r'ladder|harnas|windkracht',
  'bliksem': r'bliksem|onweer|overspanning',
 },
 18: {
  'qcode': r'\bq[rst][a-z]\b',
  'afk': r'\bcq\b|\bsk\b|\bpse\b|afkorting',
  'kvu1': r'klasse van uitzending|\b[a-z][0-9][a-z]\b',
  'kvu2': r'klasse van uitzending|\b[a-z][0-9][a-z]\b',
  'kvu3': r'klasse van uitzending|\b[a-z][0-9][a-z]\b',
  'kvu': r'klasse van uitzending|\b[a-z][0-9][a-z]\b',
  'abca': r'spellingsalfabet',
  'abcb': r'spellingsalfabet',
  'calls': r'roepletters|prefix|\bpd\b|\bpa\b',
  'vermogen': r'\bpep\b|zendvermogen|maximaal vermogen',
  'rst': r'\brst\b|ontvangstrapport',
  'status': r'primair|secundair|\bnib\b',
  'orgs': r'\bitu\b|cept|iaru|harec',
 },
}

def norm(q): return ' '.join([q['question']] + [o['text'] for o in q['options']] + [q.get('explanation') or '']).lower()

def main():
    for ch in (3, 4, 5, 6, 17, 18):
        qs = json.load(open(ROOT / f'data/hoofdstuk-{ch}.json'))
        p = ROOT / f'data/theorie/hoofdstuk-{ch}.json'
        th = json.load(open(p))
        bysec = {}
        for qid, secs in th['qmap'].items():
            for s in secs: bysec.setdefault(s, []).append(qid)
        for it in th['drill']:
            ids = set(bysec.get(it['sec'], []))
            pat = KW.get(ch, {}).get(it['id'])
            if pat:
                rx = re.compile(pat)
                ids |= {q['id'] for q in qs if rx.search(norm(q))}
            it['exam'] = sorted(ids, key=lambda i: int(i.split('-')[1]))
        json.dump(th, open(p, 'w'), ensure_ascii=False, indent=1)
        print(ch, [(it['id'], len(it['exam'])) for it in th['drill'] if len(it['exam']) < 2])
if __name__ == '__main__': main()
