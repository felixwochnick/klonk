import type { LearnDatabase, LearnModule } from '../../types'

// Schulbibliothek: eine Tabelle Bücher, je Startsituation ein anderer Bestand und andere Ausleihen

const GENRES = {
  fantasy: { de: 'Fantasy', en: 'fantasy' },
  crime: { de: 'Krimi', en: 'crime' },
  nonfiction: { de: 'Sachbuch', en: 'non-fiction' },
  adventure: { de: 'Abenteuer', en: 'adventure' },
  comic: { de: 'Comic', en: 'comic' },
} as const

/** Bücher des Bestands: Titel de/en, Autor:in, Jahr, Seiten, Genre – Jahre und Seitenzahlen sind alle verschieden (eindeutige Sortierung) */
const BOOKS = {
  lastDragon: ['Der letzte Drache', 'The Last Dragon', 'Ina Berg', 2012, 320, 'fantasy'],
  snow: ['Spuren im Schnee', 'Tracks in the Snow', 'Paul Weber', 2008, 210, 'crime'],
  planets: ['Planeten und Sterne', 'Planets and Stars', 'Sara Kim', 2019, 96, 'nonfiction'],
  dragonGang: ['Die Drachenbande', 'The Dragon Gang', 'Tom Kranz', 2016, 64, 'comic'],
  forest: ['Der Zauberwald', 'The Magic Forest', 'Ina Berg', 2005, 180, 'fantasy'],
  river: ['Abenteuer am Fluss', 'Adventure on the River', 'Lena Hofmann', 2010, 150, 'adventure'],
  computers: ['Wie Computer denken', 'How Computers Think', 'Max Brandt', 2021, 128, 'nonfiction'],
  dragonfire: ['Drachenfeuer', 'Dragonfire', 'Ole Sander', 2014, 410, 'fantasy'],
  robots: ['Die Insel der Roboter', 'The Island of Robots', 'Lena Hofmann', 2018, 240, 'adventure'],
  kaya: ['Kommissarin Kaya ermittelt', 'Inspector Kaya Investigates', 'Paul Weber', 2001, 270, 'crime'],
  dragonEgg: ['Das Drachenei', 'The Dragon Egg', 'Ole Sander', 2017, 230, 'fantasy'],
  bees: ['Bienen verstehen', 'Understanding Bees', 'Sara Kim', 2020, 88, 'nonfiction'],
  redMark: ['Der Fall der roten Marke', 'The Case of the Red Mark', 'Paul Weber', 2013, 190, 'crime'],
  superKlonk: ['Superklonk', 'Super Klonk', 'Tom Kranz', 2022, 48, 'comic'],
  lotta: ['Lotta und der Drache', 'Lotta and the Dragon', 'Lena Hofmann', 2009, 140, 'adventure'],
  fridolin: ['Fridolin, der freche Drache', 'Fridolin the Cheeky Dragon', 'Tom Kranz', 2011, 56, 'comic'],
  castle: ['Das Geheimnis der Ziegelburg', 'The Secret of Brick Castle', 'Lena Hofmann', 2015, 260, 'adventure'],
} as const satisfies Record<string, readonly [string, string, string, number, number, keyof typeof GENRES]>

type Stock = [book: keyof typeof BOOKS, borrowedBy: string | null][]

const text = (value: string | null) => (value === null ? 'NULL' : `'${value.replace(/'/g, '\'\'')}'`)

function librarySql(stock: Stock, lang: 'de' | 'en') {
  const [table, columns] = lang === 'de'
    ? ['buecher', 'id INTEGER PRIMARY KEY,\n  titel TEXT NOT NULL,\n  autor TEXT NOT NULL,\n  jahr INTEGER,\n  seiten INTEGER,\n  genre TEXT,\n  ausgeliehen_von TEXT']
    : ['books', 'id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  author TEXT NOT NULL,\n  year INTEGER,\n  pages INTEGER,\n  genre TEXT,\n  borrowed_by TEXT']
  const rows = stock.map(([key, borrowedBy], i) => {
    const [de, en, author, year, pages, genre] = BOOKS[key]
    return `  (${i + 1}, ${text(lang === 'de' ? de : en)}, ${text(author)}, ${year}, ${pages}, ${text(GENRES[genre][lang])}, ${text(borrowedBy)})`
  })
  return `CREATE TABLE ${table} (\n  ${columns}\n);\nINSERT INTO ${table} VALUES\n${rows.join(',\n')};\n`
}

