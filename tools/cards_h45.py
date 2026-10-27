#!/usr/bin/env python3
"""Flashcards, formuleblad en formule-spel voor H4 en H5 (naar het voorbeeld van cards_h3.py).
Gebruik: python tools/cards_h45.py   (schrijft cards, formulas en drill in data/theorie/hoofdstuk-4.json en -5.json)"""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent

# ===================================================================== H4
C4 = [
("s3","Wat is de eenheid van elektrische veldsterkte E?","Volt per meter (V/m)."),
("s3","Formule voor de elektrische veldsterkte tussen twee platen?","E = U / d (U de spanning, d de plaatafstand in meter)."),
("s3","Een spanning van 5 V staat over twee platen op 1 mm afstand. Hoe groot is E?","5 V / 0,001 m = 5000 V/m."),
("s3","Hoe kun je een elektrisch veld afschermen?","Met een goed elektrisch geleidend scherm dat op een vaste spanning (massa) is aangesloten, bijvoorbeeld een metalen blikje of de mantel van een coaxkabel."),
("s3","Wat gebeurt er met het veld tussen twee geladen platen als de afstand kleiner wordt?","Het veld blijft steeds meer tussen de platen opgesloten (minder veld erbuiten)."),
("s4","Wat is de eenheid van magnetische veldsterkte H?","Ampère per meter (A/m)."),
("s4","Waar hangt de sterkte van het magnetisch veld rond een draad rechtstreeks van af?","Van de stroom door de draad (hoe groter I, des te sterker H)."),
("s4","Welk materiaal schermt een magnetisch veld goed af?","Materiaal met een hoge magnetische permeabiliteit, zoals mu-metaal of ijzerlegeringen. Koper schermt een magnetisch veld niet af."),
("s4","Schermt ferriet een elektrisch veld af?","Nee. Ferriet is wel magnetisch geleidend maar niet elektrisch geleidend, dus het elektrische veld gaat er gewoon doorheen."),
("s6","Waaruit bestaat een condensator?","Uit twee geleidende platen (elektroden) met daartussen een isolator, het diëlektricum."),
("s6","Waar slaat een condensator zijn energie in op?","In het elektrisch veld tussen de platen."),
("s7","Wat gebeurt er als je een condensator op een gelijkspanningsbron aansluit?","Hij laadt op tot de bronspanning is bereikt; daarna loopt er geen stroom meer."),
("s8","Formule voor lading, stroom en tijd?","Q = I · t (lading in C, stroom in A, tijd in s)."),
("s8","Hoe hangen lading Q, capaciteit C en spanning U samen?","Q = C · U, dus U = Q / C en C = Q / U."),
("s8","Een condensator van 1 µF is opgeladen tot 400 V. Hoeveel lading zit erop?","Q = C · U = 1·10⁻⁶ F × 400 V = 400 µC (4·10⁻⁴ C)."),
("s8","Een condensator wordt met een constante stroom opgeladen. Hoe loopt de spanning op?","Rechtlijnig: evenredig met de tijd."),
("s9","Wat is de eenheid van capaciteit?","De farad (F). Voor radio meestal pF, nF of µF."),
("s9","Wat betekent 1 farad?","1 F = 1 C/V: één coulomb lading bij één volt spanning."),
("s10","Formule voor de capaciteit van een plaatcondensator?","C = 0,0885 · εr · A / d, met C in pF, A in cm² en d in cm."),
("s10","Hoe verandert C als de plaatafstand d groter wordt?","C wordt kleiner (omgekeerd evenredig met d)."),
("s10","Hoe verandert C als de plaatoppervlakte A groter wordt?","C wordt groter (evenredig met A)."),
("s10","Wat is de relatieve diëlektrische constante εr van lucht (en vacuüm)?","Ongeveer 1."),
("s10","Een isolerende plaat met εr = 4 komt tussen de platen van een luchtcondensator. Wat gebeurt er met C?","C wordt 4 keer zo groot."),
("s12","Wat is de doorslagspanning van een condensator?","De spanning waarbij het diëlektricum doorslaat (geleidend wordt) en de condensator defect raakt. Een grotere plaatafstand geeft een hogere doorslagspanning."),
("s13","Wat is een trimcondensator?","Een instelbare condensator die je eenmalig instelt op de gewenste capaciteit (ook trimmer of instelcondensator)."),
("s13","Welke diëlektrica komen veel voor bij condensatoren?","Lucht, mica, kunststoffolie, keramiek; en bij elektrolytische condensatoren een dun oxidelaagje (aluminium of tantalium)."),
("s16","Wat is inductie?","Een veranderend magnetisch veld wekt in een draad of spoel een stroom (spanning) op."),
("s16","Wat is zelfinductie?","Inductie in de spoel die het veranderende magnetische veld zelf veroorzaakt: een stroomverandering werkt zichzelf tegen."),
("s16","Wat zegt de wet van Lenz?","De door inductie opgewekte stroom werkt de oorzaak (de verandering) tegen."),
("s17","Hoe komt de stroom door een spoel op gang na het inschakelen?","Niet ineens maar geleidelijk: I = U · t / L (evenredig met de tijd, zolang de stroom nog niet beperkt wordt door R)."),
("s17","Wat is de eenheid van zelfinductie L?","De henry (H). Bij 1 H leidt 1 V tot een stroomverandering van 1 A per seconde."),
("s19","Formule voor de zelfinductie van een in één laag gewikkelde spoel?","L = μ₀ · μr · n² · A / l (n windingen, A doorsnede, l lengte, μr de relatieve permeabiliteit)."),
("s19","Hoe verandert L als het aantal windingen verdubbelt?","L wordt 4 keer zo groot (evenredig met n²)."),
("s19","Hoe verandert L als de spoel langer wordt (bij gelijk aantal windingen)?","L wordt kleiner (omgekeerd evenredig met de lengte l)."),
("s19","Wat doet een ijzer- of ferrietkern met de zelfinductie?","Door de hogere μr wordt L groter."),
("s22","Hoe loopt de spanning over een condensator die via een weerstand wordt opgeladen?","Eerst snel, dan steeds langzamer; hij bereikt de bronspanning nooit helemaal (exponentieel)."),
("s23","Formule voor de tijdconstante van een RC-schakeling?","τ = R · C (τ in s, R in Ω, C in F)."),
("s23","Hoeveel van de bronspanning heeft C na 1 τ bij opladen?","Ongeveer 63%. Na 5 τ is hij praktisch vol (99,3%)."),
("s23","Hoeveel van de beginspanning is er na 1 τ nog over bij ontladen?","Ongeveer 37% (dus 63% is weg)."),
("s23","Een RC-schakeling heeft R = 10 kΩ en C = 100 nF. Hoe groot is τ?","10⁴ Ω × 10⁻⁷ F = 1 ms."),
("s25","Formule voor de tijdconstante van een RL-schakeling?","τ = L / R (1 H/Ω = 1 s)."),
("s25","Hoe loopt de stroom door een spoel in serie met een weerstand na het inschakelen?","Hij bouwt geleidelijk op en bereikt na ongeveer 5 τ praktisch de eindwaarde U/R."),
("s27","Wat is het verschil in gedrag bij gelijkspanning: condensator en spoel?","Een condensator blokkeert gelijkstroom (na het opladen), een spoel geleidt gelijkstroom (alleen zijn draadweerstand telt)."),
("s30","Vervangingscapaciteit van condensatoren in parallel?","C = C₁ + C₂ + C₃ + … (de capaciteiten tellen op)."),
("s31","Vervangingscapaciteit van condensatoren in serie?","1/C = 1/C₁ + 1/C₂ + … ; twee in serie: C = C₁·C₂ / (C₁ + C₂). Altijd kleiner dan de kleinste."),
("s31","Twee gelijke condensatoren C in serie: wat is de totale capaciteit?","C / 2."),
("s31","Welke grootheid is bij condensatoren in serie overal gelijk?","De lading Q (en de stroom). De spanning verdeelt zich, het meest over de kleinste C."),
("s32","Vervangingswaarde van spoelen in parallel?","1/L = 1/L₁ + 1/L₂ + … (net als bij weerstanden)."),
("s33","Vervangingswaarde van spoelen in serie?","L = L₁ + L₂ + L₃ + … (zonder onderlinge koppeling)."),
]

