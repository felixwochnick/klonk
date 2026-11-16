import { map } from '../../map'
import type { LearnModule } from '../../types'

export const sqlModify: LearnModule = {
  id: 'sql-modify',
  track: 'sql',
  title: { de: 'Die Welt ändern: INSERT, UPDATE, DELETE', en: 'Changing the world: INSERT, UPDATE, DELETE' },
  summary: {
    de: 'Ziegel und Marken per SQL einfügen, ändern und löschen, Figuren versetzen und drehen – die 3D-Welt zeigt jede Änderung.',
    en: 'Insert, change and delete bricks and marks with SQL, move and turn characters – the 3D world shows every change.',
  },
  objectives: [
    { de: 'Mit `INSERT INTO … VALUES …` neue Datensätze in eine Tabelle einfügen', en: 'Insert new records into a table with `INSERT INTO … VALUES …`' },
    { de: 'Mit `UPDATE … SET … WHERE …` Attributwerte ausgewählter Datensätze ändern, auch berechnet (`x = x + 1`)', en: 'Change attribute values of selected records with `UPDATE … SET … WHERE …`, also computed (`x = x + 1`)' },
    { de: 'Mit `DELETE FROM … WHERE …` gezielt Datensätze löschen und erklären, warum `WHERE` dabei so wichtig ist', en: 'Delete specific records with `DELETE FROM … WHERE …` and explain why `WHERE` matters so much here' },
  ],
  prerequisites: ['sql-select'],
  intro: {
    de: `Mit SQL kannst du die Welt nicht nur abfragen, sondern auch **ändern**. Nach dem Ausführen überträgt Klonk die Tabellen zurück in die Welt – du siehst die Änderung sofort in der 3D-Ansicht.

\`\`\`sql
INSERT INTO ziegel (x, y, ebene, farbe) VALUES (2, 1, 1, 'rot');
UPDATE figuren SET richtung = 'süden' WHERE name = 'Klonk';
DELETE FROM marken WHERE farbe = 'gelb';
\`\`\`

- \`INSERT INTO tabelle (spalten) VALUES (werte)\` – fügt einen Datensatz ein; mehrere auf einmal mit \`VALUES (…), (…)\`
- \`UPDATE tabelle SET spalte = wert WHERE …\` – ändert Werte; rechts darf auch eine Rechnung stehen, z. B. \`SET x = x + 1\`
- \`DELETE FROM tabelle WHERE …\` – löscht Datensätze

**Vorsicht:** Ohne \`WHERE\` ändert \`UPDATE\` bzw. löscht \`DELETE\` **alle** Zeilen der Tabelle. Mehrere Anweisungen trennst du mit \`;\`.

Die Datenbank achtet darauf, dass die Welt gültig bleibt: Farben und Richtungen müssen erlaubte Werte sein (\`'grün'\`, \`'süden'\` …), und auf einem Feld kann nur eine Marke liegen – \`x\` und \`y\` sind zusammen der **Primärschlüssel** der Tabelle \`marken\`. Jede Prüfung beginnt wieder mit der Startwelt.`,
    en: `With SQL you can not only query the world but also **change** it. After running, Klonk transfers the tables back into the world – you see the change right away in the 3D view.

\`\`\`sql
INSERT INTO bricks (x, y, level, color) VALUES (2, 1, 1, 'red');
UPDATE characters SET direction = 'south' WHERE name = 'Klonk';
DELETE FROM marks WHERE color = 'yellow';
\`\`\`

- \`INSERT INTO table (columns) VALUES (values)\` – inserts a record; several at once with \`VALUES (…), (…)\`
- \`UPDATE table SET column = value WHERE …\` – changes values; the right-hand side may also be a calculation, e.g. \`SET x = x + 1\`
- \`DELETE FROM table WHERE …\` – deletes records

**Careful:** Without \`WHERE\`, \`UPDATE\` changes and \`DELETE\` deletes **all** rows of the table. Separate several statements with \`;\`.

The database makes sure the world stays valid: colours and directions must be allowed values (\`'green'\`, \`'south'\` …), and a cell can only hold one mark – \`x\` and \`y\` together are the **primary key** of the table \`marks\`. Every check starts again with the start world.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine Doppelstunde.

**Voraussetzungen:** S1 (\`SELECT\`, \`WHERE\`). Bedingungen mit \`AND\`/\`OR\` werden erst in S3 behandelt und hier nicht gebraucht.

**Idee:** Datenmanipulation wird unmittelbar sichtbar: Jede Anweisung verändert die 3D-Welt. Geprüft wird die Welt nach dem Skript (Felder bzw. Position und Blickrichtung der Figuren), in mehreren Startwelten – abgezählte Koordinaten genügen ab Aufgabe 2 nicht mehr.

**Begriffe:** Datensatz einfügen, ändern, löschen; Primärschlüssel. Die Tabellen der Welt haben echte Schlüssel: \`marken\` (x, y) – höchstens eine Marke je Feld –, \`ziegel\` (x, y, ebene) und \`figuren\` (name). Ein zweites \`INSERT\` auf dasselbe Feld scheitert mit „UNIQUE constraint failed“ – ein guter Anlass, den Primärschlüssel als Eindeutigkeitsbedingung zu besprechen. Ebenso fangen CHECK-Bedingungen ungültige Werte ab (z. B. eine lila Marke).

**Typische Schwierigkeiten:**
- \`UPDATE\`/\`DELETE\` ohne \`WHERE\` – betrifft alle Zeilen
- Text in einfachen Anführungszeichen, Umlaute in Werten (\`'grün'\`, \`'süden'\`)
- \`ebene\` zählt von unten ab 1; die Reihenfolge der Ziegel eines Stapels ergibt sich aus \`ebene\`
- \`SET a = 1, b = 2\` mit Komma, nicht mit \`AND\` (\`SET a = 1 AND b = 2\` setzt \`a\` auf einen Wahrheitswert)

**Differenzierung:** Aufgabe 5 (\`INSERT … SELECT\`) ist eine Knobelaufgabe. Schnelle Lernende können zusätzlich versuchen, alle Figuren umdrehen zu lassen (Osten ⇄ Westen) – zwei \`UPDATE\` nacheinander heben sich dabei auf, \`CASE\` oder ein Zwischenwert helfen.

**Weiterführend:** S3 verfeinert \`WHERE\` mit \`AND\`, \`OR\`, \`LIKE\`, \`BETWEEN\` und \`IN\`.`,
    en: `**Time needed:** one double lesson.

**Prerequisites:** S1 (\`SELECT\`, \`WHERE\`). Conditions with \`AND\`/\`OR\` are covered in S3 and not needed here.

**Idea:** Data manipulation becomes visible immediately: every statement changes the 3D world. Klonk checks the world after the script (cells, or position and direction of the characters) in several start worlds – from task 2 on, counted coordinates are not enough.

**Terms:** inserting, updating and deleting records; primary key. The world tables have real keys: \`marks\` (x, y) – at most one mark per cell –, \`bricks\` (x, y, level) and \`characters\` (name). A second \`INSERT\` on the same cell fails with “UNIQUE constraint failed” – a good occasion to discuss the primary key as a uniqueness constraint. Likewise, CHECK constraints catch invalid values (e.g. a purple mark).

**Typical difficulties:**
- \`UPDATE\`/\`DELETE\` without \`WHERE\` – affects all rows
- Text in single quotes
- \`level\` counts from the bottom starting at 1; the order of the bricks in a stack follows \`level\`
- \`SET a = 1, b = 2\` with a comma, not \`AND\` (\`SET a = 1 AND b = 2\` sets \`a\` to a truth value)

**Differentiation:** Task 5 (\`INSERT … SELECT\`) is a puzzle. Fast learners can also try to turn all characters around (east ⇄ west) – two \`UPDATE\`s in a row cancel each other out; \`CASE\` or an intermediate value helps.

**Next:** S3 refines \`WHERE\` with \`AND\`, \`OR\`, \`LIKE\`, \`BETWEEN\` and \`IN\`.`,
  },
  tasks: [
    {
      id: 'tower',
      title: { de: 'Ein kleiner Turm', en: 'A small tower' },
      text: {
        de: 'Baue auf dem Feld `x = 3`, `y = 2` einen Turm aus zwei Ziegeln: unten einen blauen, darauf einen gelben.',
        en: 'Build a tower of two bricks on the cell `x = 3`, `y = 2`: a blue one at the bottom, a yellow one on top.',
      },
      hints: [
        { de: 'Jeder Ziegel ist eine eigene Zeile in `ziegel`. Der untere liegt auf `ebene` 1, der obere auf `ebene` 2.', en: 'Each brick is a row of its own in `bricks`. The bottom one is on `level` 1, the top one on `level` 2.' },
        { de: 'Zwei Zeilen auf einmal: `INSERT INTO ziegel (x, y, ebene, farbe) VALUES (…), (…)`', en: 'Two rows at once: `INSERT INTO bricks (x, y, level, color) VALUES (…), (…)`' },
      ],
      worlds: [map('> . . .\n. R . .\n. . . .')],
      worldDatabase: true,
      solution: {
        de: 'INSERT INTO ziegel (x, y, ebene, farbe) VALUES (3, 2, 1, \'blau\'), (3, 2, 2, \'gelb\')',
        en: 'INSERT INTO bricks (x, y, level, color) VALUES (3, 2, 1, \'blue\'), (3, 2, 2, \'yellow\')',
      },
      check: { cells: true },
    },
    {
      id: 'move',
      title: { de: 'Klonk rückt vor', en: 'Klonk moves on' },
      text: {
        de: 'Klonk soll **zwei Felder weiter nach Osten** stehen (x wird um 2 größer) und danach **nach Süden** schauen. Alle anderen Figuren bleiben, wie sie sind. Klonk steht in jeder Welt woanders – rechne mit der Spalte `x`.',
        en: 'Klonk should stand **two cells further east** (x increases by 2) and then face **south**. All other characters stay as they are. Klonk stands somewhere else in every world – calculate with the column `x`.',
      },
      hints: [
        { de: '`SET x = x + 2` nimmt den alten Wert und zählt 2 dazu. Mehrere Spalten trennst du mit Komma: `SET x = …, richtung = …`', en: '`SET x = x + 2` takes the old value and adds 2. Separate several columns with a comma: `SET x = …, direction = …`' },
        { de: 'Ohne `WHERE name = \'Klonk\'` würden alle Figuren mitlaufen.', en: 'Without `WHERE name = \'Klonk\'` all characters would move along.' },
      ],
      worlds: [
        map('> . . . .\n. . ^ . .\n. . . . .', { names: ['Klonk', 'Klara'] }),
        map('. . . . .\n. < . . .\n. . . v .', { names: ['Klonk', 'Kim'] }),
        map('. v . . .\n. . . . <\n> . . . .', { names: ['Klara', 'Kim', 'Klonk'] }),
      ],
      worldDatabase: true,
      solution: {
        de: 'UPDATE figuren SET x = x + 2, richtung = \'süden\' WHERE name = \'Klonk\'',
        en: 'UPDATE characters SET x = x + 2, direction = \'south\' WHERE name = \'Klonk\'',
      },
      check: { position: true, direction: true },
    },
    {
      id: 'red-marks',
      title: { de: 'Rote Marken weg', en: 'Away with red marks' },
      text: {
        de: 'Entferne alle **roten** Marken aus der Welt. Marken in anderen Farben bleiben liegen.',
        en: 'Remove all **red** marks from the world. Marks of other colours stay where they are.',
      },
      hints: [
        { de: '`DELETE FROM marken` allein löscht alle Marken – schränke mit `WHERE` ein.', en: '`DELETE FROM marks` on its own deletes all marks – narrow it down with `WHERE`.' },
      ],
      worlds: [
        map('> r . y\nb r . r\n. g r .'),
        map('r . y >\n. b . .\ng . r y'),
      ],
      worldDatabase: true,
      solution: { de: 'DELETE FROM marken WHERE farbe = \'rot\'', en: 'DELETE FROM marks WHERE color = \'red\'' },
      check: { cells: true },
    },
    {
      id: 'paint',
      title: { de: 'Neuer Anstrich', en: 'A fresh coat of paint' },
      text: {
        de: 'Streiche alle **roten** Ziegel **grün** an – egal, auf welcher Ebene sie liegen. Ziegel in anderen Farben behalten ihre Farbe.',
        en: 'Paint all **red** bricks **green** – no matter which level they are on. Bricks of other colours keep their colour.',
      },
      hints: [
        { de: 'Eine einzige `UPDATE`-Anweisung kann viele Zeilen auf einmal ändern: alle, für die die Bedingung gilt.', en: 'A single `UPDATE` statement can change many rows at once: all rows for which the condition holds.' },
      ],
      worlds: [
        map('> RB . Y\n. 3 BR .\nR . GR .'),
        map('> . RRY\nBRB . R\n. W R'),
      ],
      worldDatabase: true,
      solution: { de: 'UPDATE ziegel SET farbe = \'grün\' WHERE farbe = \'rot\'', en: 'UPDATE bricks SET color = \'green\' WHERE color = \'red\'' },
      check: { cells: true },
    },
    {
      id: 'mark-characters',
      title: { de: 'Jede Figur markiert', en: 'Every character marked' },
      text: {
        de: 'Lege unter **jede Figur** eine gelbe Marke – also auf genau das Feld, auf dem sie steht. Wie viele Figuren es gibt und wo sie stehen, ist in jeder Welt anders.',
        en: 'Put a yellow mark under **every character** – exactly on the cell it stands on. How many characters there are and where they stand differs in every world.',
      },
      hints: [
        { de: 'Die Felder der Figuren stehen schon in der Tabelle `figuren`. `INSERT INTO … SELECT …` fügt das Ergebnis einer Abfrage ein.', en: 'The cells of the characters are already in the table `characters`. `INSERT INTO … SELECT …` inserts the result of a query.' },
        { de: 'In einer Abfrage darf auch ein fester Wert stehen: `SELECT x, y, \'gelb\' FROM figuren`', en: 'A query may also contain a fixed value: `SELECT x, y, \'yellow\' FROM characters`' },
      ],
      worlds: [
        map('> . b .\n. . . ^\nr . . .', { names: ['Klonk', 'Klara'] }),
        map('. v . .\ng . < .\n. . . >', { names: ['Klonk', 'Kim', 'Klara'] }),
      ],
      worldDatabase: true,
      solution: {
        de: 'INSERT INTO marken (x, y, farbe)\nSELECT x, y, \'gelb\' FROM figuren',
        en: 'INSERT INTO marks (x, y, color)\nSELECT x, y, \'yellow\' FROM characters',
      },
      check: { cells: true },
    },
  ],
}
