import { map } from '../../map'
import type { LearnModule } from '../../types'

/** Stapel einer Reihe: Spalte, Höhe, Farbe (Bauplan bzw. alte Inventurliste) – absichtlich unsortiert */
const stacks = (rows: [number, number, string][]) => `CREATE TABLE stacks (x INTEGER NOT NULL, height INTEGER NOT NULL, color TEXT NOT NULL);
${rows.map(([x, height, color]) => `INSERT INTO stacks VALUES (${x}, ${height}, '${color}');`).join('\n')}
`

const MARKS: Record<string, string> = { y: 'yellow', r: 'red', b: 'blue', g: 'green' }
/** Pixelbild als Textkarte (Zeile = y, Spalte = x, `.` = leer, `y` `r` `b` `g` = Marke) ⇒ Tabelle `pixels`, rückwärts eingefügt */
function picture(art: string) {
  const pixels = art.trim().split('\n')
    .flatMap((line, y) => line.trim().split(/\s+/).map((char, x) => ({ x: x + 1, y: y + 1, color: MARKS[char] })))
    .filter(p => p.color)
  return `CREATE TABLE pixels (x INTEGER NOT NULL, y INTEGER NOT NULL, color TEXT NOT NULL);
${pixels.reverse().map(p => `INSERT INTO pixels VALUES (${p.x}, ${p.y}, '${p.color}');`).join('\n')}
`
}

/** Methode „gehe zu Feld x|y“ der Musterlösungen (Aufgaben 2 und 4) */
const goTo = {
  python: `def go_to(klonk, x, y):
    while klonk.position_x() < x:
        while not klonk.is_facing_east():
            klonk.turn_left()
        klonk.step()
    while klonk.position_x() > x:
        while not klonk.is_facing_west():
            klonk.turn_left()
        klonk.step()
    while klonk.position_y() < y:
        while not klonk.is_facing_south():
            klonk.turn_left()
        klonk.step()
    while klonk.position_y() > y:
        while not klonk.is_facing_north():
            klonk.turn_left()
        klonk.step()
`,
  java: `    static void goTo(Klonk klonk, int x, int y) {
        while (klonk.positionX() < x) {
            while (!klonk.isFacingEast()) {
                klonk.turnLeft();
            }
            klonk.step();
        }
        while (klonk.positionX() > x) {
            while (!klonk.isFacingWest()) {
                klonk.turnLeft();
            }
            klonk.step();
        }
        while (klonk.positionY() < y) {
            while (!klonk.isFacingSouth()) {
                klonk.turnLeft();
            }
            klonk.step();
        }
        while (klonk.positionY() > y) {
            while (!klonk.isFacingNorth()) {
                klonk.turnLeft();
            }
            klonk.step();
        }
    }
`,
  javascript: (typed: boolean) => `function goTo(${typed ? 'klonk: Klonk, x: number, y: number' : 'klonk, x, y'}) {
  while (klonk.positionX() < x) {
    while (!klonk.isFacingEast()) {
      klonk.turnLeft()
    }
    klonk.step()
  }
  while (klonk.positionX() > x) {
    while (!klonk.isFacingWest()) {
      klonk.turnLeft()
    }
    klonk.step()
  }
  while (klonk.positionY() < y) {
    while (!klonk.isFacingSouth()) {
      klonk.turnLeft()
    }
    klonk.step()
  }
  while (klonk.positionY() > y) {
    while (!klonk.isFacingNorth()) {
      klonk.turnLeft()
    }
    klonk.step()
  }
}
`,
  csharp: `void GoTo(Klonk klonk, int x, int y)
{
    while (klonk.PositionX() < x)
    {
        while (!klonk.IsFacingEast())
        {
            klonk.TurnLeft();
        }
        klonk.Step();
    }
    while (klonk.PositionX() > x)
    {
        while (!klonk.IsFacingWest())
        {
            klonk.TurnLeft();
        }
        klonk.Step();
    }
    while (klonk.PositionY() < y)
    {
        while (!klonk.IsFacingSouth())
        {
            klonk.TurnLeft();
        }
        klonk.Step();
    }
    while (klonk.PositionY() > y)
    {
        while (!klonk.IsFacingNorth())
        {
            klonk.TurnLeft();
        }
        klonk.Step();
    }
}
`,
}

