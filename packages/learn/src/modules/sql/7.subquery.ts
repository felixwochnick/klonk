import type { LearnDatabase, LearnModule } from '../../types'

// Schulkiosk: Produkte und die Verkäufe einer Woche, je Startsituation anderes Sortiment, andere Preise und Verkäufe

const PRODUCTS = {
  pretzel: [{ de: 'Brezel', en: 'pretzel' }, 'bakery'],
  pretzelStick: [{ de: 'Laugenstange', en: 'pretzel stick' }, 'bakery'],
  cheeseRoll: [{ de: 'Käsebrötchen', en: 'cheese roll' }, 'bakery'],
  wholemealRoll: [{ de: 'Vollkornbrötchen', en: 'wholemeal roll' }, 'bakery'],
  apple: [{ de: 'Apfel', en: 'apple' }, 'fruit'],
  banana: [{ de: 'Banane', en: 'banana' }, 'fruit'],
  water: [{ de: 'Wasser', en: 'water' }, 'drinks'],
  cocoa: [{ de: 'Kakao', en: 'cocoa' }, 'drinks'],
  spritzer: [{ de: 'Apfelschorle', en: 'apple spritzer' }, 'drinks'],
  cerealBar: [{ de: 'Müsliriegel', en: 'cereal bar' }, 'snacks'],
  yoghurt: [{ de: 'Joghurt', en: 'yoghurt' }, 'snacks'],
} as const
type Product = keyof typeof PRODUCTS

const CATEGORIES = {
  bakery: { de: 'Backwaren', en: 'bakery' },
  fruit: { de: 'Obst', en: 'fruit' },
  drinks: { de: 'Getränke', en: 'drinks' },
  snacks: { de: 'Snacks', en: 'snacks' },
} as const

const DAYS = {
  mon: { de: 'Montag', en: 'Monday' },
  tue: { de: 'Dienstag', en: 'Tuesday' },
  wed: { de: 'Mittwoch', en: 'Wednesday' },
  thu: { de: 'Donnerstag', en: 'Thursday' },
  fri: { de: 'Freitag', en: 'Friday' },
} as const

type Kiosk = {
  /** Sortiment mit Preis in Euro (je Kategorie ist das günstigste Produkt eindeutig) */
  products: [product: Product, price: number][]
  /** Verkäufe: Tag, Produkt, Stückzahl */
  sales: [day: keyof typeof DAYS, product: Product, quantity: number][]
}

function kioskSql(kiosk: Kiosk, lang: 'de' | 'en') {
  const n = lang === 'de'
    ? { products: 'produkte', category: 'kategorie', price: 'preis', sales: 'verkaeufe', productId: 'produkt_id', day: 'tag', quantity: 'menge' }
    : { products: 'products', category: 'category', price: 'price', sales: 'sales', productId: 'product_id', day: 'day', quantity: 'quantity' }
  const id = (product: Product) => kiosk.products.findIndex(([p]) => p === product) + 1
  const values = (rows: string[]) => rows.map(row => `  (${row})`).join(',\n')
  return [
    `CREATE TABLE ${n.products} (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  ${n.category} TEXT NOT NULL,\n  ${n.price} REAL NOT NULL\n);`,
    `CREATE TABLE ${n.sales} (\n  id INTEGER PRIMARY KEY,\n  ${n.productId} INTEGER NOT NULL REFERENCES ${n.products}(id),\n  ${n.day} TEXT NOT NULL,\n  ${n.quantity} INTEGER NOT NULL\n);`,
    `INSERT INTO ${n.products} VALUES\n${values(kiosk.products.map(([product, price], i) => {
      const [name, category] = PRODUCTS[product]
      return `${i + 1}, '${name[lang]}', '${CATEGORIES[category][lang]}', ${price.toFixed(2)}`
    }))};`,
    `INSERT INTO ${n.sales} VALUES\n${values(kiosk.sales.map(([day, product, quantity], i) => `${i + 1}, ${id(product)}, '${DAYS[day][lang]}', ${quantity}`))};`,
  ].join('\n') + '\n'
}

