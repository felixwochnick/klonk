import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeObjects: LearnModule = {
  id: 'code-objects',
  track: 'advanced',
  title: { de: 'Mehrere Objekte', en: 'Several objects' },
  summary: {
    de: 'Mehrere Figuren als eigene Objekte steuern, neue Figuren erstellen, alle Figuren durchlaufen und zusammenarbeiten lassen.',
    en: 'Control several characters as separate objects, create new characters, go through all characters and let them work together.',
  },
  objectives: [
    { de: 'Für jede Figur ein eigenes Objekt holen (`new Klonk("Klara")`) und über seine Variable steuern', en: 'Get a separate object for each character (`new Klonk("Klara")`) and control it via its variable' },
    { de: 'Neue Figuren mit `Klonk.create` erstellen und alle Figuren mit `Klonk.all()` in einer Schleife durchlaufen', en: 'Create new characters with `Klonk.create` and go through all characters with `Klonk.all()` in a loop' },
    { de: 'Den Zustand einzelner Objekte abfragen (`positionX()`, `name`) und Figuren danach zusammenarbeiten lassen', en: 'Query the state of individual objects (`positionX()`, `name`) and let characters work together based on it' },
  ],
  prerequisites: ['code-methods'],
  intro: {
    de: `Bisher hast du immer ein einziges Objekt der Klasse \`Klonk\` benutzt. Jede Figur der Welt kann aber ihr eigenes **Objekt** bekommen: \`new Klonk("Klara")\` holt die Figur mit diesem Namen (Groß-/Kleinschreibung egal), \`new Klonk(2)\` die zweite. \`Klonk.create(name, aussehen, x, y)\` erstellt eine **neue** Figur, und \`Klonk.all()\` liefert alle Figuren der Welt.

\`\`\`python
from klonk import Klonk, red

klonk = Klonk("Klonk")
klara = Klonk("Klara")
klonk.step()
klara.set_mark(red)
kim = Klonk.create("Kim", "female", 1, 3)
kim.step()
for figure in Klonk.all():
    print(figure.name + ": " + str(figure.position_x()))
\`\`\`

\`\`\`java
import klonk.Klonk;
import static klonk.Klonk.*;

public class Programm {
    public static void main(String[] args) {
        Klonk klonk = new Klonk("Klonk");
        Klonk klara = new Klonk("Klara");
        klonk.step();
        klara.setMark(RED);
        Klonk kim = Klonk.create("Kim", "female", 1, 3);
        kim.step();
        for (Klonk figure : Klonk.all()) {
            System.out.println(figure.name + ": " + figure.positionX());
        }
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, red } from 'klonk'

const klonk = new Klonk('Klonk')
const klara = new Klonk('Klara')
klonk.step()
klara.setMark(red)
const kim = Klonk.create('Kim', 'female', 1, 3)
kim.step()
for (const figure of Klonk.all()) {
  console.log(figure.name + ': ' + figure.positionX())
}
\`\`\`

\`\`\`csharp
using klonk;
using static klonk.Klonk;

var klonk = new Klonk("Klonk");
var klara = new Klonk("Klara");
klonk.Step();
klara.SetMark(Red);
var kim = Klonk.Create("Kim", "female", 1, 3);
kim.Step();
foreach (var figure in Klonk.All())
{
    Console.WriteLine(figure.Name + ": " + figure.PositionX());
}
\`\`\`

Jedes Objekt hat seinen eigenen **Zustand**: Name, Position und Blickrichtung. Du fragst ihn mit Methoden wie \`positionX()\` oder \`isFacingNorth()\` ab, den Namen mit \`name\` (C#: \`Name\`). Bei \`Klonk.create\` sind Aussehen (\`"male"\`, \`"female"\` oder \`"diverse"\`) und Feld freiwillig – ohne Feld erscheint die neue Figur neben einer vorhandenen. Die Schleife \`for … in\` (Java \`for (Klonk figure : …)\`, JavaScript \`for … of\`, C# \`foreach\`) geht die Figuren der Reihe nach durch.

Eine Variable speichert nur einen **Verweis** auf ein Objekt. \`helper = klara\` erzeugt keine neue Figur: Beide Variablen zeigen auf dasselbe Objekt, und \`helper.step()\` bewegt Klara.`,
    en: `So far you have always used a single object of the class \`Klonk\`. But every character in the world can get its own **object**: \`new Klonk("Klara")\` gets the character with this name (case does not matter), \`new Klonk(2)\` the second one. \`Klonk.create(name, look, x, y)\` creates a **new** character, and \`Klonk.all()\` returns all characters in the world.

\`\`\`python
from klonk import Klonk, red

klonk = Klonk("Klonk")
klara = Klonk("Klara")
klonk.step()
klara.set_mark(red)
kim = Klonk.create("Kim", "female", 1, 3)
kim.step()
for figure in Klonk.all():
    print(figure.name + ": " + str(figure.position_x()))
\`\`\`

\`\`\`java
import klonk.Klonk;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk("Klonk");
        Klonk klara = new Klonk("Klara");
        klonk.step();
        klara.setMark(RED);
        Klonk kim = Klonk.create("Kim", "female", 1, 3);
        kim.step();
        for (Klonk figure : Klonk.all()) {
            System.out.println(figure.name + ": " + figure.positionX());
        }
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, red } from 'klonk'

const klonk = new Klonk('Klonk')
const klara = new Klonk('Klara')
klonk.step()
klara.setMark(red)
const kim = Klonk.create('Kim', 'female', 1, 3)
kim.step()
for (const figure of Klonk.all()) {
  console.log(figure.name + ': ' + figure.positionX())
}
\`\`\`

\`\`\`csharp
using klonk;
using static klonk.Klonk;

var klonk = new Klonk("Klonk");
var klara = new Klonk("Klara");
klonk.Step();
klara.SetMark(Red);
var kim = Klonk.Create("Kim", "female", 1, 3);
kim.Step();
foreach (var figure in Klonk.All())
{
    Console.WriteLine(figure.Name + ": " + figure.PositionX());
}
\`\`\`

Every object has its own **state**: name, position and direction. You query it with methods like \`positionX()\` or \`isFacingNorth()\`, the name with \`name\` (C#: \`Name\`). For \`Klonk.create\`, the look (\`"male"\`, \`"female"\` or \`"diverse"\`) and the cell are optional – without a cell the new character appears next to an existing one. The loop \`for … in\` (Java \`for (Klonk figure : …)\`, JavaScript \`for … of\`, C# \`foreach\`) goes through the characters one after another.

A variable only stores a **reference** to an object. \`helper = klara\` does not create a new character: both variables point to the same object, and \`helper.step()\` moves Klara.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** F3 (Methoden mit Parametern). E11 (Mehrere Figuren) ist hilfreich, aber nicht nötig.

**Lizenz:** In der Lernansicht stehen jeder Aufgabe so viele Figuren zur Verfügung, wie sie braucht – auch ohne Lizenz. In eigenen Projekten erlaubt die kostenlose Version nur eine Figur.

**Typische Schwierigkeiten:**

- Objekt und Figur verwechseln: \`new Klonk("Klara")\` erzeugt keine neue Figur, sondern ein Objekt für eine vorhandene; erst \`Klonk.create\` stellt eine neue Figur in die Welt. Ein zweites \`Klonk.create("Kim")\` scheitert, weil der Name schon vergeben ist.
- \`new Klonk()\` ist immer die **erste** Figur der Welt. In Aufgabe 1 steht Klara manchmal zuerst – wer über Nummern statt Namen arbeitet, steuert dort die falsche Figur.
- Zwei Objekte für dieselbe Figur sind verschiedene Objekte (\`==\` bzw. \`is\` liefert falsch), steuern aber dieselbe Figur. Eine Zuweisung \`helper = klara\` kopiert dagegen nur den Verweis. Das eignet sich gut, um Objekt, Verweis und Zustand an der Tafel zu unterscheiden.
- Figuren blockieren sich gegenseitig (Fehler „Feld besetzt“), und \`isWall()\` sieht andere Figuren nicht. In Aufgabe 4 muss der Abstand deshalb über die Positionen berechnet werden.
- Koordinaten: \`positionY()\` wächst nach Süden; \`Klonk.create\` erwartet Spalte und Zeile ab 1.
- Anzahl der Figuren in Aufgabe 3: Python \`len(figures)\`, Java \`figures.length\` (ohne Klammern), JavaScript \`figures.length\`, C# \`figures.Length\`. \`Klonk.all()\` liefert in Java und C# ein Array, in Python und JavaScript eine Liste – ein Ausblick auf F5.

**Differenzierung:** Schnelle Lernende schreiben für Aufgabe 4 eine Methode \`gap(a, b)\`, die den Abstand zweier Figuren zurückgibt, oder lassen in Aufgabe 3 jede Figur zusätzlich Namen und Position ausgeben (wie in F2).`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** F3 (methods with parameters). E11 (several characters) is helpful but not required.

**Licence:** In the learning view every task has as many characters available as it needs – even without a licence. In their own projects the free version only allows one character.

**Typical difficulties:**

- Confusing object and character: \`new Klonk("Klara")\` does not create a new character but an object for an existing one; only \`Klonk.create\` puts a new character into the world. A second \`Klonk.create("Kim")\` fails because the name is already taken.
- \`new Klonk()\` is always the **first** character in the world. In task 1 Klara sometimes comes first – whoever works with numbers instead of names controls the wrong character there.
- Two objects for the same character are different objects (\`==\` or \`is\` returns false) but control the same character. An assignment \`helper = klara\`, on the other hand, only copies the reference. This is well suited to distinguish object, reference and state on the board.
- Characters block each other (error “cell occupied”), and \`isWall()\` does not see other characters. In task 4 the distance therefore has to be calculated from the positions.
- Coordinates: \`positionY()\` grows towards the south; \`Klonk.create\` expects column and row starting at 1.
- Number of characters in task 3: Python \`len(figures)\`, Java \`figures.length\` (without parentheses), JavaScript \`figures.length\`, C# \`figures.Length\`. \`Klonk.all()\` returns an array in Java and C#, a list in Python and JavaScript – a preview of F5.

**Differentiation:** Fast learners write a method \`gap(a, b)\` for task 4 that returns the distance between two characters, or let every character additionally output its name and position in task 3 (as in F2).`,
  },
  tasks: [
    {
      id: 'klonk-and-klara',
      title: { de: 'Klonk und Klara', en: 'Klonk and Klara' },
      text: {
        de: 'In der Welt stehen Klonk und Klara. Beide laufen bis zur Wand; dort setzt Klonk eine **gelbe** und Klara eine **rote** Marke. Welche der beiden die erste Figur der Welt ist, ist nicht immer gleich – hol dir die Objekte deshalb über ihren Namen.',
        en: 'Klonk and Klara stand in the world. Both walk to the wall; there Klonk sets a **yellow** and Klara a **red** mark. Which of the two is the first character in the world is not always the same – so get the objects by their names.',
      },
      hints: [
        {
          de: 'Für jede Figur ein eigenes Objekt in einer eigenen Variablen:\n\n```python\nklonk = Klonk("Klonk")\nklara = Klonk("Klara")\n```\n\n```java\nKlonk klonk = new Klonk("Klonk");\nKlonk klara = new Klonk("Klara");\n```\n\n```javascript\nconst klonk = new Klonk(\'Klonk\')\nconst klara = new Klonk(\'Klara\')\n```\n\n```csharp\nvar klonk = new Klonk("Klonk");\nvar klara = new Klonk("Klara");\n```',
          en: 'A separate object in a separate variable for each character:\n\n```python\nklonk = Klonk("Klonk")\nklara = Klonk("Klara")\n```\n\n```java\nKlonk klonk = new Klonk("Klonk");\nKlonk klara = new Klonk("Klara");\n```\n\n```javascript\nconst klonk = new Klonk(\'Klonk\')\nconst klara = new Klonk(\'Klara\')\n```\n\n```csharp\nvar klonk = new Klonk("Klonk");\nvar klara = new Klonk("Klara");\n```',
        },
        { de: 'Ohne Farbe ist eine Marke gelb. Für Rot importierst du die Farbe `red` (Java: `RED`, C#: `Red`).', en: 'Without a colour a mark is yellow. For red you import the colour `red` (Java: `RED`, C#: `Red`).' },
      ],
      worlds: [
        map(`
          > . . . .
          . . . . .
          . > . . .
        `, { names: ['Klonk', 'Klara'] }),
        map(`
          . . v . .
          . . . . .
          . . . > .
        `, { names: ['Klara', 'Klonk'] }),
        map('. < . . > .', { names: ['Klonk', 'Klara'] }),
      ],
      solutions: {
        python: `from klonk import Klonk, red

klonk = Klonk("Klonk")
klara = Klonk("Klara")
while not klonk.is_wall():
    klonk.step()
klonk.set_mark()
while not klara.is_wall():
    klara.step()
klara.set_mark(red)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk("Klonk");
        Klonk klara = new Klonk("Klara");
        while (!klonk.isWall()) {
            klonk.step();
        }
        klonk.setMark();
        while (!klara.isWall()) {
            klara.step();
        }
        klara.setMark(RED);
    }
}
`,
        javascript: `import { Klonk, red } from 'klonk'

const klonk = new Klonk('Klonk')
const klara = new Klonk('Klara')
while (!klonk.isWall()) {
  klonk.step()
}
klonk.setMark()
while (!klara.isWall()) {
  klara.step()
}
klara.setMark(red)
`,
        csharp: `using klonk;
using static klonk.Klonk;

var klonk = new Klonk("Klonk");
var klara = new Klonk("Klara");
while (!klonk.IsWall())
{
    klonk.Step();
}
klonk.SetMark();
while (!klara.IsWall())
{
    klara.Step();
}
klara.SetMark(Red);
`,
      },
      check: { position: true, cells: true },
      characters: 2,
    },
    {
      id: 'reinforcement',
      title: { de: 'Verstärkung', en: 'Reinforcement' },
      text: {
        de: 'Klonk läuft bis zur Wand. Dann erstellt dein Programm eine neue Figur namens **Kim** genau ein Feld südlich von Klonk. Kim läuft bis zur westlichen Wand und setzt dort eine **grüne** Marke. Wo Klonk ankommt, ist in jeder Welt anders – frag seine Position ab.',
        en: 'Klonk walks to the wall. Then your program creates a new character called **Kim** exactly one cell south of Klonk. Kim walks to the west wall and sets a **green** mark there. Where Klonk arrives differs in each world – query its position.',
      },
      hints: [
        { de: '`Klonk.create("Kim", "female", x, y)` erstellt Kim in Spalte x und Zeile y (beide ab 1, die Zeilen zählen von Norden nach Süden). Klonks Position liefern `positionX()` und `positionY()` – ein Feld weiter südlich ist die Zeile um 1 größer.', en: '`Klonk.create("Kim", "female", x, y)` creates Kim in column x and row y (both starting at 1, rows count from north to south). Klonk\'s position is returned by `positionX()` and `positionY()` – one cell further south, the row is 1 larger.' },
        { de: 'In welche Richtung Kim am Anfang schaut, verrät `isFacingWest()` (Python: `is_facing_west()`, C#: `IsFacingWest()`): Dreh sie nach links, solange sie nicht nach Westen schaut.', en: 'Which direction Kim faces at the start is revealed by `isFacingWest()` (Python: `is_facing_west()`, C#: `IsFacingWest()`): turn it left as long as it does not face west.' },
      ],
      worlds: [
        map(`
          > . . . .
          . . . . .
        `),
        map(`
          . . . . . . .
          . > . . . . .
          . . . . . . .
        `),
        map(`
          . . > .
          . . . .
          . . . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk, green

klonk = Klonk()
while not klonk.is_wall():
    klonk.step()
kim = Klonk.create("Kim", "female", klonk.position_x(), klonk.position_y() + 1)
while not kim.is_facing_west():
    kim.turn_left()
while not kim.is_wall():
    kim.step()
kim.set_mark(green)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        while (!klonk.isWall()) {
            klonk.step();
        }
        Klonk kim = Klonk.create("Kim", "female", klonk.positionX(), klonk.positionY() + 1);
        while (!kim.isFacingWest()) {
            kim.turnLeft();
        }
        while (!kim.isWall()) {
            kim.step();
        }
        kim.setMark(GREEN);
    }
}
`,
        javascript: `import { Klonk, green } from 'klonk'

const klonk = new Klonk()
while (!klonk.isWall()) {
  klonk.step()
}
const kim = Klonk.create('Kim', 'female', klonk.positionX(), klonk.positionY() + 1)
while (!kim.isFacingWest()) {
  kim.turnLeft()
}
while (!kim.isWall()) {
  kim.step()
}
kim.setMark(green)
`,
        csharp: `using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
while (!klonk.IsWall())
{
    klonk.Step();
}
var kim = Klonk.Create("Kim", "female", klonk.PositionX(), klonk.PositionY() + 1);
while (!kim.IsFacingWest())
{
    kim.TurnLeft();
}
while (!kim.IsWall())
{
    kim.Step();
}
kim.SetMark(Green);
`,
      },
      check: { position: true, cells: true },
      requires: ['loop'],
      characters: 2,
    },
    {
      id: 'everyone',
      title: { de: 'Alle Figuren', en: 'All characters' },
      text: {
        de: 'In jeder Welt stehen unterschiedlich viele Figuren mit unterschiedlichen Namen. Jede läuft bis zur Wand und setzt dort eine Marke. Gib danach aus, wie viele Figuren es sind. Verwende `Klonk.all()` und eine Schleife.',
        en: 'In each world there is a different number of characters with different names. Each one walks to the wall and sets a mark there. Then output how many characters there are. Use `Klonk.all()` and a loop.',
      },
      hints: [
        {
          de: 'Speichere das Ergebnis von `Klonk.all()` in einer Variablen und geh die Figuren mit einer Schleife durch:\n\n```python\nfigures = Klonk.all()\nfor figure in figures:\n    ...\n```\n\n```java\nKlonk[] figures = Klonk.all();\nfor (Klonk figure : figures) {\n    ...\n}\n```\n\n```javascript\nconst figures = Klonk.all()\nfor (const figure of figures) {\n  ...\n}\n```\n\n```csharp\nKlonk[] figures = Klonk.All();\nforeach (var figure in figures)\n{\n    ...\n}\n```',
          en: 'Store the result of `Klonk.all()` in a variable and go through the characters with a loop:\n\n```python\nfigures = Klonk.all()\nfor figure in figures:\n    ...\n```\n\n```java\nKlonk[] figures = Klonk.all();\nfor (Klonk figure : figures) {\n    ...\n}\n```\n\n```javascript\nconst figures = Klonk.all()\nfor (const figure of figures) {\n  ...\n}\n```\n\n```csharp\nKlonk[] figures = Klonk.All();\nforeach (var figure in figures)\n{\n    ...\n}\n```',
        },
        { de: 'Die Anzahl: Python `len(figures)`, Java und JavaScript `figures.length`, C# `figures.Length`.', en: 'The number: Python `len(figures)`, Java and JavaScript `figures.length`, C# `figures.Length`.' },
      ],
      worlds: [
        map(`
          > . . . . .
          . . < . . .
          . . . > . .
        `, { names: ['Klonk', 'Klara', 'Kai'] }),
        map(`
          . > . .
          . . . <
        `, { names: ['Mia', 'Ben'] }),
        map(`
          . . . < . . .
          > . . . . . .
          . . . . . > .
          . < . . . . .
        `, { names: ['Klonk', 'Lena', 'Tom', 'Ida'] }),
      ],
      solutions: {
        python: `from klonk import Klonk

figures = Klonk.all()
for figure in figures:
    while not figure.is_wall():
        figure.step()
    figure.set_mark()
print("Figures: " + str(len(figures)))
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk[] figures = Klonk.all();
        for (Klonk figure : figures) {
            while (!figure.isWall()) {
                figure.step();
            }
            figure.setMark();
        }
        System.out.println("Figures: " + figures.length);
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const figures = Klonk.all()
for (const figure of figures) {
  while (!figure.isWall()) {
    figure.step()
  }
  figure.setMark()
}
console.log('Figures: ' + figures.length)
`,
        csharp: `using klonk;

Klonk[] figures = Klonk.All();
foreach (var figure in figures)
{
    while (!figure.IsWall())
    {
        figure.Step();
    }
    figure.SetMark();
}
Console.WriteLine("Figures: " + figures.Length);
`,
      },
      check: { position: true, cells: true, output: 'numbers' },
      requires: ['loop'],
      characters: 4,
    },
    {
      id: 'meeting-point',
      title: { de: 'Treffpunkt', en: 'Meeting point' },
      text: {
        de: 'Klonk und Klara stehen sich in einer Reihe gegenüber. Sie gehen abwechselnd je einen Schritt aufeinander zu, Klonk beginnt. Sobald sie direkt nebeneinanderstehen, bleiben beide stehen. Wie weit sie voneinander entfernt sind, ist in jeder Welt anders – vergleiche ihre Positionen.',
        en: 'Klonk and Klara stand facing each other in a row. They take turns stepping towards each other, Klonk begins. As soon as they stand right next to each other, both stop. How far apart they are differs in each world – compare their positions.',
      },
      hints: [
        { de: 'Der Abstand ist `klara.positionX() - klonk.positionX()` (Python: `position_x()`, C#: `PositionX()`). Direkt nebeneinander stehen sie, wenn der Abstand 1 ist.', en: 'The distance is `klara.positionX() - klonk.positionX()` (Python: `position_x()`, C#: `PositionX()`). They stand right next to each other when the distance is 1.' },
        { de: 'Prüfe den Abstand vor **jedem** Schritt – auch vor Klaras Schritt, denn nach Klonks Schritt können die beiden schon nebeneinanderstehen.', en: 'Check the distance before **every** step – also before Klara\'s step, because after Klonk\'s step the two may already stand next to each other.' },
      ],
      worlds: [
        map('> . . . . . <', { names: ['Klonk', 'Klara'] }),
        map(`
          . . . . . . . . . . .
          . > . . . . . . . < .
        `, { names: ['Klonk', 'Klara'] }),
        map('> . . <', { names: ['Klonk', 'Klara'] }),
        map('. > < .', { names: ['Klonk', 'Klara'] }),
      ],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk("Klonk")
klara = Klonk("Klara")
while klara.position_x() - klonk.position_x() > 1:
    klonk.step()
    if klara.position_x() - klonk.position_x() > 1:
        klara.step()
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk("Klonk");
        Klonk klara = new Klonk("Klara");
        while (klara.positionX() - klonk.positionX() > 1) {
            klonk.step();
            if (klara.positionX() - klonk.positionX() > 1) {
                klara.step();
            }
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk('Klonk')
const klara = new Klonk('Klara')
while (klara.positionX() - klonk.positionX() > 1) {
  klonk.step()
  if (klara.positionX() - klonk.positionX() > 1) {
    klara.step()
  }
}
`,
        csharp: `using klonk;

var klonk = new Klonk("Klonk");
var klara = new Klonk("Klara");
while (klara.PositionX() - klonk.PositionX() > 1)
{
    klonk.Step();
    if (klara.PositionX() - klonk.PositionX() > 1)
    {
        klara.Step();
    }
}
`,
      },
      check: { position: true },
      requires: ['loop'],
      characters: 2,
    },
  ],
}
