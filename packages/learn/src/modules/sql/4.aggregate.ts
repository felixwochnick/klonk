import type { LearnDatabase, LearnModule } from '../../types'

// Sportfest: eine Tabelle mit den Ergebnissen (Punkte je Disziplin, 0 = ungültiger Versuch), je Startsituation andere Klassen

const EVENTS = {
  sprint: { de: 'Sprint', en: 'sprint' },
  jump: { de: 'Weitsprung', en: 'long jump' },
  throw: { de: 'Wurf', en: 'throw' },
  run: { de: 'Ausdauerlauf', en: 'endurance run' },
} as const
type Event = keyof typeof EVENTS

/** Teilnehmende: Name, Klasse, Punkte je Disziplin (fehlt = nicht angetreten) */
type Athlete = [name: string, form: string, points: Partial<Record<Event, number>>]

function sportsDaySql(athletes: Athlete[], lang: 'de' | 'en') {
  const [table, columns] = lang === 'de'
    ? ['ergebnisse', 'id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  klasse TEXT NOT NULL,\n  disziplin TEXT NOT NULL,\n  punkte INTEGER NOT NULL']
    : ['results', 'id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  class TEXT NOT NULL,\n  event TEXT NOT NULL,\n  points INTEGER NOT NULL']
  const rows = athletes.flatMap(([name, form, points]) => (Object.keys(EVENTS) as Event[])
    .filter(event => points[event] !== undefined)
    .map(event => `'${name}', '${form}', '${EVENTS[event][lang]}', ${points[event]}`))
  return `CREATE TABLE ${table} (\n  ${columns}\n);\nINSERT INTO ${table} VALUES\n${rows.map((row, i) => `  (${i + 1}, ${row})`).join(',\n')};\n`
}

// Gesamtpunkte der Klassen und Durchschnitte der Disziplinen sind je Startsituation verschieden (eindeutige Sortierung)
const SPORTS_DAYS: Athlete[][] = [
  [
    ['Mia', '7a', { sprint: 45, jump: 38, throw: 30 }],
    ['Ben', '7a', { sprint: 52, jump: 0, throw: 41 }],
    ['Elif', '7b', { sprint: 39, jump: 44, throw: 35, run: 50 }],
    ['Jonas', '7b', { sprint: 30, jump: 27, throw: 0 }],
    ['Lea', '8a', { sprint: 48, jump: 50, throw: 28 }],
    ['Noah', '8a', { sprint: 41, run: 36 }],
  ],
  [
    ['Can', '5a', { sprint: 33, jump: 29, throw: 40 }],
    ['Ida', '5a', { sprint: 47, jump: 41, throw: 0, run: 44 }],
    ['Ole', '5b', { sprint: 0, jump: 35, throw: 46 }],
    ['Sara', '5b', { sprint: 51, jump: 48, throw: 37 }],
    ['Tim', '6a', { sprint: 40, jump: 0, throw: 52, run: 39 }],
    ['Zoe', '6a', { sprint: 36, jump: 31 }],
    ['Finn', '6a', { throw: 44, run: 0 }],
  ],
  [
    ['Ali', '9a', { sprint: 55, jump: 47, throw: 49 }],
    ['Eva', '9a', { sprint: 42, jump: 0, throw: 33 }],
    ['Jan', '9b', { sprint: 38, jump: 45, throw: 0, run: 41 }],
    ['Nina', '9b', { sprint: 49, jump: 52, throw: 31, run: 47 }],
    ['Paul', '9b', { sprint: 0, jump: 36 }],
    ['Lina', '9a', { sprint: 44, throw: 38, run: 45 }],
  ],
]

const sportsDay: LearnDatabase[] = [{
  name: { de: 'sportfest', en: 'sports_day' },
  sql: SPORTS_DAYS.map(athletes => ({ de: sportsDaySql(athletes, 'de'), en: sportsDaySql(athletes, 'en') })),
}]