// Der Durchschnittspreis liegt je Startsituation woanders (keine feste Preisgrenze passt überall); in der dritten kostet die
// Banane so viel wie die günstigste Backware – eine Unterabfrage ohne Bezug zur Kategorie findet dann zu viel
const KIOSKS: Kiosk[] = [
  {
    products: [['pretzel', 0.9], ['cheeseRoll', 1.8], ['apple', 0.5], ['banana', 0.6], ['water', 0.8], ['cocoa', 1.2], ['cerealBar', 1.1], ['yoghurt', 1.3]],
    sales: [
      ['mon', 'pretzel', 12], ['mon', 'cocoa', 5], ['mon', 'apple', 4], ['mon', 'pretzel', 3],
      ['tue', 'pretzel', 9], ['tue', 'cheeseRoll', 6], ['tue', 'water', 8],
      ['wed', 'cocoa', 7], ['wed', 'cerealBar', 3],
      ['thu', 'pretzel', 10], ['thu', 'water', 6], ['thu', 'apple', 2],
      ['fri', 'cheeseRoll', 8], ['fri', 'cocoa', 4],
    ],
  },
  {
    products: [['pretzelStick', 1.1], ['wholemealRoll', 1.6], ['cheeseRoll', 2.2], ['apple', 0.6], ['spritzer', 1.4], ['water', 0.9], ['cocoa', 1.5], ['cerealBar', 1.2], ['banana', 0.55]],
    sales: [
      ['mon', 'pretzelStick', 7], ['mon', 'water', 10],
      ['tue', 'cocoa', 6], ['tue', 'banana', 3], ['tue', 'pretzelStick', 5],
      ['wed', 'wholemealRoll', 4], ['wed', 'water', 9], ['wed', 'cerealBar', 2],
      ['thu', 'pretzelStick', 8], ['thu', 'cocoa', 3],
      ['fri', 'spritzer', 5], ['fri', 'pretzelStick', 6],
    ],
  },
  {
    products: [['pretzel', 0.8], ['wholemealRoll', 1.4], ['banana', 0.8], ['apple', 0.45], ['cocoa', 1.05], ['spritzer', 1.2], ['yoghurt', 0.95], ['cerealBar', 1.25], ['cheeseRoll', 2.1]],
    sales: [
      ['mon', 'yoghurt', 4], ['mon', 'pretzel', 11], ['mon', 'banana', 2], ['mon', 'cocoa', 6],
      ['tue', 'pretzel', 8], ['tue', 'spritzer', 5],
      ['wed', 'pretzel', 9], ['wed', 'cocoa', 4], ['wed', 'yoghurt', 3],
      ['thu', 'spritzer', 6], ['thu', 'banana', 1],
    ],
  },
]

const kiosk: LearnDatabase[] = [{
  name: { de: 'kiosk', en: 'kiosk' },
  sql: KIOSKS.map(k => ({ de: kioskSql(k, 'de'), en: kioskSql(k, 'en') })),
}]

