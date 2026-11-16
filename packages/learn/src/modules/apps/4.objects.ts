import { map } from '../../map'
import type { LearnModule } from '../../types'

/** Neue Figuren: Name, Aussehen, Feld (ab 1) und Farbe ihrer Marke */
const figures = (rows: [string, string, number, number, string][]) => `CREATE TABLE figures (name TEXT PRIMARY KEY, look TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, mark TEXT NOT NULL);
${rows.map(([name, look, x, y, mark]) => `INSERT INTO figures VALUES ('${name}', '${look}', ${x}, ${y}, '${mark}');`).join('\n')}
`

/** Alter Spielstand (Figuren und Positionen, teils längst überholt) */
const savegame = (rows: [string, number, number][]) => `CREATE TABLE figures (name TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL);
${rows.map(([name, x, y]) => `INSERT INTO figures VALUES ('${name}', ${x}, ${y});`).join('\n')}
`

/** Bauaufträge: Figur, Spalte, Höhe, Farbe – je Figur mit wachsender Spalte */
const orders = (rows: [string, number, number, string][]) => `CREATE TABLE orders (id INTEGER PRIMARY KEY, worker TEXT NOT NULL, x INTEGER NOT NULL, height INTEGER NOT NULL, color TEXT NOT NULL);
${rows.map(([worker, x, height, color], i) => `INSERT INTO orders VALUES (${i + 1}, '${worker}', ${x}, ${height}, '${color}');`).join('\n')}
`

/** Figuren im Dienst mit gespeicherter Position und Markenzahl aus früheren Schichten */
const staff = (rows: [string, number, number, number][]) => `CREATE TABLE staff (name TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL, marks INTEGER NOT NULL);
${rows.map(([name, x, y, marks]) => `INSERT INTO staff VALUES ('${name}', ${x}, ${y}, ${marks});`).join('\n')}
`

/** Klasse `Order` der Musterlösung (JavaScript bzw. TypeScript mit Typen) */
const orderClass = (typed: boolean) => `${typed ? 'type OrderRow = { id: number, worker: string, x: number, height: number, color: KlonkColor }\n\n' : ''}class Order {
${typed ? '  id: number\n  worker: string\n  x: number\n  height: number\n  color: KlonkColor\n\n' : ''}  constructor(${typed ? 'row: OrderRow' : 'row'}) {
    this.id = row.id
    this.worker = row.worker
    this.x = row.x
    this.height = row.height
    this.color = row.color
  }

  execute(${typed ? 'robot: Klonk' : 'robot'}) {
    while (robot.positionX() < this.x) {
      robot.step()
    }
    robot.turnLeft()
    for (let i = 0; i < this.height; i++) {
      robot.placeBrick(this.color)
    }
    robot.turnRight()
  }
}

const db = Database.open('orders')
const orders = db.query${typed ? '<OrderRow>' : ''}('SELECT id, worker, x, height, color FROM orders ORDER BY id').map(row => new Order(row))
for (const order of orders) {
  order.execute(new Klonk(order.worker))
}
`

/** Klasse `StaffMember` der Musterlösung (JavaScript bzw. TypeScript mit Typen) */
const staffClass = (typed: boolean) => `${typed ? 'type StaffRow = { name: string, x: number, y: number, marks: number }\n\n' : ''}class StaffMember {
${typed ? '  name: string\n  x: number\n  y: number\n  marks: number\n  robot: Klonk\n\n' : ''}  constructor(${typed ? 'row: StaffRow' : 'row'}) {
    this.name = row.name
    this.x = row.x
    this.y = row.y
    this.marks = row.marks
    this.robot = new Klonk(row.name)
  }

  patrol() {
    while (!this.robot.isWall()) {
      this.robot.step()
      if (this.robot.isMark()) {
        this.marks++
      }
    }
    this.x = this.robot.positionX()
    this.y = this.robot.positionY()
  }

  save(${typed ? 'db: Database' : 'db'}) {
    db.execute('UPDATE staff SET x = ?, y = ?, marks = ? WHERE name = ?', [this.x, this.y, this.marks, this.name])
  }
}

const db = Database.open('shift')
const members = db.query${typed ? '<StaffRow>' : ''}('SELECT name, x, y, marks FROM staff').map(row => new StaffMember(row))
for (const member of members) {
  member.patrol()
  member.save(db)
}
`