F4 = [
{"title":"Velden","items":[
 {"f":"E = U / d","t":"elektrische veldsterkte in V/m (d in m)"},
 {"f":"H in A/m","t":"magnetische veldsterkte; evenredig met de stroom"}]},
{"title":"Condensator","items":[
 {"f":"Q = I · t","t":"lading in C"},
 {"f":"Q = C · U   ·   U = Q / C   ·   C = Q / U","t":"lading, capaciteit en spanning"},
 {"f":"C = 0,0885 · εr · A / d","t":"plaatcondensator; C in pF, A in cm², d in cm; εr(lucht) ≈ 1"},
 {"f":"Parallel: C = C₁ + C₂ + …","t":"capaciteiten tellen op"},
 {"f":"Serie: 1/C = 1/C₁ + 1/C₂ + …","t":"twee in serie: C = C₁ · C₂ / (C₁ + C₂); gelijke: C/n"}]},
{"title":"Spoel","items":[
 {"f":"L = μ₀ · μr · n² · A / l","t":"zelfinductie van een enkellaagse spoel in H (L ∝ n²)"},
 {"f":"I = U · t / L","t":"stroom die op gang komt in een spoel (eenheid 1 H = 1 V·s/A)"},
 {"f":"Serie: L = L₁ + L₂ + …","t":"zonder koppeling; parallel: 1/L = 1/L₁ + 1/L₂ + …"}]},
{"title":"Met een weerstand","items":[
 {"f":"τ = R · C","t":"RC-tijdconstante in s; na 1 τ: 63% van het eindverschil"},
 {"f":"τ = L / R","t":"RL-tijdconstante in s"},
 {"f":"Na 5 τ is het proces praktisch klaar (99,3%)","t":"opladen/ontladen en opbouwen/uitdoven van stroom"}]},
]