export const sqlSubquery: LearnModule = {
  id: 'sql-subquery',
  track: 'sql',
  title: { de: 'Unterabfragen', en: 'Subqueries' },
  summary: {
    de: 'Fragen in Fragen: Mit Unterabfragen wertet der Schulkiosk Preise und Verkäufe aus – mit IN, EXISTS, Vergleichen und Zwischenergebnissen.',
    en: 'Questions inside questions: with subqueries the school kiosk evaluates prices and sales – with IN, EXISTS, comparisons and intermediate results.',
  },
  objectives: [
    { de: 'Eine Unterabfrage, die einen einzelnen Wert liefert, in einem Vergleich verwenden (z. B. mit dem Durchschnitt)', en: 'Use a subquery that returns a single value in a comparison (e.g. with the average)' },
    { de: 'Mit `IN`, `NOT IN`, `EXISTS` und `NOT EXISTS` prüfen, ob passende Datensätze in einer anderen Tabelle vorkommen', en: 'Check with `IN`, `NOT IN`, `EXISTS` and `NOT EXISTS` whether matching records occur in another table' },
    { de: 'Korrelierte Unterabfragen und Unterabfragen in `FROM` (Zwischenergebnisse) einsetzen', en: 'Use correlated subqueries and subqueries in `FROM` (intermediate results)' },
  ],
  prerequisites: ['sql-join'],
  intro: {
    de: `Der Schulkiosk speichert sein Sortiment und die Verkäufe einer Woche in der Datenbank \`kiosk\`:

- \`produkte\` (id, name, kategorie, preis) – Preise in Euro
- \`verkaeufe\` (id, produkt_id, tag, menge) – \`produkt_id\` verweist auf \`produkte.id\`

Eine **Unterabfrage** ist eine Abfrage in Klammern innerhalb einer anderen. Liefert sie **einen Wert**, kannst du damit vergleichen – hier: das teuerste Produkt:

\`\`\`sql
SELECT name, preis
FROM produkte
WHERE preis = (SELECT MAX(preis) FROM produkte)
\`\`\`

Liefert sie **eine Spalte**, prüfst du mit \`IN\`, ob ein Wert darin vorkommt:

\`\`\`sql
SELECT name
FROM produkte
WHERE id IN (SELECT produkt_id FROM verkaeufe WHERE menge >= 10)
\`\`\`

- \`NOT IN (…)\` – der Wert kommt nicht vor
- \`EXISTS (…)\` / \`NOT EXISTS (…)\` – die Unterabfrage liefert mindestens eine / keine Zeile. Sie darf sich dabei auf die äußere Zeile beziehen (**korrelierte** Unterabfrage): \`WHERE NOT EXISTS (SELECT * FROM verkaeufe v WHERE v.produkt_id = p.id)\`
- In \`FROM\` wirkt eine Unterabfrage wie eine Tabelle mit einem Zwischenergebnis: \`SELECT … FROM (SELECT …) AS zwischen\`

Unterabfragen werden von innen nach außen gelesen: Führe die innere Abfrage ruhig erst allein aus und sieh dir ihr Ergebnis an.`,
    en: `The school kiosk stores its range of products and the sales of one week in the database \`kiosk\`:

- \`products\` (id, name, category, price) – prices in euros
- \`sales\` (id, product_id, day, quantity) – \`product_id\` refers to \`products.id\`

A **subquery** is a query in parentheses inside another one. If it returns **one value**, you can compare with it – here: the most expensive product:

\`\`\`sql
SELECT name, price
FROM products
WHERE price = (SELECT MAX(price) FROM products)
\`\`\`

If it returns **one column**, you check with \`IN\` whether a value occurs in it:

\`\`\`sql
SELECT name
FROM products
WHERE id IN (SELECT product_id FROM sales WHERE quantity >= 10)
\`\`\`

- \`NOT IN (…)\` – the value does not occur
- \`EXISTS (…)\` / \`NOT EXISTS (…)\` – the subquery returns at least one / no row. It may refer to the outer row (**correlated** subquery): \`WHERE NOT EXISTS (SELECT * FROM sales s WHERE s.product_id = p.id)\`
- In \`FROM\`, a subquery acts like a table holding an intermediate result: \`SELECT … FROM (SELECT …) AS step\`

Subqueries are read from the inside out: feel free to run the inner query on its own first and look at its result.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** S4 (Aggregatfunktionen, \`GROUP BY\`) und S5 (Fremdschlüssel, Verknüpfungen). S6 ist nicht nötig.

**Idee:** Unterabfragen zerlegen eine Frage in Teilfragen – ein Grundgedanke der Problemlösung. Klonk verlangt in allen Aufgaben eine Unterabfrage (\`(SELECT …\`), auch wo eine Verknüpfung (Aufgaben 2 und 3) oder eine Sortierung mit \`LIMIT\` möglich wäre; beides lohnt sich als Vergleich im Gespräch. Geprüft wird mit drei verschiedenen Sortimenten: Eine feste Preisgrenze statt des Durchschnitts besteht nicht in allen.

**Typische Schwierigkeiten:**
- Aggregat direkt in \`WHERE\` (\`WHERE preis > AVG(preis)\`) statt in einer Unterabfrage
- \`=\` statt \`IN\`, wenn die Unterabfrage mehrere Zeilen liefert (SQLite nimmt dann stillschweigend die erste Zeile, andere Systeme melden einen Fehler)
- korrelierte Unterabfrage (Aufgabe 4) ohne Bezug zur äußeren Zeile – dann wird mit dem Minimum aller Produkte verglichen; die Daten sind so gewählt, dass auch \`preis IN (SELECT MIN(preis) … GROUP BY kategorie)\` auffällt
- \`NOT IN\` mit NULL-Werten in der Unterabfrage liefert nie eine Zeile (kommt hier nicht vor, lohnt aber den Hinweis)
- SQLite erlaubt \`SELECT kategorie, name, MIN(preis) … GROUP BY kategorie\` und liefert dabei sogar den passenden Namen – andere Datenbanksysteme lehnen das ab; deshalb verlangt Aufgabe 4 eine Unterabfrage

**Differenzierung:** Aufgabe 5 (Unterabfrage in \`FROM\`) ist die anspruchsvollste. Schnelle Lernende ermitteln zusätzlich den umsatzstärksten Tag (\`SUM(menge * preis)\` über eine Verknüpfung, dann Vergleich mit dem Maximum).`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** S4 (aggregate functions, \`GROUP BY\`) and S5 (foreign keys, joins). S6 is not required.

**Idea:** Subqueries break a question down into sub-questions – a basic idea of problem solving. Klonk requires a subquery (\`(SELECT …\`) in all tasks, even where a join (tasks 2 and 3) or sorting with \`LIMIT\` would also work; both are worth comparing in discussion. Checking uses three different product ranges: a fixed price limit instead of the average does not pass in all of them.

**Typical difficulties:**
- aggregate directly in \`WHERE\` (\`WHERE price > AVG(price)\`) instead of in a subquery
- \`=\` instead of \`IN\` when the subquery returns several rows (SQLite silently takes the first row, other systems report an error)
- correlated subquery (task 4) without reference to the outer row – then the comparison is with the minimum of all products; the data is chosen so that \`price IN (SELECT MIN(price) … GROUP BY category)\` is caught as well
- \`NOT IN\` with NULL values in the subquery never returns a row (does not occur here, but worth mentioning)
- SQLite allows \`SELECT category, name, MIN(price) … GROUP BY category\` and even returns the matching name – other database systems reject it; that is why task 4 requires a subquery

**Differentiation:** Task 5 (subquery in \`FROM\`) is the most demanding one. Fast learners also determine the day with the highest turnover (\`SUM(quantity * price)\` over a join, then comparison with the maximum).`,
  },
  tasks: [
    {
      id: 'above-average',
      title: { de: 'Teurer als der Durchschnitt', en: 'More expensive than average' },
      text: {
        de: 'Welche Produkte kosten **mehr als der Durchschnittspreis** aller Produkte? Gib Name und Preis aus. Das Sortiment und die Preise sind in jedem Datensatz anders.',
        en: 'Which products cost **more than the average price** of all products? Output name and price. The range of products and the prices differ in every data set.',
      },
      hints: [
        { de: '`SELECT AVG(preis) FROM produkte` liefert genau einen Wert – in Klammern kannst du ihn in `WHERE` verwenden.', en: '`SELECT AVG(price) FROM products` returns exactly one value – in parentheses you can use it in `WHERE`.' },
      ],
      worlds: [],
      databases: kiosk,
      solution: {
        de: 'SELECT name, preis\nFROM produkte\nWHERE preis > (SELECT AVG(preis) FROM produkte)',
        en: 'SELECT name, price\nFROM products\nWHERE price > (SELECT AVG(price) FROM products)',
      },
      check: { result: 'unordered' },
      requires: ['subquery'],
    },
    {
      id: 'monday',
      title: { de: 'Was am Montag lief', en: 'What sold on Monday' },
      text: {
        de: 'Welche Produkte wurden am `Montag` verkauft? Gib jeden Produktnamen **einmal** aus, alphabetisch sortiert. Verwende eine Unterabfrage mit `IN`.',
        en: 'Which products were sold on `Monday`? Output each product name **once**, sorted alphabetically. Use a subquery with `IN`.',
      },
      hints: [
        { de: 'Innen: die `produkt_id` aller Verkäufe vom Montag. Außen: alle Produkte, deren `id` darin vorkommt.', en: 'Inside: the `product_id` of all sales on Monday. Outside: all products whose `id` occurs in it.' },
      ],
      worlds: [],
      databases: kiosk,
      solution: {
        de: 'SELECT name\nFROM produkte\nWHERE id IN (SELECT produkt_id FROM verkaeufe WHERE tag = \'Montag\')\nORDER BY name',
        en: 'SELECT name\nFROM products\nWHERE id IN (SELECT product_id FROM sales WHERE day = \'Monday\')\nORDER BY name',
      },
      check: { result: 'ordered' },
      requires: ['subquery'],
    },
    {
      id: 'never-sold',
      title: { de: 'Ladenhüter', en: 'Shelf warmers' },
      text: {
        de: 'Welche Produkte wurden in dieser Woche **kein einziges Mal** verkauft? Gib ihre Namen aus.',
        en: 'Which products were **not sold even once** this week? Output their names.',
      },
      hints: [
        { de: 'Zwei Wege: `WHERE id NOT IN (SELECT produkt_id FROM verkaeufe)` oder `WHERE NOT EXISTS (SELECT * FROM verkaeufe v WHERE v.produkt_id = p.id)`.', en: 'Two ways: `WHERE id NOT IN (SELECT product_id FROM sales)` or `WHERE NOT EXISTS (SELECT * FROM sales s WHERE s.product_id = p.id)`.' },
        { de: 'Für `NOT EXISTS` braucht die äußere Tabelle einen Namen: `FROM produkte p`.', en: 'For `NOT EXISTS` the outer table needs a name: `FROM products p`.' },
      ],
      worlds: [],
      databases: kiosk,
      solution: {
        de: 'SELECT p.name\nFROM produkte p\nWHERE NOT EXISTS (SELECT * FROM verkaeufe v WHERE v.produkt_id = p.id)',
        en: 'SELECT p.name\nFROM products p\nWHERE NOT EXISTS (SELECT * FROM sales s WHERE s.product_id = p.id)',
      },
      check: { result: 'unordered' },
      requires: ['subquery'],
    },
    {
      id: 'cheapest',
      title: { de: 'Das Günstigste jeder Kategorie', en: 'The cheapest of each category' },
      text: {
        de: 'Gib für jede Kategorie das **günstigste** Produkt aus: Kategorie, Name und Preis, sortiert nach der Kategorie.',
        en: 'For every category, output the **cheapest** product: category, name and price, sorted by category.',
      },
      hints: [
        { de: 'Ein Produkt ist das günstigste seiner Kategorie, wenn sein Preis gleich dem kleinsten Preis **in derselben Kategorie** ist.', en: 'A product is the cheapest of its category if its price equals the lowest price **in the same category**.' },
        { de: 'Die Unterabfrage bezieht sich auf die äußere Zeile: `WHERE p.preis = (SELECT MIN(preis) FROM produkte q WHERE q.kategorie = p.kategorie)`', en: 'The subquery refers to the outer row: `WHERE p.price = (SELECT MIN(price) FROM products q WHERE q.category = p.category)`' },
      ],
      worlds: [],
      databases: kiosk,
      solution: {
        de: 'SELECT p.kategorie, p.name, p.preis\nFROM produkte p\nWHERE p.preis = (SELECT MIN(q.preis) FROM produkte q WHERE q.kategorie = p.kategorie)\nORDER BY p.kategorie',
        en: 'SELECT p.category, p.name, p.price\nFROM products p\nWHERE p.price = (SELECT MIN(q.price) FROM products q WHERE q.category = p.category)\nORDER BY p.category',
      },
      check: { result: 'ordered' },
      requires: ['subquery'],
    },
    {
      id: 'per-day',
      title: { de: 'Stück pro Tag', en: 'Items per day' },
      text: {
        de: 'Wie viele Stück verkauft der Kiosk **im Durchschnitt pro Tag**? Rechne nur mit den Tagen, an denen etwas verkauft wurde. Berechne dazu erst die Stückzahl je Tag und dann deren Durchschnitt.',
        en: 'How many items does the kiosk sell **on average per day**? Only count the days on which something was sold. First calculate the number of items per day and then their average.',
      },
      hints: [
        { de: 'Zwischenergebnis: `SELECT tag, SUM(menge) AS stueck FROM verkaeufe GROUP BY tag` – eine Zeile je Tag.', en: 'Intermediate result: `SELECT day, SUM(quantity) AS items FROM sales GROUP BY day` – one row per day.' },
        { de: 'Dieses Zwischenergebnis setzt du in Klammern hinter `FROM` und bildest davon `AVG(stueck)`.', en: 'Put this intermediate result in parentheses after `FROM` and take `AVG(items)` of it.' },
      ],
      worlds: [],
      databases: kiosk,
      solution: {
        de: 'SELECT AVG(stueck) AS durchschnitt\nFROM (SELECT tag, SUM(menge) AS stueck FROM verkaeufe GROUP BY tag) AS je_tag',
        en: 'SELECT AVG(items) AS average\nFROM (SELECT day, SUM(quantity) AS items FROM sales GROUP BY day) AS per_day',
      },
      check: { result: 'unordered' },
      requires: ['subquery'],
    },
  ],
}
