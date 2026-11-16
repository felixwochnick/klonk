import type { LearnDatabase, LearnModule } from '../../types'

// Schülerzeitung: Die Datenbank wächst von Aufgabe zu Aufgabe – jede Aufgabe bringt die Tabellen der vorigen mit Daten mit

type Lang = 'de' | 'en'

const AUTHORS: [name: string, form: string][] = [['Jonas Weber', '9a'], ['Mia Krüger', '8b'], ['Elif Demir', '10a'], ['Tom Becker', '7c']]
const ISSUES: [title: { de: string, en: string }, date: string, copies: number][] = [
  [{ de: 'Herbstausgabe', en: 'Autumn issue' }, '2026-10-09', 150],
  [{ de: 'Winterausgabe', en: 'Winter issue' }, '2026-12-18', 200],
  [{ de: 'Frühlingsausgabe', en: 'Spring issue' }, '2027-03-26', 180],
]
const ARTICLES: [title: { de: string, en: string }, page: number, issue: number][] = [
  [{ de: 'Neue Bänke für den Pausenhof', en: 'New benches for the playground' }, 3, 2],
  [{ de: 'Interview mit unserer Hausmeisterin', en: 'Interview with our caretaker' }, 5, 2],
  [{ de: 'Unser Schulgarten blüht', en: 'Our school garden is blooming' }, 2, 3],
]

const N = {
  de: {
    authors: 'autoren', form: 'klasse',
    issues: 'ausgaben', number: 'nummer', title: 'titel', published: 'erschienen', copies: 'auflage',
    articles: 'artikel', page: 'seite', authorId: 'autor_id', issue: 'ausgabe',
    contributions: 'mitarbeit', articleId: 'artikel_id',
  },
  en: {
    authors: 'authors', form: 'class',
    issues: 'issues', number: 'number', title: 'title', published: 'published', copies: 'copies',
    articles: 'articles', page: 'page', authorId: 'author_id', issue: 'issue',
    contributions: 'contributions', articleId: 'article_id',
  },
} as const

const quote = (value: string) => `'${value.replace(/'/g, '\'\'')}'`

const authorsSql = (lang: Lang) => {
  const n = N[lang]
  return `CREATE TABLE ${n.authors} (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  ${n.form} TEXT\n);
INSERT INTO ${n.authors} VALUES\n${AUTHORS.map(([name, form], i) => `  (${i + 1}, ${quote(name)}, ${quote(form)})`).join(',\n')};\n`
}
const issuesSql = (lang: Lang) => {
  const n = N[lang]
  return `CREATE TABLE ${n.issues} (\n  ${n.number} INTEGER PRIMARY KEY,\n  ${n.title} TEXT NOT NULL,\n  ${n.published} DATE,\n  ${n.copies} INTEGER\n);
INSERT INTO ${n.issues} VALUES\n${ISSUES.map(([title, date, copies], i) => `  (${i + 1}, ${quote(title[lang])}, ${quote(date)}, ${copies})`).join(',\n')};\n`
}
/** Artikel nach dem Umbau für Aufgabe 4: ohne `autor_id`, die Autorenschaft steht in der Zwischentabelle */
const articlesSql = (lang: Lang) => {
  const n = N[lang]
  return `CREATE TABLE ${n.articles} (\n  id INTEGER PRIMARY KEY,\n  ${n.title} TEXT NOT NULL,\n  ${n.page} INTEGER,\n  ${n.issue} INTEGER REFERENCES ${n.issues}(${n.number})\n);
INSERT INTO ${n.articles} VALUES\n${ARTICLES.map(([title, page, issue], i) => `  (${i + 1}, ${quote(title[lang])}, ${page}, ${issue})`).join(',\n')};\n`
}

const NAME = { de: 'schuelerzeitung', en: 'school_paper' }
const paper = (parts: ((lang: Lang) => string)[]): LearnDatabase[] => [{
  name: NAME,
  sql: {
    de: parts.length ? parts.map(part => part('de')).join('') : '-- Die Datenbank der Schülerzeitung ist noch leer.\n',
    en: parts.length ? parts.map(part => part('en')).join('') : '-- The database of the school paper is still empty.\n',
  },
}]

