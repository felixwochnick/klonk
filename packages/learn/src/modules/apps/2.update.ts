import { map } from '../../map'
import type { LearnModule } from '../../types'

/** Spielstände: Punkte je Figur (je Startsituation andere Daten) */
const game = (players: [string, number][]) => `CREATE TABLE players (name TEXT PRIMARY KEY, points INTEGER NOT NULL);
${players.map(([name, points]) => `INSERT INTO players VALUES ('${name}', ${points});`).join('\n')}
`

/** Ziegellager: Bestand je Farbe */
const store = (amounts: Record<string, number>) => `CREATE TABLE stock (color TEXT PRIMARY KEY, amount INTEGER NOT NULL);
${Object.entries(amounts).map(([color, amount]) => `INSERT INTO stock VALUES ('${color}', ${amount});`).join('\n')}
`

/** Besuche je Feld aus früheren Läufen (nicht jedes Feld hat schon eine Zeile) */
const visits = (rows: [number, number, number][]) => `CREATE TABLE visits (x INTEGER NOT NULL, y INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (x, y));
${rows.map(([x, y, count]) => `INSERT INTO visits VALUES (${x}, ${y}, ${count});`).join('\n')}
`

export const appUpdate: LearnModule = {
  id: 'app-update',
  track: 'apps',
  title: { de: 'Daten speichern', en: 'Storing data' },
  summary: {
    de: 'Ergebnisse des Programms mit `INSERT` und `UPDATE` in die Datenbank schreiben – sicher mit Platzhaltern statt zusammengesetztem SQL.',
    en: 'Write the program’s results to the database with `INSERT` and `UPDATE` – safely with placeholders instead of assembled SQL.',
  },
  objectives: [
    { de: 'Mit `execute` ändernde SQL-Anweisungen ausführen und Werte über Platzhalter `?` übergeben', en: 'Run changing SQL statements with `execute` and pass values via `?` placeholders' },
    { de: 'Erklären, warum SQL nie aus Text und Werten zusammengesetzt wird (SQL-Injection)', en: 'Explain why SQL is never assembled from text and values (SQL injection)' },
    { de: 'Den Rückgabewert von `execute` nutzen: Zeile ändern, sonst neu anlegen', en: 'Use the return value of `execute`: update a row, otherwise insert a new one' },
  ],
  prerequisites: ['app-query', 'sql-modify'],
  intro: {
    de: `Bisher hat dein Programm nur gelesen. Mit \`execute\` führt es **ändernde** Anweisungen aus – \`INSERT\`, \`UPDATE\`, \`DELETE\`. Die Werte kommen dabei nicht direkt ins SQL, sondern stehen dort als **Platzhalter** \`?\`:

\`\`\`python
from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("game")
db.execute("INSERT INTO players (name, points) VALUES (?, ?)", ("Mia", 0))
changed = db.execute("UPDATE players SET points = points + ? WHERE name = ?", (5, klonk.name))
print(changed)
\`\`\`

\`\`\`java
import klonk.Klonk;
import klonk.Database;

public class Programm {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("game");
        db.execute("INSERT INTO players (name, points) VALUES (?, ?)", "Mia", 0);
        int changed = db.execute("UPDATE players SET points = points + ? WHERE name = ?", 5, klonk.name);
        System.out.println(changed);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('game')
db.execute('INSERT INTO players (name, points) VALUES (?, ?)', ['Mia', 0])
const changed = db.execute('UPDATE players SET points = points + ? WHERE name = ?', [5, klonk.name])
console.log(changed)
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
var db = Database.Open("game");
db.Execute("INSERT INTO players (name, points) VALUES (?, ?)", "Mia", 0);
var changed = db.Execute("UPDATE players SET points = points + ? WHERE name = ?", 5, klonk.Name);
Console.WriteLine(changed);
\`\`\`

Die Werte für die Platzhalter gibst du **getrennt** vom SQL an, in derselben Reihenfolge wie die \`?\`: in Python als Tupel, in JavaScript als Liste, in Java und C# einfach als weitere Argumente. \`execute\` liefert die **Zahl der geänderten Zeilen** – findet ein \`UPDATE\` keine passende Zeile, ist sie 0.

**Warum nicht einfach zusammensetzen?** \`"… WHERE name = '" + name + "'"\` sieht harmlos aus. Enthält der Wert aber selbst ein Anführungszeichen (\`O'Neil\`), ist das SQL kaputt – und wer Eingaben geschickt wählt (\`x' OR '1'='1\`), verändert damit die Anweisung selbst. Das heißt **SQL-Injection** und ist eine der häufigsten Sicherheitslücken. Mit Platzhaltern liest die Datenbank Werte immer als Daten, nie als SQL.`,
    en: `So far your program has only read. With \`execute\` it runs **changing** statements – \`INSERT\`, \`UPDATE\`, \`DELETE\`. The values do not go directly into the SQL; instead the SQL contains **placeholders** \`?\`:

\`\`\`python
from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("game")
db.execute("INSERT INTO players (name, points) VALUES (?, ?)", ("Mia", 0))
changed = db.execute("UPDATE players SET points = points + ? WHERE name = ?", (5, klonk.name))
print(changed)
\`\`\`

\`\`\`java
import klonk.Klonk;
import klonk.Database;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("game");
        db.execute("INSERT INTO players (name, points) VALUES (?, ?)", "Mia", 0);
        int changed = db.execute("UPDATE players SET points = points + ? WHERE name = ?", 5, klonk.name);
        System.out.println(changed);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('game')
db.execute('INSERT INTO players (name, points) VALUES (?, ?)', ['Mia', 0])
const changed = db.execute('UPDATE players SET points = points + ? WHERE name = ?', [5, klonk.name])
console.log(changed)
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
var db = Database.Open("game");
db.Execute("INSERT INTO players (name, points) VALUES (?, ?)", "Mia", 0);
var changed = db.Execute("UPDATE players SET points = points + ? WHERE name = ?", 5, klonk.Name);
Console.WriteLine(changed);
\`\`\`

You pass the values for the placeholders **separately** from the SQL, in the same order as the \`?\`: in Python as a tuple, in JavaScript as a list, in Java and C# simply as further arguments. \`execute\` returns the **number of changed rows** – if an \`UPDATE\` finds no matching row, it is 0.

**Why not just glue it together?** \`"… WHERE name = '" + name + "'"\` looks harmless. But if the value itself contains a quote (\`O'Neil\`), the SQL breaks – and whoever chooses the input cleverly (\`x' OR '1'='1\`) changes the statement itself. This is called **SQL injection** and is one of the most common security holes. With placeholders, the database always reads values as data, never as SQL.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** A1 sowie \`INSERT\` und \`UPDATE\` in SQL (S2). Zählvariablen und Verzweigungen in der gewählten Sprache (F2).

**Idee:** Das Programm erzeugt Daten, die Datenbank bewahrt sie auf: ein Wegprotokoll, ein Punktestand, ein Lagerbestand, eine Besuchsstatistik. Klonk prüft den Inhalt der Tabellen nach dem Lauf mit mehreren Welten und Datensätzen; jeder Lauf beginnt mit einer frischen Kopie der Datenbank, mehrfaches Ausführen sammelt also keine Zeilen an.

**SQL-Injection:** Platzhalter sind von der ersten Aufgabe an verbindlich. Es lohnt sich, die Lücke einmal vorzuführen: Setzt man einen Namen per Verkettung ein, bricht \`O'Neil\` das SQL; die Eingabe \`x' OR '1'='1\` macht aus einem \`UPDATE … WHERE name = '…'\` eines, das alle Zeilen ändert. Mit \`?\` übergibt das Programm SQL und Werte getrennt – die Datenbank liest Werte nie als Befehl. Bezug zu Datensicherheit und Angriffen auf Webanwendungen.

**Typische Schwierigkeiten:** Zahl und Reihenfolge der Werte passen nicht zu den \`?\`. Ein Platzhalter in Anführungszeichen (\`'?'\`) ist ein Text, kein Platzhalter. In Python braucht ein Tupel mit einem Wert ein Komma (\`(color,)\`) – ein einzelner Wert darf auch ohne Tupel stehen. \`UPDATE\` ohne \`WHERE\` ändert alle Zeilen. In Aufgabe 2 heißt die Figur in jeder Welt anders – der Name kommt aus \`klonk.name\` (C# \`klonk.Name\`), nicht aus dem Aufgabentext.

**Differenzierung:** Aufgabe 4 nutzt den Rückgabewert von \`execute\` (ändern, sonst anlegen). Schnelle Lernende lösen sie zusätzlich mit einem einzigen Befehl: \`INSERT … ON CONFLICT (x, y) DO UPDATE SET count = count + 1\` (Upsert in SQLite).

**Ausblick:** A3 verbindet Welt und Datenbank in beide Richtungen – Baupläne bauen, Welten erfassen.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** A1 as well as \`INSERT\` and \`UPDATE\` in SQL (S2). Counter variables and branches in the chosen language (F2).

**Idea:** The program produces data, the database keeps it: a route log, a score, a stock of bricks, a visit statistic. Klonk checks the content of the tables after the run with several worlds and data sets; each run starts with a fresh copy of the database, so running a program several times does not pile up rows.

**SQL injection:** Placeholders are mandatory from the first task on. It is worth demonstrating the hole once: if a name is inserted by concatenation, \`O'Neil\` breaks the SQL; the input \`x' OR '1'='1\` turns an \`UPDATE … WHERE name = '…'\` into one that changes all rows. With \`?\` the program passes SQL and values separately – the database never reads values as commands. Links to data security and attacks on web applications.

**Typical difficulties:** The number and order of the values do not match the \`?\`. A placeholder in quotes (\`'?'\`) is text, not a placeholder. In Python a tuple with one value needs a comma (\`(color,)\`) – a single value may also be passed without a tuple. \`UPDATE\` without \`WHERE\` changes all rows. In task 2 the character has a different name in each world – the name comes from \`klonk.name\` (C# \`klonk.Name\`), not from the task text.

**Differentiation:** Task 4 uses the return value of \`execute\` (update, otherwise insert). Fast learners additionally solve it with a single statement: \`INSERT … ON CONFLICT (x, y) DO UPDATE SET count = count + 1\` (upsert in SQLite).

**Next:** A3 connects world and database in both directions – building from plans, recording worlds.`,
  },
  tasks: [
    {
      id: 'route-log',
      title: { de: 'Wegprotokoll', en: 'Route log' },
      text: {
        de: 'Klonk läuft bis zur Wand. Nach **jedem Schritt** trägt dein Programm eine Zeile in die Tabelle `path` der Datenbank `log` ein: die Nummer des Schritts (1, 2, 3 …) und Klonks neue Position (`x`, `y` wie `positionX()` und `positionY()`).',
        en: 'Klonk walks to the wall. After **every step** your program adds a row to the table `path` in the database `log`: the number of the step (1, 2, 3 …) and Klonk’s new position (`x`, `y` as returned by `positionX()` and `positionY()`).',
      },
      hints: [
        {
          de: `Die Tabelle hat die Spalten \`step\`, \`x\` und \`y\`. Eine Zeile mit drei Platzhaltern:

\`\`\`python
db.execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", (n, klonk.position_x(), klonk.position_y()))
\`\`\`

\`\`\`java
db.execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", n, klonk.positionX(), klonk.positionY());
\`\`\`

\`\`\`javascript
db.execute('INSERT INTO path (step, x, y) VALUES (?, ?, ?)', [n, klonk.positionX(), klonk.positionY()])
\`\`\`

\`\`\`csharp
db.Execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", n, klonk.PositionX(), klonk.PositionY());
\`\`\``,
          en: `The table has the columns \`step\`, \`x\` and \`y\`. One row with three placeholders:

\`\`\`python
db.execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", (n, klonk.position_x(), klonk.position_y()))
\`\`\`

\`\`\`java
db.execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", n, klonk.positionX(), klonk.positionY());
\`\`\`

\`\`\`javascript
db.execute('INSERT INTO path (step, x, y) VALUES (?, ?, ?)', [n, klonk.positionX(), klonk.positionY()])
\`\`\`

\`\`\`csharp
db.Execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", n, klonk.PositionX(), klonk.PositionY());
\`\`\``,
        },
      ],
      worlds: [
        map('> . . . .'),
        map(`
          . v . .
          . . . .
          . . . .
          . . . .
        `),
        map('. . . . . <'),
      ],
      databases: [{ name: 'log', sql: 'CREATE TABLE path (step INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL);\n' }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("log")
n = 0
while not klonk.is_wall():
    klonk.step()
    n = n + 1
    db.execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", (n, klonk.position_x(), klonk.position_y()))
`,
        java: `import klonk.Klonk;
import klonk.Database;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("log");
        int n = 0;
        while (!klonk.isWall()) {
            klonk.step();
            n++;
            db.execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", n, klonk.positionX(), klonk.positionY());
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('log')
let n = 0
while (!klonk.isWall()) {
  klonk.step()
  n++
  db.execute('INSERT INTO path (step, x, y) VALUES (?, ?, ?)', [n, klonk.positionX(), klonk.positionY()])
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("log");
var n = 0;
while (!klonk.IsWall())
{
    klonk.Step();
    n++;
    db.Execute("INSERT INTO path (step, x, y) VALUES (?, ?, ?)", n, klonk.PositionX(), klonk.PositionY());
}
`,
      },
      check: { position: true, tables: ['path'] },
      requires: ['loop'],
    },
    {
      id: 'score',
      title: { de: 'Punktestand', en: 'Score' },
      text: {
        de: 'Die Figur läuft bis zur Wand und sammelt Punkte: Jedes Feld mit einer Marke, das sie betritt, zählt einen Punkt (egal welche Farbe). Am Ende **addiert** dein Programm die gesammelten Punkte zu ihrem Punktestand in der Tabelle `players` (Datenbank `game`). Die Figur heißt in jeder Welt anders – ihren Namen kennt das Objekt.',
        en: 'The character walks to the wall and collects points: every cell with a mark it enters counts one point (any colour). At the end your program **adds** the collected points to its score in the table `players` (database `game`). The character has a different name in every world – the object knows its name.',
      },
      hints: [
        { de: 'Zähle die Punkte in einer Variablen und schreibe sie erst am Ende mit einem einzigen `UPDATE … SET points = points + ? WHERE name = ?`. Den Namen liefert `klonk.name` (C#: `klonk.Name`).', en: 'Count the points in a variable and write them only at the end with a single `UPDATE … SET points = points + ? WHERE name = ?`. The name comes from `klonk.name` (C#: `klonk.Name`).' },
      ],
      worlds: [
        map('> . y . y y .', { names: ['Klara'] }),
        map('> y r . . b . g', { names: ['Kim'] }),
        map('> . g .', { names: ['Klonk'] }),
      ],
      databases: [{
        name: 'game',
        sql: [
          game([['Klara', 12], ['Ben', 7], ['Kim', 3]]),
          game([['Klara', 5], ['Kim', 0], ['Klonk', 9]]),
          game([['Kim', 8], ['Klonk', 4], ['Klara', 2]]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("game")
points = 0
while not klonk.is_wall():
    klonk.step()
    if klonk.is_mark():
        points = points + 1
db.execute("UPDATE players SET points = points + ? WHERE name = ?", (points, klonk.name))
`,
        java: `import klonk.Klonk;
import klonk.Database;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("game");
        int points = 0;
        while (!klonk.isWall()) {
            klonk.step();
            if (klonk.isMark()) {
                points++;
            }
        }
        db.execute("UPDATE players SET points = points + ? WHERE name = ?", points, klonk.name);
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('game')
let points = 0
while (!klonk.isWall()) {
  klonk.step()
  if (klonk.isMark()) {
    points++
  }
}
db.execute('UPDATE players SET points = points + ? WHERE name = ?', [points, klonk.name])
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("game");
var points = 0;
while (!klonk.IsWall())
{
    klonk.Step();
    if (klonk.IsMark())
    {
        points++;
    }
}
db.Execute("UPDATE players SET points = points + ? WHERE name = ?", points, klonk.Name);
`,
      },
      check: { position: true, tables: ['players'] },
      requires: ['loop', 'if'],
    },
    {
      id: 'brick-store',
      title: { de: 'Ziegellager', en: 'Brick store' },
      text: {
        de: 'Klonk räumt auf: Er läuft bis zur Wand und hebt dabei **alle Ziegel** auf, die vor ihm liegen. Jeden aufgehobenen Ziegel bucht dein Programm ins Lager: In der Tabelle `stock` (Datenbank `store`) steigt die Anzahl (`amount`) seiner Farbe um 1. Für jede Ziegelfarbe gibt es dort schon eine Zeile.',
        en: 'Klonk tidies up: it walks to the wall and picks up **all bricks** lying in front of it on the way. Your program books every picked-up brick into the store: in the table `stock` (database `store`) the `amount` of its colour goes up by 1. There is already a row for every brick colour.',
      },
      hints: [
        { de: 'Die Farbe des obersten Ziegels erkennst du mit `isBrick(farbe)`. Welche Farben es gibt, steht im Lager: `SELECT color FROM stock` – probiere sie der Reihe nach aus, bevor du den Ziegel aufhebst.', en: 'You recognise the colour of the top brick with `isBrick(colour)`. The colours are listed in the store: `SELECT color FROM stock` – try them one after another before picking up the brick.' },
        { de: 'Auf einem Feld können mehrere Ziegel liegen: Solange `isBrick()` gilt, Farbe suchen, aufheben, buchen – erst dann den nächsten Schritt.', en: 'A cell can hold several bricks: as long as `isBrick()` is true, find the colour, pick up, book – only then take the next step.' },
      ],
      worlds: [
        map('> RB . GG Y . BRB .'),
        map('> O G . RRY B'),
        map('> . . W K . PG'),
      ],
      databases: [{
        name: 'store',
        sql: [
          store({ red: 4, blue: 0, yellow: 2, green: 7, orange: 1, purple: 0, white: 3, black: 5 }),
          store({ red: 0, blue: 2, yellow: 0, green: 1, orange: 6, purple: 2, white: 0, black: 1 }),
          store({ red: 10, blue: 10, yellow: 10, green: 0, orange: 0, purple: 3, white: 1, black: 0 }),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("store")
colors = db.query("SELECT color FROM stock")
while not klonk.is_wall():
    while klonk.is_brick():
        for row in colors:
            if klonk.is_brick(row["color"]):
                klonk.pick_brick()
                db.execute("UPDATE stock SET amount = amount + 1 WHERE color = ?", (row["color"],))
                break
    klonk.step()
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;
import java.util.List;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("store");
        List<Row> colors = db.query("SELECT color FROM stock");
        while (!klonk.isWall()) {
            while (klonk.isBrick()) {
                for (Row row : colors) {
                    String color = row.getString("color");
                    if (klonk.isBrick(color)) {
                        klonk.pickBrick();
                        db.execute("UPDATE stock SET amount = amount + 1 WHERE color = ?", color);
                        break;
                    }
                }
            }
            klonk.step();
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('store')
const colors = db.query('SELECT color FROM stock')
while (!klonk.isWall()) {
  while (klonk.isBrick()) {
    for (const row of colors) {
      if (klonk.isBrick(row.color)) {
        klonk.pickBrick()
        db.execute('UPDATE stock SET amount = amount + 1 WHERE color = ?', [row.color])
        break
      }
    }
  }
  klonk.step()
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("store");
var colors = db.Query("SELECT color FROM stock");
while (!klonk.IsWall())
{
    while (klonk.IsBrick())
    {
        foreach (var row in colors)
        {
            var color = row.GetString("color");
            if (klonk.IsBrick(color))
            {
                klonk.PickBrick();
                db.Execute("UPDATE stock SET amount = amount + 1 WHERE color = ?", color);
                break;
            }
        }
    }
    klonk.Step();
}
`,
      },
      check: { cells: true, tables: ['stock'] },
      requires: ['loop', 'if'],
    },
    {
      id: 'visits',
      title: { de: 'Besuchszähler', en: 'Visit counter' },
      text: {
        de: 'Klonk läuft bis zur Wand, dreht sich um und läuft zurück bis zur gegenüberliegenden Wand. Jedes Mal, wenn er ein Feld **betritt**, zählt das als Besuch: In der Tabelle `visits` (Datenbank `visits`) steigt `count` für dieses Feld um 1. Manche Felder stehen dort schon aus früheren Läufen, andere noch nicht – für sie legt dein Programm eine neue Zeile mit `count` = 1 an.',
        en: 'Klonk walks to the wall, turns around and walks back to the opposite wall. Every time it **enters** a cell, that counts as a visit: in the table `visits` (database `visits`) the `count` of this cell goes up by 1. Some cells are already there from earlier runs, others are not – for those your program adds a new row with `count` = 1.',
      },
      hints: [
        { de: '`execute` liefert die Zahl der geänderten Zeilen. Versuche zuerst das `UPDATE`; ist das Ergebnis 0, gab es das Feld noch nicht – dann folgt ein `INSERT`.', en: '`execute` returns the number of changed rows. Try the `UPDATE` first; if the result is 0, the cell was not there yet – then an `INSERT` follows.' },
      ],
      worlds: [
        map('. . > . . .'),
        map(`
          . . . .
          > . . .
        `),
        map('. . . . . . <'),
      ],
      databases: [{
        name: 'visits',
        sql: [
          visits([[1, 1, 3], [4, 1, 1], [6, 1, 2]]),
          visits([[1, 1, 4], [2, 2, 1], [4, 2, 7]]),
          visits([[3, 1, 2], [7, 1, 1]]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("visits")
for lap in range(2):
    while not klonk.is_wall():
        klonk.step()
        x = klonk.position_x()
        y = klonk.position_y()
        changed = db.execute("UPDATE visits SET count = count + 1 WHERE x = ? AND y = ?", (x, y))
        if changed == 0:
            db.execute("INSERT INTO visits (x, y, count) VALUES (?, ?, 1)", (x, y))
    klonk.turn_left()
    klonk.turn_left()
`,
        java: `import klonk.Klonk;
import klonk.Database;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("visits");
        for (int lap = 0; lap < 2; lap++) {
            while (!klonk.isWall()) {
                klonk.step();
                int x = klonk.positionX();
                int y = klonk.positionY();
                int changed = db.execute("UPDATE visits SET count = count + 1 WHERE x = ? AND y = ?", x, y);
                if (changed == 0) {
                    db.execute("INSERT INTO visits (x, y, count) VALUES (?, ?, 1)", x, y);
                }
            }
            klonk.turnLeft();
            klonk.turnLeft();
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('visits')
for (let lap = 0; lap < 2; lap++) {
  while (!klonk.isWall()) {
    klonk.step()
    const x = klonk.positionX()
    const y = klonk.positionY()
    const changed = db.execute('UPDATE visits SET count = count + 1 WHERE x = ? AND y = ?', [x, y])
    if (changed === 0) {
      db.execute('INSERT INTO visits (x, y, count) VALUES (?, ?, 1)', [x, y])
    }
  }
  klonk.turnLeft()
  klonk.turnLeft()
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("visits");
for (var lap = 0; lap < 2; lap++)
{
    while (!klonk.IsWall())
    {
        klonk.Step();
        var x = klonk.PositionX();
        var y = klonk.PositionY();
        var changed = db.Execute("UPDATE visits SET count = count + 1 WHERE x = ? AND y = ?", x, y);
        if (changed == 0)
        {
            db.Execute("INSERT INTO visits (x, y, count) VALUES (?, ?, 1)", x, y);
        }
    }
    klonk.TurnLeft();
    klonk.TurnLeft();
}
`,
      },
      check: { position: true, tables: ['visits'] },
      requires: ['loop', 'if'],
    },
  ],
}