const STOCKS: Stock[] = [
  [['lastDragon', 'Mia'], ['snow', null], ['planets', 'Ben'], ['dragonGang', null], ['forest', null], ['river', 'Mia'],
    ['computers', null], ['dragonfire', 'Elif'], ['robots', null], ['kaya', 'Ben']],
  [['dragonEgg', null], ['bees', 'Jonas'], ['redMark', null], ['superKlonk', 'Lea'], ['lotta', null], ['forest', 'Lea'],
    ['fridolin', null], ['castle', null], ['snow', 'Jonas'], ['robots', 'Noah'], ['computers', null]],
  [['kaya', null], ['dragonfire', null], ['lastDragon', 'Elif'], ['dragonGang', 'Mia'], ['planets', null], ['river', null],
    ['dragonEgg', 'Mia'], ['forest', null], ['bees', 'Elif'], ['superKlonk', null]],
]

const library: LearnDatabase[] = [{
  name: { de: 'bibliothek', en: 'library' },
  sql: STOCKS.map(stock => ({ de: librarySql(stock, 'de'), en: librarySql(stock, 'en') })),
}]

export const sqlFilter: LearnModule = {
  id: 'sql-filter',
  track: 'sql',
  title: { de: 'Filtern und Sortieren', en: 'Filtering and sorting' },
  summary: {
    de: 'In der Schulbibliothek genau die richtigen Bücher finden: Bedingungen verknüpfen, Muster suchen, fehlende Werte erkennen, sortieren und begrenzen.',
    en: 'Find exactly the right books in the school library: combine conditions, search for patterns, spot missing values, sort and limit.',
  },
  objectives: [
    { de: 'Bedingungen mit Vergleichen sowie `AND`, `OR` und `NOT` formulieren und Klammern richtig setzen', en: 'Write conditions with comparisons and `AND`, `OR` and `NOT`, and place parentheses correctly' },
    { de: 'Mit `LIKE`, `BETWEEN`, `IN` und `IS NULL` gezielt Datensätze auswählen', en: 'Select records with `LIKE`, `BETWEEN`, `IN` and `IS NULL`' },
    { de: 'Ergebnisse mit `ORDER BY … DESC`, `LIMIT` und `DISTINCT` sortieren, begrenzen und Doppeltes entfernen', en: 'Sort, limit and de-duplicate results with `ORDER BY … DESC`, `LIMIT` and `DISTINCT`' },
  ],
  prerequisites: ['sql-select'],
  intro: {
    de: `Die Schulbibliothek verwaltet ihre Bücher in der Datenbank \`bibliothek\` (Datei im Aufgabenordner). Die Tabelle \`buecher\` hat die Spalten \`id\`, \`titel\`, \`autor\`, \`jahr\`, \`seiten\`, \`genre\` und \`ausgeliehen_von\` – dort steht, wer das Buch gerade hat, oder **NULL**, wenn es im Regal steht.

Bedingungen lassen sich verknüpfen und verfeinern:

\`\`\`sql
SELECT titel, jahr
FROM buecher
WHERE (genre = 'Krimi' OR genre = 'Sachbuch')
  AND jahr >= 2010
  AND ausgeliehen_von IS NULL
ORDER BY jahr DESC
LIMIT 3
\`\`\`

- Vergleiche: \`=\`, \`<>\` (ungleich), \`<\`, \`<=\`, \`>\`, \`>=\`
- \`AND\` (beides), \`OR\` (mindestens eins), \`NOT\` (nicht) – \`AND\` bindet stärker als \`OR\`, setze daher Klammern
- \`titel LIKE '%Stern%'\` – Muster: \`%\` steht für beliebig viele Zeichen, \`_\` für genau eins
- \`seiten BETWEEN 100 AND 200\` – von 100 bis einschließlich 200
- \`genre IN ('Krimi', 'Comic')\` – einer der aufgezählten Werte
- \`ausgeliehen_von IS NULL\` bzw. \`IS NOT NULL\` – fehlender Wert (\`= NULL\` funktioniert **nicht**)
- \`ORDER BY jahr DESC\` – absteigend; \`LIMIT 3\` – nur die ersten drei Zeilen
- \`SELECT DISTINCT autor …\` – jede Zeile nur einmal

Klonk prüft deine Abfrage mit mehreren Beständen der Bibliothek – sie muss also für alle Daten stimmen, nicht nur für die in der Datei.`,
    en: `The school library manages its books in the database \`library\` (file in the task folder). The table \`books\` has the columns \`id\`, \`title\`, \`author\`, \`year\`, \`pages\`, \`genre\` and \`borrowed_by\` – it holds who has the book at the moment, or **NULL** if it is on the shelf.

Conditions can be combined and refined:

\`\`\`sql
SELECT title, year
FROM books
WHERE (genre = 'crime' OR genre = 'non-fiction')
  AND year >= 2010
  AND borrowed_by IS NULL
ORDER BY year DESC
LIMIT 3
\`\`\`

- Comparisons: \`=\`, \`<>\` (not equal), \`<\`, \`<=\`, \`>\`, \`>=\`
- \`AND\` (both), \`OR\` (at least one), \`NOT\` (not) – \`AND\` binds more strongly than \`OR\`, so use parentheses
- \`title LIKE '%Star%'\` – pattern: \`%\` stands for any number of characters, \`_\` for exactly one
- \`pages BETWEEN 100 AND 200\` – from 100 up to and including 200
- \`genre IN ('crime', 'comic')\` – one of the listed values
- \`borrowed_by IS NULL\` or \`IS NOT NULL\` – missing value (\`= NULL\` does **not** work)
- \`ORDER BY year DESC\` – descending; \`LIMIT 3\` – only the first three rows
- \`SELECT DISTINCT author …\` – each row only once

Klonk checks your query with several library stocks – so it must be right for all data, not just for the data in the file.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** S1. S2 ist nicht nötig – das Modul arbeitet mit einer eigenen Datenbank statt der Welt.

**Idee:** Eine einzige, überschaubare Tabelle (Relation) mit realistischen Daten. Jede Aufgabe wird mit drei verschiedenen Beständen geprüft; wer das Ergebnis aus der Datei abliest und fest einträgt, scheitert an den anderen. Sortierte Aufgaben sind so gestellt, dass die Reihenfolge eindeutig ist.

**Begriffe:** Tabelle, Attribut, Datensatz, Attributwert, Nullwert (NULL = kein Wert, nicht 0 und nicht leerer Text). Die Bedingung hinter \`WHERE\` entspricht der Selektion, die Spaltenauswahl hinter \`SELECT\` der Projektion.

**Typische Schwierigkeiten:**
- \`= NULL\` statt \`IS NULL\` – liefert nie eine Zeile
- \`OR\` ohne Klammern neben \`AND\` (Aufgabe 4) – \`a OR b AND c\` bedeutet \`a OR (b AND c)\`
- \`LIKE\` ohne \`%\` sucht exakt; in SQLite ignoriert \`LIKE\` Groß- und Kleinschreibung (außer bei Umlauten)
- \`DISTINCT\` gilt für die ganze Zeile, nicht für eine einzelne Spalte
- \`LIMIT\` ohne \`ORDER BY\` liefert irgendwelche Zeilen

**Differenzierung:** Aufgabe 4 lässt sich zuerst mit \`OR\` und Vergleichen lösen und danach mit \`IN\` und \`BETWEEN\` verkürzen. Schnelle Lernende formulieren eigene Suchanfragen („alle Bücher von Ina Berg, die nicht ausgeliehen sind“).

**Weiterführend:** S4 zählt und gruppiert (\`COUNT\`, \`GROUP BY\`).`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** S1. S2 is not required – the module uses its own database instead of the world.

**Idea:** A single, clear table (relation) with realistic data. Every task is checked with three different stocks; anyone who reads the result off the file and hard-codes it fails on the others. Sorted tasks are designed so that the order is unambiguous.

**Terms:** table, attribute, record, attribute value, null value (NULL = no value, not 0 and not empty text). The condition after \`WHERE\` corresponds to selection, the choice of columns after \`SELECT\` to projection.

**Typical difficulties:**
- \`= NULL\` instead of \`IS NULL\` – never returns a row
- \`OR\` without parentheses next to \`AND\` (task 4) – \`a OR b AND c\` means \`a OR (b AND c)\`
- \`LIKE\` without \`%\` searches for an exact match; in SQLite \`LIKE\` ignores upper/lower case (for ASCII letters)
- \`DISTINCT\` applies to the whole row, not to a single column
- \`LIMIT\` without \`ORDER BY\` returns arbitrary rows

**Differentiation:** Task 4 can first be solved with \`OR\` and comparisons and then shortened with \`IN\` and \`BETWEEN\`. Fast learners write their own searches (“all books by Ina Berg that are not borrowed”).

**Next:** S4 counts and groups (\`COUNT\`, \`GROUP BY\`).`,
  },
  tasks: [
    {
      id: 'new-fantasy',
      title: { de: 'Neue Fantasy', en: 'New fantasy' },
      text: {
        de: 'Welche Bücher aus dem Genre `Fantasy` sind **2010 oder später** erschienen? Gib Titel und Erscheinungsjahr aus.',
        en: 'Which books of the genre `fantasy` were published **in 2010 or later**? Output title and year of publication.',
      },
      hints: [
        { de: 'Zwei Bedingungen, die beide gelten müssen, verbindest du mit `AND`.', en: 'Combine two conditions that must both hold with `AND`.' },
        { de: '„2010 oder später“ heißt `jahr >= 2010`.', en: '“2010 or later” means `year >= 2010`.' },
      ],
      worlds: [],
      databases: library,
      solution: {
        de: 'SELECT titel, jahr\nFROM buecher\nWHERE genre = \'Fantasy\' AND jahr >= 2010',
        en: 'SELECT title, year\nFROM books\nWHERE genre = \'fantasy\' AND year >= 2010',
      },
      check: { result: 'unordered' },
    },
    {
      id: 'borrowers',
      title: { de: 'Wer liest gerade', en: 'Who is reading' },
      text: {
        de: 'Wer hat gerade mindestens ein Buch ausgeliehen? Gib jeden Namen **nur einmal** aus, alphabetisch sortiert.',
        en: 'Who has borrowed at least one book at the moment? Output each name **only once**, sorted alphabetically.',
      },
      hints: [
        { de: 'Bücher im Regal haben in `ausgeliehen_von` keinen Wert: `IS NOT NULL` filtert sie heraus.', en: 'Books on the shelf have no value in `borrowed_by`: `IS NOT NULL` filters them out.' },
        { de: 'Wer zwei Bücher hat, steht zweimal in der Tabelle – `SELECT DISTINCT` entfernt doppelte Zeilen.', en: 'Anyone with two books appears twice in the table – `SELECT DISTINCT` removes duplicate rows.' },
      ],
      worlds: [],
      databases: library,
      solution: {
        de: 'SELECT DISTINCT ausgeliehen_von\nFROM buecher\nWHERE ausgeliehen_von IS NOT NULL\nORDER BY ausgeliehen_von',
        en: 'SELECT DISTINCT borrowed_by\nFROM books\nWHERE borrowed_by IS NOT NULL\nORDER BY borrowed_by',
      },
      check: { result: 'ordered' },
    },
    {
      id: 'dragons',
      title: { de: 'Drachen gesucht', en: 'Looking for dragons' },
      text: {
        de: 'Ben mag Drachen, aber keine Comics. Gib die Titel aller Bücher aus, in deren Titel das Wort `Drache` vorkommt (auch als Teil eines Worts wie in „Drachenfeuer“) – aber **keine** Comics.',
        en: 'Ben likes dragons, but not comics. Output the titles of all books whose title contains the word `Dragon` (also as part of a word as in “Dragonfire”) – but **no** comics.',
      },
      hints: [
        { de: '`titel LIKE \'%Drache%\'` passt auf alle Titel, in denen „Drache“ irgendwo vorkommt.', en: '`title LIKE \'%Dragon%\'` matches all titles that contain “Dragon” anywhere.' },
        { de: 'Comics schließt du mit `NOT genre = \'Comic\'` oder `genre <> \'Comic\'` aus.', en: 'Exclude comics with `NOT genre = \'comic\'` or `genre <> \'comic\'`.' },
      ],
      worlds: [],
      databases: library,
      solution: {
        de: 'SELECT titel\nFROM buecher\nWHERE titel LIKE \'%Drache%\' AND NOT genre = \'Comic\'',
        en: 'SELECT title\nFROM books\nWHERE title LIKE \'%Dragon%\' AND NOT genre = \'comic\'',
      },
      check: { result: 'unordered' },
    },
    {
      id: 'read-aloud',
      title: { de: 'Ein Buch zum Vorlesen', en: 'A book to read aloud' },
      text: {
        de: `Frau Lang sucht ein Buch zum Vorlesen. Es soll

- ein Abenteuer- **oder** ein Fantasy-Buch sein,
- mindestens 100 und höchstens 250 Seiten haben und
- gerade im Regal stehen (nicht ausgeliehen sein).

Gib Titel und Seitenzahl aus, sortiert nach der Seitenzahl – das kürzeste Buch zuerst.`,
        en: `Ms Lang is looking for a book to read aloud. It should

- be an adventure **or** a fantasy book,
- have at least 100 and at most 250 pages and
- be on the shelf right now (not borrowed).

Output title and number of pages, sorted by the number of pages – the shortest book first.`,
      },
      hints: [
        { de: '`AND` bindet stärker als `OR`. Setze die Bedingung mit `OR` in Klammern – oder nimm `genre IN (\'Abenteuer\', \'Fantasy\')`.', en: '`AND` binds more strongly than `OR`. Put the condition with `OR` in parentheses – or use `genre IN (\'adventure\', \'fantasy\')`.' },
        { de: '`seiten BETWEEN 100 AND 250` schließt beide Grenzen ein.', en: '`pages BETWEEN 100 AND 250` includes both limits.' },
      ],
      worlds: [],
      databases: library,
      solution: {
        de: 'SELECT titel, seiten\nFROM buecher\nWHERE genre IN (\'Abenteuer\', \'Fantasy\')\n  AND seiten BETWEEN 100 AND 250\n  AND ausgeliehen_von IS NULL\nORDER BY seiten',
        en: 'SELECT title, pages\nFROM books\nWHERE genre IN (\'adventure\', \'fantasy\')\n  AND pages BETWEEN 100 AND 250\n  AND borrowed_by IS NULL\nORDER BY pages',
      },
      check: { result: 'ordered' },
    },
    {
      id: 'newest',
      title: { de: 'Die neuesten im Regal', en: 'The newest on the shelf' },
      text: {
        de: 'Für das Schaufenster der Bibliothek: Gib Titel und Erscheinungsjahr der **drei neuesten** Bücher aus, die gerade **im Regal** stehen – das neueste zuerst.',
        en: 'For the library window: output title and year of the **three newest** books that are **on the shelf** right now – the newest first.',
      },
      hints: [
        { de: '`ORDER BY jahr DESC` sortiert absteigend, `LIMIT 3` behält nur die ersten drei Zeilen.', en: '`ORDER BY year DESC` sorts in descending order, `LIMIT 3` keeps only the first three rows.' },
        { de: 'Erst filtern (`WHERE`), dann sortieren, dann begrenzen – in dieser Reihenfolge steht es auch in der Abfrage.', en: 'First filter (`WHERE`), then sort, then limit – that is also the order in the query.' },
      ],
      worlds: [],
      databases: library,
      solution: {
        de: 'SELECT titel, jahr\nFROM buecher\nWHERE ausgeliehen_von IS NULL\nORDER BY jahr DESC\nLIMIT 3',
        en: 'SELECT title, year\nFROM books\nWHERE borrowed_by IS NULL\nORDER BY year DESC\nLIMIT 3',
      },
      check: { result: 'ordered' },
    },
  ],
}