export const sqlCreate: LearnModule = {
  id: 'sql-create',
  track: 'sql',
  title: { de: 'Tabellen anlegen', en: 'Creating tables' },
  summary: {
    de: 'Die Datenbank der Schülerzeitung selbst aufbauen: Tabellen mit Datentypen, Primär- und Fremdschlüsseln anlegen und mit Daten füllen.',
    en: 'Build the school paper’s database yourself: create tables with data types, primary and foreign keys and fill them with data.',
  },
  objectives: [
    { de: 'Mit `CREATE TABLE` eine Tabelle mit passenden Datentypen (`INTEGER`, `TEXT`, `DATE`) und `NOT NULL` anlegen', en: 'Create a table with suitable data types (`INTEGER`, `TEXT`, `DATE`) and `NOT NULL` using `CREATE TABLE`' },
    { de: 'Primärschlüssel festlegen – auch aus zwei Spalten – und Fremdschlüssel mit `REFERENCES` auf eine andere Tabelle verweisen lassen', en: 'Define primary keys – also made of two columns – and let foreign keys refer to another table with `REFERENCES`' },
    { de: 'Eine n:m-Beziehung als Zwischentabelle umsetzen und Daten passend zu den Schlüsseln einfügen', en: 'Implement an n:m relationship as a junction table and insert data that matches the keys' },
  ],
  prerequisites: ['sql-join'],
  intro: {
    de: `Bisher waren die Tabellen schon da. Jetzt baust du die Datenbank \`schuelerzeitung\` selbst auf. Eine Tabelle legst du mit **CREATE TABLE** an:

\`\`\`sql
CREATE TABLE ausgaben (
  nummer INTEGER PRIMARY KEY,
  titel TEXT NOT NULL,
  erschienen DATE,
  auflage INTEGER
);
\`\`\`

Jede Spalte bekommt einen Namen und einen **Datentyp**: \`INTEGER\` (ganze Zahl), \`REAL\` (Kommazahl), \`TEXT\` (Text, auch \`VARCHAR(50)\`), \`DATE\` (Datum, geschrieben als \`'2026-10-09'\`).

- \`PRIMARY KEY\` – der **Primärschlüssel**: Sein Wert ist in jeder Zeile anders und kennzeichnet den Datensatz eindeutig
- \`NOT NULL\` – die Spalte muss immer einen Wert haben
- \`REFERENCES ausgaben(nummer)\` – ein **Fremdschlüssel**: Es dürfen nur Werte vorkommen, die es in \`ausgaben.nummer\` gibt

Ein Primärschlüssel aus mehreren Spalten und Fremdschlüssel lassen sich auch am Ende der Spaltenliste angeben:

\`\`\`sql
CREATE TABLE beispiel (
  a_id INTEGER REFERENCES a(id),
  b_id INTEGER,
  PRIMARY KEY (a_id, b_id),
  FOREIGN KEY (b_id) REFERENCES b(id)
);
\`\`\`

Daten fügst du wie in S2 mit \`INSERT INTO … VALUES …\` ein. Klonk prüft den Aufbau deiner Tabellen (Spalten, Datentypen, Schlüssel) und – wo verlangt – ihren Inhalt. Halte dich daher genau an die Namen aus der Aufgabe.`,
    en: `So far the tables were already there. Now you build the database \`school_paper\` yourself. You create a table with **CREATE TABLE**:

\`\`\`sql
CREATE TABLE issues (
  number INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  published DATE,
  copies INTEGER
);
\`\`\`

Every column gets a name and a **data type**: \`INTEGER\` (whole number), \`REAL\` (decimal number), \`TEXT\` (text, also \`VARCHAR(50)\`), \`DATE\` (date, written as \`'2026-10-09'\`).

- \`PRIMARY KEY\` – the **primary key**: its value differs in every row and identifies the record uniquely
- \`NOT NULL\` – the column must always have a value
- \`REFERENCES issues(number)\` – a **foreign key**: only values that exist in \`issues.number\` are allowed

A primary key made of several columns and foreign keys can also be given at the end of the column list:

\`\`\`sql
CREATE TABLE example (
  a_id INTEGER REFERENCES a(id),
  b_id INTEGER,
  PRIMARY KEY (a_id, b_id),
  FOREIGN KEY (b_id) REFERENCES b(id)
);
\`\`\`

You insert data as in S2 with \`INSERT INTO … VALUES …\`. Klonk checks the structure of your tables (columns, data types, keys) and – where required – their content. So stick exactly to the names in the task.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** S5 (Primär-/Fremdschlüssel, 1:n und n:m lesen), \`INSERT\` aus S2.

**Idee:** Die Lernenden setzen ein vorgegebenes Datenmodell um und erleben die Datenbank als wachsendes Projekt: Jede Aufgabe bringt die Tabellen der vorigen mit Daten mit. Vom ER-Modell zum Relationenschema: Aus Entitätstypen werden Tabellen, aus 1:n-Beziehungen Fremdschlüssel, aus n:m-Beziehungen Zwischentabellen mit zusammengesetztem Primärschlüssel. Nach jeder Aufgabe lohnt ein Blick in das **ER-Diagramm**, das Klonk aus der Datenbank erzeugt (Datenbankdatei öffnen, Tab „ER-Diagramm“) – die eigenen Fremdschlüssel erscheinen dort als Beziehungen.

**Prüfung:** Klonk vergleicht Spaltennamen, Datentypen (nach SQLite-Typaffinität: \`INT\` = \`INTEGER\`, \`VARCHAR(n)\` = \`TEXT\`, \`FLOAT\`/\`DOUBLE\` = \`REAL\`; \`DATE\` hat die Affinität NUMERIC und zählt nicht als \`TEXT\`), \`NOT NULL\`, Primär- und Fremdschlüssel und in den Aufgaben 2–4 den Inhalt. Die Reihenfolge der Spalten ist frei. Da nur Aufbau und vorgegebene Daten zählen, gibt es hier keine wechselnden Datensätze.

**Begriffe:** Relationenschema, Datentyp/Wertebereich, Primärschlüssel, zusammengesetzter Schlüssel, Fremdschlüssel, referenzielle Integrität, Kardinalität.

**Typische Schwierigkeiten:**
- Komma nach der letzten Spalte oder fehlende Klammer
- Datumswerte ohne Anführungszeichen (\`2026-10-09\` wird als Rechnung 2026 − 10 − 9 gelesen)
- zwei Spalten mit je \`PRIMARY KEY\` statt \`PRIMARY KEY (a, b)\` – Fehler „has more than one primary key“
- Fremdschlüssel auf nicht vorhandene Werte – „FOREIGN KEY constraint failed“: Klonk prüft die referenzielle Integrität wie andere Datenbanksysteme
- Zahlen in Anführungszeichen: \`'3'\` ist Text, in einer \`INTEGER\`-Spalte wandelt SQLite ihn aber um

**Differenzierung:** Schnelle Lernende entwerfen eine weitere Tabelle (z. B. Fotos zu Artikeln, 1:n) selbst, zeichnen vorher das ER-Diagramm und vergleichen es mit dem, das Klonk erzeugt.

**Weiterführend:** S7 (Unterabfragen).`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** S5 (reading primary/foreign keys, 1:n and n:m), \`INSERT\` from S2.

**Idea:** Students implement a given data model and experience the database as a growing project: each task brings along the tables of the previous one with data. From the ER model to the relational schema: entity types become tables, 1:n relationships foreign keys, n:m relationships junction tables with a composite primary key. After each task it is worth looking at the **ER diagram** that Klonk generates from the database (open the database file, tab “ER diagram”) – the students’ own foreign keys appear there as relationships.

**Checking:** Klonk compares column names, data types (by SQLite type affinity: \`INT\` = \`INTEGER\`, \`VARCHAR(n)\` = \`TEXT\`, \`FLOAT\`/\`DOUBLE\` = \`REAL\`; \`DATE\` has the affinity NUMERIC and does not count as \`TEXT\`), \`NOT NULL\`, primary and foreign keys and, in tasks 2–4, the content. The order of the columns is free. Since only the structure and given data count, there are no changing data sets here.

**Terms:** relational schema, data type/domain, primary key, composite key, foreign key, referential integrity, cardinality.

**Typical difficulties:**
- comma after the last column or a missing parenthesis
- date values without quotes (\`2026-10-09\` is read as the calculation 2026 − 10 − 9)
- two columns each with \`PRIMARY KEY\` instead of \`PRIMARY KEY (a, b)\` – error “has more than one primary key”
- foreign keys to non-existent values – “FOREIGN KEY constraint failed”: Klonk checks referential integrity like other database systems
- numbers in quotes: \`'3'\` is text, but SQLite converts it in an \`INTEGER\` column

**Differentiation:** Fast learners design a further table themselves (e.g. photos for articles, 1:n), draw the ER diagram first and compare it with the one Klonk generates.

**Next:** S7 (subqueries).`,
  },
  tasks: [
    {
      id: 'authors',
      title: { de: 'Die Redaktion', en: 'The editorial team' },
      text: {
        de: `Die Schülerzeitung braucht eine Datenbank. Lege zuerst die Tabelle \`autoren\` an – mit diesen Spalten:

- \`id\` – ganze Zahl (\`INTEGER\`), Primärschlüssel
- \`name\` – Text (\`TEXT\`), muss immer ausgefüllt sein
- \`klasse\` – Text (\`TEXT\`)`,
        en: `The school paper needs a database. First create the table \`authors\` – with these columns:

- \`id\` – whole number (\`INTEGER\`), primary key
- \`name\` – text (\`TEXT\`), must always be filled in
- \`class\` – text (\`TEXT\`)`,
      },
      hints: [
        { de: 'Aufbau: `CREATE TABLE autoren (spalte TYP, spalte TYP, …)` – die Spalten durch Komma getrennt, nach der letzten kein Komma.', en: 'Structure: `CREATE TABLE authors (column TYPE, column TYPE, …)` – columns separated by commas, no comma after the last one.' },
        { de: '„Muss ausgefüllt sein“ heißt `NOT NULL`, der Primärschlüssel bekommt `PRIMARY KEY`.', en: '“Must be filled in” means `NOT NULL`; the primary key gets `PRIMARY KEY`.' },
      ],
      worlds: [],
      databases: paper([]),
      solution: {
        de: 'CREATE TABLE autoren (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  klasse TEXT\n);',
        en: 'CREATE TABLE authors (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  class TEXT\n);',
      },
      check: { schema: [{ de: 'autoren', en: 'authors' }] },
    },
    {
      id: 'issues',
      title: { de: 'Die Ausgaben', en: 'The issues' },
      text: {
        de: `Die Redaktion ist eingetragen. Jetzt fehlen die Ausgaben der Zeitung. Lege die Tabelle \`ausgaben\` an:

- \`nummer\` – \`INTEGER\`, Primärschlüssel
- \`titel\` – \`TEXT\`, muss immer ausgefüllt sein
- \`erschienen\` – \`DATE\`
- \`auflage\` – \`INTEGER\` (wie viele Hefte gedruckt werden)

Trage danach die drei Ausgaben dieses Schuljahrs ein:

- Nummer 1: „Herbstausgabe“, erschienen am \`2026-10-09\`, Auflage 150
- Nummer 2: „Winterausgabe“, erschienen am \`2026-12-18\`, Auflage 200
- Nummer 3: „Frühlingsausgabe“, erschienen am \`2027-03-26\`, Auflage 180`,
        en: `The editorial team is entered. Now the issues of the paper are missing. Create the table \`issues\`:

- \`number\` – \`INTEGER\`, primary key
- \`title\` – \`TEXT\`, must always be filled in
- \`published\` – \`DATE\`
- \`copies\` – \`INTEGER\` (how many copies are printed)

Then enter the three issues of this school year:

- Number 1: “Autumn issue”, published on \`2026-10-09\`, 150 copies
- Number 2: “Winter issue”, published on \`2026-12-18\`, 200 copies
- Number 3: “Spring issue”, published on \`2027-03-26\`, 180 copies`,
      },
      hints: [
        { de: 'Erst `CREATE TABLE …;`, dann `INSERT INTO ausgaben VALUES (…), (…), (…);` – die Anweisungen trennst du mit `;`.', en: 'First `CREATE TABLE …;`, then `INSERT INTO issues VALUES (…), (…), (…);` – separate the statements with `;`.' },
        { de: 'Text und Datum stehen in einfachen Anführungszeichen: `\'2026-10-09\'`.', en: 'Text and dates go in single quotes: `\'2026-10-09\'`.' },
      ],
      worlds: [],
      databases: paper([authorsSql]),
      solution: {
        de: 'CREATE TABLE ausgaben (\n  nummer INTEGER PRIMARY KEY,\n  titel TEXT NOT NULL,\n  erschienen DATE,\n  auflage INTEGER\n);\nINSERT INTO ausgaben VALUES\n  (1, \'Herbstausgabe\', \'2026-10-09\', 150),\n  (2, \'Winterausgabe\', \'2026-12-18\', 200),\n  (3, \'Frühlingsausgabe\', \'2027-03-26\', 180);',
        en: 'CREATE TABLE issues (\n  number INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  published DATE,\n  copies INTEGER\n);\nINSERT INTO issues VALUES\n  (1, \'Autumn issue\', \'2026-10-09\', 150),\n  (2, \'Winter issue\', \'2026-12-18\', 200),\n  (3, \'Spring issue\', \'2027-03-26\', 180);',
      },
      check: { schema: [{ de: 'ausgaben', en: 'issues' }], tables: [{ de: 'ausgaben', en: 'issues' }] },
    },
    {
      id: 'articles',
      title: { de: 'Die Artikel', en: 'The articles' },
      text: {
        de: `Jeder Artikel hat eine Autorin oder einen Autor und erscheint in einer Ausgabe. Lege die Tabelle \`artikel\` an:

- \`id\` – \`INTEGER\`, Primärschlüssel
- \`titel\` – \`TEXT\`, muss immer ausgefüllt sein
- \`seite\` – \`INTEGER\`
- \`autor_id\` – \`INTEGER\`, Fremdschlüssel auf \`autoren(id)\`
- \`ausgabe\` – \`INTEGER\`, Fremdschlüssel auf \`ausgaben(nummer)\`

Trage danach diese beiden Artikel ein – die passenden Nummern findest du in den Tabellen \`autoren\` und \`ausgaben\`:

- Artikel 1: „Neue Bänke für den Pausenhof“ von Mia Krüger, Seite 3 der Winterausgabe
- Artikel 2: „Unser Schulgarten blüht“ von Tom Becker, Seite 2 der Frühlingsausgabe`,
        en: `Every article has an author and appears in an issue. Create the table \`articles\`:

- \`id\` – \`INTEGER\`, primary key
- \`title\` – \`TEXT\`, must always be filled in
- \`page\` – \`INTEGER\`
- \`author_id\` – \`INTEGER\`, foreign key to \`authors(id)\`
- \`issue\` – \`INTEGER\`, foreign key to \`issues(number)\`

Then enter these two articles – you find the matching numbers in the tables \`authors\` and \`issues\`:

- Article 1: “New benches for the playground” by Mia Krüger, page 3 of the winter issue
- Article 2: “Our school garden is blooming” by Tom Becker, page 2 of the spring issue`,
      },
      hints: [
        { de: 'Ein Fremdschlüssel: `autor_id INTEGER REFERENCES autoren(id)`', en: 'A foreign key: `author_id INTEGER REFERENCES authors(id)`' },
        { de: 'Mit `SELECT * FROM autoren;` siehst du die IDs. In `artikel` steht dann die Zahl, nicht der Name.', en: 'With `SELECT * FROM authors;` you see the IDs. The table `articles` then holds the number, not the name.' },
      ],
      worlds: [],
      databases: paper([authorsSql, issuesSql]),
      solution: {
        de: 'CREATE TABLE artikel (\n  id INTEGER PRIMARY KEY,\n  titel TEXT NOT NULL,\n  seite INTEGER,\n  autor_id INTEGER REFERENCES autoren(id),\n  ausgabe INTEGER REFERENCES ausgaben(nummer)\n);\nINSERT INTO artikel VALUES\n  (1, \'Neue Bänke für den Pausenhof\', 3, 2, 2),\n  (2, \'Unser Schulgarten blüht\', 2, 4, 3);',
        en: 'CREATE TABLE articles (\n  id INTEGER PRIMARY KEY,\n  title TEXT NOT NULL,\n  page INTEGER,\n  author_id INTEGER REFERENCES authors(id),\n  issue INTEGER REFERENCES issues(number)\n);\nINSERT INTO articles VALUES\n  (1, \'New benches for the playground\', 3, 2, 2),\n  (2, \'Our school garden is blooming\', 2, 4, 3);',
      },
      check: { schema: [{ de: 'artikel', en: 'articles' }], tables: [{ de: 'artikel', en: 'articles' }] },
    },
    {
      id: 'contributions',
      title: { de: 'Gemeinsam geschrieben', en: 'Written together' },
      text: {
        de: `Viele Artikel schreiben mehrere Leute gemeinsam, und jede Person schreibt mehrere Artikel – eine **n:m-Beziehung**. Die Redaktion hat \`autor_id\` deshalb aus \`artikel\` entfernt. Lege die Zwischentabelle \`mitarbeit\` an:

- \`autor_id\` – \`INTEGER\`, Fremdschlüssel auf \`autoren(id)\`
- \`artikel_id\` – \`INTEGER\`, Fremdschlüssel auf \`artikel(id)\`
- Primärschlüssel sind **beide Spalten zusammen**

Trage dann ein, wer woran mitgeschrieben hat:

- „Neue Bänke für den Pausenhof“: Mia Krüger und Jonas Weber
- „Interview mit unserer Hausmeisterin“: Elif Demir
- „Unser Schulgarten blüht“: Elif Demir, Mia Krüger und Tom Becker`,
        en: `Many articles are written by several people together, and every person writes several articles – an **n:m relationship**. The editorial team has therefore removed \`author_id\` from \`articles\`. Create the junction table \`contributions\`:

- \`author_id\` – \`INTEGER\`, foreign key to \`authors(id)\`
- \`article_id\` – \`INTEGER\`, foreign key to \`articles(id)\`
- The primary key is **both columns together**

Then enter who contributed to what:

- “New benches for the playground”: Mia Krüger and Jonas Weber
- “Interview with our caretaker”: Elif Demir
- “Our school garden is blooming”: Elif Demir, Mia Krüger and Tom Becker`,
      },
      hints: [
        { de: 'Ein zusammengesetzter Primärschlüssel steht nach den Spalten: `PRIMARY KEY (autor_id, artikel_id)`', en: 'A composite primary key goes after the columns: `PRIMARY KEY (author_id, article_id)`' },
        { de: 'Jede Zeile von `mitarbeit` verbindet genau eine Person mit genau einem Artikel – für drei Personen an einem Artikel brauchst du drei Zeilen.', en: 'Every row of `contributions` connects exactly one person with exactly one article – three people on one article need three rows.' },
      ],
      worlds: [],
      databases: paper([authorsSql, issuesSql, articlesSql]),
      solution: {
        de: 'CREATE TABLE mitarbeit (\n  autor_id INTEGER REFERENCES autoren(id),\n  artikel_id INTEGER REFERENCES artikel(id),\n  PRIMARY KEY (autor_id, artikel_id)\n);\nINSERT INTO mitarbeit VALUES\n  (2, 1), (1, 1),\n  (3, 2),\n  (3, 3), (2, 3), (4, 3);',
        en: 'CREATE TABLE contributions (\n  author_id INTEGER REFERENCES authors(id),\n  article_id INTEGER REFERENCES articles(id),\n  PRIMARY KEY (author_id, article_id)\n);\nINSERT INTO contributions VALUES\n  (2, 1), (1, 1),\n  (3, 2),\n  (3, 3), (2, 3), (4, 3);',
      },
      check: { schema: [{ de: 'mitarbeit', en: 'contributions' }], tables: [{ de: 'mitarbeit', en: 'contributions' }] },
    },
  ],
}
