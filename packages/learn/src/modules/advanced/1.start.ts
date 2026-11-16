import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeStart: LearnModule = {
  id: 'code-start',
  track: 'advanced',
  title: { de: 'Umstieg: Klonk als Objekt', en: 'Switching over: Klonk as an object' },
  summary: {
    de: 'Von Klonk-Script in eine Programmiersprache: Objekt erzeugen, Methoden aufrufen, Schleifen und Verzweigungen.',
    en: 'From Klonk-Script to a programming language: create an object, call methods, loops and branches.',
  },
  objectives: [
    { de: 'Die Bibliothek `klonk` importieren und ein Objekt der Klasse `Klonk` erzeugen', en: 'Import the `klonk` library and create an object of the class `Klonk`' },
    { de: 'Methoden mit der Punktschreibweise aufrufen (`klonk.step()`)', en: 'Call methods with dot notation (`klonk.step()`)' },
    { de: 'Bekannte Kontrollstrukturen in der neuen Sprache schreiben: `while`, `for`, `if`/`else`', en: 'Write familiar control structures in the new language: `while`, `for`, `if`/`else`' },
  ],
  prerequisites: ['conditions'],
  intro: {
    de: `In Python, Java, JavaScript, TypeScript und C# ist Klonk ein **Objekt**. Du holst dir die Klasse \`Klonk\` aus der Bibliothek \`klonk\` und erzeugst damit ein Objekt für die erste Figur der Welt. Befehle sind **Methoden** des Objekts: Objektname, Punkt, Methodenname und Klammern.

\`\`\`python
from klonk import Klonk, blue

klonk = Klonk()
klonk.step(2)
klonk.place_brick(blue)
\`\`\`

\`\`\`java
import klonk.Klonk;
import static klonk.Klonk.*;

public class Programm {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        klonk.step(2);
        klonk.placeBrick(BLUE);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, blue } from 'klonk'

const klonk = new Klonk()
klonk.step(2)
klonk.placeBrick(blue)
\`\`\`

\`\`\`csharp
using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
klonk.Step(2);
klonk.PlaceBrick(Blue);
\`\`\`

Die Befehle heißen wie in Klonk-Script auf Englisch – in Python klein mit Unterstrich (\`turn_left\`), in C# mit großem Anfangsbuchstaben (\`TurnLeft\`). Sensoren sind Methoden mit Rückgabewert, z. B. \`isWall()\`. Schleifen und Verzweigungen schreibst du so, wie es die Sprache vorsieht: \`while\`, \`for\`, \`if\` … \`else\`.`,
    en: `In Python, Java, JavaScript, TypeScript and C#, Klonk is an **object**. You get the class \`Klonk\` from the library \`klonk\` and use it to create an object for the first character in the world. Commands are **methods** of the object: object name, dot, method name and parentheses.

\`\`\`python
from klonk import Klonk, blue

klonk = Klonk()
klonk.step(2)
klonk.place_brick(blue)
\`\`\`

\`\`\`java
import klonk.Klonk;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        klonk.step(2);
        klonk.placeBrick(BLUE);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk, blue } from 'klonk'

const klonk = new Klonk()
klonk.step(2)
klonk.placeBrick(blue)
\`\`\`

\`\`\`csharp
using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
klonk.Step(2);
klonk.PlaceBrick(Blue);
\`\`\`

The commands have the same English names as in Klonk-Script – in Python in lower case with underscores (\`turn_left\`), in C# with a capital first letter (\`TurnLeft\`). Sensors are methods that return a value, e.g. \`isWall()\`. Loops and branches are written the way the language does it: \`while\`, \`for\`, \`if\` … \`else\`.`,
  },
  teacher: {
    de: `**Zeitbedarf:** eine Doppelstunde.

**Voraussetzungen:** Die Lernenden kennen Wiederholung und Verzweigung aus Klonk-Script oder Blöcken (E4–E7). Das Modul lässt sich auch als Einstieg für Lernende mit Programmiererfahrung nutzen.

**Typische Schwierigkeiten:** Klammern bei Methoden ohne Parameter (\`klonk.isWall\` statt \`klonk.isWall()\` ist in Python und JavaScript kein Fehler, aber immer wahr), Semikolons und geschweifte Klammern in Java und C#, Einrückung in Python. Der Import fehlt oder die Farbe wird nicht mit importiert. Die Fehlermeldungen des Editors erscheinen schon beim Tippen – es lohnt sich, sie gemeinsam zu lesen.

**Sprachwahl:** Die Gruppenleitung legt die Sprache je Modul fest (Unterricht → Gruppe). Ohne Vorgabe wählen die Lernenden je Aufgabe; die Tipps und Beispiele zeigen jeweils die gewählte Sprache.

**Differenzierung:** Schnelle Lernende lösen Aufgabe 4 in einer zweiten Sprache und vergleichen die Schreibweisen.`,
    en: `**Time needed:** one double lesson.

**Prerequisites:** Students know repetition and branching from Klonk-Script or blocks (E4–E7). The module can also serve as an entry point for students with programming experience.

**Typical difficulties:** Parentheses for methods without parameters (\`klonk.isWall\` instead of \`klonk.isWall()\` is no error in Python and JavaScript but always true), semicolons and curly braces in Java and C#, indentation in Python. The import is missing or the colour is not imported. The editor shows error messages while typing – it pays to read them together.

**Choice of language:** The group leader sets the language per module (Teaching → group). Without a setting, students choose per task; hints and examples show the chosen language.

**Differentiation:** Fast learners solve task 4 in a second language and compare the notations.`,
  },
  tasks: [
    {
      id: 'hello',
      title: { de: 'Hallo, Klonk', en: 'Hello, Klonk' },
      text: {
        de: 'Bring Klonk auf die gelbe Marke. Dort dreht er sich nach links und legt einen **blauen** Ziegel vor sich.',
        en: 'Bring Klonk to the yellow mark. There it turns left and places a **blue** brick in front of itself.',
      },
      hints: [
        {
          de: 'Die Farbe musst du mit importieren, z. B. in Python:\n\n```python\nfrom klonk import Klonk, blue\n```\n\n```java\nimport static klonk.Klonk.*;\n```\n\n```javascript\nimport { Klonk, blue } from \'klonk\'\n```\n\n```csharp\nusing static klonk.Klonk;\n```',
          en: 'You also have to import the colour:\n\n```python\nfrom klonk import Klonk, blue\n```\n\n```java\nimport static klonk.Klonk.*;\n```\n\n```javascript\nimport { Klonk, blue } from \'klonk\'\n```\n\n```csharp\nusing static klonk.Klonk;\n```',
        },
      ],
      worlds: [map(`
        . . . . .
        > . . y .
        . . . . .
      `)],
      solutions: {
        python: `from klonk import Klonk, blue

klonk = Klonk()
klonk.step(3)
klonk.turn_left()
klonk.place_brick(blue)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        klonk.step(3);
        klonk.turnLeft();
        klonk.placeBrick(BLUE);
    }
}
`,
        javascript: `import { Klonk, blue } from 'klonk'

const klonk = new Klonk()
klonk.step(3)
klonk.turnLeft()
klonk.placeBrick(blue)
`,
        csharp: `using klonk;
using static klonk.Klonk;

var klonk = new Klonk();
klonk.Step(3);
klonk.TurnLeft();
klonk.PlaceBrick(Blue);
`,
      },
      check: { position: true, cells: true },
    },
    {
      id: 'while-wall',
      title: { de: 'Bis zur Wand', en: 'To the wall' },
      text: {
        de: 'Klonk läuft bis zur Wand und markiert dort sein Feld. Wie weit die Wand entfernt ist, ist in jeder Welt anders.',
        en: 'Klonk walks to the wall and marks its cell there. How far away the wall is differs in each world.',
      },
      hints: [
        { de: 'Die bedingte Schleife heißt in allen Sprachen `while`. „nicht“ schreibt man in Python `not`, sonst `!`.', en: 'The conditional loop is called `while` in all languages. “not” is written `not` in Python, `!` otherwise.' },
      ],
      worlds: [map('> . . . .'), map('> . . . . . . . .'), map('> .')],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk()
while not klonk.is_wall():
    klonk.step()
klonk.set_mark()
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        while (!klonk.isWall()) {
            klonk.step();
        }
        klonk.setMark();
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
while (!klonk.isWall()) {
  klonk.step()
}
klonk.setMark()
`,
        csharp: `using klonk;

var klonk = new Klonk();
while (!klonk.IsWall())
{
    klonk.Step();
}
klonk.SetMark();
`,
      },
      check: { position: true, cells: true },
      requires: ['loop'],
    },
    {
      id: 'for-tower',
      title: { de: 'Turm mit Zählschleife', en: 'Tower with a counting loop' },
      text: {
        de: 'Baue vor Klonk einen Turm aus genau **fünf** Ziegeln. Verwende eine Zählschleife statt fünfmal derselben Zeile.',
        en: 'Build a tower of exactly **five** bricks in front of Klonk. Use a counting loop instead of the same line five times.',
      },
      hints: [
        {
          de: 'Eine Zählschleife für fünf Durchläufe:\n\n```python\nfor i in range(5):\n    ...\n```\n\n```java\nfor (int i = 0; i < 5; i++) {\n    ...\n}\n```\n\n```javascript\nfor (let i = 0; i < 5; i++) {\n  ...\n}\n```\n\n```csharp\nfor (var i = 0; i < 5; i++)\n{\n    ...\n}\n```',
          en: 'A counting loop with five passes:\n\n```python\nfor i in range(5):\n    ...\n```\n\n```java\nfor (int i = 0; i < 5; i++) {\n    ...\n}\n```\n\n```javascript\nfor (let i = 0; i < 5; i++) {\n  ...\n}\n```\n\n```csharp\nfor (var i = 0; i < 5; i++)\n{\n    ...\n}\n```',
        },
      ],
      worlds: [map('. > . .')],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk()
for i in range(5):
    klonk.place_brick()
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        for (int i = 0; i < 5; i++) {
            klonk.placeBrick();
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
for (let i = 0; i < 5; i++) {
  klonk.placeBrick()
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
for (var i = 0; i < 5; i++)
{
    klonk.PlaceBrick();
}
`,
      },
      check: { cells: true },
      requires: ['loop'],
    },
    {
      id: 'invert-marks',
      title: { de: 'Marken umkehren', en: 'Invert the marks' },
      text: {
        de: 'Klonk läuft bis zur Wand. Auf jedem Feld, das er betritt, entfernt er die Marke, falls eine da ist – sonst setzt er eine. Sein Startfeld bleibt, wie es ist.',
        en: 'Klonk walks to the wall. On every cell it enters it removes the mark if there is one – otherwise it sets one. Its start cell stays as it is.',
      },
      hints: [
        { de: 'Nach jedem Schritt entscheidet eine Verzweigung mit `if` und `else`, ob `removeMark` oder `setMark` an der Reihe ist (Python: `remove_mark`/`set_mark`, C#: `RemoveMark`/`SetMark`).', en: 'After each step, a branch with `if` and `else` decides whether `removeMark` or `setMark` is next (Python: `remove_mark`/`set_mark`, C#: `RemoveMark`/`SetMark`).' },
      ],
      worlds: [map('> y . y y .'), map('> . . . y . y y'), map('> y')],
      solutions: {
        python: `from klonk import Klonk

klonk = Klonk()
while not klonk.is_wall():
    klonk.step()
    if klonk.is_mark():
        klonk.remove_mark()
    else:
        klonk.set_mark()
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        while (!klonk.isWall()) {
            klonk.step();
            if (klonk.isMark()) {
                klonk.removeMark();
            } else {
                klonk.setMark();
            }
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const klonk = new Klonk()
while (!klonk.isWall()) {
  klonk.step()
  if (klonk.isMark()) {
    klonk.removeMark()
  } else {
    klonk.setMark()
  }
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
while (!klonk.IsWall())
{
    klonk.Step();
    if (klonk.IsMark())
    {
        klonk.RemoveMark();
    }
    else
    {
        klonk.SetMark();
    }
}
`,
      },
      check: { cells: true },
      requires: ['loop', 'if'],
    },
  ],
}
