#!/usr/bin/env python3
"""Flashcards, formuleblad en formule-spel voor H6 (transformatoren). Gebruik: python tools/cards_h6.py"""
import sys, importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('c45', Path(__file__).with_name('cards_h45.py'))
src = Path(__file__).with_name('cards_h45.py').read_text(encoding='utf-8')
build_src = src[src.index('def build('):src.index('build(4, C4')]
import json
ROOT = Path(__file__).resolve().parent.parent
exec(build_src)

C6 = [
("s2","Waarvoor gebruik je transformatoren?","Spanning of stroom (wisselstroom) groter of kleiner maken, impedanties veranderen en gelijkspanningen tussen schakelingen scheiden (galvanische scheiding)."),
("s3","Waarom is de kern van een LF-trafo van weekijzer?","Weekijzer heeft een hoge permeabiliteit: het magnetisch veld wordt goed door de wikkelingen geleid en er gaat weinig veld verloren."),
("s3","Wat is de primaire en wat de secundaire wikkeling?","Primair is de wikkeling voor de invoer, secundair die voor de uitvoer."),
("s3","Waarom wordt een weekijzeren kern opgebouwd uit gestapelde, onderling geïsoleerde lamellen?","Om wervelstromen in de kern tegen te gaan. Die veroorzaken warmte en dus kernverliezen."),
("s3","Waarom is een ringkerntrafo gunstig?","Het magnetisch veld blijft vrijwel geheel binnen de ringvormige kern en de wikkelingen: weinig spreidingsverlies."),
("s3","Welke kern gebruik je bij HF in plaats van weekijzer?","Ferriet, ijzerpoeder of ijzercarbonyl: niet elektrisch geleidend en het veld kan de snelle ompoling volgen."),
("s5","Werkt een transformator op gelijkspanning?","Nee. Zodra de gelijkstroom constant is verandert het magnetisch veld niet meer, dus er is geen inductie en geen secundaire spanning."),
("s6","Wat gebeurt er met een gelijkstroomdeel in de primaire stroom?","Het wordt niet doorgegeven naar de secundaire. Te veel gelijkstroom kan de kern wel in verzadiging brengen."),
("s6","Wat geldt voor het vermogen bij een ideale transformator?","P primair = P secundair. Spanning en stroom veranderen, het vermogen niet."),
("s7","Hoe hangen spanning en windingen samen bij een trafo?","U₁ / U₂ = N₁ / N₂ (de spanning is evenredig met het aantal windingen)."),
("s7","Hoe hangen de stromen en de windingen samen?","I₁ / I₂ = N₂ / N₁ (precies omgekeerd: meer windingen betekent minder stroom)."),
("s7","Een trafo heeft 1000 primaire en 250 secundaire windingen. Bij 100 V primair, hoeveel V secundair?","U₂ = 100 × 250/1000 = 25 V."),
("s7","Zelfde trafo (1000 : 250), secundair 1 A. Hoeveel is de primaire stroom?","I₁ = 1 × 250/1000 = 0,25 A."),
("s7","Wat betekent 'volt per winding'?","Elke winding levert dezelfde spanning. Spanning over een wikkeling = volt per winding × aantal windingen."),
("s7","Waarom mag je de 20 V-wikkeling van een 230 V/20 V-trafo niet op 230 V aansluiten?","Je krijgt dan aan de andere kant een veel te hoge spanning (circa 2,6 kV): gevaarlijk en de isolatie bezwijkt."),
("s7","Wat is een ampèrewinding?","Stroom × aantal windingen. Dat is de maat voor de sterkte van het magnetisch veld; primair en secundair zijn (ideaal) gelijk."),
("s8","Formule voor impedantietransformatie?","Z₁ / Z₂ = (N₁ / N₂)². Het kwadraat van de wikkelverhouding."),
("s8","Een trafo transformeert spanning 10 keer omhoog. Hoe verandert de impedantie?","Met een factor 100 (kwadraat). Dat geldt ook voor R en X."),
("s8","Een trafo 900 : 300 heeft 90 pF aan de secundaire. Hoeveel ziet de primaire?","Z₁ = 9 × Z₂, dus de reactantie is 9× groter en de capaciteit 9× kleiner: 10 pF."),
("s8","Waarvoor gebruik je een aanpassingstrafo?","Om de impedantie van een bron aan die van de belasting aan te passen, zodat het vermogensoverdracht maximaal is (bijv. versterker–luidspreker)."),
("s9","Wat gebeurt er als je twee gelijke wikkelingen in serie zet met de verkeerde polariteit?","De spanningen heffen elkaar op: tussen de uiteinden staat 0 V."),
("s9","Wat gebeurt er als je twee wikkelingen met verkeerde fase parallel zet?","Kortsluiting, met alle gevolgen van dien."),
("s10","Wat is een autotransformator?","Een trafo met één wikkeling met aftakkingen: er is geen aparte secundaire. Dat bespaart koper."),
("s10","Wat is het grote nadeel van een autotrafo?","Geen galvanische scheiding tussen ingang en uitgang: onveilig voor netspanning."),
("s10","Wat is een variac?","Een autotrafo met een glijcontact, waardoor de uitgangsspanning continu regelbaar is."),
("s10","Welke stroom loopt in het gemeenschappelijke deel van een autotrafo?","Het verschil van primaire en secundaire stroom (ze zijn in tegenfase), niet de som."),
("s10","Mag je alle aftakkingen van één secundaire wikkeling tegelijk volledig belasten?","Nee. De stromen lopen samen door het onderste deel van de wikkeling; de totale stroom mag de maximale stroom niet overschrijden."),
("s11","Wat is nullaststroom?","De (kleine) primaire stroom die loopt als de secundaire niet belast is. De primaire gedraagt zich dan als een spoel met hoge zelfinductie."),
("s11","Wat is het verschil tussen een smoorspoel en een trafo met betrekking tot gelijkstroom?","Een smoorspoel smoort wisselstroom en laat gelijkstroom door. Een trafo geeft alleen wisselstroom door."),
("s13","Welke drie soorten verliezen heeft een trafo?","Koperverliezen, ijzerverliezen en spreidingsverliezen."),
("s14","Wat zijn koperverliezen?","Warmte door de weerstand van het wikkeldraad (P = I²·R)."),
("s15","Noem twee oorzaken van ijzerverliezen.","Wervelstromen in de kern en hysterese (voortdurend omkeren van de magnetisering). Ook verzadiging vergroot de verliezen."),
("s15","Wat is verzadiging van de kern?","Boven een bepaalde veldsterkte neemt de permeabiliteit af. De zelfinductie daalt, de nullaststroom stijgt en er komt meer warmte."),
("s15","Waarom zijn ijzerkernen niet geschikt voor HF?","De hysterese verliezen lopen bij hogere frequenties sterk op en het ijzer kan de snelle ompoling niet volgen."),
("s16","Wat zijn spreidingsverliezen?","Het deel van het magnetisch veld dat buiten de kern blijft en dus niet in de secundaire terechtkomt. Het zorgt niet voor opwarming."),
("s18","Wat is de belangrijkste overeenkomst tussen HF- en LF-transformatoren?","Energieoverdracht verloopt via een magnetisch veld."),
("s19","Hoe verandert het aantal windingen als de frequentie hoger wordt?","Er zijn minder windingen nodig: hoe hoger de frequentie, des te minder windingen."),
("s19","Wat is het huideffect (skin effect)?","Bij hogere frequentie loopt de stroom steeds meer aan de buitenkant van een geleider. De weerstand van de draad neemt daardoor toe."),
("s19","Waarom gebruik je verzilverd koperdraad bij hoge frequenties?","De stroom loopt over de buitenkant, en zilver geleidt beter dan koper."),
("s19","Wat is litze en waarom gebruik je het bij HF?","Draad van veel dunne onderling geïsoleerde draadjes. Het totale oppervlak is groter dan bij massief draad, dus minder last van het huideffect."),
("s19","Wat doet een kern van poederijzer in een HF-spoel?","Hij verhoogt de zelfinductie. Door de kern in of uit te draaien kun je L instellen."),
("s19","Tot welke frequentie zijn de gebruikelijke kernmaterialen bruikbaar?","Ongeveer 50 MHz. Daarboven werken ze niet meer."),
("s19","Waarom is ferriet niet zo geschikt voor vervormingsarme signaaloverdracht bij grote stromen?","Ferriet raakt bij grote stromen in verzadiging, wat vervorming geeft."),
("s20","Hoe schermt een aluminium bus een HF-spoel af?","Een wisselend magnetisch veld induceert in de bus een stroom die een tegengesteld veld maakt, zodat het veld buiten de bus verdwijnt."),
("s20","Wat doet een afschermbus met de zelfinductie en de Q van de spoel?","Beide worden lager. Meet je de spoel buiten de bus, dan vind je een te hoge L."),
("s20","Wat zorgt voor een effectieve afscherming van een spoel zonder bus?","Wikkelen op een ringkern: het veld blijft binnen de ring."),
("s20","Wat doet een metalen kern in een HF-spoel (145 en 432 MHz)?","Hij verlaagt de zelfinductie."),
("s21","Rekenregels trafo samengevat?","Spanning: U₁/U₂ = N₁/N₂. Stroom: I₁/I₂ = N₂/N₁. Impedantie: Z₁/Z₂ = (N₁/N₂)². Dat geldt ook voor autotrafo's."),
]