/** Beispiel der Einführung (ohne Kommentare, für beide UI-Sprachen gleich – nur die Java-Klasse heißt wie die Datei) */
const introExample = (programClass: string) => `\`\`\`python
from klonk import Database

class Figure:
    def __init__(self, row):
        self.name = row["name"]
        self.x = row["x"]
        self.y = row["y"]

    def save(self, db):
        db.execute("UPDATE figures SET x = ?, y = ? WHERE name = ?", (self.x, self.y, self.name))

db = Database.open("game")
figures = [Figure(row) for row in db.query("SELECT name, x, y FROM figures")]
for figure in figures:
    figure.x = figure.x + 1
    figure.save(db)
\`\`\`

\`\`\`java
import klonk.Database;
import klonk.Row;
import java.util.ArrayList;
import java.util.List;

public class ${programClass} {
    public static void main(String[] args) {
        Database db = Database.open("game");
        List<Figure> figures = new ArrayList<Figure>();
        for (Row row : db.query("SELECT name, x, y FROM figures")) {
            figures.add(new Figure(row));
        }
        for (Figure figure : figures) {
            figure.x = figure.x + 1;
            figure.save(db);
        }
    }
}

class Figure {
    String name;
    int x;
    int y;

    Figure(Row row) {
        name = row.getString("name");
        x = row.getInt("x");
        y = row.getInt("y");
    }

    void save(Database db) {
        db.execute("UPDATE figures SET x = ?, y = ? WHERE name = ?", x, y, name);
    }
}
\`\`\`

\`\`\`javascript
import { Database } from 'klonk'

class Figure {
  constructor(row) {
    this.name = row.name
    this.x = row.x
    this.y = row.y
  }

  save(db) {
    db.execute('UPDATE figures SET x = ?, y = ? WHERE name = ?', [this.x, this.y, this.name])
  }
}

const db = Database.open('game')
const figures = db.query('SELECT name, x, y FROM figures').map(row => new Figure(row))
for (const figure of figures) {
  figure.x = figure.x + 1
  figure.save(db)
}
\`\`\`

\`\`\`typescript
import { Database } from 'klonk'

type FigureRow = { name: string, x: number, y: number }

class Figure {
  name: string
  x: number
  y: number

  constructor(row: FigureRow) {
    this.name = row.name
    this.x = row.x
    this.y = row.y
  }

  save(db: Database) {
    db.execute('UPDATE figures SET x = ?, y = ? WHERE name = ?', [this.x, this.y, this.name])
  }
}

const db = Database.open('game')
const figures = db.query<FigureRow>('SELECT name, x, y FROM figures').map(row => new Figure(row))
for (const figure of figures) {
  figure.x = figure.x + 1
  figure.save(db)
}
\`\`\`

\`\`\`csharp
using klonk;

var db = Database.Open("game");
var figures = new List<Figure>();
foreach (var row in db.Query("SELECT name, x, y FROM figures"))
{
    figures.Add(new Figure(row));
}
foreach (var figure in figures)
{
    figure.X = figure.X + 1;
    figure.Save(db);
}

class Figure
{
    public string Name;
    public int X;
    public int Y;

    public Figure(Row row)
    {
        Name = row.GetString("name");
        X = row.GetInt("x");
        Y = row.GetInt("y");
    }

    public void Save(Database db)
    {
        db.Execute("UPDATE figures SET x = ?, y = ? WHERE name = ?", X, Y, Name);
    }
}
\`\`\``