DR4 = [
("efield","s3","Elektrische veldsterkte","het elektrische veld tussen twee platen","E = U / d",
  [("E = U / ___","d",["I","C","Q"]),("De eenheid van elektrische veldsterkte is ___","volt per meter",["ampère per meter","farad","henry"])],"efield"),
("hfield","s4","Magnetisch veld en afscherming","de eenheid van magnetische veldsterkte en afscherming",None,
  [("De eenheid van magnetische veldsterkte H is ___","ampère per meter",["volt per meter","farad","henry"]),
   ("Een magnetisch veld schermt af met materiaal met een hoge ___","permeabiliteit",["geleiding","weerstand","capaciteit"]),
   ("Een elektrisch veld schermt af met goed ___ materiaal","elektrisch geleidend",["isolerend","warmtegeleidend","lichtgewicht"])],None),
("qit","s8","Lading, stroom en tijd","de lading die een stroom in een bepaalde tijd verplaatst","Q = I · t",
  [("Q = I · ___","t",["U","C","L"])],"charge"),
("qcu","s8","Lading op een condensator","de lading op een condensator met bekende capaciteit en spanning","Q = C · U",
  [("Q = C · ___","U",["I","t","L"]),("De eenheid van capaciteit is de ___","farad",["henry","coulomb","ohm"])],"qcu"),
("cplate","s10","Capaciteit van een plaatcondensator","de capaciteit uit plaatoppervlak, afstand en diëlektricum","C = 0,0885 · εr · A / d",
  [("Een grotere plaatafstand d geeft een ___ capaciteit","kleinere",["grotere","even grote","negatieve"]),
   ("Een grotere plaatoppervlakte A geeft een ___ capaciteit","grotere",["kleinere","even grote","negatieve"]),
   ("De relatieve diëlektrische constante εr van lucht is ongeveer ___","1",["0","4,3","0,0885"])],"cplate"),
("breakdown","s12","Doorslagspanning","de maximale spanning op een condensator",None,
  [("Een grotere plaatafstand geeft een ___ doorslagspanning","hogere",["lagere","even hoge","geen"])],None),
("lind","s19","Zelfinductie van een spoel","de zelfinductie uit windingen, afmetingen en kern","L = μ₀ · μr · n² · A / l",
  [("L is evenredig met het ___ van het aantal windingen n","kwadraat",["getal zelf","omgekeerde","derde deel"]),
   ("Een kern met een hogere μr geeft een ___ zelfinductie","grotere",["kleinere","even grote","negatieve"]),
   ("De eenheid van zelfinductie is de ___","henry",["farad","weber","tesla"])],None),
("lcurr","s17","Stroom door een spoel","de stroom die na het inschakelen op gang komt","I = U · t / L",
  [("I = U · t / ___","L",["C","R","Q"])],None),
("taurc","s23","Tijdconstante RC","de tijd waarmee een condensator via een weerstand oplaadt","τ = R · C",
  [("τ = R · ___","C",["L","I","U"]),("Na 1 τ is de condensator opgeladen tot ongeveer ___ van de bronspanning","63%",["37%","50%","100%"])],"taurc"),
("taurl","s25","Tijdconstante RL","de tijd waarmee de stroom in een spoel met weerstand opbouwt","τ = L / R",
  [("τ = L / ___","R",["C","U","I"])],"taurl"),
("cpar","s30","Condensatoren parallel","condensatoren naast elkaar","C = C₁ + C₂ + …",
  [("Bij parallelschakeling van condensatoren ___ de capaciteiten op","tellen",["delen","vermenigvuldigen","middelen"])],"cpar"),
("cser","s31","Condensatoren in serie","condensatoren achter elkaar","1/C = 1/C₁ + 1/C₂ + …",
  [("In serie is de totale capaciteit ___ dan de kleinste","kleiner",["groter","gelijk aan","dubbel zo groot als"]),
   ("Twee gelijke condensatoren C in serie geven ___","C / 2",["2C","C","C²"])],"cser"),
("lpar","s32","Spoelen parallel","spoelen naast elkaar (zonder koppeling)","1/L = 1/L₁ + 1/L₂ + …",
  [("Spoelen worden bij serie- en parallelschakeling net zo samengesteld als ___","weerstanden",["condensatoren","diodes","transformatoren"])],None),
("lser","s33","Spoelen in serie","spoelen achter elkaar (zonder koppeling)","L = L₁ + L₂ + …",
  [("Bij serieschakeling van spoelen ___ de zelfinducties op","tellen",["delen","vermenigvuldigen","middelen"])],None),
]

