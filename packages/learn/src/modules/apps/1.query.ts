import { map } from '../../map'
import type { LearnModule } from '../../types'

/** Schuldatenbank: Klassen und Lernende (je Startsituation andere Daten) */
const school = (classes: [string, string[]][]) => `CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL, class_id INTEGER NOT NULL REFERENCES classes(id));
${classes.map(([name], i) => `INSERT INTO classes VALUES (${i + 1}, '${name}');`).join('\n')}
${classes.flatMap(([, students], i) => students.map(s => `INSERT INTO students (name, class_id) VALUES ('${s}', ${i + 1});`)).join('\n')}
`
const SCHOOLS = [
  school([['7a', ['Mia', 'Ben', 'Ali', 'Lea']], ['7b', ['Tom', 'Eva']], ['8a', ['Jan', 'Ida', 'Max']]]),
  school([['7a', ['Zoe', 'Finn']], ['7b', ['Noah', 'Emma', 'Paul', 'Lina', 'Elif']]]),
  school([['5c', ['Ole']], ['7a', ['Sara', 'Luca', 'Nina']], ['9b', ['Can', 'Lena']], ['6a', ['Jonas', 'Mara']]]),
]

export const appQuery: LearnModule = {
  id: 'app-query',
  track: 'apps',
  title: { de: 'Abfragen im Programm', en: 'Queries in a program' },
  summary: {
    de: 'Eine Datenbank aus dem Programm öffnen, Abfragen ausführen und mit den Ergebnissen weiterarbeiten.',
    en: 'Open a database from a program, run queries and work with the results.',
  },
  objectives: [
    { de: 'Mit `Database.open` eine Datenbank öffnen und mit `query` eine SQL-Abfrage ausführen', en: 'Open a database with `Database.open` and run an SQL query with `query`' },
    { de: 'Über die Zeilen eines Ergebnisses iterieren und Spaltenwerte lesen', en: 'Iterate over the rows of a result and read column values' },
    { de: 'Ergebnisse von Abfragen im Programm verwenden (Ausgabe, Steuerung der Figur)', en: 'Use query results in the program (output, controlling the character)' },
  ],
  prerequisites: ['code-start', 'sql-select'],
  intro: {
    de: `Programme können mit einer **Datenbank** arbeiten: Die Abfrage schreibst du in SQL, das Programm führt sie aus und bekommt das Ergebnis als **Liste von Zeilen**. Jede Zeile kennt ihre Spalten über den Namen.

\`\`\`python
from klonk import Database

db = Database.open("school")
for row in db.query("SELECT name FROM students ORDER BY name"):
    print(row["name"])
print(db.query_one("SELECT count(*) AS n FROM students")["n"])
\`\`\`

\`\`\`java
import klonk.Database;
import klonk.Row;

public class Programm {
    public static void main(String[] args) {
        Database db = Database.open("school");
        for (Row row : db.query("SELECT name FROM students ORDER BY name")) {
            System.out.println(row.getString("name"));
        }
        System.out.println(db.queryOne("SELECT count(*) AS n FROM students").getInt("n"));
    }
}
\`\`\`

\`\`\`javascript
import { Database } from 'klonk'

const db = Database.open('school')
for (const row of db.query('SELECT name FROM students ORDER BY name')) {
  console.log(row.name)
}
console.log(db.queryOne('SELECT count(*) AS n FROM students')?.n)
\`\`\`

\`\`\`csharp
using klonk;

var db = Database.Open("school");
foreach (var row in db.Query("SELECT name FROM students ORDER BY name"))
{
    Console.WriteLine(row.GetString("name"));
}
Console.WriteLine(db.QueryOne("SELECT count(*) AS n FROM students").GetInt("n"));
\`\`\`

Die Datenbank \`school\` liegt im Aufgabenordner (\`school.sqlite.sql\`). Sie hat die Tabellen \`classes\` (id, name) und \`students\` (id, name, class_id). Jeder Lauf beginnt mit einer frischen Kopie.`,
    en: `Programs can work with a **database**: you write the query in SQL, the program runs it and gets the result as a **list of rows**. Each row knows its columns by name.

\`\`\`python
from klonk import Database

db = Database.open("school")
for row in db.query("SELECT name FROM students ORDER BY name"):
    print(row["name"])
print(db.query_one("SELECT count(*) AS n FROM students")["n"])
\`\`\`

\`\`\`java
import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Database db = Database.open("school");
        for (Row row : db.query("SELECT name FROM students ORDER BY name")) {
            System.out.println(row.getString("name"));
        }
        System.out.println(db.queryOne("SELECT count(*) AS n FROM students").getInt("n"));
    }
}
\`\`\`

\`\`\`javascript
import { Database } from 'klonk'

const db = Database.open('school')
for (const row of db.query('SELECT name FROM students ORDER BY name')) {
  console.log(row.name)
}
console.log(db.queryOne('SELECT count(*) AS n FROM students')?.n)
\`\`\`

\`\`\`csharp
using klonk;

var db = Database.Open("school");
foreach (var row in db.Query("SELECT name FROM students ORDER BY name"))
{
    Console.WriteLine(row.GetString("name"));
}
Console.WriteLine(db.QueryOne("SELECT count(*) AS n FROM students").GetInt("n"));
\`\`\`

The database \`school\` is in the task folder (\`school.sqlite.sql\`). It has the tables \`classes\` (id, name) and \`students\` (id, name, class_id). Each run starts with a fresh copy.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** Objekte und Schleifen in einer Programmiersprache (F1–F3) und einfache SQL-Abfragen (S1, S3). Für Aufgabe 3 hilft \`GROUP BY\` (S4) – sie lässt sich aber auch mit einer Abfrage je Klasse lösen.

**Idee:** Die Trennung von Daten (Datenbank) und Verarbeitung (Programm) wird greifbar: Dasselbe Programm baut mit anderen Daten ein anderes Säulendiagramm. Klonk prüft jede Aufgabe mit mehreren Datensätzen, abgezählte Lösungen genügen daher nicht.

**Typische Schwierigkeiten:** SQL-Text im Programm in Anführungszeichen, darin Textwerte in einfachen Anführungszeichen. Spaltennamen im Programm müssen zum SQL passen (Alias \`AS n\`). In Java und C# liefern \`getInt\`/\`GetInt\` Zahlen, \`getString\`/\`GetString\` Texte.

**Ausblick:** A2 schreibt Daten mit \`execute\` und Parametern in die Datenbank.`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** Objects and loops in a programming language (F1–F3) and simple SQL queries (S1, S3). \`GROUP BY\` (S4) helps for task 3 – but it can also be solved with one query per class.

**Idea:** The separation of data (database) and processing (program) becomes tangible: the same program builds a different bar chart with different data. Klonk checks every task with several data sets, so counted-out solutions are not enough.

**Typical difficulties:** SQL text in the program in double quotes, text values inside it in single quotes. Column names in the program must match the SQL (alias \`AS n\`). In Java and C#, \`getInt\`/\`GetInt\` return numbers, \`getString\`/\`GetString\` text.

**Next:** A2 writes data to the database with \`execute\` and parameters.`,
  },
  tasks: [
    {
      id: 'class-list',
      title: { de: 'Klassenliste', en: 'Class list' },
      text: {
        de: 'Gib die Namen aller Lernenden der Klasse **7a** aus – alphabetisch sortiert, ein Name pro Zeile.',
        en: 'Output the names of all students in class **7a** – sorted alphabetically, one name per line.',
      },
      hints: [
        { de: 'Die Klasse steht in der Tabelle `classes`. Verknüpfe beide Tabellen über `class_id` – oder suche erst die `id` der Klasse 7a und frage dann die Lernenden ab.', en: 'The class is in the table `classes`. Join both tables via `class_id` – or first look up the `id` of class 7a and then query the students.' },
      ],
      worlds: [map('>')],
      databases: [{ name: 'school', sql: SCHOOLS }],
      solutions: {
        python: `from klonk import Database

db = Database.open("school")
rows = db.query("SELECT s.name FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7a' ORDER BY s.name")
for row in rows:
    print(row["name"])
`,
        java: `import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Database db = Database.open("school");
        String sql = "SELECT s.name FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7a' ORDER BY s.name";
        for (Row row : db.query(sql)) {
            System.out.println(row.getString("name"));
        }
    }
}
`,
        javascript: `import { Database } from 'klonk'

const db = Database.open('school')
const rows = db.query("SELECT s.name FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7a' ORDER BY s.name")
for (const row of rows) {
  console.log(row.name)
}
`,
        csharp: `using klonk;

var db = Database.Open("school");
var sql = "SELECT s.name FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7a' ORDER BY s.name";
foreach (var row in db.Query(sql))
{
    Console.WriteLine(row.GetString("name"));
}
`,
      },
      check: { output: 'lines' },
    },
    {
      id: 'tower-of-students',
      title: { de: 'Ein Ziegel je Person', en: 'One brick per person' },
      text: {
        de: 'Klonk baut vor sich einen Turm mit **so vielen Ziegeln, wie die Klasse 7b Lernende hat**. Die Zahl fragt dein Programm in der Datenbank ab.',
        en: 'Klonk builds a tower in front of itself with **as many bricks as class 7b has students**. Your program asks the database for the number.',
      },
      hints: [
        { de: '`SELECT count(*) AS n FROM …` liefert genau eine Zeile mit der Spalte `n`. Dafür gibt es `queryOne` (Python `query_one`, C# `QueryOne`).', en: '`SELECT count(*) AS n FROM …` returns exactly one row with the column `n`. That is what `queryOne` is for (Python `query_one`, C# `QueryOne`).' },
      ],
      worlds: [map('> . .', { height: 6 })],
      databases: [{ name: 'school', sql: SCHOOLS.slice(0, 2) }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("school")
row = db.query_one("SELECT count(*) AS n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7b'")
for i in range(row["n"]):
    klonk.place_brick()
`,
        java: `import klonk.Klonk;
import klonk.Database;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("school");
        int n = db.queryOne("SELECT count(*) AS n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7b'").getInt("n");
        for (int i = 0; i < n; i++) {
            klonk.placeBrick();
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('school')
const n = db.queryOne("SELECT count(*) AS n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7b'")?.n ?? 0
for (let i = 0; i < n; i++) {
  klonk.placeBrick()
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("school");
var n = db.QueryOne("SELECT count(*) AS n FROM students s JOIN classes c ON c.id = s.class_id WHERE c.name = '7b'").GetInt("n");
for (var i = 0; i < n; i++)
{
    klonk.PlaceBrick();
}
`,
      },
      check: { cells: true },
      requires: ['loop'],
    },
    {
      id: 'bar-chart',
      title: { de: 'Säulendiagramm', en: 'Bar chart' },
      text: {
        de: 'Klonk baut ein Säulendiagramm: Für jede Klasse – alphabetisch nach dem Namen der Klasse – geht er einen Schritt nach Osten und baut **links neben sich** (im Norden) einen Stapel mit so vielen Ziegeln, wie die Klasse Lernende hat.',
        en: 'Klonk builds a bar chart: for every class – in alphabetical order of the class name – it takes one step east and builds a stack **to its left** (to the north) with as many bricks as the class has students.',
      },
      hints: [
        { de: 'Eine Abfrage mit `GROUP BY` liefert je Klasse eine Zeile mit der Anzahl. Für jede Zeile: Schritt, nach links drehen, Ziegel legen, zurückdrehen.', en: 'A query with `GROUP BY` returns one row per class with the count. For each row: step, turn left, place bricks, turn back.' },
      ],
      worlds: [map('. . . . . .\n> . . . . .', { height: 6 })],
      databases: [{ name: 'school', sql: SCHOOLS }],
      solutions: {
        python: `from klonk import Klonk, Database

klonk = Klonk()
db = Database.open("school")
sql = "SELECT c.name, count(*) AS n FROM classes c JOIN students s ON s.class_id = c.id GROUP BY c.id ORDER BY c.name"
for row in db.query(sql):
    klonk.step()
    klonk.turn_left()
    for i in range(row["n"]):
        klonk.place_brick()
    klonk.turn_right()
`,
        java: `import klonk.Klonk;
import klonk.Database;
import klonk.Row;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Database db = Database.open("school");
        String sql = "SELECT c.name, count(*) AS n FROM classes c JOIN students s ON s.class_id = c.id GROUP BY c.id ORDER BY c.name";
        for (Row row : db.query(sql)) {
            klonk.step();
            klonk.turnLeft();
            for (int i = 0; i < row.getInt("n"); i++) {
                klonk.placeBrick();
            }
            klonk.turnRight();
        }
    }
}
`,
        javascript: `import { Klonk, Database } from 'klonk'

const klonk = new Klonk()
const db = Database.open('school')
const sql = 'SELECT c.name, count(*) AS n FROM classes c JOIN students s ON s.class_id = c.id GROUP BY c.id ORDER BY c.name'
for (const row of db.query(sql)) {
  klonk.step()
  klonk.turnLeft()
  for (let i = 0; i < row.n; i++) {
    klonk.placeBrick()
  }
  klonk.turnRight()
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var db = Database.Open("school");
var sql = "SELECT c.name, count(*) AS n FROM classes c JOIN students s ON s.class_id = c.id GROUP BY c.id ORDER BY c.name";
foreach (var row in db.Query(sql))
{
    klonk.Step();
    klonk.TurnLeft();
    for (var i = 0; i < row.GetInt("n"); i++)
    {
        klonk.PlaceBrick();
    }
    klonk.TurnRight();
}
`,
      },
      check: { cells: true },
      requires: ['loop'],
    },
  ],
}
