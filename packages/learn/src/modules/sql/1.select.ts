import { map } from '../../map'
import type { LearnModule } from '../../types'

const three = ['Klonk', 'Klara', 'Kim']

export const sqlSelect: LearnModule = {
  id: 'sql-select',
  track: 'sql',
  title: { de: 'Die Welt als Tabelle: SELECT', en: 'The world as a table: SELECT' },
  summary: {
    de: 'Figuren, Ziegel und Marken der Welt mit SQL abfragen – Spalten wählen, filtern und sortieren.',
    en: 'Query the characters, bricks and marks of the world with SQL – choose columns, filter and sort.',
  },
  objectives: [
    { de: 'Den Aufbau einer Tabelle beschreiben: Spalten (Attribute) und Zeilen (Datensätze)', en: 'Describe the structure of a table: columns (attributes) and rows (records)' },
    { de: 'Mit `SELECT … FROM …` Spalten einer Tabelle abfragen', en: 'Query the columns of a table with `SELECT … FROM …`' },
    { de: 'Datensätze mit `WHERE` auswählen und mit `ORDER BY` sortieren', en: 'Select records with `WHERE` and sort them with `ORDER BY`' },
  ],
  intro: {
    de: `Klonk speichert die Welt auch als **Datenbank**: Jede Figur, jeder Ziegel und jede Marke ist eine **Zeile** in einer **Tabelle**. Die **Spalten** beschreiben die Eigenschaften, z. B. hat die Tabelle \`ziegel\` die Spalten \`x\`, \`y\`, \`ebene\` und \`farbe\`. Die Felder zählen ab 1, \`y\` wächst nach Süden, \`ebene\` 1 ist der unterste Ziegel eines Stapels.

Mit **SQL** fragst du die Tabellen ab:

\`\`\`sql
SELECT x, y, farbe
FROM ziegel
WHERE farbe = 'blau'
ORDER BY x, y
\`\`\`

- \`SELECT\` – welche Spalten (\`*\` = alle)
- \`FROM\` – aus welcher Tabelle
- \`WHERE\` – nur Zeilen, für die die Bedingung gilt (Text in einfachen Anführungszeichen)
- \`ORDER BY\` – sortieren (\`DESC\` = absteigend)

Mit **Ausführen** siehst du das Ergebnis als Tabelle. Die Tabellen der Welt: \`figuren\` (name, x, y, richtung, aussehen), \`ziegel\` (x, y, ebene, farbe), \`marken\` (x, y, farbe), \`quader\` (x, y) und \`welt\` (breite, tiefe, hoehe).`,
    en: `Klonk also stores the world as a **database**: every character, brick and mark is a **row** in a **table**. The **columns** describe the properties, e.g. the table \`bricks\` has the columns \`x\`, \`y\`, \`level\` and \`color\`. Cells count from 1, \`y\` grows towards the south, \`level\` 1 is the bottom brick of a stack.

With **SQL** you query the tables:

\`\`\`sql
SELECT x, y, color
FROM bricks
WHERE color = 'blue'
ORDER BY x, y
\`\`\`

- \`SELECT\` – which columns (\`*\` = all)
- \`FROM\` – from which table
- \`WHERE\` – only rows for which the condition holds (text in single quotes)
- \`ORDER BY\` – sort (\`DESC\` = descending)

**Run** shows the result as a table. The tables of the world: \`characters\` (name, x, y, direction, look), \`bricks\` (x, y, level, color), \`marks\` (x, y, color), \`blocks\` (x, y) and \`world\` (width, depth, height).`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine Doppelstunde.

**Idee:** Die Lernenden kennen die Welt aus der Reihe E. Die Welt-Datenbank macht den Zusammenhang zwischen Objekten der Welt und Datensätzen sichtbar: Was die 3D-Ansicht zeigt, steht als Zeile in einer Tabelle. Begriffe Tabelle, Attribut (Spalte), Datensatz (Zeile) und Attributwert lassen sich direkt daran einführen.

**Prüfung:** Klonk vergleicht das Ergebnis der letzten Abfrage mit dem der Musterlösung – in mehreren Welten, damit abgeschriebene Ergebnisse nicht genügen. Spaltennamen (Aliasse) sind frei, die Reihenfolge der Spalten zählt, sofern die Namen nicht übereinstimmen. Die Reihenfolge der Zeilen zählt nur, wenn die Aufgabe eine Sortierung verlangt.

**Typische Schwierigkeiten:** Text in einfachen Anführungszeichen (\`'blau'\`), Umlaute in Werten (\`'grün'\`, \`'süden'\`), \`=\` statt \`==\`. Groß- und Kleinschreibung der Schlüsselwörter ist egal, die von Textwerten nicht.

**Weiterführend:** Modul S2 ändert die Welt mit \`INSERT\`, \`UPDATE\` und \`DELETE\`.`,
    en: `**Time needed:** one double lesson.

**Idea:** Students know the world from track E. The world database shows the connection between objects in the world and records: what the 3D view shows is a row in a table. The terms table, attribute (column), record (row) and attribute value can be introduced right there.

**Checking:** Klonk compares the result of the last query with that of the model solution – in several worlds, so copied results are not enough. Column names (aliases) are free; the order of the columns matters unless the names match. The order of the rows only matters if the task asks for sorting.

**Typical difficulties:** Text in single quotes (\`'blue'\`), \`=\` instead of \`==\`. Keywords are case-insensitive, text values are not.

**Next:** Module S2 changes the world with \`INSERT\`, \`UPDATE\` and \`DELETE\`.`,
  },
  tasks: [
    {
      id: 'all-characters',
      title: { de: 'Alle Figuren', en: 'All characters' },
      text: {
        de: 'Gib die ganze Tabelle der Figuren aus – alle Spalten, alle Zeilen.',
        en: 'Output the whole table of characters – all columns, all rows.',
      },
      hints: [
        { de: '`*` steht für alle Spalten. Die Tabelle heißt `figuren`.', en: '`*` stands for all columns. The table is called `characters`.' },
      ],
      worlds: [
        map('> . . .\n. . < .\n. ^ . .', { names: three }),
        map('. . v\n> . .', { names: ['Klonk', 'Kai'] }),
      ],
      worldDatabase: true,
      solution: { de: 'SELECT * FROM figuren', en: 'SELECT * FROM characters' },
      check: { result: 'unordered' },
    },
    {
      id: 'columns',
      title: { de: 'Name und Richtung', en: 'Name and direction' },
      text: {
        de: 'Gib für jede Figur nur ihren Namen und ihre Blickrichtung aus – in dieser Reihenfolge.',
        en: 'For each character, output only its name and the direction it faces – in this order.',
      },
      hints: [
        { de: 'Statt `*` stehen hinter `SELECT` die Spalten, durch Komma getrennt.', en: 'Instead of `*`, list the columns after `SELECT`, separated by commas.' },
      ],
      worlds: [
        map('> . . .\n. . < .\n. ^ . .', { names: three }),
        map('. . v\n> . .', { names: ['Klonk', 'Kai'] }),
      ],
      worldDatabase: true,
      solution: { de: 'SELECT name, richtung FROM figuren', en: 'SELECT name, direction FROM characters' },
      check: { result: 'unordered' },
    },
    {
      id: 'red-bricks',
      title: { de: 'Nur rote Ziegel', en: 'Only red bricks' },
      text: {
        de: 'Wo liegen rote Ziegel? Gib `x`, `y` und `ebene` aller roten Ziegel aus.',
        en: 'Where are red bricks? Output `x`, `y` and `level` of all red bricks.',
      },
      hints: [
        { de: 'Mit `WHERE farbe = \'rot\'` bleiben nur die roten Ziegel übrig.', en: 'With `WHERE color = \'red\'` only the red bricks remain.' },
      ],
      worlds: [
        map('> R B .\n. RB . G\n. . RR .'),
        map('> B . R\nRRB . G'),
      ],
      worldDatabase: true,
      solution: { de: 'SELECT x, y, ebene FROM ziegel WHERE farbe = \'rot\'', en: 'SELECT x, y, level FROM bricks WHERE color = \'red\'' },
      check: { result: 'unordered' },
    },
    {
      id: 'sorted-marks',
      title: { de: 'Marken von West nach Ost', en: 'Marks from west to east' },
      text: {
        de: 'Gib Spalte, Zeile und Farbe aller Marken aus – sortiert nach `x`, bei gleichem `x` nach `y`.',
        en: 'Output column, row and colour of all marks – sorted by `x`, and by `y` where `x` is the same.',
      },
      hints: [
        { de: '`ORDER BY` nimmt mehrere Spalten: erst nach der ersten sortieren, bei Gleichstand nach der zweiten.', en: '`ORDER BY` takes several columns: sort by the first, and by the second on ties.' },
      ],
      worlds: [
        map('> . g r\nb . y .\n. r . b'),
        map('. y >\ng . .\n. b r'),
      ],
      worldDatabase: true,
      solution: { de: 'SELECT x, y, farbe FROM marken ORDER BY x, y', en: 'SELECT x, y, color FROM marks ORDER BY x, y' },
      check: { result: 'ordered' },
    },
    {
      id: 'high-stacks',
      title: { de: 'Hohe Stapel', en: 'High stacks' },
      text: {
        de: 'Auf welchen Feldern liegen **mindestens drei** Ziegel übereinander? Gib `x` und `y` jedes solchen Felds genau einmal aus.',
        en: 'On which cells are there **at least three** bricks on top of each other? Output `x` and `y` of each such cell exactly once.',
      },
      hints: [
        { de: 'Ein Stapel mit mindestens drei Ziegeln hat genau einen Ziegel auf Ebene 3.', en: 'A stack with at least three bricks has exactly one brick on level 3.' },
      ],
      worlds: [
        map('> 3 1 .\n. RBG 4 2\n. . . 5'),
        map('> 2 . 3\nRRRR . 1 .'),
      ],
      worldDatabase: true,
      solution: { de: 'SELECT x, y FROM ziegel WHERE ebene = 3', en: 'SELECT x, y FROM bricks WHERE level = 3' },
      check: { result: 'unordered' },
    },
  ],
}
