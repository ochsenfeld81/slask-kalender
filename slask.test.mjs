import { test } from "node:test";
import assert from "node:assert/strict";
import { alsIcs, leseDatum, leseSpiele } from "./slask.mjs";

const zeile = (heim, erg, gast, datum) => `<tr align="left">
<td nowrap valign="top" width="180"><b>  ${heim}  </b></td>
<td nowrap valign="top" align="center" width="50"><b>${erg}</b></td>
<td nowrap valign="top" width="180"><b>  ${gast}  </b></td>
<td valign="top" nowrap align="left" width="190">${datum}</td>
</tr>`;
const runde = (kopf) => `<b><u>${kopf}</u></b>`;

const SEITE = [
  "<title>Orlen Ekstraliga kobiet 2026/2027</title>",
  runde("Kolejka 10 - 7-8 listopada"),
  zeile("Legionistki Warszawa", "1-1", "Śląsk Wrocław", "7 listopada, 13:00"),
  zeile("UJ Kraków", "2-2", "Górnik Łęczna", "8 listopada, 13:00"),
  runde("Kolejka 11 - 14-15 listopada"),
  zeile("Śląsk Wrocław", "-", "Górnik Łęczna", "15 listopada, 12:00"),
  runde("Kolejka 12 - 21-22 lutego"),
  zeile("Śląsk Wrocław", "-", "UJ Kraków", "22 lutego"),
  runde("Kolejka 13 - 28 lutego - 1 marca"),
  zeile("Pogoń Szczecin", "-", "Śląsk Wrocław", ""),
  runde("Kolejka 14"),
  zeile("Śląsk Wrocław", "-", "GKS Katowice", ""),
].join("\n");

const spiele = leseSpiele(SEITE);
const nach = (heim, gast) => spiele.find((s) => s.heim === heim && s.gast === gast);

test("nur Spiele von Śląsk Wrocław", () => {
  assert.equal(spiele.length, 5);
  assert.equal(nach("UJ Kraków", "Górnik Łęczna"), undefined);
});

test("Tag und Uhrzeit des Spiels, nicht der Runde", () => {
  const s = nach("Śląsk Wrocław", "Górnik Łęczna");
  assert.deepEqual(s.datum, { tag: 15, monat: 11, zeit: "12:00", jahr: 2026 });
  assert.equal(s.offen, null);
  assert.equal(s.spieltag, 11);
});

test("Rückrunde im Folgejahr", () => {
  assert.equal(nach("Śląsk Wrocław", "UJ Kraków").datum.jahr, 2027);
});

test("Tag ohne Uhrzeit → 12:00, Uhrzeit offen", () => {
  const s = nach("Śląsk Wrocław", "UJ Kraków");
  assert.equal(s.offen, "Uhrzeit offen");
  assert.match(alsIcs([s]), /DTSTART;TZID=Europe\/Warsaw:20270222T120000/);
  assert.match(alsIcs([s]), /Uhrzeit offen/);
});

test("nur Wochenende der Runde → erster Tag, Termin offen", () => {
  const s = nach("Pogoń Szczecin", "Śląsk Wrocław");
  assert.deepEqual(s.datum, { tag: 28, monat: 2, zeit: null, jahr: 2027 });
  assert.equal(s.offen, "Termin offen");
});

test("ohne jedes Datum kein Termin", () => {
  assert.equal(nach("Śląsk Wrocław", "GKS Katowice").datum, null);
  assert.doesNotMatch(alsIcs(spiele), /GKS Katowice/);
});

test("Ergebnis gespielter Spiele in der Beschreibung", () => {
  assert.equal(nach("Legionistki Warszawa", "Śląsk Wrocław").ergebnis, "1:1");
  assert.equal(nach("Śląsk Wrocław", "Górnik Łęczna").ergebnis, null);
});

test("verlegtes Spiel behält seine Kennung", () => {
  const uid = (html) => alsIcs(leseSpiele(html)).match(/UID:.*gornik.*/)[0];
  const verlegt = SEITE.replace("15 listopada, 12:00", "14 listopada, 18:00");
  assert.equal(uid(SEITE), uid(verlegt));
  assert.match(alsIcs(leseSpiele(verlegt)), /20261114T180000/);
});

test("Datei ist bei gleichem Spielplan Byte für Byte gleich (kein Commit ohne Änderung)", () => {
  assert.equal(alsIcs(leseSpiele(SEITE)), alsIcs(leseSpiele(SEITE)));
});

test("Zeilen höchstens 75 Bytes, mit CRLF", () => {
  const ics = alsIcs(spiele);
  for (const z of ics.split("\r\n")) assert.ok(new TextEncoder().encode(z).length <= 75, z);
  assert.ok(!/[^\r]\n/.test(ics));
});

test("Datumsformen", () => {
  assert.deepEqual(leseDatum("31 października - 1 listopada"), { tag: 31, monat: 10, zeit: null });
  assert.equal(leseDatum(""), null);
});