const pictureMain = {
  javascript: `const klonk = new Klonk()
const db = Database.open('picture')
for (const row of db.query('SELECT x, y, color FROM pixels ORDER BY y, x')) {
  goTo(klonk, row.x, row.y)
  klonk.setMark(row.color)
}
`,
}

const copyMain = {
  javascript: `const klonk = new Klonk()
const db = Database.open('clipboard')
const colors = [yellow, red, blue, green]
for (let y = 1; y <= 3; y++) {
  for (let x = 1; x <= 3; x++) {
    goTo(klonk, x, y)
    for (const color of colors) {
      if (klonk.isMark(color)) {
        db.execute('INSERT INTO marks (x, y, color) VALUES (?, ?, ?)', [x, y, color])
      }
    }
  }
}
for (const row of db.query('SELECT x, y, color FROM marks')) {
  goTo(klonk, row.x + 4, row.y)
  klonk.setMark(row.color)
}
`,
}

export const appWorld: LearnModule = {
  id: 'app-world',
  track: 'apps',
  title: { de: 'Welt und Datenbank', en: 'World and database' },
  summary: {
    de: 'Baupläne aus einer Tabelle in der Welt bauen und umgekehrt festhalten, was in der Welt steht.',
    en: 'Build plans from a table in the world and, the other way round, record what is in the world.',
  },
  objectives: [
    { de: 'Zeilen einer Tabelle als Bauplan lesen und die Figur danach Ziegel legen und Marken setzen lassen', en: 'Read the rows of a table as a plan and let the character place bricks and set marks accordingly' },
    { de: 'Den Zustand der Welt (Stapel, Marken, Positionen) erfassen und als Zeilen speichern', en: 'Record the state of the world (stacks, marks, positions) and store it as rows' },
    { de: 'Eine Tabelle als Zwischenspeicher nutzen, um einen Teil der Welt an eine andere Stelle zu übertragen', en: 'Use a table as a clipboard to transfer part of the world to another place' },
  ],
  prerequisites: ['app-update'],
  intro: {
    de: `Eine Welt besteht aus Daten: Wo liegen wie viele Ziegel welcher Farbe, wo sind Marken? Solche Daten passen gut in Tabellen. In diesem Modul geht es in **beide Richtungen** – von der Datenbank in die Welt und von der Welt in die Datenbank.

\`\`\`python
from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("example")
# Datenbank ⇒ Welt: Ziegel nach Plan legen
for row in db.query("SELECT color FROM tower ORDER BY level"):
    klonk.place_brick(row["color"])
# Welt ⇒ Datenbank: festhalten, was Klonk vor sich sieht
db.execute("INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)", (klonk.position_x(), klonk.position_y(), klonk.brick_count()))
\`\`\`

\`\`\`java
import klonk.Klonk;
import klonk.Database;
import klonk.Row;

public class Programm {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("example");
        // Datenbank ⇒ Welt: Ziegel nach Plan legen
        for (Row row : db.query("SELECT color FROM tower ORDER BY level")) {
            klonk.placeBrick(row.getString("color"));
        }
        // Welt ⇒ Datenbank: festhalten, was Klonk vor sich sieht
        db.execute("INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)", klonk.positionX(), klonk.positionY(), klonk.brickCount());
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('example')
// Datenbank ⇒ Welt: Ziegel nach Plan legen
for (const row of db.query('SELECT color FROM tower ORDER BY level')) {
  klonk.placeBrick(row.color)
}
// Welt ⇒ Datenbank: festhalten, was Klonk vor sich sieht
db.execute('INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)', [klonk.positionX(), klonk.positionY(), klonk.brickCount()])
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
var db = Database.Open("example");
// Datenbank ⇒ Welt: Ziegel nach Plan legen
foreach (var row in db.Query("SELECT color FROM tower ORDER BY level"))
{
    klonk.PlaceBrick(row.GetString("color"));
}
// Welt ⇒ Datenbank: festhalten, was Klonk vor sich sieht
db.Execute("INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)", klonk.PositionX(), klonk.PositionY(), klonk.BrickCount());
\`\`\`

**Koordinaten** in den Tabellen sind dieselben wie bei \`positionX()\` und \`positionY()\`: x zählt von Westen nach Osten (links nach rechts), y von Norden nach Süden (oben nach unten), beide ab 1. **Farben** stehen als Text in den Tabellen (\`red\`, \`blue\` …) – das sind genau die Werte der Farbkonstanten, du kannst sie also direkt an \`placeBrick\` oder \`setMark\` geben. Umgekehrt verrät \`isBrick(farbe)\` die Farbe des obersten Ziegels vor Klonk und \`isMark(farbe)\` die Farbe der Marke unter ihm.`,
    en: `A world consists of data: where are how many bricks of which colour, where are marks? Such data fits well into tables. This module works in **both directions** – from the database into the world and from the world into the database.

\`\`\`python
from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("example")
# database ⇒ world: place bricks according to the plan
for row in db.query("SELECT color FROM tower ORDER BY level"):
    klonk.place_brick(row["color"])
# world ⇒ database: record what Klonk sees in front of it
db.execute("INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)", (klonk.position_x(), klonk.position_y(), klonk.brick_count()))
\`\`\`

\`\`\`java
import klonk.Klonk;
import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("example");
        // database ⇒ world: place bricks according to the plan
        for (Row row : db.query("SELECT color FROM tower ORDER BY level")) {
            klonk.placeBrick(row.getString("color"));
        }
        // world ⇒ database: record what Klonk sees in front of it
        db.execute("INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)", klonk.positionX(), klonk.positionY(), klonk.brickCount());
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('example')
// database ⇒ world: place bricks according to the plan
for (const row of db.query('SELECT color FROM tower ORDER BY level')) {
  klonk.placeBrick(row.color)
}
// world ⇒ database: record what Klonk sees in front of it
db.execute('INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)', [klonk.positionX(), klonk.positionY(), klonk.brickCount()])
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
var db = Database.Open("example");
// database ⇒ world: place bricks according to the plan
foreach (var row in db.Query("SELECT color FROM tower ORDER BY level"))
{
    klonk.PlaceBrick(row.GetString("color"));
}
// world ⇒ database: record what Klonk sees in front of it
db.Execute("INSERT INTO seen (x, y, bricks) VALUES (?, ?, ?)", klonk.PositionX(), klonk.PositionY(), klonk.BrickCount());
\`\`\`

**Coordinates** in the tables are the same as for \`positionX()\` and \`positionY()\`: x counts from west to east (left to right), y from north to south (top to bottom), both starting at 1. **Colours** are stored as text (\`red\`, \`blue\` …) – exactly the values of the colour constants, so you can pass them directly to \`placeBrick\` or \`setMark\`. The other way round, \`isBrick(colour)\` reveals the colour of the top brick in front of Klonk and \`isMark(colour)\` the colour of the mark below it.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** A1 und A2, eigene Methoden mit Parametern (F3). Aufgabe 2 und 4 verlangen eine Methode – das Hinlaufen zu einem Feld.

**Idee:** Die Welt ist auch nur Daten. Ein Bauplan in einer Tabelle wird zur Welt (Aufgaben 1 und 2), eine Welt wird zur Tabelle (Aufgabe 3), und über eine Tabelle als Zwischenspeicher wandert ein Muster an eine andere Stelle (Aufgabe 4). Aufgabe 3 ist die Umkehrung von Aufgabe 1: Die erfasste Tabelle hat denselben Aufbau wie der Bauplan – ein schöner Anlass, über Datenformate zu sprechen. Wer die Welt als Datenbank aus S1 kennt, sieht hier, wie ein Programm denselben Abgleich selbst herstellt.

**Typische Schwierigkeiten:** x und y vertauscht oder y in die falsche Richtung (y wächst nach Süden). Der Bauplan ist unsortiert – ohne \`ORDER BY x\` müsste Klonk zurücklaufen. Die Farbe des obersten Ziegels lässt sich nur über \`isBrick(farbe)\` herausfinden, also durch Ausprobieren aller Farben. In Aufgabe 3 bleiben die alten Zeilen stehen, wenn sie nicht zuerst gelöscht werden; wer zum Zählen Ziegel aufhebt, verändert die Welt (geprüft wird auch sie). Die Methode zum Hinlaufen braucht die Figur als Parameter (oder als Attribut, ab A4).

**Differenzierung:** Schnelle Lernende entwerfen eigene Pixelbilder als \`INSERT\`-Anweisungen oder lösen Aufgabe 4 ohne feste Bereichsgröße (Grenzen per \`isWall\` oder aus einer Abfrage mit \`max(x)\`). Langsamere Lernende bekommen die Methode zum Hinlaufen vorgegeben und konzentrieren sich auf die Datenbank.

**Ausblick:** A4 bildet Zeilen auf Objekte eigener Klassen ab (Aufträge, Figuren) und schreibt sie zurück.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** A1 and A2, own methods with parameters (F3). Tasks 2 and 4 require a method – walking to a cell.

**Idea:** The world is just data, too. A plan in a table becomes the world (tasks 1 and 2), a world becomes a table (task 3), and via a table used as a clipboard a pattern moves to another place (task 4). Task 3 is the reverse of task 1: the recorded table has the same structure as the plan – a good occasion to talk about data formats. Students who know the world as a database from S1 see here how a program establishes the same mapping itself.

**Typical difficulties:** x and y swapped or y in the wrong direction (y grows to the south). The plan is unsorted – without \`ORDER BY x\` Klonk would have to walk back. The colour of the top brick can only be found with \`isBrick(colour)\`, i.e. by trying all colours. In task 3 the old rows remain unless they are deleted first; whoever picks up bricks to count them changes the world (which is checked as well). The method for walking needs the character as a parameter (or as an attribute, from A4 on).

**Differentiation:** Fast learners design their own pixel pictures as \`INSERT\` statements or solve task 4 without a fixed area size (limits via \`isWall\` or from a query with \`max(x)\`). Slower learners get the walking method and concentrate on the database.

**Next:** A4 maps rows to objects of their own classes (orders, characters) and writes them back.`,
  },
  tasks: [
    {
      id: 'build-plan',
      title: { de: 'Bauplan', en: 'Building plan' },
      text: {
        de: 'In der Tabelle `stacks` (Datenbank `plan`) steht ein Bauplan: Jede Zeile ist ein Stapel mit Spalte `x`, Höhe `height` und Farbe `color`. Klonk läuft nach Osten und baut jeden Stapel **links neben sich** (im Norden) in der richtigen Spalte. Die Zeilen stehen ungeordnet in der Tabelle.',
        en: 'The table `stacks` (database `plan`) holds a building plan: every row is a stack with column `x`, height `height` and colour `color`. Klonk walks east and builds every stack **to its left** (to the north) in the right column. The rows are not in order in the table.',
      },
      hints: [
        { de: 'Sortiere mit `ORDER BY x`, dann muss Klonk nie zurück. Für jede Zeile: laufen, solange `positionX()` kleiner als `x` ist – dann nach links drehen, bauen, zurückdrehen.', en: 'Sort with `ORDER BY x`, then Klonk never has to go back. For each row: walk while `positionX()` is less than `x` – then turn left, build, turn back.' },
      ],
      worlds: [map('. . . . . . .\n> . . . . . .')],
      databases: [{
        name: 'plan',
        sql: [
          stacks([[4, 3, 'blue'], [2, 1, 'red'], [6, 5, 'yellow'], [7, 2, 'green']]),
          stacks([[5, 6, 'orange'], [1, 2, 'purple'], [3, 4, 'red']]),
          stacks([[7, 1, 'white'], [3, 3, 'black'], [2, 2, 'blue'], [5, 4, 'green'], [6, 1, 'red']]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("plan")
for row in db.query("SELECT x, height, color FROM stacks ORDER BY x"):
    while klonk.position_x() < row["x"]:
        klonk.step()
    klonk.turn_left()
    for i in range(row["height"]):
        klonk.place_brick(row["color"])
    klonk.turn_right()
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("plan");
        for (Row row : db.query("SELECT x, height, color FROM stacks ORDER BY x")) {
            while (klonk.positionX() < row.getInt("x")) {
                klonk.step();
            }
            klonk.turnLeft();
            for (int i = 0; i < row.getInt("height"); i++) {
                klonk.placeBrick(row.getString("color"));
            }
            klonk.turnRight();
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('plan')
for (const row of db.query('SELECT x, height, color FROM stacks ORDER BY x')) {
  while (klonk.positionX() < row.x) {
    klonk.step()
  }
  klonk.turnLeft()
  for (let i = 0; i < row.height; i++) {
    klonk.placeBrick(row.color)
  }
  klonk.turnRight()
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("plan");
foreach (var row in db.Query("SELECT x, height, color FROM stacks ORDER BY x"))
{
    while (klonk.PositionX() < row.GetInt("x"))
    {
        klonk.Step();
    }
    klonk.TurnLeft();
    for (var i = 0; i < row.GetInt("height"); i++)
    {
        klonk.PlaceBrick(row.GetString("color"));
    }
    klonk.TurnRight();
}
`,
      },
      check: { cells: true },
      requires: ['loop'],
    },
    {
      id: 'pixel-picture',
      title: { de: 'Pixelbild', en: 'Pixel picture' },
      text: {
        de: 'Die Tabelle `pixels` (Datenbank `picture`) beschreibt ein Bild aus Marken: Jede Zeile ist ein Feld (`x`, `y`) mit der Farbe der Marke (`color`). Klonk setzt alle Marken des Bildes. Schreibe dafür eine **Methode**, die Klonk zu einem beliebigen Feld x|y bringt.',
        en: 'The table `pixels` (database `picture`) describes a picture made of marks: every row is a cell (`x`, `y`) with the colour of the mark (`color`). Klonk sets all marks of the picture. For this, write a **method** that brings Klonk to any cell x|y.',
      },
      hints: [
        { de: 'Methode `goTo(klonk, x, y)` (Python `go_to`, C# `GoTo`): Solange `positionX()` kleiner als `x` ist, nach Osten drehen (links drehen, bis `isFacingEast()` gilt) und einen Schritt gehen. Ebenso nach Westen, Süden (y zu klein) und Norden (y zu groß).', en: 'Method `goTo(klonk, x, y)` (Python `go_to`, C# `GoTo`): as long as `positionX()` is less than `x`, face east (turn left until `isFacingEast()` holds) and take a step. Likewise to the west, south (y too small) and north (y too large).' },
        { de: 'Marken stören beim Laufen nicht – Klonk kann einfach darüber gehen.', en: 'Marks do not get in the way – Klonk can simply walk over them.' },
      ],
      worlds: [map(`
        > . . . .
        . . . . .
        . . . . .
        . . . . .
        . . . . .
      `)],
      databases: [{
        name: 'picture',
        sql: [
          picture(`
            . r . r .
            r r r r r
            r r r r r
            . r r r .
            . . r . .
          `),
          picture(`
            . y y y .
            y b y b y
            y y y y y
            y r y r y
            . y r y .
          `),
          picture(`
            . . g . .
            . g g g .
            g g g g g
            . . r . .
            . . r . .
          `),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

${goTo.python}
klonk = Klonk()
db = Database.open("picture")
for row in db.query("SELECT x, y, color FROM pixels ORDER BY y, x"):
    go_to(klonk, row["x"], row["y"])
    klonk.set_mark(row["color"])
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("picture");
        for (Row row : db.query("SELECT x, y, color FROM pixels ORDER BY y, x")) {
            goTo(klonk, row.getInt("x"), row.getInt("y"));
            klonk.setMark(row.getString("color"));
        }
    }

${goTo.java}}
`,
        javascript: `import { Klonk, Database } from 'klonk'

${goTo.javascript(false)}
${pictureMain.javascript}`,
        typescript: `import { Klonk, Database } from 'klonk'

${goTo.javascript(true)}
${pictureMain.javascript}`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("picture");
foreach (var row in db.Query("SELECT x, y, color FROM pixels ORDER BY y, x"))
{
    GoTo(klonk, row.GetInt("x"), row.GetInt("y"));
    klonk.SetMark(row.GetString("color"));
}

${goTo.csharp}`,
      },
      check: { cells: true },
      requires: ['loop', 'method'],
    },
    {
      id: 'inventory',
      title: { de: 'Inventur', en: 'Stocktaking' },
      text: {
        de: 'Im Regal (der obersten Reihe) stehen Stapel, jeder aus Ziegeln **einer** Farbe – rot, blau, gelb oder grün. Klonk läuft darunter nach Osten bis zur Wand und erfasst jeden Stapel als Zeile in der Tabelle `stacks` (Datenbank `inventory`): Spalte `x`, Anzahl der Ziegel `height`, Farbe `color`. Leere Felder bekommen keine Zeile. In der Tabelle steht noch die alte Inventur – sie muss vorher weg. Die Stapel selbst bleiben, wie sie sind.',
        en: 'The shelf (the top row) holds stacks, each made of bricks of **one** colour – red, blue, yellow or green. Klonk walks east below it to the wall and records every stack as a row in the table `stacks` (database `inventory`): column `x`, number of bricks `height`, colour `color`. Empty cells get no row. The table still contains the old stocktaking – it has to go first. The stacks themselves stay as they are.',
      },
      hints: [
        { de: 'Alte Zeilen löschst du mit `DELETE FROM stacks`. Für jede Spalte (auch die erste und die letzte): nach links drehen, `brickCount()` lesen, die Farbe mit `isBrick(farbe)` herausfinden, zurückdrehen.', en: 'Delete old rows with `DELETE FROM stacks`. For every column (including the first and the last): turn left, read `brickCount()`, find the colour with `isBrick(colour)`, turn back.' },
        { de: 'Die Farben kannst du wie die Klasse importieren und in eine Liste schreiben: `[red, blue, yellow, green]` (Java `RED` …, C# `Red` …).', en: 'You can import the colours like the class and put them in a list: `[red, blue, yellow, green]` (Java `RED` …, C# `Red` …).' },
      ],
      worlds: [
        map('RR . BBB Y . GGGG R\n> . . . . . .'),
        map('. GG . . YYYYY B .\n> . . . . . .'),
        map('B R G Y BB RR .\n> . . . . . .'),
      ],
      databases: [{
        name: 'inventory',
        sql: [
          stacks([[1, 3, 'red'], [5, 1, 'green']]),
          stacks([[2, 2, 'green']]),
          stacks([[7, 6, 'yellow'], [1, 1, 'blue'], [4, 2, 'blue']]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database, red, blue, yellow, green

klonk = Klonk()
db = Database.open("inventory")
db.execute("DELETE FROM stacks")
colors = [red, blue, yellow, green]
while True:
    klonk.turn_left()
    height = klonk.brick_count()
    if height > 0:
        for color in colors:
            if klonk.is_brick(color):
                db.execute("INSERT INTO stacks (x, height, color) VALUES (?, ?, ?)", (klonk.position_x(), height, color))
    klonk.turn_right()
    if klonk.is_wall():
        break
    klonk.step()
`,
        java: `import klonk.Klonk;
import klonk.Database;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("inventory");
        db.execute("DELETE FROM stacks");
        String[] colors = { RED, BLUE, YELLOW, GREEN };
        while (true) {
            klonk.turnLeft();
            int height = klonk.brickCount();
            if (height > 0) {
                for (String color : colors) {
                    if (klonk.isBrick(color)) {
                        db.execute("INSERT INTO stacks (x, height, color) VALUES (?, ?, ?)", klonk.positionX(), height, color);
                    }
                }
            }
            klonk.turnRight();
            if (klonk.isWall()) {
                break;
            }
            klonk.step();
        }
    }
}
`,
        javascript: `import { Klonk, Database, red, blue, yellow, green } from 'klonk'

const klonk = new Klonk()
const db = Database.open('inventory')
db.execute('DELETE FROM stacks')
const colors = [red, blue, yellow, green]
while (true) {
  klonk.turnLeft()
  const height = klonk.brickCount()
  if (height > 0) {
    for (const color of colors) {
      if (klonk.isBrick(color)) {
        db.execute('INSERT INTO stacks (x, height, color) VALUES (?, ?, ?)', [klonk.positionX(), height, color])
      }
    }
  }
  klonk.turnRight()
  if (klonk.isWall()) {
    break
  }
  klonk.step()
}
`,
        csharp: `using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
var db = Database.Open("inventory");
db.Execute("DELETE FROM stacks");
string[] colors = { Red, Blue, Yellow, Green };
while (true)
{
    klonk.TurnLeft();
    var height = klonk.BrickCount();
    if (height > 0)
    {
        foreach (var color in colors)
        {
            if (klonk.IsBrick(color))
            {
                db.Execute("INSERT INTO stacks (x, height, color) VALUES (?, ?, ?)", klonk.PositionX(), height, color);
            }
        }
    }
    klonk.TurnRight();
    if (klonk.IsWall())
    {
        break;
    }
    klonk.Step();
}
`,
      },
      check: { cells: true, tables: ['stacks'] },
      requires: ['loop', 'if'],
    },
    {
      id: 'copy-pattern',
      title: { de: 'Muster kopieren', en: 'Copy a pattern' },
      text: {
        de: 'Links in der Welt (Spalten 1 bis 3, Reihen 1 bis 3) liegt ein Muster aus Marken. Kopiere es über die Datenbank **vier Felder nach rechts** (Spalten 5 bis 7): Zuerst speichert dein Programm jede Marke des linken Bereichs als Zeile in der Tabelle `marks` (Datenbank `clipboard`) – `x`, `y` und `color` wie im linken Bereich. Danach setzt Klonk nach diesen Zeilen die Marken im rechten Bereich.',
        en: 'On the left of the world (columns 1 to 3, rows 1 to 3) there is a pattern of marks. Copy it via the database **four cells to the right** (columns 5 to 7): first your program stores every mark of the left area as a row in the table `marks` (database `clipboard`) – `x`, `y` and `color` as in the left area. Then Klonk sets the marks in the right area according to these rows.',
      },
      hints: [
        { de: 'Zwei verschachtelte Zählschleifen für y und x besuchen alle neun Felder des linken Bereichs – mit deiner Methode zum Hinlaufen aus der Pixelbild-Aufgabe. Die Farbe einer Marke verrät `isMark(farbe)`.', en: 'Two nested counting loops for y and x visit all nine cells of the left area – with your walking method from the pixel picture task. `isMark(colour)` reveals the colour of a mark.' },
      ],
      worlds: [
        map(`
          >y . r . . . .
          .  b . . . . .
          g  . y . . . .
        `),
        map(`
          > r r . . . .
          . . r . . . .
          b b b . . . .
        `),
        map(`
          >g g g . . . .
          .  . . . . . .
          .  y . . . . .
        `),
      ],
      databases: [{ name: 'clipboard', sql: 'CREATE TABLE marks (x INTEGER NOT NULL, y INTEGER NOT NULL, color TEXT NOT NULL);\n' }],
      solutions: {
        python: `from klonk import Klonk, Database, yellow, red, blue, green

${goTo.python}
klonk = Klonk()
db = Database.open("clipboard")
colors = [yellow, red, blue, green]
for y in range(1, 4):
    for x in range(1, 4):
        go_to(klonk, x, y)
        for color in colors:
            if klonk.is_mark(color):
                db.execute("INSERT INTO marks (x, y, color) VALUES (?, ?, ?)", (x, y, color))
for row in db.query("SELECT x, y, color FROM marks"):
    go_to(klonk, row["x"] + 4, row["y"])
    klonk.set_mark(row["color"])
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("clipboard");
        String[] colors = { YELLOW, RED, BLUE, GREEN };
        for (int y = 1; y <= 3; y++) {
            for (int x = 1; x <= 3; x++) {
                goTo(klonk, x, y);
                for (String color : colors) {
                    if (klonk.isMark(color)) {
                        db.execute("INSERT INTO marks (x, y, color) VALUES (?, ?, ?)", x, y, color);
                    }
                }
            }
        }
        for (Row row : db.query("SELECT x, y, color FROM marks")) {
            goTo(klonk, row.getInt("x") + 4, row.getInt("y"));
            klonk.setMark(row.getString("color"));
        }
    }

${goTo.java}}
`,
        javascript: `import { Klonk, Database, yellow, red, blue, green } from 'klonk'

${goTo.javascript(false)}
${copyMain.javascript}`,
        typescript: `import { Klonk, Database, yellow, red, blue, green } from 'klonk'

${goTo.javascript(true)}
${copyMain.javascript}`,
        csharp: `using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
var db = Database.Open("clipboard");
string[] colors = { Yellow, Red, Blue, Green };
for (var y = 1; y <= 3; y++)
{
    for (var x = 1; x <= 3; x++)
    {
        GoTo(klonk, x, y);
        foreach (var color in colors)
        {
            if (klonk.IsMark(color))
            {
                db.Execute("INSERT INTO marks (x, y, color) VALUES (?, ?, ?)", x, y, color);
            }
        }
    }
}
foreach (var row in db.Query("SELECT x, y, color FROM marks"))
{
    GoTo(klonk, row.GetInt("x") + 4, row.GetInt("y"));
    klonk.SetMark(row.GetString("color"));
}

${goTo.csharp}`,
      },
      check: { cells: true, tables: ['marks'] },
      requires: ['loop', 'method'],
    },
  ],
}
