/**
 * Spielplan der Frauen von Śląsk Wrocław (Orlen Ekstraliga) als Kalender-Abo.
 *
 * Quelle ist 90minut.pl, nicht die Vereinsseite: slaskwroclaw.pl weist Programme mit 403 ab.
 * Läuft alle paar Stunden über GitHub Actions; Google Kalender abonniert die erzeugte `slask.ics`.
 *
 * Regeln:
 * - Ein Spiel mit Tag und Uhrzeit steht zu dieser Uhrzeit, 2 Stunden lang.
 * - Ein Spiel mit Tag ohne Uhrzeit, oder nur mit dem Wochenende des Spieltags, steht am (ersten) Tag
 *   um 12:00 mit „Uhrzeit offen“ bzw. „Termin offen“ im Titel – nie ganztägig.
 * - Ein Spiel ohne jedes Datum (Rückrunde vor der Ansetzung) fehlt, bis es angesetzt ist.
 * - Die Kennung (UID) hängt an Saison und Paarung, nicht am Datum: Wird ein Spiel verlegt, wandert der
 *   Termin im Kalender mit, statt doppelt zu erscheinen.
 * - Findet das Skript zu wenige Spiele, bricht es ab und lässt die alte Datei stehen – lieber ein
 *   alter Stand als ein leerer Kalender, wenn 90minut.pl seine Seite umbaut.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const QUELLE = "http://www.90minut.pl/liga/1/liga14769.html";
export const VEREIN = "Śląsk Wrocław";
const MIN_SPIELE = 15; // 12 Mannschaften → 22 Spiele je Saison
const ZEITZONE = "Europe/Warsaw";
const DAUER_STUNDEN = 2;

const MONATE = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12,
};

const sauber = (html) =>
  html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** „15 listopada, 12:00“, „15 listopada“, „14-15 listopada“, „31 października - 1 listopada“. */
export function leseDatum(text) {
  const t = (text || "").trim().toLowerCase();
  const tag = t.match(/^(\d{1,2})/);
  const monat = Object.keys(MONATE).find((m) => t.includes(m));
  if (!tag || !monat) return null;
  const zeit = t.match(/(\d{1,2}):(\d{2})/);
  return {
    tag: Number(tag[1]),
    monat: MONATE[monat],
    zeit: zeit ? `${zeit[1].padStart(2, "0")}:${zeit[2]}` : null,
  };
}

/** Saison „2026/2027“: Juli bis Dezember im ersten Jahr, Januar bis Juni im zweiten. */
export const jahrFuer = (monat, saison) => (monat >= 7 ? saison[0] : saison[1]);

/** Alle Spiele von `VEREIN` aus der Seite (bereits als Text dekodiert). */
export function leseSpiele(html) {
  const titel = html.match(/<title>[^<]*?(\d{4})\/(\d{4})/);
  if (!titel) throw new Error("Saison nicht gefunden");
  const saison = [Number(titel[1]), Number(titel[2])];

  const muster =
    /<b><u>Kolejka (\d+)(?: - ([^<]*))?<\/u><\/b>|<tr align="left">\s*<td[^>]*width="180">(.*?)<\/td>\s*<td[^>]*width="50">(.*?)<\/td>\s*<td[^>]*width="180">(.*?)<\/td>\s*<td[^>]*width="190">(.*?)<\/td>/gs;
  const spiele = [];
  let runde = null;
  for (const m of html.matchAll(muster)) {
    if (m[1]) {
      runde = { nr: Number(m[1]), datum: leseDatum(m[2]) };
      continue;
    }
    const heim = sauber(m[3]);
    const gast = sauber(m[5]);
    if (heim !== VEREIN && gast !== VEREIN) continue;
    const ergebnis = sauber(m[4]);
    const eigenes = leseDatum(sauber(m[6]));
    let datum = eigenes;
    let offen = null;
    if (!eigenes && runde?.datum) {
      datum = { ...runde.datum, zeit: null };
      offen = "Termin offen";
    } else if (eigenes && !eigenes.zeit) {
      offen = "Uhrzeit offen";
    }
    spiele.push({
      spieltag: runde?.nr ?? null,
      heim,
      gast,
      ergebnis: /^\d+-\d+$/.test(ergebnis) ? ergebnis.replace("-", ":") : null,
      datum: datum && { ...datum, jahr: jahrFuer(datum.monat, saison) },
      offen,
      saison,
    });
  }
  return spiele;
}

