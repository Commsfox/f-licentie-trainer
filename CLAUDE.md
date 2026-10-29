# RZAM-F project: context voor Claude Code

Dit bestand bevat alles wat in het claude.ai-project "RZAM-F" is gedaan en besloten (stand 27-10-2026).
Lees dit eerst. Jasper schrijft Nederlands: antwoord in het Nederlands.

## Doel
Jasper helpen studeren voor en slagen voor de **RZAM-F licentie** (Nederlands radiozendamateur-certificaat F, examen via CBR).
Daarbij een oefenapp die hij in zijn vrije tijd gebruikt (web-app; Android kan als PWA, losse desktop-app bestaat al).

## Repositories
| Repo | Wat |
|---|---|
| `Commsfox/f-licentie-trainer` | Jasper's fork van `Cappisteijns/f-licentie-trainer` (collega). Statische web-app (index.html, js/, css/, data/, img/). Hoofdproject. |
| `Commsfox/RZAM-F` | Bronmateriaal: `01-Exameneisen` (CBR/VRZA), `02-Theorie/VRZA` en `02-Theorie/VERON` (PDF's, VERON via **Git LFS**: `git lfs pull`), `03-VRZA-Examentraining` (examenvragen per hoofdstuk), `04-boekje-pienter`. |

## Mappen
- Deze repo is de app. Bronmateriaal staat in de repo `Commsfox/RZAM-F`.
- Lokaal (Jasper's Linux Mint) staan beide naast elkaar in `~/claude-code/` (alleen voor code): `~/claude-code/f-licentie-trainer` en `~/claude-code/RZAM-F`.
- In de Claude-app / claude.ai/code: kies deze repo; voeg `Commsfox/RZAM-F` toe als je de bron-PDF's nodig hebt (theorie opnieuw bouwen, vragen nakijken).
- Wijzigingen altijd op een branch met een PR naar main; Jasper merget zelf.

## App draaien
```bash
python3 -m http.server 8000   # Linux Mint heeft geen `python`, gebruik python3
```
Open http://localhost:8000. Startscript voor Linux Mint (clonet/pullt naar `~/claude-code/f-licentie-trainer`, start server met no-cache headers, opent browser, toont branch/versie, maakt bureaublad-icoon): `f-licentie-start.sh` + `f-licentie-trainer.desktop` (in de projectbestanden, map `start/`).

## Opbouw f-licentie-trainer (Jasper's versie)
- Tabbladen: **Leren** (eerst, app opent hierop) vóór **Oefenen**; Meer → Opties.
- `js/theory.js`: Leren. Eerst boekkeuze **VRZA / VERON** (logo's in `img/logo/`, VERON-logo lichtblauw met transparant wit).
  - VRZA H2–H18 als selecteerbare tekst in app-lettertype: `data/theorie/tekst-N.json` (HTML, gemaakt met `tools/vrza_text.py`), opgaven+uitwerkingen in `data/theorie/hoofdstuk-N.json` (`tools/build_theory_vrza.py`, 249 theorievragen). `img/theorie/hsN` alleen figuren en display-formules.
  - VERON H1–H13 via OCR (tesseract `nld`, `OMP_THREAD_LIMIT=1`) met `tools/build_theory_veron.py` → `data/veron` + `img/veron`; hoofdstuk-keys `v1`..`v13`.
  - Teksten in een PDF-achtig scrollbaar **leesvenster** (volle schermhoogte). VERON per heel hoofdstuk met "Ga naar paragraaf…", VRZA per paragraaf.
- Oefenen: 1413 examenvragen H3–H18 (`data/hoofdstuk-N.json`, `data/index.json`). Het goede antwoord staat in `answer` én in `tools/answer_overrides.json` (die wint bij opnieuw extraheren): pas bij een correctie beide aan. Bron van waarheid = vetgedrukte optie in de uitwerking (VRZA-PDF), niet de uitlegtekst ("het foute antwoord C" misleidt). Controle 28-10-2026: 1223 vragen automatisch tegen de vetgedrukte optie gelegd, alleen 6-10 was fout (C → D, 1,5 A). Plus zoekfunctie "Een specifieke vraag oefenen" (PR #13).
- Uit upstream overgenomen (PR #11): H4/H5 flashcards + formules (op titel omgezet naar Jasper's paragraafnummering), formule-spelmodi, rekenmachine, voortgang-heatmap. Upstream H4/H5 pagina-afbeeldingen **niet** overgenomen (theorie is tekst).
- Vraagopmaak (PR #27): `tools/question_layout.py` zet regels, opsommingen en alinea's uit de VRZA-PDF's in `question` ('\n' = regel, '\n\n' = alinea) en haalt figuurlabels uit de tekst; alleen als de woorden gelijk blijven. Draai het na elke `extract_vrza.py` (die plakt alles tot één regel). De app toont dit via `stem()` in `js/app.js`.
- Uit upstream overgenomen (PR #26, sync t/m upstream ec98b1d van 28-10-2026): Voortgang → **Geschiedenis** van elke oefenronde/examen met "Verwijderen" (antwoorden exact teruggedraaid, `store.hist`, max 1500 antwoorden); leeg examen afbreken zonder opslaan; onbeantwoorde examenvragen tellen niet in statistieken; verwachte examenscore + slagingskans + verloopgrafiek (`js/progress.js`, `store.tr`); oefenen op volgorde van de vragenbank (pref `chrono`); flashcards/formules/drill voor H6, H17, H18 (H18 = "Feitenspel" met `pairs`), paragraaf-id's op titel omgezet naar Jasper's nummering. Zoeken vindt ook theoriekaarten en Jasper's theorievragen (`opgaven`, "opgave 6-8"), plus volledige lijst per hoofdstuk/soort.
- **Niet** overgenomen uit upstream: "cursusopgaven" (`exercises`, `tools/build_exercises.py`, dubbel met de theorievragen; alle 72 antwoorden kwamen overeen) en pagina-afbeeldingen `img/theorie/hsN/p*.webp`. Let op: `tools/cards_h*.py` van upstream schrijven upstream-paragraaf-id's; na draaien opnieuw omzetten.
- Thema's: Meer → "Optie 4 · Thema's": Standaard of "Kleurencombinatie KMar".
- Theorievragen (PR #16): 214 meerkeuze worden nagekeken (antwoord = vetgedrukte optie in de uitwerking, anders "Antwoord X"; uitzonderingen in `OPG_ANSWER` in `js/app.js`), 49 open vragen beoordeel je zelf. Resultaat in `store.recordCard` onder `hs3:o3-1`, veld `l` = laatste poging goed; laatst fout = foutenvijver (knop "Foute theorievragen" in Leren).
- PWA (PR #17): `manifest.webmanifest`, `sw.js` (eerst netwerk, offline uit cache), iconen `img/logo/app-192/512.png`. Werkt pas op Android via https: GitHub Pages staat nog uit (Settings → Pages → `main`, map `/`).

### Afwijkende maplayout t.o.v. upstream (belangrijk bij upstream-sync)
- Examenafbeeldingen staan in `img/examenvragen/hsN` (upstream: `img/hsN`). JSON en `extract_vrza.py` wijzen daarnaar. Verder `img/theorievragen` en `img/theorie`.
- Upstream-afbeeldingen hebben PDF-navigatiepijlen (blauwe rondjes met groene/gele/rode pijl, "Naar de uitwerking"/"Terug naar de opgave") en ©-voettekst. Jasper wil die **niet**.
- `extract_vrza.py` slaat inhoudsopgave-pagina's over (PR #15); upstream niet, dus na een sync kunnen er weer onterechte uitwerkingspagina's (inhoudsopgave/inleiding/formularium) bij de eerste opgave van een PDF staan.
- Na elke upstream-sync: verplaats `img/hsN` → `img/examenvragen/hsN`, pas JSON-paden aan, draai `python3 tools/strip_nav.py img/examenvragen/hs*/*.webp` (scipy nodig).
- Werkwijze bij upstream-features: cherry-pick of merge, maar Jasper's layout en theorie behouden.

## Losse desktop-app (branch `desktop`, NIET in main)
- `standalone/main.go`: Go `embed` van de hele app + server op `localhost:47830`; accounts uit via herschreven `config.js`.
- `standalone/voortgang.js`: spiegelt `flic.*` localStorage naar `%AppData%/F-licentie-trainer/voortgang.json` via `/api/voortgang` (geen accounts; tab heet daar "Opslag").
- Bouwen: `bash standalone/build.sh` → `standalone/dist` (Windows .exe, linux, mac, elk ~130 MB). Go staat lokaal in `~/sdk/go1.27.3`: `PATH=~/sdk/go1.27.3/bin:$PATH bash standalone/build.sh`.
- PR #12 is op Jasper's verzoek gesloten; code leeft alleen op `desktop`. Na wijzigingen in main: main in `desktop` mergen en opnieuw bouwen (laatst: {D}, met PR #15–#17; .exe 27-10-2026 gebouwd).
- Jasper wil de app delen met collega's. GitHub-releases maakt Jasper zelf aan.

## Geschiedenis (alle PR's op Commsfox/f-licentie-trainer zijn gemerged, tenzij vermeld)
- #1: fork gesynchroniseerd met upstream (H3–H18), navigatiepijlen weg (`tools/strip_nav.py`).
- #2: Leren vóór Oefenen, VRZA-theorie als tekst, 249 theorievragen.
- #3: boekkeuze VRZA/VERON + VERON als OCR-tekst, VRZA kader/tabel-fix.
- #4–#7: README snelstart, officieel VERON-logo, startscript.
- #8: leesvenster. #10: thema's (Standaard/KMar). #11: upstream-features (flashcards, formules, rekenmachine, heatmap).
- #12: desktop-app (GESLOTEN, zit op branch `desktop`). #13: zoekfunctie "Een specifieke vraag oefenen".
- #15: onterechte uitwerkingspagina's weg (367 plaatjes). #16: theorievragen interactief. #17: Android-PWA.
- #26: upstream-sync 28-10-2026 (geschiedenis/verwijderen, verwachte score, H6/H17/H18 flashcards en feitenspel).
- Antwoord vraag 6-10 gecorrigeerd (C → D, 1,5 A). `desktop` krijgt het pas na main mergen + opnieuw bouwen.
- Branches: alleen `main` en `desktop` (opgeruimd 27-10-2026). `upstream` = Cappisteijns/f-licentie-trainer.

Werkwijze die Jasper prettig vindt: wijzigingen op een branch, PR naar main, Jasper merget zelf. Nieuw werk altijd vanaf een verse main.

## VERON vs VRZA (vergelijking 25-10-2026)
- Inhoud komt overeen; **VRZA blijft de basis** (grondiger, actueler).
- Onderwerpen die VERON wel goed behandelt en VRZA minder (prioriteit): link budget/trajectverlies; ruisbronnen (kosmisch/atmosferisch/aarde, dominante bron; CBR-eis 2.7, VERON H7.1.4); S/N en gevoeligheid; sporadische E + aurora (examenvragen hs14-236/216/217/21/24); sleutelklikken + desensitisatie; meetfouten.
- Fouten in VERON: tegenstrijdige regel over het cijfer in de roepnaam; "stratosfeer" waar ionosfeer bedoeld is.
- Besloten (27-10-2026): VERON-aanvullingen **niet** in de VRZA-theorie schrijven; de twee boeken staan apart en vullen elkaar aan.

## Spiekbriefje ("Boekje pienter RZAM-F")
Origineel: `Boekje pienter RZAM-F.docx` (60 foto's/kaarten). Omgezet naar tekst: `Boekje pienter RZAM-F (tekst).docx` (51 pagina's A4, Word-tabellen, formules als Word-vergelijkingen (OMML) met echte breuken; schema's/grafieken als bijgesneden afbeeldingen). Gemaakt met docx-js.
Jasper's regels:
- Pagina voor pagina het origineel volgen: zelfde onderwerpen, volgorde en titels (bijv. "Grootheden" blijft).
- Geen extra's: geen inhoudsopgave, correctiekaders, overzicht of "aanvulling".
- Correcties stil in de inhoud verwerken. Geen half onderwerp op de volgende pagina.
- Delen schrijf je als gestapelde breuk, niet met "/".
Stille correcties (gecontroleerd met VRZA): ρ nikkel 0,07 en tin 0,11; condensatorconstante 0,0885 (A cm², d cm, C pF); FET: de drain heeft geen invloed (niet de gate); tetrode: anodestroom; klasse B lineair in balans (push-pull); opamp-optelversterker R4→R1; KVU ".J"→J; notchfilter energie-formulering; voetnoot ring 4: zonder ring ±20% tolerantie; sinus-aslabel weg.
LibreOffice: `libreoffice-math` nodig; schaalt OMML-formules niet mee (Word wel).

## Open punten
- GitHub Pages aanzetten, zodat de PWA op Android te installeren is.
- `img/theorievragen` blijft staan (besloten 27-10-2026).

## Projectbestanden (in claude.ai, download wat je nodig hebt)
- `losse-app/`: gebouwde desktop-app (exe, Windows-zip, linux, mac).
- `start/`: startscript + .desktop-launcher voor Linux Mint.
- `Boekje pienter RZAM-F.docx` en `(tekst).docx`: spiekbriefje.
- `preview/`, `kmar-thema/`, `leesvenster/`, `veron/`, `spiekbriefje-tekst/`: screenshots ter controle.