RW4 = {
"efield":[("E = U / d","U","U = E · d",["U = E / d","U = d / E","U = E + d"]),("E = U / d","d","d = U / E",["d = E / U","d = U · E","d = E − U"])],
"qit":[("Q = I · t","I","I = Q / t",["I = t / Q","I = Q · t","I = Q − t"]),("Q = I · t","t","t = Q / I",["t = I / Q","t = Q · I","t = Q − I"])],
"qcu":[("Q = C · U","C","C = Q / U",["C = U / Q","C = Q · U","C = Q − U"]),("Q = C · U","U","U = Q / C",["U = C / Q","U = Q · C","U = Q − C"])],
"cplate":[("C = 0,0885 · εr · A / d","d","d = 0,0885 · εr · A / C",["d = C / (0,0885 · εr · A)","d = 0,0885 · εr · C / A","d = 0,0885 · A / (εr · C)"]),
          ("C = 0,0885 · εr · A / d","A","A = C · d / (0,0885 · εr)",["A = 0,0885 · εr · C / d","A = C / (0,0885 · εr · d)","A = 0,0885 · εr · d / C"])],
"taurc":[("τ = R · C","C","C = τ / R",["C = R / τ","C = τ · R","C = τ − R"]),("τ = R · C","R","R = τ / C",["R = C / τ","R = τ · C","R = τ − C"])],
"taurl":[("τ = L / R","L","L = τ · R",["L = τ / R","L = R / τ","L = τ − R"]),("τ = L / R","R","R = L / τ",["R = τ / L","R = τ · L","R = L − τ"])],
"lcurr":[("I = U · t / L","L","L = U · t / I",["L = I / (U · t)","L = U · I / t","L = I · t / U"])],
}

