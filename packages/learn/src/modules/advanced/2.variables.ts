import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeVariables: LearnModule = {
  id: 'code-variables',
  track: 'advanced',
  title: { de: 'Variablen und Datentypen', en: 'Variables and data types' },
  summary: {
    de: 'Werte in Variablen speichern, mit ganzen Zahlen rechnen, Texte zusammensetzen und Wahrheitswerte merken.',
    en: 'Store values in variables, calculate with whole numbers, put texts together and remember truth values.',
  },
  objectives: [
    { de: 'Variablen anlegen und ihnen neue Werte zuweisen – mit Datentyp (`int`, `String`, `boolean`) in Java und C#', en: 'Create variables and assign new values to them – with a data type (`int`, `String`, `boolean`) in Java and C#' },
    { de: 'Mit Variablen zählen und rechnen (`+`, `-`, `*`, `/`)', en: 'Count and calculate with variables (`+`, `-`, `*`, `/`)' },
    { de: 'Texte und Zahlen verbinden und ausgeben (`print`, `System.out.println`, `console.log`, `Console.WriteLine`)', en: 'Combine texts and numbers and output them (`print`, `System.out.println`, `console.log`, `Console.WriteLine`)' },
  ],
  prerequisites: ['code-start'],
  intro: {
    de: `Eine **Variable** ist ein Speicherplatz mit Namen. Mit \`=\` gibst du ihr einen Wert – und später einen neuen. Jeder Wert hat einen **Datentyp**:

- ganze Zahlen, z. B. \`0\` oder \`42\` (Java und C#: \`int\`, TypeScript: \`number\`)
- Texte, z. B. \`"Steps: "\` (Java: \`String\`, C# und TypeScript: \`string\`)
- Wahrheitswerte, also wahr oder falsch (Java und TypeScript: \`boolean\`, C#: \`bool\`)

In Java und C# schreibst du den Datentyp vor den Namen, wenn du die Variable anlegst. Python und JavaScript erkennen den Typ am Wert; in JavaScript legst du veränderliche Variablen mit \`let\` an.

\`\`\`python
from klonk import Klonk

klonk = Klonk()
steps = 0
while not klonk.is_wall():
    klonk.step()
    steps = steps + 1
print("Steps: " + str(steps))
\`\`\`

\`\`\`java
import klonk.Klonk;

public class Programm {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int steps = 0;
        while (!klonk.isWall()) {
            klonk.step();
            steps = steps + 1;
        }
        System.out.println("Steps: " + steps);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

const klonk = new Klonk()
let steps = 0
while (!klonk.isWall()) {
  klonk.step()
  steps = steps + 1
}
console.log('Steps: ' + steps)
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

const klonk = new Klonk()
let steps: number = 0
while (!klonk.isWall()) {
  klonk.step()
  steps = steps + 1
}
console.log('Steps: ' + steps)
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
int steps = 0;
while (!klonk.IsWall())
{
    klonk.Step();
    steps = steps + 1;
}
Console.WriteLine("Steps: " + steps);
\`\`\`

\`steps = steps + 1\` bedeutet: Nimm den alten Wert, zähle eins dazu und speichere das Ergebnis wieder in \`steps\`. Gerechnet wird mit \`+\`, \`-\`, \`*\` und \`/\`. Mit \`+\` hängst du auch Texte aneinander; in Python musst du eine Zahl dafür erst mit \`str()\` in einen Text umwandeln.`,
    en: `A **variable** is a named storage place. With \`=\` you give it a value – and later a new one. Every value has a **data type**:

- whole numbers, e.g. \`0\` or \`42\` (Java and C#: \`int\`, TypeScript: \`number\`)
- texts, e.g. \`"Steps: "\` (Java: \`String\`, C# and TypeScript: \`string\`)
- truth values, i.e. true or false (Java and TypeScript: \`boolean\`, C#: \`bool\`)

In Java and C# you write the data type in front of the name when you create the variable. Python and JavaScript recognise the type from the value; in JavaScript you create variables that change with \`let\`.

\`\`\`python
from klonk import Klonk

klonk = Klonk()
steps = 0
while not klonk.is_wall():
    klonk.step()
    steps = steps + 1
print("Steps: " + str(steps))
\`\`\`

\`\`\`java
import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int steps = 0;
        while (!klonk.isWall()) {
            klonk.step();
            steps = steps + 1;
        }
        System.out.println("Steps: " + steps);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

const klonk = new Klonk()
let steps = 0
while (!klonk.isWall()) {
  klonk.step()
  steps = steps + 1
}
console.log('Steps: ' + steps)
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

const klonk = new Klonk()
let steps: number = 0
while (!klonk.isWall()) {
  klonk.step()
  steps = steps + 1
}
console.log('Steps: ' + steps)
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
int steps = 0;
while (!klonk.IsWall())
{
    klonk.Step();
    steps = steps + 1;
}
Console.WriteLine("Steps: " + steps);
\`\`\`

\`steps = steps + 1\` means: take the old value, add one and store the result in \`steps\` again. You calculate with \`+\`, \`-\`, \`*\` and \`/\`. With \`+\` you can also join texts; in Python you first have to turn a number into a text with \`str()\`.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine bis zwei Doppelstunden.

**Voraussetzungen:** F1 (Objekt erzeugen, Schleifen, Verzweigungen). Wer E9 bearbeitet hat, kennt Variablen und Zähler bereits – neu sind Deklaration und Datentypen.

**Typische Schwierigkeiten:**

- Anlegen und Zuweisen verwechseln: In Java und C# steht der Typ nur beim ersten Mal (\`int steps = 0;\`), danach heißt es \`steps = steps + 1;\`. Ein zweites \`int steps\` ist ein Compilerfehler; steht die Deklaration im Schleifenrumpf, beginnt der Zähler bei jedem Durchlauf neu.
- JavaScript: Mit \`const\` angelegte Variablen lassen sich nicht neu zuweisen – Zähler brauchen \`let\`.
- Python: \`"Steps: " + steps\` ist ein Fehler, weil Text und Zahl nicht von selbst verbunden werden; Abhilfe schaffen \`str(steps)\` oder ein f-String. Wahrheitswerte werden großgeschrieben (\`True\`, \`False\`).
- Java, C# und JavaScript werten \`+\` von links nach rechts aus: \`"x: " + a + b\` hängt beide Zahlen als Text an, \`a + b + "|"\` rechnet zuerst.
- Raum vermessen (Aufgabe 2): Klonk steht schon auf dem ersten Feld – die Breite ist die Zahl der Schritte plus eins (Zaunpfahlproblem).

**Prüfung der Ausgabe:** Die Aufgaben 1 und 2 vergleichen nur die Zahlen in der Ausgabe, die Formulierung ist frei. Aufgabe 3 vergleicht die ganze Zeile (Groß-/Kleinschreibung und mehrfache Leerzeichen egal), damit das genaue Zusammensetzen von Text geübt wird.

**Differenzierung:** Beim Anhalten (Haltepunkt oder Einzelschritt) zeigt Klonk alle Variablen mit ihren Werten – geeignet für Trace-Tabellen. Schnelle Lernende geben in Aufgabe 2 zusätzlich den Umfang aus oder zählen in Aufgabe 4 die roten Marken, statt sich nur einen Wahrheitswert zu merken.`,
    en: `**Time needed:** one to two double lessons.

**Prerequisites:** F1 (create an object, loops, branches). Students who worked on E9 already know variables and counters – new are declarations and data types.

**Typical difficulties:**

- Confusing declaration and assignment: in Java and C# the type is written only the first time (\`int steps = 0;\`), afterwards it is \`steps = steps + 1;\`. A second \`int steps\` is a compiler error; if the declaration is inside the loop body, the counter starts again in each pass.
- JavaScript: variables created with \`const\` cannot be reassigned – counters need \`let\`.
- Python: \`"Steps: " + steps\` is an error because text and numbers are not joined automatically; \`str(steps)\` or an f-string helps. Truth values are capitalised (\`True\`, \`False\`).
- Java, C# and JavaScript evaluate \`+\` from left to right: \`"x: " + a + b\` appends both numbers as text, \`a + b + "|"\` adds first.
- Measuring the room (task 2): Klonk already stands on the first cell – the width is the number of steps plus one (fencepost problem).

**Checking the output:** Tasks 1 and 2 only compare the numbers in the output; the wording is free. Task 3 compares the whole line (case and repeated spaces do not matter) so that putting text together exactly is practised.

**Differentiation:** When paused (breakpoint or single step), Klonk shows all variables with their values – suitable for trace tables. Fast learners additionally output the perimeter in task 2 or count the red marks in task 4 instead of only remembering a truth value.`,
  },
  tasks: [
    {
      id: 'count-steps',
      title: { de: 'Schritte zählen', en: 'Count the steps' },
      text: {
        de: 'Klonk läuft bis zur Wand und gibt danach aus, wie viele Schritte er gegangen ist, z. B. `Steps: 4`. Wie weit die Wand entfernt ist, ist in jeder Welt anders.',
        en: 'Klonk walks to the wall and then outputs how many steps it took, e.g. `Steps: 4`. How far away the wall is differs in each world.',
      },
      hints: [
        {
          de: 'Leg **vor** der Schleife eine Variable mit dem Wert 0 an und erhöhe sie nach jedem Schritt um 1:\n\n```python\nsteps = 0\n...\nsteps = steps + 1\n```\n\n```java\nint steps = 0;\n...\nsteps = steps + 1;\n```\n\n```javascript\nlet steps = 0\n...\nsteps = steps + 1\n```\n\n```csharp\nint steps = 0;\n...\nsteps = steps + 1;\n```',
          en: 'Create a variable with the value 0 **before** the loop and increase it by 1 after every step:\n\n```python\nsteps = 0\n...\nsteps = steps + 1\n```\n\n```java\nint steps = 0;\n...\nsteps = steps + 1;\n```\n\n```javascript\nlet steps = 0\n...\nsteps = steps + 1\n```\n\n```csharp\nint steps = 0;\n...\nsteps = steps + 1;\n```',
        },
      ],
      worlds: [
        map('> . . . . .'),
        map(`
          . . . . . . . . .
          . . > . . . . . .
        `),
        map('. > .'),
      ],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk()
steps = 0
while not klonk.is_wall():
    klonk.step()
    steps = steps + 1
print("Steps: " + str(steps))
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int steps = 0;
        while (!klonk.isWall()) {
            klonk.step();
            steps = steps + 1;
        }
        System.out.println("Steps: " + steps);
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
let steps = 0
while (!klonk.isWall()) {
  klonk.step()
  steps = steps + 1
}
console.log('Steps: ' + steps)
`,
        typescript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
let steps: number = 0
while (!klonk.isWall()) {
  klonk.step()
  steps = steps + 1
}
console.log('Steps: ' + steps)
`,
        csharp: `using klonk;

var klonk = new Klonk();
int steps = 0;
while (!klonk.IsWall())
{
    klonk.Step();
    steps = steps + 1;
}
Console.WriteLine("Steps: " + steps);
`,
      },
      check: { position: true, output: 'numbers' },
      requires: ['loop'],
    },
    {
      id: 'measure-room',
      title: { de: 'Raum vermessen', en: 'Measure the room' },
      text: {
        de: 'Klonk steht in der nordwestlichen Ecke des Raums und schaut nach Osten. Er läuft bis zur östlichen Wand, dreht sich nach rechts und läuft bis zur südlichen Wand. Gib danach die **Breite**, die **Tiefe** und die **Fläche** des Raums in Feldern aus – in dieser Reihenfolge.',
        en: 'Klonk stands in the north-west corner of the room and faces east. It walks to the east wall, turns right and walks to the south wall. Then output the **width**, the **depth** and the **area** of the room in cells – in this order.',
      },
      hints: [
        { de: 'Achtung: Wenn Klonk 4 Schritte bis zur Wand gehen kann, ist der Raum 5 Felder breit – auf dem ersten Feld steht Klonk ja schon. Am einfachsten beginnt dein Zähler deshalb bei 1.', en: 'Careful: if Klonk can take 4 steps to the wall, the room is 5 cells wide – Klonk already stands on the first cell. So the easiest way is to start your counter at 1.' },
        { de: 'Die Fläche ist Breite mal Tiefe. Das Malzeichen ist in allen Sprachen `*`, z. B. `area = width * depth`.', en: 'The area is width times depth. The multiplication sign is `*` in all languages, e.g. `area = width * depth`.' },
      ],
      worlds: [
        map(`
          > . . . .
          . . . . .
          . . . . .
        `),
        map(`
          > . . . . . . .
          . . . . . . . .
          . . . . . . . .
          . . . . . . . .
        `),
        map('> . .'),
        map(`
          >
          .
          .
          .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk()
width = 1
while not klonk.is_wall():
    klonk.step()
    width = width + 1
klonk.turn_right()
depth = 1
while not klonk.is_wall():
    klonk.step()
    depth = depth + 1
area = width * depth
print("Width: " + str(width))
print("Depth: " + str(depth))
print("Area: " + str(area))
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int width = 1;
        while (!klonk.isWall()) {
            klonk.step();
            width = width + 1;
        }
        klonk.turnRight();
        int depth = 1;
        while (!klonk.isWall()) {
            klonk.step();
            depth = depth + 1;
        }
        int area = width * depth;
        System.out.println("Width: " + width);
        System.out.println("Depth: " + depth);
        System.out.println("Area: " + area);
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
let width = 1
while (!klonk.isWall()) {
  klonk.step()
  width = width + 1
}
klonk.turnRight()
let depth = 1
while (!klonk.isWall()) {
  klonk.step()
  depth = depth + 1
}
const area = width * depth
console.log('Width: ' + width)
console.log('Depth: ' + depth)
console.log('Area: ' + area)
`,
        typescript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
let width: number = 1
while (!klonk.isWall()) {
  klonk.step()
  width = width + 1
}
klonk.turnRight()
let depth: number = 1
while (!klonk.isWall()) {
  klonk.step()
  depth = depth + 1
}
const area: number = width * depth
console.log('Width: ' + width)
console.log('Depth: ' + depth)
console.log('Area: ' + area)
`,
        csharp: `using klonk;

var klonk = new Klonk();
int width = 1;
while (!klonk.IsWall())
{
    klonk.Step();
    width = width + 1;
}
klonk.TurnRight();
int depth = 1;
while (!klonk.IsWall())
{
    klonk.Step();
    depth = depth + 1;
}
int area = width * depth;
Console.WriteLine("Width: " + width);
Console.WriteLine("Depth: " + depth);
Console.WriteLine("Area: " + area);
`,
      },
      check: { position: true, output: 'numbers' },
      requires: ['loop'],
    },
    {
      id: 'name-tag',
      title: { de: 'Namensschild', en: 'Name tag' },
      text: {
        de: 'Die Figur heißt in jeder Welt anders. Sie läuft bis zur Wand und gibt danach in **einer** Zeile ihren Namen, einen Doppelpunkt, ein Leerzeichen und ihre Position (Spalte|Zeile) aus – genau so: `Klara: 2|4`. Spalten zählen von Westen ab 1, Zeilen von Norden ab 1.',
        en: 'The character has a different name in each world. It walks to the wall and then outputs on **one** line its name, a colon, a space and its position (column|row) – exactly like this: `Klara: 2|4`. Columns count from the west starting at 1, rows from the north starting at 1.',
      },
      hints: [
        {
          de: 'Der Name ist ein Text, die Position sind zwei ganze Zahlen:\n\n```python\nname = klonk.name\nx = klonk.position_x()\n```\n\n```java\nString name = klonk.name;\nint x = klonk.positionX();\n```\n\n```javascript\nconst name = klonk.name\nconst x = klonk.positionX()\n```\n\n```csharp\nstring name = klonk.Name;\nint x = klonk.PositionX();\n```',
          en: 'The name is a text, the position consists of two whole numbers:\n\n```python\nname = klonk.name\nx = klonk.position_x()\n```\n\n```java\nString name = klonk.name;\nint x = klonk.positionX();\n```\n\n```javascript\nconst name = klonk.name\nconst x = klonk.positionX()\n```\n\n```csharp\nstring name = klonk.Name;\nint x = klonk.PositionX();\n```',
        },
        {
          de: 'Setze die Zeile mit `+` aus Text und Zahlen zusammen. In Python musst du jede Zahl mit `str()` umwandeln, z. B. `name + ": " + str(x)`.',
          en: 'Put the line together from text and numbers with `+`. In Python you have to convert each number with `str()`, e.g. `name + ": " + str(x)`.',
        },
      ],
      worlds: [
        map(`
          . . . . .
          . v . . .
          . . . . .
          . . . . .
        `, { names: ['Klara'] }),
        map(`
          . . . . . .
          > . . . . .
        `, { names: ['Kai'] }),
        map(`
          . . .
          . . .
          . ^ .
        `),
        map('. . < . . . .', { names: ['Mia'] }),
      ],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk()
while not klonk.is_wall():
    klonk.step()
x = klonk.position_x()
y = klonk.position_y()
print(klonk.name + ": " + str(x) + "|" + str(y))
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        while (!klonk.isWall()) {
            klonk.step();
        }
        int x = klonk.positionX();
        int y = klonk.positionY();
        System.out.println(klonk.name + ": " + x + "|" + y);
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
while (!klonk.isWall()) {
  klonk.step()
}
const x = klonk.positionX()
const y = klonk.positionY()
console.log(klonk.name + ': ' + x + '|' + y)
`,
        typescript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
while (!klonk.isWall()) {
  klonk.step()
}
const x: number = klonk.positionX()
const y: number = klonk.positionY()
console.log(klonk.name + ': ' + x + '|' + y)
`,
        csharp: `using klonk;

var klonk = new Klonk();
while (!klonk.IsWall())
{
    klonk.Step();
}
int x = klonk.PositionX();
int y = klonk.PositionY();
Console.WriteLine(klonk.Name + ": " + x + "|" + y);
`,
      },
      check: { position: true, output: 'lines' },
      requires: ['loop'],
    },
    {
      id: 'red-seen',
      title: { de: 'Rot gesehen?', en: 'Seen red?' },
      text: {
        de: 'Klonk läuft bis zur Wand. Lag unterwegs mindestens eine **rote** Marke, setzt er am Ende eine rote Marke auf sein Feld, sonst eine **grüne**. Merk dir in einer Variablen mit einem Wahrheitswert, ob Klonk schon eine rote Marke gesehen hat.',
        en: 'Klonk walks to the wall. If there was at least one **red** mark on the way, it sets a red mark on its cell at the end, otherwise a **green** one. Remember in a variable holding a truth value whether Klonk has already seen a red mark.',
      },
      hints: [
        {
          de: 'Am Anfang hat Klonk noch nichts gesehen – die Variable ist falsch. Steht Klonk auf einer roten Marke, wird sie wahr:\n\n```python\nred_seen = False\n...\nif klonk.is_mark(red):\n    red_seen = True\n```\n\n```java\nboolean redSeen = false;\n...\nif (klonk.isMark(RED)) {\n    redSeen = true;\n}\n```\n\n```javascript\nlet redSeen = false\n...\nif (klonk.isMark(red)) {\n  redSeen = true\n}\n```\n\n```csharp\nbool redSeen = false;\n...\nif (klonk.IsMark(Red))\n{\n    redSeen = true;\n}\n```',
          en: 'At the start Klonk has not seen anything – the variable is false. If Klonk stands on a red mark, it becomes true:\n\n```python\nred_seen = False\n...\nif klonk.is_mark(red):\n    red_seen = True\n```\n\n```java\nboolean redSeen = false;\n...\nif (klonk.isMark(RED)) {\n    redSeen = true;\n}\n```\n\n```javascript\nlet redSeen = false\n...\nif (klonk.isMark(red)) {\n  redSeen = true\n}\n```\n\n```csharp\nbool redSeen = false;\n...\nif (klonk.IsMark(Red))\n{\n    redSeen = true;\n}\n```',
        },
        { de: 'Ein Wahrheitswert kann direkt als Bedingung dienen: `if (redSeen)` – in Python `if red_seen:`. Die Farben `red` und `green` musst du mit importieren.', en: 'A truth value can be used directly as a condition: `if (redSeen)` – in Python `if red_seen:`. You have to import the colours `red` and `green` as well.' },
      ],
      worlds: [
        map('> . y r . b .'),
        map('> y . b . y . . .'),
        map('> r . .'),
        map('> b'),
      ],
      solutions: {
        python: `from klonk import Klonk, red, green

klonk = Klonk()
red_seen = False
while not klonk.is_wall():
    klonk.step()
    if klonk.is_mark(red):
        red_seen = True
if red_seen:
    klonk.set_mark(red)
else:
    klonk.set_mark(green)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        boolean redSeen = false;
        while (!klonk.isWall()) {
            klonk.step();
            if (klonk.isMark(RED)) {
                redSeen = true;
            }
        }
        if (redSeen) {
            klonk.setMark(RED);
        } else {
            klonk.setMark(GREEN);
        }
    }
}
`,
        javascript: `import { Klonk, red, green } from 'klonk'

const klonk = new Klonk()
let redSeen = false
while (!klonk.isWall()) {
  klonk.step()
  if (klonk.isMark(red)) {
    redSeen = true
  }
}
if (redSeen) {
  klonk.setMark(red)
} else {
  klonk.setMark(green)
}
`,
        typescript: `import { Klonk, red, green } from 'klonk'

const klonk = new Klonk()
let redSeen: boolean = false
while (!klonk.isWall()) {
  klonk.step()
  if (klonk.isMark(red)) {
    redSeen = true
  }
}
if (redSeen) {
  klonk.setMark(red)
} else {
  klonk.setMark(green)
}
`,
        csharp: `using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
bool redSeen = false;
while (!klonk.IsWall())
{
    klonk.Step();
    if (klonk.IsMark(Red))
    {
        redSeen = true;
    }
}
if (redSeen)
{
    klonk.SetMark(Red);
}
else
{
    klonk.SetMark(Green);
}
`,
      },
      check: { position: true, cells: true },
      requires: ['loop', 'if'],
    },
  ],
}