// ---------- iCalendar ----------

const text = (s) =>
  String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Zeilen über 75 Bytes umbrechen, ohne ein Zeichen zu zerschneiden. */
function falte(zeile) {
  const enc = new TextEncoder();
  const teile = [];
  let akt = "";
  for (const z of zeile) {
    const grenze = teile.length ? 74 : 75;
    if (enc.encode(akt + z).length > grenze) {
      teile.push(akt);
      akt = z;
    } else akt += z;
  }
  teile.push(akt);
  return teile.join("\r\n ");
}

const zwei = (n) => String(n).padStart(2, "0");
const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").replace(/Ł/g, "L")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", `TZID:${ZEITZONE}`,
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
  "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
  "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

export function alsIcs(spiele) {
  const zeilen = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//slask-kalender//DE", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", `X-WR-CALNAME:${text(`${VEREIN} Frauen`)}`, `X-WR-TIMEZONE:${ZEITZONE}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
    ...VTIMEZONE,
  ];
  for (const s of spiele) {
    if (!s.datum) continue;
    const { jahr, monat, tag, zeit } = s.datum;
    const [h, min] = (zeit || "12:00").split(":").map(Number);
    const start = `${jahr}${zwei(monat)}${zwei(tag)}T${zwei(h)}${zwei(min)}00`;
    const ende = `${jahr}${zwei(monat)}${zwei(tag)}T${zwei(h + DAUER_STUNDEN)}${zwei(min)}00`;
    const heimspiel = s.heim === VEREIN;
    const zusatz = s.offen ? `Frauen, ${s.offen}` : "Frauen";
    const beschreibung = [
      `Orlen Ekstraliga (Frauen), ${s.spieltag}. Spieltag, ${heimspiel ? "Heimspiel" : "Auswärtsspiel"}.`,
      s.ergebnis ? `Ergebnis ${s.ergebnis}.` : null,
      s.offen ? "Anstoßzeit noch nicht veröffentlicht – 12:00 ist Platzhalter." : null,
      `Quelle: ${QUELLE}`,
    ].filter(Boolean).join("\n");
    zeilen.push(
      "BEGIN:VEVENT",
      `UID:${s.saison.join("-")}-${slug(s.heim)}-${slug(s.gast)}@slask-kalender`,
      "DTSTAMP:20260801T000000Z",
      `DTSTART;TZID=${ZEITZONE}:${start}`,
      `DTEND;TZID=${ZEITZONE}:${ende}`,
      `SUMMARY:${text(`${s.heim} – ${s.gast} (${zusatz})`)}`,
      `DESCRIPTION:${text(beschreibung)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  zeilen.push("END:VCALENDAR");
  return zeilen.map(falte).join("\r\n") + "\r\n";
}

// ---------- Aufruf ----------

async function main() {
  const antwort = await fetch(QUELLE, { headers: { "User-Agent": "Mozilla/5.0 (slask-kalender)" } });
  if (!antwort.ok) throw new Error(`${QUELLE}: HTTP ${antwort.status}`);
  const html = new TextDecoder("iso-8859-2").decode(await antwort.arrayBuffer());
  const spiele = leseSpiele(html);
  if (spiele.length < MIN_SPIELE) {
    throw new Error(`Nur ${spiele.length} Spiele gefunden (mindestens ${MIN_SPIELE}) – Seite umgebaut?`);
  }
  const ziel = process.argv[2] || "slask.ics";
  writeFileSync(ziel, alsIcs(spiele));
  const mitDatum = spiele.filter((s) => s.datum).length;
  console.log(`${spiele.length} Spiele, davon ${mitDatum} mit Datum → ${ziel}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