# ===================================================================== H5
C5 = [
("s3","Wat is het kenmerk van een wisselspanning?","Ze wisselt voortdurend van polariteit (teken): de stroom gaat heen en weer."),
("s4","Welke vormen van wisselspanning ken je?","Sinus, blok, driehoek en zaagtand."),
("s5","Hoe hangen frequentie f en periodeduur T samen?","f = 1 / T en T = 1 / f."),
("s5","Wat is de periodeduur van de netspanning (50 Hz)?","1/50 s = 20 ms."),
("s5","Een golfvorm heeft een periodeduur van 2 ms. Hoe groot is de frequentie?","f = 1 / 0,002 s = 500 Hz."),
("s5","Wat is de amplitude?","De maximale uitwijking uit de nulstand (de maximale waarde)."),
("s5","Wat is de gemiddelde waarde van een zuivere wisselspanning over een hele periode?","Nul."),
("s5","Wat is de effectieve waarde van een sinus met amplitude Umax?","U_eff = Umax / √2 ≈ 0,7 · Umax."),
("s5","Hoe bereken je Umax uit de effectieve waarde?","Umax = U_eff · √2 ≈ 1,4 · U_eff. De netspanning 230 V eff heeft dus een top van ongeveer 325 V."),
("s5","Wat is de effectieve waarde van een blokspanning met amplitude A?","U_eff = A (een blok is steeds op zijn maximum)."),
("s5","Wat betekent de effectieve waarde?","De gelijkspanning die in een weerstand evenveel warmte (vermogen) geeft."),
("s5","Hoeveel graden hoort bij een halve periode, en bij een kwart periode?","180° en 90°."),
("s5","Wat is de hoekfrequentie ω?","ω = 2π · f (in rad/s)."),
("s6","Hoe bepaal je het gelijkspanningsdeel van een mengvorm?","Het gelijkstroomdeel is de gemiddelde waarde van het signaal."),
("s9","Hoe tel je twee gelijkspanningen of -stromen op?","Gewoon rekenkundig (let op de polariteit)."),
("s10","Hoe tel je twee wisselspanningen op die 90° in fase verschillen?","Met Pythagoras: U = √(U₁² + U₂²), omdat de vectoren loodrecht op elkaar staan."),
("s10","Hoe tel je twee even grote wisselspanningen op die in fase zijn?","De amplituden tellen op (bij gelijke frequentie): twee keer zo groot."),
("s10","Hoe tel je twee even grote wisselspanningen op die in tegenfase (180°) zijn?","Ze heffen elkaar op: de som is nul."),
("s13","Wat is het faseverschil tussen stroom en spanning bij een condensator?","90°: de stroom loopt voor op de spanning."),
("s14","Wat is het faseverschil tussen stroom en spanning bij een spoel?","90°: de spanning loopt voor op de stroom."),
("s14","Wat is het faseverschil tussen stroom en spanning bij een weerstand?","0°: ze lopen gelijk op."),
("s17","Welk ezelsbruggetje onthoudt het faseverschil bij L en C?","LUI: bij L loopt U voor op I. En bij C loopt I voor op U (CIU). Oudere variant: LEICIE."),
("s19","Formule voor de reactantie van een condensator?","X_C = 1 / (2π · f · C) = 1 / (ω · C)."),
("s19","Formule voor de reactantie van een spoel?","X_L = 2π · f · L = ω · L."),
("s19","Hoe verandert X_C met de frequentie?","X_C wordt kleiner als f groter wordt (omgekeerd evenredig)."),
("s19","Hoe verandert X_L met de frequentie?","X_L wordt groter als f groter wordt (evenredig)."),
("s19","Wat is de wet van Ohm voor een reactantie?","U_eff = I_eff · X (met X = X_C of X_L)."),
("s19","Wat doet een condensator bij gelijkspanning (f = 0), en een spoel?","Condensator: X_C is oneindig (blokkeert). Spoel: X_L = 0 (geleidt)."),
("s20","Wanneer is een LC-kring in resonantie?","Als X_L = X_C."),
("s20","Wat is er bijzonder aan een seriekring in resonantie?","De impedantie is minimaal (alleen de verliesweerstand R), dus de stroom is maximaal. De spanningen over L en C zijn even groot en tegengesteld."),
("s20","Wat is er bijzonder aan een parallelkring in resonantie?","De impedantie is maximaal, dus de stroom uit de bron is minimaal. De stromen door L en C zijn even groot en tegengesteld."),
("s20","Wanneer gedraagt een seriekring zich als spoel, en wanneer als condensator?","Boven de resonantiefrequentie is X_L groter: inductief (als spoel). Eronder is X_C groter: capacitief."),
("s20","Wanneer gedraagt een parallelkring zich als spoel?","Onder de resonantiefrequentie: de spoel heeft dan de laagste reactantie en neemt de meeste stroom."),
("s21","Formule van Thomson voor de resonantiefrequentie?","f_res = 1 / (2π · √(L · C))."),
("s21","Wat gebeurt er met f_res als C twee keer zo groot wordt?","f_res wordt √2 keer zo laag (delen door ongeveer 1,41)."),
("s21","Wat gebeurt er met f_res als L en C allebei 2 keer zo groot worden?","f_res wordt 2 keer zo laag."),
("s22","Wat is impedantie?","De schijnbare weerstand van een weerstand en een reactantie samen, in ohm (symbool Z)."),
("s22","Impedantie van R en X in serie?","Z = √(R² + X²)."),
("s22","Impedantie van R en X parallel?","1/Z = √(1/R² + 1/X²)."),
("s22","Een weerstand van 30 Ω in serie met X_L = 40 Ω. Hoe groot is Z?","Z = √(30² + 40²) = 50 Ω."),
("s25","Welke vier filtersoorten ken je?","Laagdoorlaat, hoogdoorlaat, bandsper en banddoorlaat."),
("s26","Wat doet een laagdoorlaatfilter?","Laat lage frequenties door en verzwakt hoge."),
("s26","Hoe ziet een eenvoudig RC-laagdoorlaatfilter eruit?","Een weerstand in serie, met de uitgang over de condensator (naar massa). X_C wordt kleiner bij hoge f, dus de uitgangsspanning daalt."),
("s26","Formule voor de kantelfrequentie van een RC-filter?","f_k = 1 / (2π · R · C). Daar geldt R = X_C."),
("s26","Formule voor de kantelfrequentie van een RL-filter?","f_k = R / (2π · L). Daar geldt R = X_L."),
("s26","Hoeveel is de versterking van een eenvoudig filter bij de kantelfrequentie?","−3 dB (de verzwakking is 3 dB; het vermogen is gehalveerd, de spanning ×0,7)."),
("s27","Wat doet een hoogdoorlaatfilter?","Laat hoge frequenties door en verzwakt lage; je kunt het zien als een laagdoorlaatfilter met R en C verwisseld."),
("s28","Wat is de kwaliteitsfactor Q van een seriekring?","Q = X_L,res / R_verlies = ω_res · L / R_verlies (op resonantie)."),
("s28","Wat is de kwaliteitsfactor Q van een parallelkring?","Q = R_verlies / X_L,res = R_verlies / (ω_res · L) (de vergelijking staat op zijn kop t.o.v. de seriekring)."),
("s28","Hoe hangen bandbreedte B, Q en f_res samen?","B = f_res / Q (en dus Q = f_res / B). Hoe groter Q, des te smaller de bandbreedte."),
("s28","Tussen welke punten meet je de bandbreedte?","Tussen de twee −3 dB-punten (flanken) van de resonantiekromme."),
("s28","Wat gebeurt er met Q als de verliesweerstand van een seriekring groter wordt?","Q wordt kleiner: de kring is minder scherp en de bandbreedte neemt toe."),
("s29","Wat doet een bandsperfilter?","Het verzwakt een frequentieband en laat hogere en lagere frequenties door."),
("s32","Waaruit bestaat een blokgolf volgens Fourier?","Uit de grondgolf en alle oneven harmonischen (3×, 5×, 7×, …) met afnemende amplitude (A/3, A/5, A/7)."),
("s32","Wat is een harmonische?","Een sinus met een geheel veelvoud van de grondfrequentie."),
("s33","Wat doet een laagdoorlaatfilter met de harmonischen van een signaal?","Het verzwakt ze, zodat het signaal meer op een sinus gaat lijken."),
]