export const appObjects: LearnModule = {
  id: 'app-objects',
  track: 'apps',
  title: { de: 'Objekte und Tabellen', en: 'Objects and tables' },
  summary: {
    de: 'Zeilen werden zu Objekten und Objekte wieder zu Zeilen: Figuren und Aufträge aus Tabellen, eigene Klassen mit `save`.',
    en: 'Rows become objects and objects become rows again: characters and orders from tables, own classes with `save`.',
  },
  objectives: [
    { de: 'Aus Zeilen einer Tabelle Objekte erzeugen – Figuren mit `Klonk.create` und Objekte einer eigenen Klasse', en: 'Create objects from the rows of a table – characters with `Klonk.create` and objects of an own class' },
    { de: 'Spalten als Attribute und Verhalten als Methoden einer Klasse abbilden (objektrelationales Mapping)', en: 'Map columns to attributes and behaviour to methods of a class (object-relational mapping)' },
    { de: 'Den Zustand von Objekten mit `INSERT` bzw. `UPDATE` in die Tabelle zurückschreiben', en: 'Write the state of objects back to the table with `INSERT` or `UPDATE`' },
  ],
  prerequisites: ['app-world', 'code-classes'],
  intro: {
    de: `Tabellen und Klassen passen gut zusammen: Die **Spalten** werden zu **Attributen**, jede **Zeile** wird zu einem **Objekt**. Der Konstruktor liest eine Zeile, Methoden geben dem Objekt Verhalten – und eine Methode \`save\` schreibt seinen Zustand zurück. Diese Abbildung heißt **objektrelationales Mapping (ORM)**. Das Beispiel lädt alle Figuren aus einer Tabelle, rückt jede um eine Spalte nach rechts und speichert sie wieder:

${introExample('Programm')}

In Java und C# steht die eigene Klasse in derselben Datei – in Java ohne \`public\`, in C# nach den Anweisungen des Hauptprogramms.

**Figuren aus Daten:** \`Klonk.create(name, look, x, y)\` (C# \`Klonk.Create\`) erzeugt eine neue Figur und liefert ihr Objekt. \`look\` ist \`"male"\`, \`"female"\` oder \`"diverse"\`, x und y zählen wie \`positionX()\`/\`positionY()\` ab 1. \`Klonk.all()\` (C# \`Klonk.All()\`) liefert alle Figuren der Welt, \`new Klonk("Klara")\` die Figur mit diesem Namen.`,
    en: `Tables and classes fit together well: the **columns** become **attributes**, every **row** becomes an **object**. The constructor reads a row, methods give the object behaviour – and a method \`save\` writes its state back. This mapping is called **object-relational mapping (ORM)**. The example loads all characters from a table, moves each one column to the right and saves them again:

${introExample('Program')}

In Java and C#, your own class goes into the same file – in Java without \`public\`, in C# after the statements of the main program.

**Characters from data:** \`Klonk.create(name, look, x, y)\` (C# \`Klonk.Create\`) creates a new character and returns its object. \`look\` is \`"male"\`, \`"female"\` or \`"diverse"\`, x and y count from 1 like \`positionX()\`/\`positionY()\`. \`Klonk.all()\` (C# \`Klonk.All()\`) returns all characters in the world, \`new Klonk("Klara")\` the character with that name.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** A3 und eigene Klassen mit Konstruktor und Methoden (F6), Listen (F5) sind hilfreich. Die Aufgaben 3 und 4 verlangen eine eigene Klasse.

**Idee:** Objektrelationales Mapping von Hand: Tabelle ↔ Klasse, Zeile ↔ Objekt, Spalte ↔ Attribut. Die Aufgaben gehen den Weg in beide Richtungen – Zeilen werden zu Figuren (1), Figuren zu Zeilen (2), Zeilen zu Objekten mit Verhalten (3), und Objekte laden, arbeiten und speichern sich selbst (4). So arbeiten auch ORM-Bibliotheken wie Hibernate, Entity Framework oder SQLAlchemy. Der Tab „Diagramm“ zeigt die eigene Klasse im Klassendiagramm neben \`Klonk\` und \`Database\` – ein guter Anlass, Klassendiagramm und Tabellenschema zu vergleichen.

**Typische Schwierigkeiten:** Klasse und Objekt verwechselt (eine Liste von Zeilen statt einer Liste von Objekten). Attribute im Konstruktor nicht gesetzt (\`self.\`/\`this.\` vergessen). In Java steht die zweite Klasse ohne \`public\` in derselben Datei, in C# nach den Anweisungen des Hauptprogramms. Neue Figuren brauchen ein freies Feld und einen eindeutigen Namen. In Aufgabe 4 muss die neue Position ins Objekt, bevor \`save\` schreibt; Figuren, die nicht in der Tabelle stehen, bleiben stehen – \`Klonk.all()\` ist hier der falsche Weg.

**Differenzierung:** Schnelle Lernende schreiben eine statische Methode \`Order.loadAll(db)\`, die die Liste der Objekte liefert, oder ergänzen in Aufgabe 4 eine Methode \`insert(db)\` für Figuren, die noch keine Zeile haben. Langsamere Lernende bekommen das Klassengerüst (Attribute und Konstruktor) vorgegeben.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** A3 and own classes with constructor and methods (F6), lists (F5) help. Tasks 3 and 4 require an own class.

**Idea:** Object-relational mapping by hand: table ↔ class, row ↔ object, column ↔ attribute. The tasks go both ways – rows become characters (1), characters become rows (2), rows become objects with behaviour (3), and objects load, work and save themselves (4). ORM libraries such as Hibernate, Entity Framework or SQLAlchemy work the same way. The “Diagram” tab shows the own class in the class diagram next to \`Klonk\` and \`Database\` – a good occasion to compare class diagram and table schema.

**Typical difficulties:** Class and object mixed up (a list of rows instead of a list of objects). Attributes not set in the constructor (\`self.\`/\`this.\` forgotten). In Java the second class goes into the same file without \`public\`, in C# after the statements of the main program. New characters need a free cell and a unique name. In task 4 the new position has to go into the object before \`save\` writes; characters that are not in the table stay where they are – \`Klonk.all()\` is the wrong way here.

**Differentiation:** Fast learners write a static method \`Order.loadAll(db)\` that returns the list of objects, or add a method \`insert(db)\` in task 4 for characters that do not have a row yet. Slower learners get the class skeleton (attributes and constructor).`,
  },
  tasks: [
    {
      id: 'load-figures',
      title: { de: 'Figuren aus der Tabelle', en: 'Characters from the table' },
      text: {
        de: 'Klonk bekommt Gesellschaft: Für jede Zeile der Tabelle `figures` (Datenbank `figures`) erzeugt dein Programm eine neue Figur – mit dem Namen (`name`), dem Aussehen (`look`) und auf dem Feld (`x`, `y`) aus der Tabelle. Jede neue Figur setzt danach auf ihrem Feld eine Marke in der Farbe aus der Spalte `mark`.',
        en: 'Klonk gets company: for every row of the table `figures` (database `figures`) your program creates a new character – with the name (`name`), the look (`look`) and on the cell (`x`, `y`) from the table. Afterwards every new character sets a mark on its cell in the colour from the column `mark`.',
      },
      hints: [
        { de: '`Klonk.create(name, look, x, y)` (C# `Klonk.Create`) liefert das Objekt der neuen Figur – merke es dir in einer Variablen und rufe darauf `setMark` auf.', en: '`Klonk.create(name, look, x, y)` (C# `Klonk.Create`) returns the object of the new character – keep it in a variable and call `setMark` on it.' },
      ],
      worlds: [map(`
        > . . . . .
        . . . . . .
        . . . . . .
        . . . . . .
      `)],
      databases: [{
        name: 'figures',
        sql: [
          figures([['Klara', 'female', 3, 2, 'red'], ['Kim', 'diverse', 5, 4, 'blue']]),
          figures([['Ben', 'male', 2, 3, 'green'], ['Lea', 'female', 6, 1, 'yellow'], ['Ida', 'diverse', 4, 4, 'red']]),
          figures([['Mo', 'diverse', 1, 4, 'blue'], ['Ela', 'female', 3, 3, 'yellow'], ['Tom', 'male', 6, 2, 'green'], ['Nia', 'female', 2, 2, 'red']]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

db = Database.open("figures")
for row in db.query("SELECT name, look, x, y, mark FROM figures"):
    figure = Klonk.create(row["name"], row["look"], row["x"], row["y"])
    figure.set_mark(row["mark"])
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Database db = Database.open("figures");
        for (Row row : db.query("SELECT name, look, x, y, mark FROM figures")) {
            Klonk figure = Klonk.create(row.getString("name"), row.getString("look"), row.getInt("x"), row.getInt("y"));
            figure.setMark(row.getString("mark"));
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const db = Database.open('figures')
for (const row of db.query('SELECT name, look, x, y, mark FROM figures')) {
  const figure = Klonk.create(row.name, row.look, row.x, row.y)
  figure.setMark(row.mark)
}
`,
        csharp: `using klonk;

var db = Database.Open("figures");
foreach (var row in db.Query("SELECT name, look, x, y, mark FROM figures"))
{
    var figure = Klonk.Create(row.GetString("name"), row.GetString("look"), row.GetInt("x"), row.GetInt("y"));
    figure.SetMark(row.GetString("mark"));
}
`,
      },
      check: { position: true, cells: true },
      requires: ['loop'],
      characters: 5,
    },
    {
      id: 'savegame',
      title: { de: 'Spielstand speichern', en: 'Save the game' },
      text: {
        de: 'Alle Figuren der Welt laufen bis zur Wand – jede in ihre Blickrichtung. Danach speichert dein Programm den Spielstand: In der Tabelle `figures` (Datenbank `savegame`) steht am Ende für jede Figur genau eine Zeile mit `name`, `x` und `y`. Der alte Spielstand in der Tabelle wird vorher gelöscht.',
        en: 'All characters in the world walk to the wall – each in the direction it is facing. Then your program saves the game: at the end, the table `figures` (database `savegame`) holds exactly one row per character with `name`, `x` and `y`. The old saved game in the table is deleted first.',
      },
      hints: [
        { de: '`Klonk.all()` (C# `Klonk.All()`) liefert alle Figuren als Objekte. Jedes Objekt kennt seinen Namen (`name`, C# `Name`) und seine Position.', en: '`Klonk.all()` (C# `Klonk.All()`) returns all characters as objects. Every object knows its name (`name`, C# `Name`) and its position.' },
      ],
      worlds: [
        map(`
          > . . . . .
          . . . . . .
          . . . . . <
          . . > . . .
        `, { names: ['Klonk', 'Klara', 'Kim'] }),
        map(`
          . . . . .
          < . . . .
          . . . . .
          . . . . v
          . . ^ . .
        `, { names: ['Kim', 'Klonk', 'Klara'] }),
        map(`
          > . . .
          . . . .
          . . . <
        `, { names: ['Klonk', 'Klara'] }),
      ],
      databases: [{
        name: 'savegame',
        sql: [
          savegame([['Klonk', 1, 1], ['Klara', 2, 2]]),
          savegame([['Kim', 3, 3]]),
          savegame([['Bob', 4, 4], ['Klonk', 2, 3]]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

db = Database.open("savegame")
db.execute("DELETE FROM figures")
for figure in Klonk.all():
    while not figure.is_wall():
        figure.step()
    db.execute("INSERT INTO figures (name, x, y) VALUES (?, ?, ?)", (figure.name, figure.position_x(), figure.position_y()))
`,
        java: `import klonk.Klonk;
import klonk.Database;

public class Program {
    public static void main(String[] args) {
        Database db = Database.open("savegame");
        db.execute("DELETE FROM figures");
        for (Klonk figure : Klonk.all()) {
            while (!figure.isWall()) {
                figure.step();
            }
            db.execute("INSERT INTO figures (name, x, y) VALUES (?, ?, ?)", figure.name, figure.positionX(), figure.positionY());
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const db = Database.open('savegame')
db.execute('DELETE FROM figures')
for (const figure of Klonk.all()) {
  while (!figure.isWall()) {
    figure.step()
  }
  db.execute('INSERT INTO figures (name, x, y) VALUES (?, ?, ?)', [figure.name, figure.positionX(), figure.positionY()])
}
`,
        csharp: `using klonk;

var db = Database.Open("savegame");
db.Execute("DELETE FROM figures");
foreach (var figure in Klonk.All())
{
    while (!figure.IsWall())
    {
        figure.Step();
    }
    db.Execute("INSERT INTO figures (name, x, y) VALUES (?, ?, ?)", figure.Name, figure.PositionX(), figure.PositionY());
}
`,
      },
      check: { position: true, tables: ['figures'] },
      requires: ['loop'],
      characters: 3,
    },
    {
      id: 'orders',
      title: { de: 'Aufträge als Objekte', en: 'Orders as objects' },
      text: {
        de: 'Klonk und Klara bauen nach Aufträgen aus der Tabelle `orders` (Datenbank `orders`). Jeder Auftrag nennt die Figur (`worker`), die Spalte (`x`), die Höhe (`height`) und die Farbe (`color`) eines Stapels. Die Figur läuft nach Osten bis zur Spalte und baut den Stapel **links neben sich**. Schreibe eine **Klasse** `Order` mit den Spalten als Attributen und einer Methode `execute(robot)`, die den Auftrag mit der übergebenen Figur ausführt. Lade alle Aufträge (nach `id` geordnet) als Objekte und führe sie aus.',
        en: 'Klonk and Klara build according to orders from the table `orders` (database `orders`). Each order names the character (`worker`), the column (`x`), the height (`height`) and the colour (`color`) of a stack. The character walks east to the column and builds the stack **to its left**. Write a **class** `Order` with the columns as attributes and a method `execute(robot)` that carries out the order with the given character. Load all orders (ordered by `id`) as objects and execute them.',
      },
      hints: [
        { de: 'Der Konstruktor bekommt eine Zeile und übernimmt jede Spalte in ein Attribut. Die Figur zu einem Auftrag liefert `new Klonk(order.worker)` (Python `Klonk(order.worker)`).', en: 'The constructor receives a row and copies every column into an attribute. `new Klonk(order.worker)` (Python `Klonk(order.worker)`) returns the character for an order.' },
        { de: '`execute` funktioniert wie eine Zeile des Bauplans aus A3 – nur liest die Methode die Werte aus den Attributen des Objekts.', en: '`execute` works like one row of the building plan from A3 – only the method reads the values from the attributes of the object.' },
      ],
      worlds: [map(`
        . . . . . . .
        > . . . . . .
        . . . . . . .
        > . . . . . .
      `, { names: ['Klonk', 'Klara'] })],
      databases: [{
        name: 'orders',
        sql: [
          orders([['Klonk', 2, 3, 'red'], ['Klara', 3, 2, 'blue'], ['Klonk', 5, 1, 'yellow'], ['Klara', 6, 4, 'green']]),
          orders([['Klara', 1, 2, 'orange'], ['Klara', 4, 5, 'purple'], ['Klonk', 7, 3, 'white']]),
          orders([['Klonk', 3, 1, 'black'], ['Klonk', 4, 2, 'black'], ['Klonk', 6, 6, 'red'], ['Klara', 2, 1, 'green'], ['Klara', 7, 2, 'blue']]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

class Order:
    def __init__(self, row):
        self.id = row["id"]
        self.worker = row["worker"]
        self.x = row["x"]
        self.height = row["height"]
        self.color = row["color"]

    def execute(self, robot):
        while robot.position_x() < self.x:
            robot.step()
        robot.turn_left()
        for i in range(self.height):
            robot.place_brick(self.color)
        robot.turn_right()

db = Database.open("orders")
orders = [Order(row) for row in db.query("SELECT id, worker, x, height, color FROM orders ORDER BY id")]
for order in orders:
    order.execute(Klonk(order.worker))
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;
import java.util.ArrayList;
import java.util.List;

public class Program {
    public static void main(String[] args) {
        Database db = Database.open("orders");
        List<Order> orders = new ArrayList<Order>();
        for (Row row : db.query("SELECT id, worker, x, height, color FROM orders ORDER BY id")) {
            orders.add(new Order(row));
        }
        for (Order order : orders) {
            order.execute(new Klonk(order.worker));
        }
    }
}

class Order {
    int id;
    String worker;
    int x;
    int height;
    String color;

    Order(Row row) {
        id = row.getInt("id");
        worker = row.getString("worker");
        x = row.getInt("x");
        height = row.getInt("height");
        color = row.getString("color");
    }

    void execute(Klonk robot) {
        while (robot.positionX() < x) {
            robot.step();
        }
        robot.turnLeft();
        for (int i = 0; i < height; i++) {
            robot.placeBrick(color);
        }
        robot.turnRight();
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

${orderClass(false)}`,
        typescript: `import { Klonk, Database } from 'klonk'
import type { KlonkColor } from 'klonk'

${orderClass(true)}`,
        csharp: `using klonk;

var db = Database.Open("orders");
var orders = new List<Order>();
foreach (var row in db.Query("SELECT id, worker, x, height, color FROM orders ORDER BY id"))
{
    orders.Add(new Order(row));
}
foreach (var order in orders)
{
    order.Execute(new Klonk(order.Worker));
}

class Order
{
    public int Id;
    public string Worker;
    public int X;
    public int Height;
    public string Color;

    public Order(Row row)
    {
        Id = row.GetInt("id");
        Worker = row.GetString("worker");
        X = row.GetInt("x");
        Height = row.GetInt("height");
        Color = row.GetString("color");
    }

    public void Execute(Klonk robot)
    {
        while (robot.PositionX() < X)
        {
            robot.Step();
        }
        robot.TurnLeft();
        for (var i = 0; i < Height; i++)
        {
            robot.PlaceBrick(Color);
        }
        robot.TurnRight();
    }
}
`,
      },
      check: { cells: true },
      requires: ['class', 'loop'],
      characters: 2,
    },
    {
      id: 'shift-report',
      title: { de: 'Schichtbericht', en: 'Shift report' },
      text: {
        de: 'Nur die Figuren, die in der Tabelle `staff` (Datenbank `shift`) stehen, haben heute Dienst. Schreibe eine **Klasse**, deren Objekte je eine Zeile darstellen (`name`, `x`, `y`, `marks`) und die passende Figur steuern. Jede Figur im Dienst läuft bis zur Wand und zählt die Marken auf den Feldern, die sie betritt. Danach schreibt jedes Objekt seine Werte zurück: die neue Position in `x` und `y` und in `marks` den bisherigen Wert plus die neu gezählten Marken. Figuren ohne Dienst bleiben stehen.',
        en: 'Only the characters listed in the table `staff` (database `shift`) are on duty today. Write a **class** whose objects each represent one row (`name`, `x`, `y`, `marks`) and control the matching character. Every character on duty walks to the wall and counts the marks on the cells it enters. Afterwards every object writes its values back: the new position in `x` and `y` and in `marks` the previous value plus the newly counted marks. Characters that are off duty stay where they are.',
      },
      hints: [
        { de: 'Zum Beispiel: Konstruktor aus einer Zeile (dazu ein Attribut mit der Figur `new Klonk(name)`), Methode `patrol()` für den Rundgang, Methode `save(db)` mit `UPDATE staff SET x = ?, y = ?, marks = ? WHERE name = ?`.', en: 'For example: a constructor from a row (plus an attribute holding the character `new Klonk(name)`), a method `patrol()` for the round, a method `save(db)` with `UPDATE staff SET x = ?, y = ?, marks = ? WHERE name = ?`.' },
      ],
      worlds: [map(`
        > . y . y .
        . . . . . .
        > y . y y .
        . . . . . .
        > . . y . y
      `, { names: ['Klonk', 'Klara', 'Kim'] })],
      databases: [{
        name: 'shift',
        sql: [
          staff([['Klonk', 1, 1, 4], ['Kim', 2, 5, 0]]),
          staff([['Klara', 6, 3, 10]]),
          staff([['Klonk', 6, 1, 2], ['Klara', 1, 3, 0], ['Kim', 1, 5, 7]]),
        ],
      }],
      solutions: {
        python: `from klonk import Klonk, Database

class StaffMember:
    def __init__(self, row):
        self.name = row["name"]
        self.x = row["x"]
        self.y = row["y"]
        self.marks = row["marks"]
        self.robot = Klonk(row["name"])

    def patrol(self):
        while not self.robot.is_wall():
            self.robot.step()
            if self.robot.is_mark():
                self.marks = self.marks + 1
        self.x = self.robot.position_x()
        self.y = self.robot.position_y()

    def save(self, db):
        db.execute("UPDATE staff SET x = ?, y = ?, marks = ? WHERE name = ?", (self.x, self.y, self.marks, self.name))

db = Database.open("shift")
members = [StaffMember(row) for row in db.query("SELECT name, x, y, marks FROM staff")]
for member in members:
    member.patrol()
    member.save(db)
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;
import java.util.ArrayList;
import java.util.List;

public class Program {
    public static void main(String[] args) {
        Database db = Database.open("shift");
        List<StaffMember> members = new ArrayList<StaffMember>();
        for (Row row : db.query("SELECT name, x, y, marks FROM staff")) {
            members.add(new StaffMember(row));
        }
        for (StaffMember member : members) {
            member.patrol();
            member.save(db);
        }
    }
}

class StaffMember {
    String name;
    int x;
    int y;
    int marks;
    Klonk robot;

    StaffMember(Row row) {
        name = row.getString("name");
        x = row.getInt("x");
        y = row.getInt("y");
        marks = row.getInt("marks");
        robot = new Klonk(name);
    }

    void patrol() {
        while (!robot.isWall()) {
            robot.step();
            if (robot.isMark()) {
                marks++;
            }
        }
        x = robot.positionX();
        y = robot.positionY();
    }

    void save(Database db) {
        db.execute("UPDATE staff SET x = ?, y = ?, marks = ? WHERE name = ?", x, y, marks, name);
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

${staffClass(false)}`,
        typescript: `import { Klonk, Database } from 'klonk'

${staffClass(true)}`,
        csharp: `using klonk;

var db = Database.Open("shift");
var members = new List<StaffMember>();
foreach (var row in db.Query("SELECT name, x, y, marks FROM staff"))
{
    members.Add(new StaffMember(row));
}
foreach (var member in members)
{
    member.Patrol();
    member.Save(db);
}

class StaffMember
{
    public string Name;
    public int X;
    public int Y;
    public int Marks;
    public Klonk Robot;

    public StaffMember(Row row)
    {
        Name = row.GetString("name");
        X = row.GetInt("x");
        Y = row.GetInt("y");
        Marks = row.GetInt("marks");
        Robot = new Klonk(Name);
    }

    public void Patrol()
    {
        while (!Robot.IsWall())
        {
            Robot.Step();
            if (Robot.IsMark())
            {
                Marks++;
            }
        }
        X = Robot.PositionX();
        Y = Robot.PositionY();
    }

    public void Save(Database db)
    {
        db.Execute("UPDATE staff SET x = ?, y = ?, marks = ? WHERE name = ?", X, Y, Marks, Name);
    }
}
`,
      },
      check: { position: true, tables: ['staff'] },
      requires: ['class', 'loop'],
      characters: 3,
    },
  ],
}