F6 = [
{"title":"Transformator (ideaal)","items":[
 {"f":"U₁ / U₂ = N₁ / N₂   ·   U₂ = U₁ · N₂ / N₁","t":"spanning evenredig met het aantal windingen"},
 {"f":"I₁ / I₂ = N₂ / N₁   ·   I₁ = I₂ · N₂ / N₁","t":"stroom omgekeerd evenredig met het aantal windingen"},
 {"f":"P₁ = P₂","t":"ideaal: geen verlies; U₁·I₁ = U₂·I₂"},
 {"f":"Z₁ / Z₂ = (N₁ / N₂)²","t":"impedantie (ook R en X) met het kwadraat van de wikkelverhouding"},
 {"f":"N₁ / N₂ = √(Z₁ / Z₂)","t":"wikkelverhouding voor een gewenste aanpassing"}]},
{"title":"Rendement","items":[
 {"f":"η = P_uit / P_in · 100%","t":"rendement; het verschil is warmte (koper-, ijzer-, spreidingsverlies)"}]},
{"title":"Autotrafo","items":[
 {"f":"Spanningen evenredig met windingen","t":"tussen de aansluitingen, zoals bij een gewone trafo"},
 {"f":"Gemeenschappelijk deel: I = I₁ − I₂","t":"verschil van de stromen (tegenfase)"}]},
{"title":"HF","items":[
 {"f":"X_L = 2π · f · L","t":"hoe hoger f, des te minder windingen voor dezelfde reactantie"}]},
]