F5 = [
{"title":"Wisselspanning","items":[
 {"f":"f = 1 / T   ·   T = 1 / f","t":"frequentie in Hz, periodeduur in s"},
 {"f":"ω = 2π · f","t":"hoekfrequentie in rad/s"},
 {"f":"U_eff = U_max / √2 ≈ 0,7 · U_max","t":"sinus; omgekeerd U_max = U_eff · √2 ≈ 1,4 · U_eff"},
 {"f":"Blok: U_eff = A","t":"gemiddelde waarde van zuivere wisselspanning = 0"}]},
{"title":"Reactantie en fase","items":[
 {"f":"X_C = 1 / (2π · f · C) = 1 / (ω · C)","t":"condensator: daalt met f; stroom loopt 90° voor op spanning"},
 {"f":"X_L = 2π · f · L = ω · L","t":"spoel: stijgt met f; spanning loopt 90° voor op stroom (LUI)"},
 {"f":"U_eff = I_eff · X","t":"wet van Ohm voor een reactantie"},
 {"f":"Optellen bij 90°: U = √(U₁² + U₂²)","t":"vectoren loodrecht (Pythagoras)"}]},
{"title":"Resonantie en impedantie","items":[
 {"f":"X_L = X_C   →   f_res = 1 / (2π · √(L · C))","t":"vergelijking van Thomson"},
 {"f":"Serie: Z minimaal (= R), stroom maximaal","t":"in resonantie"},
 {"f":"Parallel: Z maximaal, bronstroom minimaal","t":"in resonantie"},
 {"f":"Serie: Z = √(R² + X²)","t":"parallel: 1/Z = √(1/R² + 1/X²)"}]},
{"title":"Filters","items":[
 {"f":"RC: f_k = 1 / (2π · R · C)","t":"kantelfrequentie; daar R = X en −3 dB"},
 {"f":"RL: f_k = R / (2π · L)","t":"kantelfrequentie van een RL-filter"},
 {"f":"Q (serie) = X_L,res / R_verlies","t":"parallel: Q = R_verlies / X_L,res"},
 {"f":"B = f_res / Q   ·   Q = f_res / B","t":"bandbreedte tussen de −3 dB-punten"}]},
{"title":"Niet-sinusvormig","items":[
 {"f":"Blokgolf = A·sin(ωt) + A·sin(3ωt)/3 + A·sin(5ωt)/5 + …","t":"grondgolf plus oneven harmonischen"},
 {"f":"Laagdoorlaatfilter verzwakt harmonischen","t":"het signaal wordt gladder (meer sinus)"}]},
]