export const sqlAggregate: LearnModule = {
  id: 'sql-aggregate',
  track: 'sql',
  title: { de: 'Zählen und Gruppieren', en: 'Counting and grouping' },
  summary: {
    de: 'Die Ergebnisse des Sportfests auswerten: zählen, summieren, Durchschnitte bilden – für alle zusammen oder je Klasse und Disziplin.',
    en: 'Evaluate the results of the sports day: count, add up, calculate averages – for everyone together or per class and event.',
  },
  objectives: [
    { de: 'Mit den Aggregatfunktionen `COUNT`, `SUM`, `AVG`, `MIN` und `MAX` Werte vieler Datensätze zusammenfassen und Spalten mit `AS` benennen', en: 'Summarise the values of many records with the aggregate functions `COUNT`, `SUM`, `AVG`, `MIN` and `MAX` and name columns with `AS`' },
    { de: 'Mit `GROUP BY` Datensätze zu Gruppen zusammenfassen und je Gruppe auswerten', en: 'Combine records into groups with `GROUP BY` and evaluate each group' },
    { de: 'Gruppen mit `HAVING` auswählen und den Unterschied zu `WHERE` erklären', en: 'Select groups with `HAVING` and explain the difference to `WHERE`' },
  ],
  prerequisites: ['sql-filter'],
  intro: {
    de: `Beim Sportfest hat die Schule alle Ergebnisse in der Datenbank \`sportfest\` gesammelt. Die Tabelle \`ergebnisse\` hat die Spalten \`id\`, \`name\`, \`klasse\`, \`disziplin\` und \`punkte\` – eine Zeile je Person und Disziplin. 0 Punkte bedeuten einen ungültigen Versuch.

**Aggregatfunktionen** fassen viele Zeilen zu einem Wert zusammen:

\`\`\`sql
SELECT COUNT(*) AS anzahl, MAX(punkte) AS bester, AVG(punkte) AS schnitt
FROM ergebnisse
WHERE disziplin = 'Sprint'
\`\`\`

\`COUNT(*)\` zählt Zeilen, \`SUM\`, \`AVG\`, \`MIN\` und \`MAX\` rechnen mit einer Spalte. \`AS\` gibt einer Ergebnisspalte einen Namen.

Mit **GROUP BY** entsteht je Gruppe eine Ergebniszeile:

\`\`\`sql
SELECT klasse, SUM(punkte) AS gesamt
FROM ergebnisse
GROUP BY klasse
HAVING SUM(punkte) > 200
ORDER BY gesamt DESC
\`\`\`

- \`WHERE\` wählt **Zeilen aus, bevor** gruppiert wird
- \`GROUP BY klasse\` fasst alle Zeilen mit derselben Klasse zusammen
- \`HAVING\` wählt **Gruppen aus, nachdem** gerechnet wurde – hier darf eine Aggregatfunktion stehen
- Hinter \`SELECT\` stehen dann nur die Spalten aus \`GROUP BY\` und Aggregatfunktionen`,
    en: `At the sports day the school collected all results in the database \`sports_day\`. The table \`results\` has the columns \`id\`, \`name\`, \`class\`, \`event\` and \`points\` – one row per person and event. 0 points means an invalid attempt.

**Aggregate functions** combine many rows into one value:

\`\`\`sql
SELECT COUNT(*) AS number, MAX(points) AS best, AVG(points) AS average
FROM results
WHERE event = 'sprint'
\`\`\`

\`COUNT(*)\` counts rows; \`SUM\`, \`AVG\`, \`MIN\` and \`MAX\` calculate with a column. \`AS\` gives a result column a name.

With **GROUP BY** you get one result row per group:

\`\`\`sql
SELECT class, SUM(points) AS total
FROM results
GROUP BY class
HAVING SUM(points) > 200
ORDER BY total DESC
\`\`\`

- \`WHERE\` selects **rows before** grouping
- \`GROUP BY class\` combines all rows with the same class
- \`HAVING\` selects **groups after** the calculation – an aggregate function may appear here
- After \`SELECT\` there should only be the columns from \`GROUP BY\` and aggregate functions`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** S3 (\`WHERE\` mit Vergleichen, \`ORDER BY … DESC\`).

**Idee:** Eine Tabelle, viele Fragen: Die Sportfest-Daten laden zu Auswertungen ein, wie sie auch in der Schule anfallen (Urkunden, Klassenwertung). Alle Aufgaben werden mit drei Datensätzen geprüft; feste Zahlen genügen nicht. Ab Aufgabe 3 verlangt Klonk \`GROUP BY\`.

**Begriffe:** Aggregatfunktion, Gruppierung, Alias. Die Reihenfolge der Auswertung (\`FROM\` → \`WHERE\` → \`GROUP BY\` → \`HAVING\` → \`SELECT\` → \`ORDER BY\`) erklärt, warum \`WHERE\` keine Aggregatfunktion enthalten darf und \`HAVING\` schon.

**Typische Schwierigkeiten:**
- Aggregatfunktion in \`WHERE\` (\`WHERE SUM(punkte) >= 100\`) – Fehlermeldung „misuse of aggregate“
- Spalten hinter \`SELECT\`, die weder gruppiert noch aggregiert sind – SQLite meldet keinen Fehler, sondern nimmt einen beliebigen Wert der Gruppe; andere Datenbanksysteme lehnen die Abfrage ab
- \`COUNT(*)\` zählt Zeilen, \`COUNT(spalte)\` nur Zeilen, in denen die Spalte nicht NULL ist
- \`AVG\` liefert eine Kommazahl; Klonk vergleicht mit dem ungerundeten Wert – \`ROUND(AVG(punkte), 1)\` gilt daher als falsch, wenn das Runden den Wert ändert

**Differenzierung:** Aufgabe 5 kombiniert \`WHERE\`, \`GROUP BY\`, \`HAVING\` und \`ORDER BY\` und eignet sich als Abschluss oder Zusatzaufgabe. Weitere Fragen für Schnelle: „Wer war in jeder Disziplin am besten?“ (führt zu Unterabfragen, S7).

**Weiterführend:** S5 verknüpft Tabellen; dort wird auch über mehrere Tabellen hinweg gruppiert.`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** S3 (\`WHERE\` with comparisons, \`ORDER BY … DESC\`).

**Idea:** One table, many questions: the sports day data invites evaluations like those that come up at school (certificates, class ranking). All tasks are checked with three data sets; fixed numbers are not enough. From task 3 on, Klonk requires \`GROUP BY\`.

**Terms:** aggregate function, grouping, alias. The order of evaluation (\`FROM\` → \`WHERE\` → \`GROUP BY\` → \`HAVING\` → \`SELECT\` → \`ORDER BY\`) explains why \`WHERE\` must not contain an aggregate function but \`HAVING\` may.

**Typical difficulties:**
- Aggregate function in \`WHERE\` (\`WHERE SUM(points) >= 100\`) – error message “misuse of aggregate”
- Columns after \`SELECT\` that are neither grouped nor aggregated – SQLite does not report an error but takes any value of the group; other database systems reject the query
- \`COUNT(*)\` counts rows, \`COUNT(column)\` only rows where the column is not NULL
- \`AVG\` returns a decimal number; Klonk compares with the unrounded value – \`ROUND(AVG(points), 1)\` therefore counts as wrong if rounding changes the value

**Differentiation:** Task 5 combines \`WHERE\`, \`GROUP BY\`, \`HAVING\` and \`ORDER BY\` and works as a final or extra task. More questions for fast learners: “Who was best in each event?” (leads to subqueries, S7).

**Next:** S5 joins tables; grouping there also spans several tables.`,
  },
  tasks: [
    {
      id: 'count',
      title: { de: 'Wie viele beim Weitsprung', en: 'How many in the long jump' },
      text: {
        de: 'Wie viele Ergebnisse gibt es in der Disziplin `Weitsprung`? Ungültige Versuche (0 Punkte) zählen mit.',
        en: 'How many results are there in the event `long jump`? Invalid attempts (0 points) count too.',
      },
      hints: [
        { de: '`COUNT(*)` zählt alle Zeilen, die nach `WHERE` übrig bleiben.', en: '`COUNT(*)` counts all rows that remain after `WHERE`.' },
      ],
      worlds: [],
      databases: sportsDay,
      solution: {
        de: 'SELECT COUNT(*) AS anzahl\nFROM ergebnisse\nWHERE disziplin = \'Weitsprung\'',
        en: 'SELECT COUNT(*) AS number\nFROM results\nWHERE event = \'long jump\'',
      },
      check: { result: 'unordered' },
    },
    {
      id: 'sprint',
      title: { de: 'Bilanz im Sprint', en: 'Sprint summary' },
      text: {
        de: 'Gib für den `Sprint` die **höchste**, die **niedrigste** und die **durchschnittliche** Punktzahl aus – in dieser Reihenfolge und mit sinnvollen Spaltennamen.',
        en: 'For the `sprint`, output the **highest**, the **lowest** and the **average** number of points – in this order and with meaningful column names.',
      },
      hints: [
        { de: 'Mehrere Aggregatfunktionen dürfen nebeneinander stehen: `SELECT MAX(punkte) AS bester, …`', en: 'Several aggregate functions may stand side by side: `SELECT MAX(points) AS best, …`' },
      ],
      worlds: [],
      databases: sportsDay,
      solution: {
        de: 'SELECT MAX(punkte) AS hoechste, MIN(punkte) AS niedrigste, AVG(punkte) AS schnitt\nFROM ergebnisse\nWHERE disziplin = \'Sprint\'',
        en: 'SELECT MAX(points) AS highest, MIN(points) AS lowest, AVG(points) AS average\nFROM results\nWHERE event = \'sprint\'',
      },
      check: { result: 'unordered' },
    },
    {
      id: 'class-ranking',
      title: { de: 'Klassenwertung', en: 'Class ranking' },
      text: {
        de: 'Welche Klasse hat insgesamt die meisten Punkte gesammelt? Gib für **jede Klasse** ihren Namen und ihre Gesamtpunktzahl aus – die Klasse mit den meisten Punkten zuerst.',
        en: 'Which class collected the most points in total? Output the name and the total number of points of **every class** – the class with the most points first.',
      },
      hints: [
        { de: '`GROUP BY klasse` bildet je Klasse eine Gruppe, `SUM(punkte)` addiert die Punkte innerhalb der Gruppe.', en: '`GROUP BY class` forms one group per class, `SUM(points)` adds up the points within each group.' },
        { de: 'Nach einem Alias kannst du sortieren: `SUM(punkte) AS gesamt … ORDER BY gesamt DESC`', en: 'You can sort by an alias: `SUM(points) AS total … ORDER BY total DESC`' },
      ],
      worlds: [],
      databases: sportsDay,
      solution: {
        de: 'SELECT klasse, SUM(punkte) AS gesamt\nFROM ergebnisse\nGROUP BY klasse\nORDER BY gesamt DESC',
        en: 'SELECT class, SUM(points) AS total\nFROM results\nGROUP BY class\nORDER BY total DESC',
      },
      check: { result: 'ordered' },
      requires: ['groupBy'],
    },
    {
      id: 'certificates',
      title: { de: 'Urkunden', en: 'Certificates' },
      text: {
        de: 'Eine Urkunde bekommt, wer über alle Disziplinen zusammen **mindestens 100 Punkte** erreicht hat. Gib Name und Gesamtpunktzahl dieser Personen aus, alphabetisch nach Namen sortiert.',
        en: 'A certificate goes to everyone who scored **at least 100 points** across all events together. Output name and total points of these people, sorted alphabetically by name.',
      },
      hints: [
        { de: 'Erst je Person summieren (`GROUP BY name`), dann die Gruppen auswählen.', en: 'First add up per person (`GROUP BY name`), then select the groups.' },
        { de: '`WHERE` sieht nur einzelne Zeilen – Bedingungen an die Summe gehören in `HAVING SUM(punkte) >= 100`.', en: '`WHERE` only sees single rows – conditions on the sum belong in `HAVING SUM(points) >= 100`.' },
      ],
      worlds: [],
      databases: sportsDay,
      solution: {
        de: 'SELECT name, SUM(punkte) AS gesamt\nFROM ergebnisse\nGROUP BY name\nHAVING SUM(punkte) >= 100\nORDER BY name',
        en: 'SELECT name, SUM(points) AS total\nFROM results\nGROUP BY name\nHAVING SUM(points) >= 100\nORDER BY name',
      },
      check: { result: 'ordered' },
      requires: ['groupBy'],
    },
    {
      id: 'events',
      title: { de: 'Disziplinen im Vergleich', en: 'Events compared' },
      text: {
        de: `Die Sportlehrkräfte wollen die Disziplinen vergleichen. Dabei zählen nur **gültige** Ergebnisse (mehr als 0 Punkte).

Gib je Disziplin ihren Namen, die Anzahl der gültigen Ergebnisse und deren Durchschnitt aus – aber nur Disziplinen mit **mindestens 3** gültigen Ergebnissen. Sortiere nach dem Durchschnitt, den höchsten zuerst.`,
        en: `The PE teachers want to compare the events. Only **valid** results count (more than 0 points).

For each event, output its name, the number of valid results and their average – but only events with **at least 3** valid results. Sort by the average, highest first.`,
      },
      hints: [
        { de: 'Ungültige Ergebnisse sind einzelne Zeilen – die entfernt `WHERE`. „Mindestens 3 Ergebnisse“ betrifft die Gruppe – das prüft `HAVING`.', en: 'Invalid results are single rows – `WHERE` removes them. “At least 3 results” is about the group – `HAVING` checks that.' },
        { de: 'Reihenfolge der Teile: `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY …`', en: 'Order of the parts: `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY …`' },
      ],
      worlds: [],
      databases: sportsDay,
      solution: {
        de: 'SELECT disziplin, COUNT(*) AS anzahl, AVG(punkte) AS schnitt\nFROM ergebnisse\nWHERE punkte > 0\nGROUP BY disziplin\nHAVING COUNT(*) >= 3\nORDER BY schnitt DESC',
        en: 'SELECT event, COUNT(*) AS number, AVG(points) AS average\nFROM results\nWHERE points > 0\nGROUP BY event\nHAVING COUNT(*) >= 3\nORDER BY average DESC',
      },
      check: { result: 'ordered' },
      requires: ['groupBy'],
    },
  ],
}