DR6 = [
("tU","s7","Spanningstransformatie","de spanning aan de secundaire van een trafo","U₂ = U₁ · N₂ / N₁",
  [("U₁ / U₂ = ___","N₁ / N₂",["N₂ / N₁","(N₁ / N₂)²","I₁ / I₂"]),("Meer secundaire dan primaire windingen geeft een ___ spanning","hogere",["lagere","even hoge","wisselende"])],"trafoU"),
("tI","s7","Stroomtransformatie","de primaire stroom uit de secundaire stroom","I₁ = I₂ · N₂ / N₁",
  [("I₁ / I₂ = ___","N₂ / N₁",["N₁ / N₂","(N₂ / N₁)²","U₁ / U₂"]),("Bij een trafo die de spanning omhoog transformeert, wordt de stroom ___","lager",["hoger","gelijk","nul"])],"trafoI"),
("tP","s6","Vermogen bij een ideale trafo","het vermogen aan beide kanten van een ideale trafo","P₁ = P₂",
  [("Bij een ideale trafo is het primaire vermogen ___ het secundaire","gelijk aan",["groter dan","kleiner dan","de helft van"]),("Een trafo werkt op ___","wisselspanning",["gelijkspanning","beide even goed","alleen pulsen met DC-deel"])],None),
("tZ","s8","Impedantietransformatie","de impedantie die de primaire ziet","Z₁ / Z₂ = (N₁ / N₂)²",
  [("De impedantie transformeert met het ___ van de wikkelverhouding","kwadraat",["omgekeerde","getal zelf","wortel"]),("Bij spanning 10× omhoog gaat de impedantie met een factor ___","100",["10","1000","0,1"])],"trafoZ"),
("tN","s8","Wikkelverhouding voor aanpassing","de wikkelverhouding voor een gewenste impedantie","N₁ / N₂ = √(Z₁ / Z₂)",
  [("N₁/N₂ = ___ (Z₁/Z₂)","√",["kwadraat van","omgekeerde van","tweemaal"])],"trafoN"),
("eta","s13","Rendement van een trafo","het rendement uit opgenomen en afgegeven vermogen","η = P_uit / P_in · 100%",
  [("Het vermogensverschil tussen in en uit wordt ___","warmte",["licht","opgeslagen in de kern","spanning"])],"rend"),
("auto","s10","Autotransformator","de autotransformator",None,
  [("Een autotrafo heeft ___ wikkeling(en)","één",["twee","drie","geen"]),("Een autotrafo heeft geen ___","galvanische scheiding",["aftakkingen","weerstand","kern"])],None),
("verl","s13","Verliezen in trafo's","de soorten verliezen",None,
  [("Wervelstromen horen bij de ___","ijzerverliezen",["koperverliezen","spreidingsverliezen","dielectrische verliezen"]),("De weerstand van het wikkeldraad geeft ___","koperverliezen",["ijzerverliezen","spreidingsverliezen","hysterese"])],None),
("hf","s19","HF-spoelen en trafo's","kenmerken van spoelen en trafo's bij hoge frequenties",None,
  [("Hoe hoger de frequentie, des te ___ windingen","minder",["meer","evenveel","dikkere"]),("Door het huideffect loopt de stroom aan de ___ van de draad","buitenkant",["binnenkant","onderkant","isolatie"]),("Litze vermindert de last van het ___","huideffect",["hysterese","verzadiging","spreidingsverlies"])],None),
]

RW6 = {
"tU":[("U₂ = U₁ · N₂ / N₁","N₂","N₂ = N₁ · U₂ / U₁",["N₂ = N₁ · U₁ / U₂","N₂ = U₂ / (U₁ · N₁)","N₂ = N₁ + U₂ / U₁"]),("U₂ = U₁ · N₂ / N₁","U₁","U₁ = U₂ · N₁ / N₂",["U₁ = U₂ · N₂ / N₁","U₁ = U₂ / N₁ · N₂","U₁ = U₂ + N₁ / N₂"])],
"tI":[("I₁ = I₂ · N₂ / N₁","I₂","I₂ = I₁ · N₁ / N₂",["I₂ = I₁ · N₂ / N₁","I₂ = I₁ / (N₁ · N₂)","I₂ = I₁ + N₁ / N₂"])],
"tZ":[("Z₁ / Z₂ = (N₁ / N₂)²","Z₂","Z₂ = Z₁ · (N₂ / N₁)²",["Z₂ = Z₁ · (N₁ / N₂)²","Z₂ = Z₁ · N₂ / N₁","Z₂ = Z₁ / (N₂ / N₁)²"])],
}

build(6, C6, F6, DR6, RW6)