DR5 = [
("freq","s5","Frequentie en periodeduur","het verband tussen frequentie en tijd per periode","f = 1 / T",
  [("T = 1 / ___","f",["A","ω","U"]),("Bij 50 Hz is de periodeduur ___","20 ms",["2 ms","50 ms","0,2 s"])],"freq"),
("omega","s5","Hoekfrequentie","de hoekfrequentie uit de frequentie","ω = 2π · f",
  [("ω = 2π · ___","f",["T","A","C"])],None),
("ueff","s5","Effectieve waarde van een sinus","de effectieve waarde uit de amplitude","U_eff = U_max / √2",
  [("U_max = U_eff · ___","√2",["2","π","1/√2"]),("De gemiddelde waarde van een zuivere wisselspanning is ___","0",["U_eff","U_max / 2","U_max / √2"])],"ueff"),
("phase","s17","Fase bij L en C","het faseverschil tussen stroom en spanning",None,
  [("Bij een spoel loopt de ___ voor op de stroom","spanning",["stroom","weerstand","frequentie"]),
   ("Bij een condensator loopt de ___ voor op de spanning","stroom",["weerstand","frequentie","impedantie"]),
   ("Het faseverschil tussen stroom en spanning bij een reactantie is ___","90°",["0°","45°","180°"])],None),
("pyth","s10","Optellen met 90° faseverschil","wisselspanningen die 90° verschoven zijn","U = √(U₁² + U₂²)",
  [("Bij 90° faseverschil tel je vectoren op met de stelling van ___","Pythagoras",["Thomson","Ohm","Kirchhoff"])],"pyth"),
("xc","s19","Reactantie van een condensator","de weerstand die een condensator tegen wisselstroom biedt","X_C = 1 / (2π · f · C)",
  [("Bij hogere frequentie wordt X_C ___","kleiner",["groter","gelijk","oneindig"])],"xc"),
("xl","s19","Reactantie van een spoel","de weerstand die een spoel tegen wisselstroom biedt","X_L = 2π · f · L",
  [("Bij hogere frequentie wordt X_L ___","groter",["kleiner","gelijk","nul"])],"xl"),
("fres","s21","Resonantiefrequentie (Thomson)","de frequentie waarop een LC-kring resoneert","f = 1 / (2π · √(L · C))",
  [("Bij resonantie is X_L ___ X_C","gelijk aan",["groter dan","kleiner dan","de helft van"]),
   ("Een 2× zo grote C geeft een ___ resonantiefrequentie","lagere",["hogere","even hoge","2× zo hoge"])],"fres"),
("ressr","s20","Serieresonantie","een seriekring op zijn resonantiefrequentie",None,
  [("In een seriekring bij resonantie is de impedantie ___","minimaal",["maximaal","oneindig","gelijk aan X_L − X_C"]),
   ("In een seriekring bij resonantie is de stroom ___","maximaal",["minimaal","nul","gelijk aan 2·I"])],None),
("respr","s20","Parallelresonantie","een parallelkring op zijn resonantiefrequentie",None,
  [("In een parallelkring bij resonantie is de impedantie ___","maximaal",["minimaal","nul","gelijk aan R / 2"]),
   ("In een parallelkring bij resonantie is de bronstroom ___","minimaal",["maximaal","oneindig","gelijk aan de som"])],None),
("zser","s22","Impedantie in serie","een weerstand en een reactantie achter elkaar","Z = √(R² + X²)",
  [("Z = √(R² + ___)","X²",["X","R","2 · R · X"])],"zser"),
("zpar","s22","Impedantie parallel","een weerstand en een reactantie naast elkaar","1/Z = √(1/R² + 1/X²)",[],None),
("fkrc","s26","Kantelfrequentie RC-filter","de grens tussen doorlaten en verzwakken bij een RC-filter","f_k = 1 / (2π · R · C)",
  [("Bij de kantelfrequentie geldt R ___ X","=",["<",">","+"]),("Op de kantelfrequentie is de verzwakking ___","3 dB",["0 dB","6 dB","20 dB"])],"fkrc"),
("fkrl","s26","Kantelfrequentie RL-filter","de grens tussen doorlaten en verzwakken bij een RL-filter","f_k = R / (2π · L)",[],"fkrl"),
("filt","s25","Soorten filters","wat een filter doorlaat of tegenhoudt",None,
  [("Een laagdoorlaatfilter laat ___ frequenties door","lage",["hoge","alleen één","alle"]),
   ("Een hoogdoorlaatfilter laat ___ frequenties door","hoge",["lage","alleen één","geen"]),
   ("Een bandsperfilter ___ een frequentieband","verzwakt",["laat door","versterkt","verdubbelt"])],None),
("qser","s28","Kwaliteitsfactor seriekring","de scherpte van een seriekring","Q = X_L / R_verlies",
  [("Voor een seriekring is Q = X_L / ___","R_verlies",["X_C","f","B"])],"qfac"),
("qpar","s28","Kwaliteitsfactor parallelkring","de scherpte van een parallelkring","Q = R_verlies / X_L",
  [("Voor een parallelkring is Q = R_verlies / ___","X_L",["X_C · L","f","B"])],None),
("bw","s28","Bandbreedte","de breedte van het doorgelaten frequentiegebied","B = f_res / Q",
  [("Hoe groter Q, des te ___ de bandbreedte","kleiner",["groter","gelijk","negatiever"])],"bw"),
("harm","s32","Harmonischen","de bouwstenen van een niet-sinusvormig signaal",None,
  [("Een blokgolf bestaat uit alle ___ harmonischen","oneven",["even","negatieve","gebroken"]),
   ("Een laagdoorlaatfilter ___ harmonischen","verzwakt",["versterkt","maakt","laat ongemoeid"])],None),
]

