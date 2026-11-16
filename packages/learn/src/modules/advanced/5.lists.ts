import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeLists: LearnModule = {
  id: 'code-lists',
  track: 'advanced',
  title: { de: 'Listen und Arrays', en: 'Lists and arrays' },
  summary: {
    de: 'Messwerte in Listen sammeln, auswerten, sortieren und daraus Neues bauen – auch mit Listen von Figuren.',
    en: 'Collect measured values in lists, evaluate and sort them and build something new from them – also with lists of characters.',
  },
  objectives: [
    { de: 'Messwerte aus der Welt in einer Liste sammeln und über ihren Index darauf zugreifen', en: 'Collect measured values from the world in a list and access them via their index' },
    { de: 'Listen mit Schleifen auswerten: rückwärts durchlaufen, Summe, Durchschnitt und Maximum bestimmen', en: 'Evaluate lists with loops: go through them backwards, determine sum, average and maximum' },
    { de: 'Listen sortieren und Arrays von Objekten (`Klonk.all()`) mehrfach durchlaufen', en: 'Sort lists and go through arrays of objects (`Klonk.all()`) several times' },
  ],
  prerequisites: ['code-objects'],
  intro: {
    de: `Eine **Liste** speichert viele Werte unter einem Namen – der Reihe nach, jeder erreichbar über eine Nummer, den **Index**. Das erste Element hat den Index 0. Eine Liste wächst, wenn du Werte anhängst: So sammelst du Messwerte, auch wenn du vorher nicht weißt, wie viele es werden.

\`\`\`python
from klonk import Klonk

klonk = Klonk()
heights = []
for i in range(4):
    heights.append(klonk.brick_count())
    klonk.turn_left()
print("Number: " + str(len(heights)))
print("First: " + str(heights[0]))
total = 0
for height in heights:
    total = total + height
print("Sum: " + str(total))
\`\`\`

\`\`\`java
import java.util.ArrayList;
import klonk.Klonk;

public class Programm {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        ArrayList<Integer> heights = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            heights.add(klonk.brickCount());
            klonk.turnLeft();
        }
        System.out.println("Number: " + heights.size());
        System.out.println("First: " + heights.get(0));
        int total = 0;
        for (int height : heights) {
            total = total + height;
        }
        System.out.println("Sum: " + total);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

const klonk = new Klonk()
const heights = []
for (let i = 0; i < 4; i++) {
  heights.push(klonk.brickCount())
  klonk.turnLeft()
}
console.log('Number: ' + heights.length)
console.log('First: ' + heights[0])
let total = 0
for (const height of heights) {
  total = total + height
}
console.log('Sum: ' + total)
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

const klonk = new Klonk()
const heights: number[] = []
for (let i = 0; i < 4; i++) {
  heights.push(klonk.brickCount())
  klonk.turnLeft()
}
console.log('Number: ' + heights.length)
console.log('First: ' + heights[0])
let total = 0
for (const height of heights) {
  total = total + height
}
console.log('Sum: ' + total)
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
var heights = new List<int>();
for (var i = 0; i < 4; i++)
{
    heights.Add(klonk.BrickCount());
    klonk.TurnLeft();
}
Console.WriteLine("Number: " + heights.Count);
Console.WriteLine("First: " + heights[0]);
int total = 0;
foreach (var height in heights)
{
    total = total + height;
}
Console.WriteLine("Sum: " + total);
\`\`\`

Die wichtigsten Schreibweisen im Überblick (Python · Java · JavaScript · C#):

- leere Liste: \`[]\` · \`new ArrayList<Integer>()\` · \`[]\` · \`new List<int>()\`
- anhängen: \`append\` · \`add\` · \`push\` · \`Add\`
- Anzahl: \`len(heights)\` · \`heights.size()\` · \`heights.length\` · \`heights.Count\`
- Element mit Index \`i\`: \`heights[i]\` · \`heights.get(i)\` · \`heights[i]\` · \`heights[i]\`

Java und C# kennen außerdem **Arrays**: Sie haben eine feste Länge (\`figures.length\` bzw. \`figures.Length\`) – \`Klonk.all()\` liefert so ein Array. In Java brauchen Listen den Import \`java.util.ArrayList\` und speichern Zahlen als \`Integer\`.`,
    en: `A **list** stores many values under one name – in order, each one reachable via a number, the **index**. The first element has the index 0. A list grows when you append values: this way you collect measured values even if you do not know beforehand how many there will be.

\`\`\`python
from klonk import Klonk

klonk = Klonk()
heights = []
for i in range(4):
    heights.append(klonk.brick_count())
    klonk.turn_left()
print("Number: " + str(len(heights)))
print("First: " + str(heights[0]))
total = 0
for height in heights:
    total = total + height
print("Sum: " + str(total))
\`\`\`

\`\`\`java
import java.util.ArrayList;
import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        ArrayList<Integer> heights = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            heights.add(klonk.brickCount());
            klonk.turnLeft();
        }
        System.out.println("Number: " + heights.size());
        System.out.println("First: " + heights.get(0));
        int total = 0;
        for (int height : heights) {
            total = total + height;
        }
        System.out.println("Sum: " + total);
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

const klonk = new Klonk()
const heights = []
for (let i = 0; i < 4; i++) {
  heights.push(klonk.brickCount())
  klonk.turnLeft()
}
console.log('Number: ' + heights.length)
console.log('First: ' + heights[0])
let total = 0
for (const height of heights) {
  total = total + height
}
console.log('Sum: ' + total)
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

const klonk = new Klonk()
const heights: number[] = []
for (let i = 0; i < 4; i++) {
  heights.push(klonk.brickCount())
  klonk.turnLeft()
}
console.log('Number: ' + heights.length)
console.log('First: ' + heights[0])
let total = 0
for (const height of heights) {
  total = total + height
}
console.log('Sum: ' + total)
\`\`\`

\`\`\`csharp
using klonk;

var klonk = new Klonk();
var heights = new List<int>();
for (var i = 0; i < 4; i++)
{
    heights.Add(klonk.BrickCount());
    klonk.TurnLeft();
}
Console.WriteLine("Number: " + heights.Count);
Console.WriteLine("First: " + heights[0]);
int total = 0;
foreach (var height in heights)
{
    total = total + height;
}
Console.WriteLine("Sum: " + total);
\`\`\`

The most important notations at a glance (Python · Java · JavaScript · C#):

- empty list: \`[]\` · \`new ArrayList<Integer>()\` · \`[]\` · \`new List<int>()\`
- append: \`append\` · \`add\` · \`push\` · \`Add\`
- number of elements: \`len(heights)\` · \`heights.size()\` · \`heights.length\` · \`heights.Count\`
- element with index \`i\`: \`heights[i]\` · \`heights.get(i)\` · \`heights[i]\` · \`heights[i]\`

Java and C# also have **arrays**: they have a fixed length (\`figures.length\` or \`figures.Length\`) – \`Klonk.all()\` returns such an array. In Java, lists need the import \`java.util.ArrayList\` and store numbers as \`Integer\`.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** F3 (Methoden mit Rückgabewert – \`heightLeft\` aus dem Spiegelbild kehrt hier wieder) und F4 (\`Klonk.all()\`, Schleife über Objekte).

**Typische Schwierigkeiten:**

- Der Index beginnt bei 0, Spalten (\`positionX()\`) beginnen bei 1. Der letzte Index ist die Anzahl minus 1 – wer bei der Anzahl beginnt, bekommt einen Fehler „Index außerhalb des Bereichs“.
- Java: \`ArrayList<int>\` ist nicht erlaubt, Zahlen stehen als \`Integer\` in der Liste. Zugriff mit \`get(i)\` statt \`[i]\`, Länge mit \`size()\` bei Listen, aber \`length\` (ohne Klammern) bei Arrays. Imports \`java.util.ArrayList\` und \`java.util.Collections\` nicht vergessen.
- C#: \`Count\` bei Listen, \`Length\` bei Arrays.
- JavaScript: \`sort()\` ohne Vergleichsfunktion sortiert Zahlen wie Texte (10 vor 9). Bei einstelligen Höhen fällt das nicht auf und sollte deshalb ausdrücklich besprochen werden: \`sort((a, b) => a - b)\`.
- Python: \`range(len(heights) - 1, -1, -1)\` ist schwer zu lesen; \`reversed(heights)\` ist eine gute Alternative.
- Durchschnitt (Aufgabe 2): In Java und C# teilt \`/\` zwei ganze Zahlen ohne Rest. Weil die Höhen ganze Zahlen sind, ändert das am Ergebnis dieser Aufgabe nichts – trotzdem lohnt es sich, \`(double)\` zu besprechen.
- Ganze Listen ausgeben sieht je Sprache anders aus; C# zeigt bei \`Console.WriteLine(heights)\` nur den Typnamen. Die Aufgaben verlangen deshalb einzelne Zahlen.

**Prüfung der Ausgabe:** Die Aufgaben 1 und 2 vergleichen nur die Zahlen in der Ausgabe – in der verlangten Reihenfolge.

**Differenzierung:** Schnelle Lernende sortieren in Aufgabe 3 ohne \`sort\` mit einem eigenen Verfahren (Bubblesort oder Sortieren durch Auswahl) – das passt zum Lehrplanthema Algorithmen. Eine weitere Erweiterung: In Aufgabe 4 die Namen der Figuren ausgeben, die sich bewegen mussten.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** F3 (methods with return values – \`heightLeft\` from the mirror image comes back here) and F4 (\`Klonk.all()\`, loop over objects).

**Typical difficulties:**

- The index starts at 0, columns (\`positionX()\`) start at 1. The last index is the number of elements minus 1 – whoever starts at the number of elements gets an “index out of range” error.
- Java: \`ArrayList<int>\` is not allowed, numbers are stored as \`Integer\` in the list. Access with \`get(i)\` instead of \`[i]\`, length with \`size()\` for lists but \`length\` (without parentheses) for arrays. Do not forget the imports \`java.util.ArrayList\` and \`java.util.Collections\`.
- C#: \`Count\` for lists, \`Length\` for arrays.
- JavaScript: \`sort()\` without a compare function sorts numbers like texts (10 before 9). With single-digit heights this goes unnoticed and should therefore be discussed explicitly: \`sort((a, b) => a - b)\`.
- Python: \`range(len(heights) - 1, -1, -1)\` is hard to read; \`reversed(heights)\` is a good alternative.
- Average (task 2): in Java and C# \`/\` divides two whole numbers without a remainder. Since the heights are whole numbers, this does not change the result of this task – it is still worth discussing \`(double)\`.
- Printing whole lists looks different in each language; C# only shows the type name for \`Console.WriteLine(heights)\`. The tasks therefore ask for individual numbers.

**Checking the output:** Tasks 1 and 2 only compare the numbers in the output – in the required order.

**Differentiation:** Fast learners sort in task 3 without \`sort\` using their own algorithm (bubble sort or selection sort) – this fits the curriculum topic of algorithms. A further extension: in task 4, output the names of the characters that had to move.`,
  },
  tasks: [
    {
      id: 'backwards',
      title: { de: 'Rückwärts ansagen', en: 'Call out backwards' },
      text: {
        de: 'Klonk geht durch einen Gang bis zur Wand. Links vom Gang stehen Stapel, manche Felder sind auch leer. Klonk misst unterwegs die Höhe neben jedem Feld seines Weges (auch neben dem Startfeld) und speichert sie in einer Liste. An der Wand gibt er die Höhen in **umgekehrter** Reihenfolge aus, jede in einer eigenen Zeile – zuerst die Höhe neben der Wand.',
        en: 'Klonk walks through a corridor to the wall. To the left of the corridor there are stacks, some cells are empty. On the way Klonk measures the height next to each cell of its way (also next to the start cell) and stores it in a list. At the wall it outputs the heights in **reverse** order, each on a line of its own – first the height next to the wall.',
      },
      hints: [
        {
          de: 'Die Methode `heightLeft(k)` aus F3 misst den Stapel links von der Figur. Häng jede Messung an die Liste an:\n\n```python\nheights = []\nheights.append(height_left(klonk))\n```\n\n```java\nArrayList<Integer> heights = new ArrayList<>();\nheights.add(heightLeft(klonk));\n```\n\n```javascript\nconst heights = []\nheights.push(heightLeft(klonk))\n```\n\n```typescript\nconst heights: number[] = []\nheights.push(heightLeft(klonk))\n```\n\n```csharp\nvar heights = new List<int>();\nheights.Add(HeightLeft(klonk));\n```',
          en: 'The method `heightLeft(k)` from F3 measures the stack to the left of the character. Append every measurement to the list:\n\n```python\nheights = []\nheights.append(height_left(klonk))\n```\n\n```java\nArrayList<Integer> heights = new ArrayList<>();\nheights.add(heightLeft(klonk));\n```\n\n```javascript\nconst heights = []\nheights.push(heightLeft(klonk))\n```\n\n```typescript\nconst heights: number[] = []\nheights.push(heightLeft(klonk))\n```\n\n```csharp\nvar heights = new List<int>();\nheights.Add(HeightLeft(klonk));\n```',
        },
        { de: 'Rückwärts geht eine Zählschleife vom letzten Index bis 0. Der letzte Index ist die Anzahl der Elemente minus 1, weil der erste Index 0 ist.', en: 'A counting loop from the last index down to 0 goes backwards. The last index is the number of elements minus 1 because the first index is 0.' },
      ],
      worlds: [
        map(`
          3 1 . 4 2
          > . . . .
        `),
        map(`
          1 2 3 4 5 4 3
          > . . . . . .
        `),
        map(`
          . 5
          > .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk


def height_left(k):
    k.turn_left()
    height = k.brick_count()
    k.turn_right()
    return height


klonk = Klonk()
heights = []
heights.append(height_left(klonk))
while not klonk.is_wall():
    klonk.step()
    heights.append(height_left(klonk))
for i in range(len(heights) - 1, -1, -1):
    print(heights[i])
`,
        java: `import java.util.ArrayList;
import klonk.Klonk;

public class Program {
    static int heightLeft(Klonk k) {
        k.turnLeft();
        int height = k.brickCount();
        k.turnRight();
        return height;
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        ArrayList<Integer> heights = new ArrayList<>();
        heights.add(heightLeft(klonk));
        while (!klonk.isWall()) {
            klonk.step();
            heights.add(heightLeft(klonk));
        }
        for (int i = heights.size() - 1; i >= 0; i--) {
            System.out.println(heights.get(i));
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

const klonk = new Klonk()
const heights = []
heights.push(heightLeft(klonk))
while (!klonk.isWall()) {
  klonk.step()
  heights.push(heightLeft(klonk))
}
for (let i = heights.length - 1; i >= 0; i--) {
  console.log(heights[i])
}
`,
        typescript: `import { Klonk } from 'klonk'

function heightLeft(k: Klonk): number {
  k.turnLeft()
  const height = k.brickCount()
  k.turnRight()
  return height
}

const klonk = new Klonk()
const heights: number[] = []
heights.push(heightLeft(klonk))
while (!klonk.isWall()) {
  klonk.step()
  heights.push(heightLeft(klonk))
}
for (let i = heights.length - 1; i >= 0; i--) {
  console.log(heights[i])
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var heights = new List<int>();
heights.Add(HeightLeft(klonk));
while (!klonk.IsWall())
{
    klonk.Step();
    heights.Add(HeightLeft(klonk));
}
for (var i = heights.Count - 1; i >= 0; i--)
{
    Console.WriteLine(heights[i]);
}

int HeightLeft(Klonk k)
{
    k.TurnLeft();
    int height = k.BrickCount();
    k.TurnRight();
    return height;
}
`,
      },
      check: { output: 'numbers' },
      requires: ['loop'],
    },
    {
      id: 'above-average',
      title: { de: 'Über dem Durchschnitt', en: 'Above average' },
      text: {
        de: 'Klonk geht wieder durch den Gang und misst alle Stapel links davon. Gib danach zuerst die **Summe** aller Höhen aus und dann, **wie viele** Stapel höher sind als der Durchschnitt. Den Durchschnitt kennst du erst, wenn alle Höhen gemessen sind – deshalb brauchst du die Liste.',
        en: 'Klonk walks through the corridor again and measures all stacks to the left of it. Then first output the **sum** of all heights and then **how many** stacks are higher than the average. You only know the average once all heights have been measured – that is why you need the list.',
      },
      hints: [
        { de: 'Durchschnitt = Summe ÷ Anzahl. Geh die Liste dafür zweimal durch: einmal, um die Summe zu bilden, danach, um die Stapel über dem Durchschnitt zu zählen.', en: 'Average = sum ÷ number. Go through the list twice for this: once to add up the sum, then to count the stacks above the average.' },
        {
          de: 'Der Durchschnitt ist meist eine Kommazahl. In Java und C# teilt `/` zwei ganze Zahlen ohne Rest (7 / 2 ergibt 3) – wandle die Summe deshalb vorher um:\n\n```python\naverage = total / len(heights)\n```\n\n```java\ndouble average = (double) total / heights.size();\n```\n\n```javascript\nconst average = total / heights.length\n```\n\n```csharp\ndouble average = (double)total / heights.Count;\n```',
          en: 'The average is usually a decimal number. In Java and C# `/` divides two whole numbers without a remainder (7 / 2 gives 3) – so convert the sum first:\n\n```python\naverage = total / len(heights)\n```\n\n```java\ndouble average = (double) total / heights.size();\n```\n\n```javascript\nconst average = total / heights.length\n```\n\n```csharp\ndouble average = (double)total / heights.Count;\n```',
        },
      ],
      worlds: [
        map(`
          3 1 . 4 2
          > . . . .
        `),
        map(`
          2 2 2 2
          > . . .
        `),
        map(`
          5 . . . 1 . 1
          > . . . . . .
        `),
        map(`
          1 4 2 5 3 3
          > . . . . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk


def height_left(k):
    k.turn_left()
    height = k.brick_count()
    k.turn_right()
    return height


klonk = Klonk()
heights = []
heights.append(height_left(klonk))
while not klonk.is_wall():
    klonk.step()
    heights.append(height_left(klonk))
total = 0
for height in heights:
    total = total + height
average = total / len(heights)
above = 0
for height in heights:
    if height > average:
        above = above + 1
print("Sum: " + str(total))
print("Above average: " + str(above))
`,
        java: `import java.util.ArrayList;
import klonk.Klonk;

public class Program {
    static int heightLeft(Klonk k) {
        k.turnLeft();
        int height = k.brickCount();
        k.turnRight();
        return height;
    }

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        ArrayList<Integer> heights = new ArrayList<>();
        heights.add(heightLeft(klonk));
        while (!klonk.isWall()) {
            klonk.step();
            heights.add(heightLeft(klonk));
        }
        int total = 0;
        for (int height : heights) {
            total = total + height;
        }
        double average = (double) total / heights.size();
        int above = 0;
        for (int height : heights) {
            if (height > average) {
                above = above + 1;
            }
        }
        System.out.println("Sum: " + total);
        System.out.println("Above average: " + above);
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

const klonk = new Klonk()
const heights = []
heights.push(heightLeft(klonk))
while (!klonk.isWall()) {
  klonk.step()
  heights.push(heightLeft(klonk))
}
let total = 0
for (const height of heights) {
  total = total + height
}
const average = total / heights.length
let above = 0
for (const height of heights) {
  if (height > average) {
    above = above + 1
  }
}
console.log('Sum: ' + total)
console.log('Above average: ' + above)
`,
        typescript: `import { Klonk } from 'klonk'

function heightLeft(k: Klonk): number {
  k.turnLeft()
  const height = k.brickCount()
  k.turnRight()
  return height
}

const klonk = new Klonk()
const heights: number[] = []
heights.push(heightLeft(klonk))
while (!klonk.isWall()) {
  klonk.step()
  heights.push(heightLeft(klonk))
}
let total = 0
for (const height of heights) {
  total = total + height
}
const average = total / heights.length
let above = 0
for (const height of heights) {
  if (height > average) {
    above = above + 1
  }
}
console.log('Sum: ' + total)
console.log('Above average: ' + above)
`,
        csharp: `using klonk;

var klonk = new Klonk();
var heights = new List<int>();
heights.Add(HeightLeft(klonk));
while (!klonk.IsWall())
{
    klonk.Step();
    heights.Add(HeightLeft(klonk));
}
int total = 0;
foreach (var height in heights)
{
    total = total + height;
}
double average = (double)total / heights.Count;
int above = 0;
foreach (var height in heights)
{
    if (height > average)
    {
        above = above + 1;
    }
}
Console.WriteLine("Sum: " + total);
Console.WriteLine("Above average: " + above);

int HeightLeft(Klonk k)
{
    k.TurnLeft();
    int height = k.BrickCount();
    k.TurnRight();
    return height;
}
`,
      },
      check: { output: 'numbers' },
      requires: ['loop'],
    },
    {
      id: 'sorted',
      title: { de: 'Der Größe nach', en: 'In order of size' },
      text: {
        de: 'Klonk misst auf dem Weg zur Wand die Stapel links vom Gang. Danach baut er auf der anderen Seite des Gangs dieselben Stapel noch einmal aus roten Ziegeln – aber der Größe nach sortiert: den niedrigsten im Westen, den höchsten im Osten. Die Stapel links bleiben stehen.',
        en: 'On the way to the wall Klonk measures the stacks to the left of the corridor. Then it builds the same stacks once more from red bricks on the other side of the corridor – but sorted by size: the lowest in the west, the highest in the east. The stacks on the left stay where they are.',
      },
      hints: [
        {
          de: 'Sortieren (aufsteigend) kann jede Sprache selbst. In Java brauchst du dafür `import java.util.Collections;`, in JavaScript eine Vergleichsfunktion – ohne sie sortiert JavaScript Zahlen wie Texte:\n\n```python\nheights.sort()\n```\n\n```java\nCollections.sort(heights);\n```\n\n```javascript\nheights.sort((a, b) => a - b)\n```\n\n```csharp\nheights.Sort();\n```',
          en: 'Every language can sort (ascending) by itself. In Java you need `import java.util.Collections;` for this, in JavaScript a compare function – without it JavaScript sorts numbers like texts:\n\n```python\nheights.sort()\n```\n\n```java\nCollections.sort(heights);\n```\n\n```javascript\nheights.sort((a, b) => a - b)\n```\n\n```csharp\nheights.Sort();\n```',
        },
        { de: 'An der Wand dreht sich Klonk um und geht zurück nach Westen – jetzt liegt die andere Seite des Gangs links von ihm. Auf dem Rückweg kommt er zuerst am östlichsten Feld vorbei: Geh die sortierte Liste deshalb vom letzten Index aus rückwärts durch.', en: 'At the wall Klonk turns around and walks back west – now the other side of the corridor is on its left. On the way back it passes the easternmost cell first: so go through the sorted list backwards from the last index.' },
      ],
      worlds: [
        map(`
          3 1 . 4 2
          > . . . .
          . . . . .
        `),
        map(`
          2 5 1 1 3 . 4
          > . . . . . .
          . . . . . . .
        `),
        map(`
          4 2
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


klonk = Klonk()
heights = []
heights.append(height_left(klonk))
while not klonk.is_wall():
    klonk.step()
    heights.append(height_left(klonk))
heights.sort()
klonk.turn_left()
klonk.turn_left()
for i in range(len(heights) - 1, -1, -1):
    klonk.turn_left()
    tower(klonk, heights[i])
    klonk.turn_right()
    if i > 0:
        klonk.step()
`,
        java: `import java.util.ArrayList;
import java.util.Collections;
import klonk.Klonk;

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

    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        ArrayList<Integer> heights = new ArrayList<>();
        heights.add(heightLeft(klonk));
        while (!klonk.isWall()) {
            klonk.step();
            heights.add(heightLeft(klonk));
        }
        Collections.sort(heights);
        klonk.turnLeft();
        klonk.turnLeft();
        for (int i = heights.size() - 1; i >= 0; i--) {
            klonk.turnLeft();
            tower(klonk, heights.get(i));
            klonk.turnRight();
            if (i > 0) {
                klonk.step();
            }
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

const klonk = new Klonk()
const heights = []
heights.push(heightLeft(klonk))
while (!klonk.isWall()) {
  klonk.step()
  heights.push(heightLeft(klonk))
}
heights.sort((a, b) => a - b)
klonk.turnLeft()
klonk.turnLeft()
for (let i = heights.length - 1; i >= 0; i--) {
  klonk.turnLeft()
  tower(klonk, heights[i])
  klonk.turnRight()
  if (i > 0) {
    klonk.step()
  }
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

const klonk = new Klonk()
const heights: number[] = []
heights.push(heightLeft(klonk))
while (!klonk.isWall()) {
  klonk.step()
  heights.push(heightLeft(klonk))
}
heights.sort((a, b) => a - b)
klonk.turnLeft()
klonk.turnLeft()
for (let i = heights.length - 1; i >= 0; i--) {
  klonk.turnLeft()
  tower(klonk, heights[i])
  klonk.turnRight()
  if (i > 0) {
    klonk.step()
  }
}
`,
        csharp: `using klonk;

var klonk = new Klonk();
var heights = new List<int>();
heights.Add(HeightLeft(klonk));
while (!klonk.IsWall())
{
    klonk.Step();
    heights.Add(HeightLeft(klonk));
}
heights.Sort();
klonk.TurnLeft();
klonk.TurnLeft();
for (var i = heights.Count - 1; i >= 0; i--)
{
    klonk.TurnLeft();
    Tower(klonk, heights[i]);
    klonk.TurnRight();
    if (i > 0)
    {
        klonk.Step();
    }
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
`,
      },
      check: { cells: true },
      requires: ['loop'],
    },
    {
      id: 'line-up',
      title: { de: 'In einer Linie', en: 'In line' },
      text: {
        de: 'In jeder Welt stehen mehrere Figuren in verschiedenen Reihen und schauen nach Osten. Am Ende sollen alle in derselben Spalte stehen wie die Figur, die am weitesten im Osten steht. Bestimme dafür zuerst mit `Klonk.all()` die größte Spalte und lass danach jede Figur so weit gehen.',
        en: 'In each world several characters stand in different rows and face east. At the end all of them should stand in the same column as the character furthest to the east. To do this, first determine the largest column with `Klonk.all()` and then let every character walk that far.',
      },
      hints: [
        { de: 'Wie beim Maximum einer Zahlenliste: Merke dir die größte bisher gefundene Spalte in einer Variablen und vergleiche sie mit `positionX()` jeder Figur.', en: 'As with the maximum of a list of numbers: remember the largest column found so far in a variable and compare it with `positionX()` of every character.' },
        { de: 'Danach geht eine zweite Schleife alle Figuren durch: Jede läuft, solange ihre Spalte kleiner ist als die größte.', en: 'After that, a second loop goes through all characters: each one walks as long as its column is smaller than the largest one.' },
      ],
      worlds: [
        map(`
          . > . . . .
          . . . . > .
          > . . . . .
        `, { names: ['Klonk', 'Klara', 'Kai'] }),
        map(`
          . . . > . . .
          > . . . . . .
          . . > . . . .
          . . . . . . >
        `, { names: ['Mia', 'Ben', 'Ida', 'Tom'] }),
        map(`
          > . . .
          . > . .
        `, { names: ['Lena', 'Kim'] }),
      ],
      solutions: {
        python: `from klonk import Klonk

figures = Klonk.all()
front = 0
for figure in figures:
    if figure.position_x() > front:
        front = figure.position_x()
for figure in figures:
    while figure.position_x() < front:
        figure.step()
`,
        java: `import klonk.Klonk;

public class Program {
    public static void main(String[] args) {
        Klonk[] figures = Klonk.all();
        int front = 0;
        for (Klonk figure : figures) {
            if (figure.positionX() > front) {
                front = figure.positionX();
            }
        }
        for (Klonk figure : figures) {
            while (figure.positionX() < front) {
                figure.step();
            }
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

const figures = Klonk.all()
let front = 0
for (const figure of figures) {
  if (figure.positionX() > front) {
    front = figure.positionX()
  }
}
for (const figure of figures) {
  while (figure.positionX() < front) {
    figure.step()
  }
}
`,
        typescript: `import { Klonk } from 'klonk'

const figures: Klonk[] = Klonk.all()
let front = 0
for (const figure of figures) {
  if (figure.positionX() > front) {
    front = figure.positionX()
  }
}
for (const figure of figures) {
  while (figure.positionX() < front) {
    figure.step()
  }
}
`,
        csharp: `using klonk;

Klonk[] figures = Klonk.All();
int front = 0;
foreach (var figure in figures)
{
    if (figure.PositionX() > front)
    {
        front = figure.PositionX();
    }
}
foreach (var figure in figures)
{
    while (figure.PositionX() < front)
    {
        figure.Step();
    }
}
`,
      },
      check: { position: true },
      requires: ['loop'],
      characters: 4,
    },
  ],
}
