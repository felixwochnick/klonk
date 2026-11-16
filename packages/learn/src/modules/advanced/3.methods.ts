import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeMethods: LearnModule = {
  id: 'code-methods',
  track: 'advanced',
  title: { de: 'Methoden mit Parametern und Rückgabewert', en: 'Methods with parameters and return values' },
  summary: {
    de: 'Eigene Methoden schreiben, die eine Figur und Zahlen als Parameter bekommen und Ergebnisse zurückgeben.',
    en: 'Write your own methods that take a character and numbers as parameters and return results.',
  },
  objectives: [
    { de: 'Eigene Methoden (Funktionen) definieren und aufrufen, die das Klonk-Objekt als Parameter bekommen', en: 'Define and call your own methods (functions) that take the Klonk object as a parameter' },
    { de: 'Methoden mit weiteren Parametern allgemein machen, z. B. `tower(k, height)`', en: 'Make methods general with further parameters, e.g. `tower(k, height)`' },
    { de: 'Ergebnisse mit `return` zurückgeben und im Programm weiterverwenden', en: 'Return results with `return` and use them further in the program' },
  ],
  prerequisites: ['code-variables'],
  intro: {
    de: `Mit einer eigenen **Methode** gibst du mehreren Befehlen einen Namen und rufst sie danach wie einen Befehl auf. Was die Methode braucht, bekommt sie als **Parameter** – zum Beispiel die Figur, die sie steuern soll, und eine Zahl. Mit \`return\` gibt eine Methode ein **Ergebnis** an die Stelle zurück, an der sie aufgerufen wurde.

\`\`\`python
from klonk import Klonk


def tower(k, height):
    for i in range(height):
        k.place_brick()


def is_free(k):
    return not k.is_wall() and not k.is_brick()


klonk = Klonk()
tower(klonk, 3)
klonk.turn_left()
if is_free(klonk):
    klonk.step()
\`\`\`

\`\`\`java
import klonk.Klonk;

public class Programm {
    static void tower(Klonk k, int height) {
        for (int i = 0; i < height; i++) {
            k.placeBrick();
        }
    }

    static boolean isFree(Klonk k) {
        return !k.isWall() && !k.isBrick();
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        tower(klonk, 3);
        klonk.turnLeft();
        if (isFree(klonk)) {
            klonk.step();
        }
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

function tower(k, height) {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function isFree(k) {
  return !k.isWall() && !k.isBrick()
}

const klonk = new Klonk()
tower(klonk, 3)
klonk.turnLeft()
if (isFree(klonk)) {
  klonk.step()
}
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

function tower(k: Klonk, height: number): void {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function isFree(k: Klonk): boolean {
  return !k.isWall() && !k.isBrick()
}

const klonk = new Klonk()
tower(klonk, 3)
klonk.turnLeft()
if (isFree(klonk)) {
  klonk.step()
}
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
Tower(klonk, 3);
klonk.TurnLeft();
if (IsFree(klonk))
{
    klonk.Step();
}

void Tower(Klonk k, int height)
{
    for (var i = 0; i < height; i++)
    {
        k.PlaceBrick();
    }
}

bool IsFree(Klonk k)
{
    return !k.IsWall() && !k.IsBrick();
}
\`\`\`

Beim Aufruf \`tower(klonk, 3)\` steht der Parameter \`k\` für die Figur \`klonk\` und \`height\` hat den Wert 3. Die Methode arbeitet mit genau dem Objekt, das du übergibst – deshalb funktioniert sie für jede Figur.

Python beginnt eine Funktion mit \`def\`, JavaScript mit \`function\`; dort steht sie über dem Hauptprogramm. In Java steht die Methode in der Klasse neben \`main\` und beginnt mit \`static\`, in C# schreibst du sie unter dein Programm. Java, C# und TypeScript verlangen vor jedem Parameter seinen Typ und geben den **Rückgabetyp** an: \`void\` heißt „kein Ergebnis“, \`int\` (TypeScript \`number\`) eine ganze Zahl, \`boolean\` (C# \`bool\`) einen Wahrheitswert. Eigene Methoden benennst du wie die Befehle deiner Sprache: in Python klein mit Unterstrich (\`turn_around\`), in C# mit großem Anfangsbuchstaben (\`TurnAround\`), sonst \`turnAround\`.`,
    en: `With your own **method** you give several commands a name and then call it like a command. Whatever the method needs, it gets as a **parameter** – for example the character it should control and a number. With \`return\`, a method gives a **result** back to the place where it was called.

\`\`\`python
from klonk import Klonk


def tower(k, height):
    for i in range(height):
        k.place_brick()


def is_free(k):
    return not k.is_wall() and not k.is_brick()


klonk = Klonk()
tower(klonk, 3)
klonk.turn_left()
if is_free(klonk):
    klonk.step()
\`\`\`

\`\`\`java
import klonk.Klonk;

public class Program {
    static void tower(Klonk k, int height) {
        for (int i = 0; i < height; i++) {
            k.placeBrick();
        }
    }

    static boolean isFree(Klonk k) {
        return !k.isWall() && !k.isBrick();
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        tower(klonk, 3);
        klonk.turnLeft();
        if (isFree(klonk)) {
            klonk.step();
        }
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

function tower(k, height) {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function isFree(k) {
  return !k.isWall() && !k.isBrick()
}

const klonk = new Klonk()
tower(klonk, 3)
klonk.turnLeft()
if (isFree(klonk)) {
  klonk.step()
}
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

function tower(k: Klonk, height: number): void {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function isFree(k: Klonk): boolean {
  return !k.isWall() && !k.isBrick()
}

const klonk = new Klonk()
tower(klonk, 3)
klonk.turnLeft()
if (isFree(klonk)) {
  klonk.step()
}
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
Tower(klonk, 3);
klonk.TurnLeft();
if (IsFree(klonk))
{
    klonk.Step();
}

void Tower(Klonk k, int height)
{
    for (var i = 0; i < height; i++)
    {
        k.PlaceBrick();
    }
}

bool IsFree(Klonk k)
{
    return !k.IsWall() && !k.IsBrick();
}
\`\`\`

In the call \`tower(klonk, 3)\`, the parameter \`k\` stands for the character \`klonk\` and \`height\` has the value 3. The method works with exactly the object you pass to it – that is why it works for every character.

Python starts a function with \`def\`, JavaScript with \`function\`; there it stands above the main program. In Java the method goes into the class next to \`main\` and starts with \`static\`; in C# you write it below your program. Java, C# and TypeScript require the type in front of each parameter and state the **return type**: \`void\` means “no result”, \`int\` (TypeScript \`number\`) a whole number, \`boolean\` (C# \`bool\`) a truth value. Name your own methods like the commands of your language: in Python in lower case with underscores (\`turn_around\`), in C# with a capital first letter (\`TurnAround\`), otherwise \`turnAround\`.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** F2 (Variablen, Zählen). Prozeduren und Funktionen aus E8 und E10 erleichtern den Einstieg; neu sind Parameter für das Objekt und die Typangaben.

**Typische Schwierigkeiten:**

- Python: Eine Funktion muss im Programmtext **über** ihrem ersten Aufruf stehen; der Rumpf wird eingerückt.
- Java: Ohne \`static\` meldet der Compiler „non-static method … cannot be referenced from a static context“. Methoden stehen in der Klasse, aber außerhalb von \`main\`.
- C#: Die Methoden stehen unter den Anweisungen des Hauptprogramms (lokale Funktionen) und werden großgeschrieben.
- Parameter und Variable verwechseln: In der Methode heißt die Figur \`k\`, im Hauptprogramm \`klonk\` – beide Namen verweisen auf dasselbe Objekt. Manche Lernende erzeugen in der Methode zusätzlich \`new Klonk()\`; das funktioniert zufällig, solange es nur eine Figur gibt, und sollte angesprochen werden.
- Rückgabewert berechnet, aber nicht verwendet: \`distanceToWall(klonk)\` ohne Zuweisung an eine Variable. Ebenso steht \`return\` manchmal in der Schleife und beendet die Methode nach dem ersten Schritt.
- Aufgabe 3: In Python liefert \`/\` immer eine Kommazahl, \`//\` teilt ganzzahlig. In JavaScript ergibt \`/\` bei ungeraden Zahlen eine Kommazahl, die \`step\` ablehnt; in den Startwelten ist der Abstand immer gerade.

**Differenzierung:** Schnelle Lernende gliedern Aufgabe 4 mit einer weiteren Methode (z. B. \`mirror(k)\` für ein Feld) oder erweitern Aufgabe 3 auf Reihen mit gerader Länge (zwei Marken in der Mitte). Wer langsamer ist, bekommt die Methode \`tower\` aus der Einführung vorgegeben.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** F2 (variables, counting). Procedures and functions from E8 and E10 make the start easier; new are parameters for the object and the type declarations.

**Typical difficulties:**

- Python: a function has to stand **above** its first call in the program text; the body is indented.
- Java: without \`static\` the compiler reports “non-static method … cannot be referenced from a static context”. Methods go into the class but outside of \`main\`.
- C#: the methods stand below the statements of the main program (local functions) and are capitalised.
- Confusing parameter and variable: inside the method the character is called \`k\`, in the main program \`klonk\` – both names refer to the same object. Some students additionally create \`new Klonk()\` inside the method; this happens to work as long as there is only one character and should be discussed.
- Return value calculated but not used: \`distanceToWall(klonk)\` without assigning it to a variable. Also, \`return\` sometimes ends up inside the loop and ends the method after the first step.
- Task 3: in Python \`/\` always gives a decimal number, \`//\` divides as whole numbers. In JavaScript \`/\` gives a decimal number for odd numbers, which \`step\` rejects; in the start worlds the distance is always even.

**Differentiation:** Fast learners structure task 4 with a further method (e.g. \`mirror(k)\` for one cell) or extend task 3 to rows with an even length (two marks in the middle). Slower learners are given the method \`tower\` from the introduction.`,
  },
  tasks: [
    {
      id: 'there-and-back',
      title: { de: 'Hin und zurück', en: 'There and back' },
      text: {
        de: 'Klonk läuft bis zur Wand, dreht sich um, läuft bis zur gegenüberliegenden Wand und dreht sich dort noch einmal um. Schreibe dafür zwei eigene Methoden, die die Figur als Parameter bekommen: `walkToWall(k)` lässt sie bis zur Wand laufen, `turnAround(k)` dreht sie um (Python: `walk_to_wall`, `turn_around`, C#: `WalkToWall`, `TurnAround`). Das Hauptprogramm besteht dann nur noch aus Aufrufen.',
        en: 'Klonk walks to the wall, turns around, walks to the opposite wall and turns around once more there. Write two methods of your own for this that take the character as a parameter: `walkToWall(k)` lets it walk to the wall, `turnAround(k)` turns it around (Python: `walk_to_wall`, `turn_around`, C#: `WalkToWall`, `TurnAround`). The main program then only consists of calls.',
      },
      hints: [
        {
          de: 'So sieht eine Methode mit der Figur als Parameter aus:\n\n```python\ndef turn_around(k):\n    k.turn_left()\n    k.turn_left()\n```\n\n```java\nstatic void turnAround(Klonk k) {\n    k.turnLeft();\n    k.turnLeft();\n}\n```\n\n```javascript\nfunction turnAround(k) {\n  k.turnLeft()\n  k.turnLeft()\n}\n```\n\n```typescript\nfunction turnAround(k: Klonk): void {\n  k.turnLeft()\n  k.turnLeft()\n}\n```\n\n```csharp\nvoid TurnAround(Klonk k)\n{\n    k.TurnLeft();\n    k.TurnLeft();\n}\n```',
          en: 'This is what a method with the character as a parameter looks like:\n\n```python\ndef turn_around(k):\n    k.turn_left()\n    k.turn_left()\n```\n\n```java\nstatic void turnAround(Klonk k) {\n    k.turnLeft();\n    k.turnLeft();\n}\n```\n\n```javascript\nfunction turnAround(k) {\n  k.turnLeft()\n  k.turnLeft()\n}\n```\n\n```typescript\nfunction turnAround(k: Klonk): void {\n  k.turnLeft()\n  k.turnLeft()\n}\n```\n\n```csharp\nvoid TurnAround(Klonk k)\n{\n    k.TurnLeft();\n    k.TurnLeft();\n}\n```',
        },
        { de: 'Beim Aufruf übergibst du deine Figur: `turnAround(klonk)`.', en: 'When calling it, you pass your character: `turnAround(klonk)`.' },
      ],
      worlds: [
        map(`
          . . > . .
          . . . . .
        `),
        map(`
          . . . . . . .
          . . . . . < .
        `),
        map(`
          . . .
          . v .
          . . .
          . . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk


def walk_to_wall(k):
    while not k.is_wall():
        k.step()


def turn_around(k):
    k.turn_left()
    k.turn_left()


klonk = Klonk()
walk_to_wall(klonk)
turn_around(klonk)
walk_to_wall(klonk)
turn_around(klonk)
`,
        java: `import klonk.Klonk;

public class Program {
    static void walkToWall(Klonk k) {
        while (!k.isWall()) {
            k.step();
        }
    }

    static void turnAround(Klonk k) {
        k.turnLeft();
        k.turnLeft();
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        walkToWall(klonk);
        turnAround(klonk);
        walkToWall(klonk);
        turnAround(klonk);
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function walkToWall(k) {
  while (!k.isWall()) {
    k.step()
  }
}

function turnAround(k) {
  k.turnLeft()
  k.turnLeft()
}

const klonk = new Klonk()
walkToWall(klonk)
turnAround(klonk)
walkToWall(klonk)
turnAround(klonk)
`,
        typescript: `import { Klonk } from 'klonk'

function walkToWall(k: Klonk): void {
  while (!k.isWall()) {
    k.step()
  }
}

function turnAround(k: Klonk): void {
  k.turnLeft()
  k.turnLeft()
}

const klonk = new Klonk()
walkToWall(klonk)
turnAround(klonk)
walkToWall(klonk)
turnAround(klonk)
`,
        csharp: `using klonk;

var klonk = new Klonk();
WalkToWall(klonk);
TurnAround(klonk);
WalkToWall(klonk);
TurnAround(klonk);

void WalkToWall(Klonk k)
{
    while (!k.IsWall())
    {
        k.Step();
    }
}

void TurnAround(Klonk k)
{
    k.TurnLeft();
    k.TurnLeft();
}
`,
      },
      check: { position: true, direction: true },
      requires: ['method'],
    },
    {
      id: 'staircase',
      title: { de: 'Treppe', en: 'Staircase' },
      text: {
        de: 'Klonk geht bis zur Wand. Links neben jedem Feld seines Weges baut er einen Turm: neben dem Startfeld 1 Ziegel hoch, neben dem nächsten Feld 2, dann 3 und so weiter. Schreibe eine Methode `tower(k, height)`, die vor der Figur `k` einen Turm aus `height` Ziegeln baut, und rufe sie mit einer Variablen als Höhe auf.',
        en: 'Klonk walks to the wall. To the left of every cell on its way it builds a tower: next to the start cell 1 brick high, next to the following cell 2, then 3 and so on. Write a method `tower(k, height)` that builds a tower of `height` bricks in front of the character `k`, and call it with a variable as the height.',
      },
      hints: [
        { de: 'Merke dir die Höhe des nächsten Turms in einer Variablen und erhöhe sie nach jedem Schritt um 1. Für jeden Turm dreht sich Klonk nach links, baut und dreht sich wieder nach rechts.', en: 'Remember the height of the next tower in a variable and increase it by 1 after every step. For each tower Klonk turns left, builds and turns right again.' },
        { de: 'Methoden dürfen andere Methoden aufrufen: Eine zweite Methode `towerLeft(k, height)` kann sich drehen, `tower(k, height)` aufrufen und sich zurückdrehen. Dann brauchst du diese drei Zeilen nicht zweimal.', en: 'Methods may call other methods: a second method `towerLeft(k, height)` can turn, call `tower(k, height)` and turn back. Then you do not need these three lines twice.' },
      ],
      worlds: [
        map(`
          . . . .
          > . . .
        `),
        map(`
          . . . . . .
          > . . . . .
        `),
        map(`
          . .
          > .
        `),
        map(`
          . . . . .
          . . > . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk


def tower(k, height):
    for i in range(height):
        k.place_brick()


def tower_left(k, height):
    k.turn_left()
    tower(k, height)
    k.turn_right()


klonk = Klonk()
height = 1
tower_left(klonk, height)
while not klonk.is_wall():
    klonk.step()
    height = height + 1
    tower_left(klonk, height)
`,
        java: `import klonk.Klonk;

public class Program {
    static void tower(Klonk k, int height) {
        for (int i = 0; i < height; i++) {
            k.placeBrick();
        }
    }

    static void towerLeft(Klonk k, int height) {
        k.turnLeft();
        tower(k, height);
        k.turnRight();
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int height = 1;
        towerLeft(klonk, height);
        while (!klonk.isWall()) {
            klonk.step();
            height = height + 1;
            towerLeft(klonk, height);
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function tower(k, height) {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function towerLeft(k, height) {
  k.turnLeft()
  tower(k, height)
  k.turnRight()
}

const klonk = new Klonk()
let height = 1
towerLeft(klonk, height)
while (!klonk.isWall()) {
  klonk.step()
  height = height + 1
  towerLeft(klonk, height)
}
`,
        typescript: `import { Klonk } from 'klonk'

function tower(k: Klonk, height: number): void {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function towerLeft(k: Klonk, height: number): void {
  k.turnLeft()
  tower(k, height)
  k.turnRight()
}

const klonk = new Klonk()
let height = 1
towerLeft(klonk, height)
while (!klonk.isWall()) {
  klonk.step()
  height = height + 1
  towerLeft(klonk, height)
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
int height = 1;
TowerLeft(klonk, height);
while (!klonk.IsWall())
{
    klonk.Step();
    height = height + 1;
    TowerLeft(klonk, height);
}

void Tower(Klonk k, int height)
{
    for (var i = 0; i < height; i++)
    {
        k.PlaceBrick();
    }
}

void TowerLeft(Klonk k, int height)
{
    k.TurnLeft();
    Tower(k, height);
    k.TurnRight();
}
`,
      },
      check: { position: true, cells: true },
      requires: ['method', 'loop'],
    },
    {
      id: 'middle',
      title: { de: 'Die Mitte finden', en: 'Find the middle' },
      text: {
        de: 'Klonk steht an der westlichen Wand und schaut nach Osten. Er soll in die Mitte seiner Reihe gehen und dort eine Marke setzen. Die Reihe hat immer eine ungerade Anzahl von Feldern. Schreibe eine Methode `distanceToWall(k)`, die die Figur bis zur Wand laufen lässt und **zurückgibt**, wie viele Schritte sie gegangen ist.',
        en: 'Klonk stands at the west wall and faces east. It should go to the middle of its row and set a mark there. The row always has an odd number of cells. Write a method `distanceToWall(k)` that lets the character walk to the wall and **returns** how many steps it took.',
      },
      hints: [
        {
          de: 'Die Methode zählt wie in F2 mit und gibt den Zähler am Ende zurück. In Java und C# ist der Rückgabetyp `int`:\n\n```python\ndef distance_to_wall(k):\n    steps = 0\n    ...\n    return steps\n```\n\n```java\nstatic int distanceToWall(Klonk k) {\n    int steps = 0;\n    ...\n    return steps;\n}\n```\n\n```javascript\nfunction distanceToWall(k) {\n  let steps = 0\n  ...\n  return steps\n}\n```\n\n```typescript\nfunction distanceToWall(k: Klonk): number {\n  let steps = 0\n  ...\n  return steps\n}\n```\n\n```csharp\nint DistanceToWall(Klonk k)\n{\n    int steps = 0;\n    ...\n    return steps;\n}\n```',
          en: 'The method counts along as in F2 and returns the counter at the end. In Java and C# the return type is `int`:\n\n```python\ndef distance_to_wall(k):\n    steps = 0\n    ...\n    return steps\n```\n\n```java\nstatic int distanceToWall(Klonk k) {\n    int steps = 0;\n    ...\n    return steps;\n}\n```\n\n```javascript\nfunction distanceToWall(k) {\n  let steps = 0\n  ...\n  return steps\n}\n```\n\n```typescript\nfunction distanceToWall(k: Klonk): number {\n  let steps = 0\n  ...\n  return steps\n}\n```\n\n```csharp\nint DistanceToWall(Klonk k)\n{\n    int steps = 0;\n    ...\n    return steps;\n}\n```',
        },
        { de: 'Speichere das Ergebnis in einer Variablen, z. B. `distance = distanceToWall(klonk)`. Von der Wand aus ist die Mitte halb so weit entfernt – dafür muss sich Klonk umdrehen. `step` nimmt auch eine Anzahl: `klonk.step(distance / 2)` (in Python teilt `//` ganzzahlig).', en: 'Store the result in a variable, e.g. `distance = distanceToWall(klonk)`. From the wall, the middle is half as far away – Klonk has to turn around for this. `step` also takes a number: `klonk.step(distance / 2)` (in Python `//` divides as whole numbers).' },
      ],
      worlds: [
        map('> . . . .'),
        map(`
          . . . . . . . . .
          > . . . . . . . .
          . . . . . . . . .
        `),
        map('> . .'),
        map(`
          . . . . . . .
          > . . . . . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk


def distance_to_wall(k):
    steps = 0
    while not k.is_wall():
        k.step()
        steps = steps + 1
    return steps


def turn_around(k):
    k.turn_left()
    k.turn_left()


klonk = Klonk()
distance = distance_to_wall(klonk)
turn_around(klonk)
klonk.step(distance // 2)
klonk.set_mark()
`,
        java: `import klonk.Klonk;

public class Program {
    static int distanceToWall(Klonk k) {
        int steps = 0;
        while (!k.isWall()) {
            k.step();
            steps = steps + 1;
        }
        return steps;
    }

    static void turnAround(Klonk k) {
        k.turnLeft();
        k.turnLeft();
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        int distance = distanceToWall(klonk);
        turnAround(klonk);
        klonk.step(distance / 2);
        klonk.setMark();
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function distanceToWall(k) {
  let steps = 0
  while (!k.isWall()) {
    k.step()
    steps = steps + 1
  }
  return steps
}

function turnAround(k) {
  k.turnLeft()
  k.turnLeft()
}

const klonk = new Klonk()
const distance = distanceToWall(klonk)
turnAround(klonk)
klonk.step(distance / 2)
klonk.setMark()
`,
        typescript: `import { Klonk } from 'klonk'

function distanceToWall(k: Klonk): number {
  let steps = 0
  while (!k.isWall()) {
    k.step()
    steps = steps + 1
  }
  return steps
}

function turnAround(k: Klonk): void {
  k.turnLeft()
  k.turnLeft()
}

const klonk = new Klonk()
const distance = distanceToWall(klonk)
turnAround(klonk)
klonk.step(distance / 2)
klonk.setMark()
`,
        csharp: `using klonk;

var klonk = new Klonk();
int distance = DistanceToWall(klonk);
TurnAround(klonk);
klonk.Step(distance / 2);
klonk.SetMark();

int DistanceToWall(Klonk k)
{
    int steps = 0;
    while (!k.IsWall())
    {
        k.Step();
        steps = steps + 1;
    }
    return steps;
}

void TurnAround(Klonk k)
{
    k.TurnLeft();
    k.TurnLeft();
}
`,
      },
      check: { position: true, cells: true },
      requires: ['method', 'returnValue'],
    },
    {
      id: 'mirror',
      title: { de: 'Spiegelbild', en: 'Mirror image' },
      text: {
        de: 'Klonk geht durch einen Gang bis zur Wand. Links vom Gang stehen Stapel aus roten Ziegeln. Klonk baut rechts vom Gang ein Spiegelbild: neben jedes Feld genauso viele rote Ziegel, wie links gegenüber stehen. Schreibe dafür eine Methode `heightLeft(k)`, die die Höhe des Stapels links von der Figur **zurückgibt** und die Figur danach wieder in ihre alte Richtung dreht. Deine Methode `tower` aus Aufgabe 2 hilft auch hier.',
        en: 'Klonk walks through a corridor to the wall. To the left of the corridor there are stacks of red bricks. Klonk builds a mirror image on the right of the corridor: next to each cell exactly as many red bricks as there are on the left opposite. Write a method `heightLeft(k)` for this that **returns** the height of the stack to the left of the character and afterwards turns the character back to its old direction. Your method `tower` from task 2 helps here as well.',
      },
      hints: [
        { de: '`brickCount()` liefert die Anzahl der Ziegel vor der Figur (Python: `brick_count()`, C#: `BrickCount()`). Merke dir den Wert in einer Variablen, bevor sich Klonk zurückdreht, und gib ihn danach zurück.', en: '`brickCount()` returns the number of bricks in front of the character (Python: `brick_count()`, C#: `BrickCount()`). Store the value in a variable before Klonk turns back, and return it afterwards.' },
        { de: 'Für jedes Feld: Höhe links messen, nach rechts drehen, Turm dieser Höhe bauen, wieder nach links drehen. Danach einen Schritt – solange keine Wand kommt. Vergiss das Startfeld nicht.', en: 'For every cell: measure the height on the left, turn right, build a tower of that height, turn left again. Then one step – as long as there is no wall. Do not forget the start cell.' },
      ],
      worlds: [
        map(`
          2 . 3 1 .
          > . . . .
          . . . . .
        `),
        map(`
          1 2 3 2 1 4 .
          > . . . . . .
          . . . . . . .
        `),
        map(`
          . 5
          > .
          . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk


def height_left(k):
    k.turn_left()
    height = k.brick_count()
    k.turn_right()
    return height


def tower(k, height):
    for i in range(height):
        k.place_brick()


def mirror(k):
    height = height_left(k)
    k.turn_right()
    tower(k, height)
    k.turn_left()


klonk = Klonk()
mirror(klonk)
while not klonk.is_wall():
    klonk.step()
    mirror(klonk)
`,
        java: `import klonk.Klonk;

public class Program {
    static int heightLeft(Klonk k) {
        k.turnLeft();
        int height = k.brickCount();
        k.turnRight();
        return height;
    }

    static void tower(Klonk k, int height) {
        for (int i = 0; i < height; i++) {
            k.placeBrick();
        }
    }

    static void mirror(Klonk k) {
        int height = heightLeft(k);
        k.turnRight();
        tower(k, height);
        k.turnLeft();
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        mirror(klonk);
        while (!klonk.isWall()) {
            klonk.step();
            mirror(klonk);
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function heightLeft(k) {
  k.turnLeft()
  const height = k.brickCount()
  k.turnRight()
  return height
}

function tower(k, height) {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function mirror(k) {
  const height = heightLeft(k)
  k.turnRight()
  tower(k, height)
  k.turnLeft()
}

const klonk = new Klonk()
mirror(klonk)
while (!klonk.isWall()) {
  klonk.step()
  mirror(klonk)
}
`,
        typescript: `import { Klonk } from 'klonk'

function heightLeft(k: Klonk): number {
  k.turnLeft()
  const height = k.brickCount()
  k.turnRight()
  return height
}

function tower(k: Klonk, height: number): void {
  for (let i = 0; i < height; i++) {
    k.placeBrick()
  }
}

function mirror(k: Klonk): void {
  const height = heightLeft(k)
  k.turnRight()
  tower(k, height)
  k.turnLeft()
}

const klonk = new Klonk()
mirror(klonk)
while (!klonk.isWall()) {
  klonk.step()
  mirror(klonk)
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
Mirror(klonk);
while (!klonk.IsWall())
{
    klonk.Step();
    Mirror(klonk);
}

int HeightLeft(Klonk k)
{
    k.TurnLeft();
    int height = k.BrickCount();
    k.TurnRight();
    return height;
}

void Tower(Klonk k, int height)
{
    for (var i = 0; i < height; i++)
    {
        k.PlaceBrick();
    }
}

void Mirror(Klonk k)
{
    int height = HeightLeft(k);
    k.TurnRight();
    Tower(k, height);
    k.TurnLeft();
}
`,
      },
      check: { position: true, cells: true },
      requires: ['method', 'returnValue', 'loop'],
    },
  ],
}