RW5 = {
"freq":[("f = 1 / T","T","T = 1 / f",["T = f","T = f / 2","T = 2π · f"]),("T = 1 / f","f","f = 1 / T",["f = T","f = 2π · T","f = T / 2"])],
"ueff":[("U_eff = U_max / √2","U_max","U_max = U_eff · √2",["U_max = U_eff / √2","U_max = U_eff · 2","U_max = U_eff²"])],
"xc":[("X_C = 1 / (2π · f · C)","C","C = 1 / (2π · f · X_C)",["C = 2π · f / X_C","C = X_C / (2π · f)","C = 2π · f · X_C"])],
"xl":[("X_L = 2π · f · L","L","L = X_L / (2π · f)",["L = 2π · f / X_L","L = X_L · 2π · f","L = 1 / (2π · f · X_L)"]),("X_L = 2π · f · L","f","f = X_L / (2π · L)",["f = 2π · L / X_L","f = X_L · 2π · L","f = 1 / (2π · L · X_L)"])],
"fres":[("f = 1 / (2π · √(L · C))","C","C = 1 / (4π² · f² · L)",["C = 1 / (2π · f · L)","C = 4π² · f² · L","C = 1 / (2π · f² · L)"]),("f = 1 / (2π · √(L · C))","L","L = 1 / (4π² · f² · C)",["L = 1 / (2π · f · C)","L = 4π² · f² · C","L = 1 / (2π · f² · C)"])],
"zser":[("Z = √(R² + X²)","X","X = √(Z² − R²)",["X = Z − R","X = √(Z² + R²)","X = Z² − R²"])],
"fkrc":[("f_k = 1 / (2π · R · C)","R","R = 1 / (2π · f_k · C)",["R = 2π · f_k · C","R = f_k / (2π · C)","R = 2π · C / f_k"])],
"fkrl":[("f_k = R / (2π · L)","L","L = R / (2π · f_k)",["L = 2π · f_k / R","L = R · 2π · f_k","L = 2π · R / f_k"])],
"qser":[("Q = X_L / R_verlies","R_verlies","R_verlies = X_L / Q",["R_verlies = Q / X_L","R_verlies = X_L · Q","R_verlies = X_L − Q"])],
"bw":[("B = f_res / Q","Q","Q = f_res / B",["Q = B / f_res","Q = f_res · B","Q = f_res − B"]),("B = f_res / Q","f_res","f_res = B · Q",["f_res = B / Q","f_res = Q / B","f_res = B + Q"])],
}

def build(chap, C, F, DR, RW):
    f = ROOT / 'data' / 'theorie' / f'hoofdstuk-{chap}.json'
    d = json.loads(f.read_text(encoding='utf-8'))
    ids = {s['id'] for s in d['sections']}
    for sec, *_ in C: assert sec in ids, (chap, 'card', sec)
    for it in DR: assert it[1] in ids, (chap, 'drill', it[1])
    d['cards'] = [{"id": f"c{i+1}", "sec": s, "q": q, "a": a} for i, (s, q, a) in enumerate(C)]
    d['formulas'] = F
    d['drill'] = [{"id": i, "sec": sec, "name": n, "where": w, "f": fm, "cloze": [{"q": q, "a": a, "w": w2} for q, a, w2 in cl], "gen": g} for i, sec, n, w, fm, cl, g in DR]
    for it in d['drill']:
        if it['id'] in RW: it['rewrite'] = [{"base": b, "ask": a, "a": r, "w": w} for b, a, r, w in RW[it['id']]]
    f.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'H{chap}:', len(d['cards']), 'kaarten,', len(d['drill']), 'formule-items,', sum(len(g['items']) for g in F), 'regels formuleblad')

build(4, C4, F4, DR4, RW4)
build(5, C5, F5, DR5, RW5)
