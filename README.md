# F-licentie oefenen 📡

Oefenapp voor het Nederlandse F-licentie zendexamen (Full Radio Amateur), gebaseerd op de examentraining en theorie van de
[VRZA-cursus](https://cursus.vrza.nl/wp/2017/12/04/vrza-cursus-zendamateur-2017-2019/). Eén Docker-container met website, database en accounts.

## Wat kan het?
- **1.413 examenvragen** uit hoofdstuk 3 t/m 18, met controle van elk antwoord, uitleg en de originele uitwerking met figuren en formules.
- **Oefenen** per hoofdstuk, met directe feedback, een foutenvijver en slim herhalen (Leitner: terugkeer na 1, 3, 7, 14, 30 dagen).
- **Examen** van 50 vragen met timer en slagingsnorm, gespreid over de gekozen hoofdstukken.
- **Leren uit twee boeken:** *Leren* begint met een keuze tussen **VRZA** en **VERON** (met logo). Beide boeken hebben hetzelfde keuzemenu per hoofdstuk en (sub)paragraaf en de tekst is te selecteren en te kopiëren. Het VERON-boek (*Cursusboek voor het F-examen*, 5e druk, H1 t/m H13) is uit scans gehaald met tekstherkenning; bij twijfel over een getal of formule geldt het boek.
- **Leren met theorie** (VRZA, hoofdstuk 2 t/m 18): kies per hoofdstuk en (sub)paragraaf wat je wilt leren, lees de cursustekst per (sub)paragraaf (zonder kop- en voettekst), maak de **theorievragen** (opgaven uit de cursustekst met uitwerking) en ga via de link bij elke examenvraag naar de bijbehorende theorie. Voor H3 ook een formuleblad, **flashcards** en het formule-spel.
- **Formule-spel** (nu H3, 22 formules): in *Leren* → *🎮 Formule-spel*. Rondes van 10 vragen: welke formule hoort bij een naam, waar hoort een formule bij, invullen wat ontbreekt, en rekenopgaven met willekeurige getallen (rekenmachine en kladblok blijven beschikbaar). Punten met bonus voor een reeks goede antwoorden, optioneel 3 levens, record per hoofdstuk. Standaard alleen formules uit paragrafen die je hebt gelezen of geoefend; formules die je vaak fout hebt komen vaker terug (eigen herhaalschema) en elke ronde telt mee voor je reeks. Even twijfelen? Tijdens een vraag kun je de **formulelijst** (of bij eenheden de voorvoegsels) bekijken, maar dan levert een goed antwoord maar 5 punten op, zonder bonus (je reeks blijft staan, en de formule komt eerder terug). Je kiest zelf wat je oefent: 🎲 alles door elkaar, 🧠 formules kennen (herkennen en invullen), 🧮 rekenen, 🔁 omwerken (`P = U²/R` → `U = ?`, met typische fouten als afleiders) of 📏 eenheden omrekenen (4,7 kΩ → Ω, 250 mA → A). Data: `data/theorie/hoofdstuk-N.json` onder `drill` (voorbeeld in `tools/cards_h3.py`; per formule optioneel `rewrite`), rekengeneratoren in `js/drill.js`.
- **Reeks en oefenkalender** zoals Anki: hoeveel dagen op rij je hebt geoefend.
- **Rekenmachine** (Casio fx-82NL-stijl) en **kladblok** tijdens oefenen en examen: tegelijk te gebruiken (het tweede paneel zet ze automatisch naast elkaar, op een staande telefoon onder elkaar; knop ◫ doet dat opnieuw), vrij te verplaatsen (slepen aan de kop) en in grootte aan te passen (rand of hoek vastpakken); positie en formaat worden onthouden.
- **Pen over het hele scherm** (🖊️ linksonder, in elke weergave): schrijf met je pen of muis overal op het scherm, ook over de vraag heen. Standaard "alleen pen": je vinger scrolt en tikt gewoon door (en een hand die tegen het scherm rust tijdens het schrijven wordt genegeerd). Pen met kleur, dikte, gum, ongedaan maken en wissen; drukgevoelig bij een pen. De tekening scrolt mee en verdwijnt bij de volgende vraag of weergave. Escape of ✕ stopt het schrijven.
- **Voortgang** per hoofdstuk, zwakste plek en examenhistorie.
- **Accounts**: inloggen en je voortgang op elk apparaat houden (ook voor medecursisten). Alles wordt automatisch opgeslagen: binnen ~1 seconde na elke vraag, kaart of gelezen paragraaf, en nogmaals als je de pagina sluit. Rechtsboven laat ✓ zien dat alles is opgeslagen (⏳ bezig, ⚠ mislukt; je voortgang staat dan nog wel op dit apparaat). Zonder account kan het ook, via een privé GitHub Gist, een overdraag-link of een back-upbestand (tabblad *Meer*).

## Snel starten (zonder Docker)
Alleen de app, zonder accounts (je voortgang blijft in je browser):

```
git clone https://github.com/Commsfox/f-licentie-trainer
cd f-licentie-trainer
python3 -m http.server 8000
```

(Op Windows: `py -m http.server 8000`.) Open daarna http://localhost:8000. Dubbelklikken op `index.html` werkt niet; de app moet via een webserver draaien. Op hetzelfde netwerk kun je hem ook op je telefoon openen via `http://<ip-van-je-pc>:8000`.

Met Docker en accounts op je eigen computer: `PB_ADMIN_EMAIL=jij@voorbeeld.nl PB_ADMIN_PASSWORD=minstens10tekens docker compose up -d --build`, daarna http://localhost:8090.

## Installeren (Docker)
Vereist Docker; hieronder met Portainer (bijv. op Unraid). Met alleen `docker compose` werkt het net zo.

1. Portainer → **Stacks → Add stack → Repository**
   - Repository URL: `https://github.com/Commsfox/f-licentie-trainer` · reference `refs/heads/main` · compose path `docker-compose.yml`
   - Environment variables: `PB_ADMIN_EMAIL` (jouw e-mail, beheerder) en `PB_ADMIN_PASSWORD` (minimaal 10 tekens). Optioneel `HOST_PORT` (standaard 8090), `DATA_DIR` (standaard `/mnt/user/appdata/f-licentie`) en `TZ`.
2. **Deploy the stack.** De eerste keer wordt de image gebouwd.
3. Open `http://<server-ip>:8090` voor de app en `http://<server-ip>:8090/_/` voor het beheerscherm (PocketBase).

De database staat in `DATA_DIR`, buiten de container: neem die map mee in je back-ups.

**Updaten:** Portainer → de stack → **Pull and redeploy** met *Re-build image* aan, daarna Ctrl+F5 in de browser. Je gegevens blijven behouden.

**Voor medecursisten** heb je een https-adres nodig: een Cloudflare Tunnel (zet `COMPOSE_PROFILES=tunnel` en `CF_TUNNEL_TOKEN`) of een eigen domein met reverse proxy. Zet in PocketBase (*Settings → Application → URL*) je openbare adres en overweeg de rate limiter.

**Beheer:** wachtwoord vergeten? Stel een nieuw wachtwoord in via het beheerscherm (*Collections → users*). Registratie afsluiten kan via *Collections → users → API rules → Create rule → superusers only*.

**Een nieuwe versie eerst testen:** maak een tweede stack `f-licentie-test` met de testbranch als reference en de variabelen `HOST_PORT=8091`, `CONTAINER_NAME=f-licentie-test`, `IMAGE_NAME=f-licentie:test`, `DATA_DIR=/mnt/user/appdata/f-licentie-test`. Die heeft een eigen database; je echte gegevens blijven onaangeraakt.

**Start niet?** Bekijk de containerlogs. Meestal is het een te kort beheerderswachtwoord of een niet-bestaande `PB_VERSION` in de `Dockerfile`.

## Inhoud toevoegen (voor beheerders)
De bron-PDF's van de VRZA staan niet in de repository (auteursrecht, `bronnen/` staat in `.gitignore`). Vragen en theorie voeg je toe met de scripts in `tools/`
(`extract_vrza.py`, `build_index.py`, `check_answers.py`, `build_theory.py`, `map_questions.py`); installeer eerst Poppler en `pip install -r tools/requirements.txt`.

- **Vragen:** `python tools/extract_vrza.py bronnen/HS4_exa_….pdf`, dan `python tools/build_index.py` en `python tools/check_answers.py 4`. Controleer de antwoorden; correcties staan in `tools/answer_overrides.json` en `tools/question_overrides.json`.
- **Theorie:** zet de VRZA-hoofdstukteksten als `bronnen/THEORIE_HS<N>_….pdf` neer (bijv. uit de repository RZAM-F, map `02-Theorie/VRZA`) en draai `python tools/build_theory_vrza.py bronnen/THEORIE_HS*.pdf` en daarna `python tools/build_index.py`. Het script leest de indeling uit de links van de inhoudsopgave, zet elke (sub)paragraaf en elke opgave/uitwerking om naar echte tekst (HTML in `data/theorie/tekst-<N>.json`, te selecteren en te kopiëren, in het lettertype van de app; figuren en losse formules als afbeelding in `img/theorie/hs<N>`, zie `tools/vrza_text.py`) en koppelt de examenvragen aan de paragrafen (correcties in `tools/theory_overrides.json`).
- **VERON-theorie:** `python tools/build_theory_veron.py <map met de VERON-pdf's>` (bijv. `RZAM-F/02-Theorie/VERON`, Git LFS; eventueel gevolgd door hoofdstuknummers, bijv. `1,7`). De pdf's zijn scans: het script maakt de pagina's schoon (doorschijnende achterkant, perforatiegaten, kop- en voettekst), draait tesseract (`apt install tesseract-ocr tesseract-ocr-nld`), maakt van goed gelezen regels tekst en knipt tekeningen, formules en tabellen als afbeelding uit. Koppen als `7.1.4 Titel` verdelen de tekst in (sub)paragrafen (OCR-fouten in kopnummers worden gerepareerd, pagina's die in de scan niet op volgorde staan worden op nummer gesorteerd). Uitvoer: `data/veron/` en `img/veron/h<N>`; de OCR-tussenresultaten staan in `.cache/veron` zodat opnieuw bouwen snel gaat.
- **Flashcards en formules:** in `data/theorie/hoofdstuk-N.json` onder `cards` (`{"id","sec","q","a"}`) en `formulas`. Voorbeeld: `tools/cards_h3.py`.

Daarna committen, pushen en in Portainer *Pull and redeploy*.

## Goed om te weten
- Machten en breuken in de uit de PDF gehaalde tekst gaan soms verloren (“I2”). Elke vraag heeft daarom een knop **Toon origineel**.
- Hoofdstuk 1 en 2 hebben bij de VRZA geen examentraining. Theorie en flashcards zijn er nu alleen voor hoofdstuk 3.
- Er is geen e-mailverificatie: wie de site kent, kan een account maken. Sluit registratie desgewenst af (zie Beheer).
- Vul `CONTACT_EMAIL` in `js/config.js` in; die staat in de privacyverklaring. Lees die verklaring na.
- De VERON-tekst komt uit tekstherkenning: hier en daar staat een verkeerd gelezen teken (bijv. `Q` voor `Ω`) en indices als R<sub>i</sub> zijn gewone letters geworden.
- De VRZA- en VERON-teksten en -figuren zijn auteursrechtelijk beschermd. Deel de app dus niet openbaar zonder toestemming van de VRZA (webteam@vrza.nl) en de VERON.
