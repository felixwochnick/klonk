import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeRecursion: LearnModule = {
  id: 'code-recursion',
  track: 'advanced',
  title: { de: 'Rekursion', en: 'Recursion' },
  summary: {
    de: 'Methoden, die sich selbst aufrufen: Basisfall, Rückweg über den Aufrufstapel und rekursive Rückgabewerte.',
    en: 'Methods that call themselves: base case, the way back via the call stack and recursive return values.',
  },
  objectives: [
    { de: 'Eine rekursive Methode mit Basisfall (Abbruchbedingung) und Rekursionsschritt schreiben', en: 'Write a recursive method with a base case (termination condition) and a recursive step' },
    { de: 'Verstehen, dass Anweisungen nach dem rekursiven Aufruf auf dem Rückweg in umgekehrter Reihenfolge ausgeführt werden', en: 'Understand that statements after the recursive call run on the way back in reverse order' },
    { de: 'Ergebnisse rekursiv berechnen: Rückgabewert des Basisfalls und Zusammensetzen auf dem Rückweg', en: 'Compute results recursively: return value of the base case and combining results on the way back' },
  ],
  prerequisites: ['code-methods'],
  intro: {
    de: `Eine Methode darf sich selbst aufrufen – das heißt **Rekursion**. Damit das irgendwann endet, braucht jede rekursive Methode einen **Basisfall** (Abbruchbedingung): einen Fall, der ohne erneuten Aufruf auskommt. Jeder andere Aufruf muss dem Basisfall ein Stück näherkommen.

Diese Methode bringt Klonk zur Wand – ganz ohne Schleife: Steht er nicht vor der Wand, geht er einen Schritt, und der Rest des Weges ist dieselbe Aufgabe, nur ein Feld kürzer.

\`\`\`python
from klonk import Klonk

def to_wall(klonk):
    if not klonk.is_wall():
        klonk.step()
        to_wall(klonk)

to_wall(Klonk())
\`\`\`

\`\`\`java
import klonk.Klonk;

public class Programm {
    static void toWall(Klonk klonk) {
        if (!klonk.isWall()) {
            klonk.step();
            toWall(klonk);
        }
    }

    public static void main(String[] args) {
        toWall(new Klonk());
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

function toWall(klonk) {
  if (!klonk.isWall()) {
    klonk.step()
    toWall(klonk)
  }
}

toWall(new Klonk())
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

function toWall(klonk: Klonk) {
  if (!klonk.isWall()) {
    klonk.step()
    toWall(klonk)
  }
}

toWall(new Klonk())
\`\`\`

\`\`\`csharp
using klonk;

ToWall(new Klonk());

void ToWall(Klonk klonk)
{
    if (!klonk.IsWall())
    {
        klonk.Step();
        ToWall(klonk);
    }
}
\`\`\`

Das Programm merkt sich jeden Aufruf, der noch nicht fertig ist (**Aufrufstapel**). Steht Klonk an der Wand, endet der innerste Aufruf, danach der davor und so weiter. Was in der Methode **nach** dem rekursiven Aufruf steht, passiert deshalb auf dem **Rückweg** – in umgekehrter Reihenfolge.

Eine rekursive Methode kann auch einen Wert zurückgeben. Der Abstand zur Wand ist zum Beispiel 0, wenn Klonk vor der Wand steht – sonst ist er um 1 größer als der Abstand vom nächsten Feld aus.`,
    en: `A method may call itself – this is called **recursion**. So that it ends at some point, every recursive method needs a **base case** (termination condition): a case that does without another call. Every other call has to get a bit closer to the base case.

This method brings Klonk to the wall – without any loop: if it is not in front of the wall, it takes a step, and the rest of the way is the same task, just one cell shorter.

\`\`\`python
from klonk import Klonk

def to_wall(klonk):
    if not klonk.is_wall():
        klonk.step()
        to_wall(klonk)

to_wall(Klonk())
\`\`\`

\`\`\`java
import klonk.Klonk;

public class Program {
    static void toWall(Klonk klonk) {
        if (!klonk.isWall()) {
            klonk.step();
            toWall(klonk);
        }
    }

    public static void main(String[] args) {
        toWall(new Klonk());
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

function toWall(klonk) {
  if (!klonk.isWall()) {
    klonk.step()
    toWall(klonk)
  }
}

toWall(new Klonk())
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

function toWall(klonk: Klonk) {
  if (!klonk.isWall()) {
    klonk.step()
    toWall(klonk)
  }
}

toWall(new Klonk())
\`\`\`

\`\`\`csharp
using klonk;

ToWall(new Klonk());

void ToWall(Klonk klonk)
{
    if (!klonk.IsWall())
    {
        klonk.Step();
        ToWall(klonk);
    }
}
\`\`\`

The program remembers every call that has not finished yet (**call stack**). When Klonk stands at the wall, the innermost call ends, then the one before it and so on. Whatever comes **after** the recursive call in the method therefore happens on the **way back** – in reverse order.

A recursive method can also return a value. The distance to the wall, for example, is 0 if Klonk stands in front of the wall – otherwise it is 1 more than the distance from the next cell.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** Methoden mit Parametern und Rückgabewert (F3). Eigene Klassen werden nicht gebraucht – das Modul lässt sich auch direkt nach F3 oder in der Oberstufe zur Wiederholung einsetzen.

**Begriffe:** rekursive Methode, Basisfall (Abbruchbedingung), Rekursionsschritt, Aufrufstapel, Abstieg und Rückweg (Aufstieg). Aufgabe 2 zeigt, dass der Aufrufstapel die Zahl der Schritte „speichert“: Klonk findet ohne Variable zum Start zurück. Aufgabe 3 und 4 setzen Ergebnisse auf dem Rückweg aus den Rückgabewerten zusammen.

**Nachvollziehen:** Im Einzelschritt lässt sich verfolgen, wie Klonk erst alle Aufrufe beginnt und dann auf dem Rückweg beendet. An der Tafel hilft eine Tabelle der offenen Aufrufe mit ihren Rückgabewerten (Aufrufbaum bzw. -stapel). Unter **Programmieren** zeigt der Tab **Diagramm** das Struktogramm der Methode; der rekursive Aufruf erscheint dort als Aufruf eines Unterprogramms.

**Typische Schwierigkeiten:**
- Fehlt der Basisfall oder wird er nie erreicht, läuft Klonk meist gegen die Wand und das Programm bricht mit einer Fehlermeldung ab. Ruft sich eine Methode auf, ohne dass sich etwas ändert, endet das Programm mit einem Stapelüberlauf.
- Der Rückgabewert des rekursiven Aufrufs wird nicht verwendet (\`countMarks(klonk)\` statt \`return countMarks(klonk) + 1\`).
- „Vor“ und „nach“ dem rekursiven Aufruf werden verwechselt (Aufgabe 2 und 4).
- Java: Hilfsmethoden in der Programmklasse brauchen \`static\`, weil \`main\` statisch ist. C#: Methoden im Hauptprogramm sind lokale Funktionen und dürfen auch nach ihrem ersten Aufruf stehen. Python und JavaScript: Die Funktion muss definiert sein, bevor das Hauptprogramm sie aufruft.

**Rekursion und Schleife:** Aufgabe 1 und 3 lassen sich auch mit Schleifen lösen; verlangt ist hier eine Methode, die sich selbst aufruft. Der Vergleich beider Lösungen eignet sich für die Besprechung (Endrekursion, Speicherbedarf des Aufrufstapels).

**Differenzierung:** Schnelle Lernende ändern Aufgabe 4 so, dass die Treppe zur Wand hin ansteigt, oder lösen „Stapel umsetzen“ aus E9 rekursiv und ohne Variable.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** methods with parameters and return values (F3). Own classes are not needed – the module can also be used directly after F3 or for revision in upper secondary.

**Concepts:** recursive method, base case (termination condition), recursive step, call stack, descent and way back (ascent). Task 2 shows that the call stack “stores” the number of steps: Klonk finds its way back to the start without a variable. Tasks 3 and 4 combine results from the return values on the way back.

**Tracing:** Stepping through the program shows how Klonk first starts all calls and then finishes them on the way back. On the board, a table of the open calls with their return values (call tree or call stack) helps. Under **Code**, the **Diagram** tab shows the structogram of the method; the recursive call appears there as a call of a subroutine.

**Typical difficulties:**
- If the base case is missing or never reached, Klonk usually runs into the wall and the program stops with an error message. If a method calls itself without anything changing, the program ends with a stack overflow.
- The return value of the recursive call is not used (\`countMarks(klonk)\` instead of \`return countMarks(klonk) + 1\`).
- “Before” and “after” the recursive call are mixed up (tasks 2 and 4).
- Java: helper methods in the program class need \`static\` because \`main\` is static. C#: methods in the main program are local functions and may also come after their first call. Python and JavaScript: the function has to be defined before the main program calls it.

**Recursion and loops:** Tasks 1 and 3 can also be solved with loops; here, a method that calls itself is required. Comparing both solutions is suitable for discussion (tail recursion, memory needed by the call stack).

**Differentiation:** Fast learners change task 4 so that the staircase rises towards the wall, or solve “Move the stack” from E9 recursively and without a variable.`,
  },
  tasks: [
    {
      id: 'mark-trail',
      title: { de: 'Markenspur', en: 'Trail of marks' },
      text: {
        de: 'Klonk markiert jedes Feld von seinem Startfeld bis zur Wand – das Startfeld und das letzte Feld vor der Wand eingeschlossen. Schreibe dafür eine rekursive Methode ohne Schleife.',
        en: 'Klonk marks every cell from its start cell to the wall – including the start cell and the last cell in front of the wall. Write a recursive method without a loop for this.',
      },
      hints: [
        { de: 'Wie im Beispiel, aber zuerst die Marke: Marke setzen – und wenn keine Wand vor Klonk ist, einen Schritt gehen und die Methode erneut aufrufen.', en: 'As in the example, but the mark comes first: set a mark – and if there is no wall in front of Klonk, take a step and call the method again.' },
      ],
      worlds: [
        map('> . . .'),
        map('> . . . . . .'),
        map('. > . # .'),
        map('> #'),
      ],
      solutions: {
        python: `from klonk import Klonk

def mark_trail(klonk):
    klonk.set_mark()
    if not klonk.is_wall():
        klonk.step()
        mark_trail(klonk)

mark_trail(Klonk())
`,
        java: `import klonk.Klonk;

public class Program {
    static void markTrail(Klonk klonk) {
        klonk.setMark();
        if (!klonk.isWall()) {
            klonk.step();
            markTrail(klonk);
        }
    }

    public static void main(String[] args) {
        markTrail(new Klonk());
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function markTrail(klonk) {
  klonk.setMark()
  if (!klonk.isWall()) {
    klonk.step()
    markTrail(klonk)
  }
}

markTrail(new Klonk())
`,
        typescript: `import { Klonk } from 'klonk'

function markTrail(klonk: Klonk) {
  klonk.setMark()
  if (!klonk.isWall()) {
    klonk.step()
    markTrail(klonk)
  }
}

markTrail(new Klonk())
`,
        csharp: `using klonk;

MarkTrail(new Klonk());

void MarkTrail(Klonk klonk)
{
    klonk.SetMark();
    if (!klonk.IsWall())
    {
        klonk.Step();
        MarkTrail(klonk);
    }
}
`,
      },
      check: { position: true, cells: true },
      requires: ['recursion'],
    },
    {
      id: 'there-and-back',
      title: { de: 'Hin und zurück', en: 'There and back' },
      text: {
        de: 'Klonk läuft bis zur Wand und setzt dort eine Marke. Dann dreht er sich um und geht zurück auf sein Startfeld – genau so viele Schritte, wie er hingegangen ist. Verwende dafür keine Variable und keine Schleife, sondern eine rekursive Methode.',
        en: 'Klonk walks to the wall and sets a mark there. Then it turns around and walks back to its start cell – exactly as many steps as it took to get there. Do not use a variable or a loop for this but a recursive method.',
      },
      hints: [
        { de: 'Der Basisfall ist die Wand: Marke setzen und umdrehen. Sonst: Schritt, rekursiver Aufruf – und **danach** ein Schritt zurück. Jeder Aufruf geht so auf dem Rückweg genau einen Schritt.', en: 'The base case is the wall: set a mark and turn around. Otherwise: step, recursive call – and **after that** one step back. This way, every call takes exactly one step on the way back.' },
      ],
      worlds: [
        map('> . . . .'),
        map('. . > . . . . .'),
        map('. > . # . .'),
      ],
      solutions: {
        python: `from klonk import Klonk

def there_and_back(klonk):
    if klonk.is_wall():
        klonk.set_mark()
        klonk.turn_left()
        klonk.turn_left()
    else:
        klonk.step()
        there_and_back(klonk)
        klonk.step()

there_and_back(Klonk())
`,
        java: `import klonk.Klonk;

public class Program {
    static void thereAndBack(Klonk klonk) {
        if (klonk.isWall()) {
            klonk.setMark();
            klonk.turnLeft();
            klonk.turnLeft();
        } else {
            klonk.step();
            thereAndBack(klonk);
            klonk.step();
        }
    }

    public static void main(String[] args) {
        thereAndBack(new Klonk());
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function thereAndBack(klonk) {
  if (klonk.isWall()) {
    klonk.setMark()
    klonk.turnLeft()
    klonk.turnLeft()
  } else {
    klonk.step()
    thereAndBack(klonk)
    klonk.step()
  }
}

thereAndBack(new Klonk())
`,
        typescript: `import { Klonk } from 'klonk'

function thereAndBack(klonk: Klonk) {
  if (klonk.isWall()) {
    klonk.setMark()
    klonk.turnLeft()
    klonk.turnLeft()
  } else {
    klonk.step()
    thereAndBack(klonk)
    klonk.step()
  }
}

thereAndBack(new Klonk())
`,
        csharp: `using klonk;

ThereAndBack(new Klonk());

void ThereAndBack(Klonk klonk)
{
    if (klonk.IsWall())
    {
        klonk.SetMark();
        klonk.TurnLeft();
        klonk.TurnLeft();
    }
    else
    {
        klonk.Step();
        ThereAndBack(klonk);
        klonk.Step();
    }
}
`,
      },
      check: { position: true, direction: true, cells: true },
      requires: ['recursion'],
    },
    {
      id: 'count-marks',
      title: { de: 'Marken zählen', en: 'Counting marks' },
      text: {
        de: 'Klonk läuft bis zur Wand. Eine rekursive Methode gibt zurück, auf wie vielen der Felder, die er dabei betritt, eine Marke liegt – sein Startfeld zählt nicht mit. Gib das Ergebnis aus.',
        en: 'Klonk walks to the wall. A recursive method returns on how many of the cells it enters there is a mark – its start cell does not count. Output the result.',
      },
      hints: [
        { de: 'Steht Klonk vor der Wand, ist das Ergebnis 0. Sonst geht er einen Schritt; das Ergebnis ist dann das Ergebnis des rekursiven Aufrufs – plus 1, wenn auf dem neuen Feld eine Marke liegt.', en: 'If Klonk stands in front of the wall, the result is 0. Otherwise it takes a step; the result is then the result of the recursive call – plus 1 if there is a mark on the new cell.' },
      ],
      worlds: [
        map('> y . y y . .'),
        map('>y . r . . b . g . .'),
        map('> y # y .'),
        map('> . .'),
      ],
      solutions: {
        python: `from klonk import Klonk

def count_marks(klonk):
    if klonk.is_wall():
        return 0
    klonk.step()
    if klonk.is_mark():
        return count_marks(klonk) + 1
    return count_marks(klonk)

print(count_marks(Klonk()))
`,
        java: `import klonk.Klonk;

public class Program {
    static int countMarks(Klonk klonk) {
        if (klonk.isWall()) {
            return 0;
        }
        klonk.step();
        if (klonk.isMark()) {
            return countMarks(klonk) + 1;
        }
        return countMarks(klonk);
    }

    public static void main(String[] args) {
        System.out.println(countMarks(new Klonk()));
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function countMarks(klonk) {
  if (klonk.isWall()) {
    return 0
  }
  klonk.step()
  if (klonk.isMark()) {
    return countMarks(klonk) + 1
  }
  return countMarks(klonk)
}

console.log(countMarks(new Klonk()))
`,
        typescript: `import { Klonk } from 'klonk'

function countMarks(klonk: Klonk): number {
  if (klonk.isWall()) {
    return 0
  }
  klonk.step()
  if (klonk.isMark()) {
    return countMarks(klonk) + 1
  }
  return countMarks(klonk)
}

console.log(countMarks(new Klonk()))
`,
        csharp: `using klonk;

Console.WriteLine(CountMarks(new Klonk()));

int CountMarks(Klonk klonk)
{
    if (klonk.IsWall())
    {
        return 0;
    }
    klonk.Step();
    if (klonk.IsMark())
    {
        return CountMarks(klonk) + 1;
    }
    return CountMarks(klonk);
}
`,
      },
      check: { position: true, output: 'numbers' },
      requires: ['recursion', 'returnValue'],
    },
    {
      id: 'staircase',
      title: { de: 'Treppe auf dem Rückweg', en: 'Staircase on the way back' },
      text: {
        de: 'Klonk läuft bis zur Wand und wieder zurück auf sein Startfeld. Auf dem Rückweg baut er auf jedem Feld links neben sich einen Turm, der so hoch ist, wie das Feld vom letzten Feld vor der Wand entfernt ist: neben dem letzten Feld kein Ziegel, neben dem Feld davor 1 Ziegel, dann 2 und so weiter bis zum Startfeld. So entsteht eine Treppe, die zur Wand hin abfällt.\n\nSchreibe dazu eine rekursive Methode, die den Abstand zur Wand zurückgibt.',
        en: 'Klonk walks to the wall and back to its start cell. On the way back, on every cell it builds a tower to its left that is as high as the cell\'s distance from the last cell in front of the wall: no brick next to the last cell, 1 brick next to the cell before it, then 2 and so on up to the start cell. This creates a staircase that descends towards the wall.\n\nFor this, write a recursive method that returns the distance to the wall.',
      },
      hints: [
        { de: 'Der Basisfall ist die Wand: umdrehen und 0 zurückgeben. Sonst: Schritt, rekursiver Aufruf – sein Ergebnis plus 1 ist der Abstand des aktuellen Feldes.', en: 'The base case is the wall: turn around and return 0. Otherwise: step, recursive call – its result plus 1 is the distance of the current cell.' },
        { de: 'Den Turm baust du erst **nach** dem rekursiven Aufruf und dem Schritt zurück: Dann kennst du den Abstand und stehst auf dem richtigen Feld. Links neben sich: nach links drehen, Ziegel legen, wieder nach rechts drehen.', en: 'Build the tower only **after** the recursive call and the step back: then you know the distance and are on the right cell. To its left: turn left, place the bricks, turn right again.' },
      ],
      worlds: [
        map(`
          > . . .
          . . . .
        `),
        map(`
          . > . . . . .
          . . . . . . .
        `),
        map(`
          > . # .
          . . . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk

def staircase(klonk):
    if klonk.is_wall():
        klonk.turn_left()
        klonk.turn_left()
        return 0
    klonk.step()
    distance = staircase(klonk) + 1
    klonk.step()
    klonk.turn_left()
    for i in range(distance):
        klonk.place_brick()
    klonk.turn_right()
    return distance

staircase(Klonk())
`,
        java: `import klonk.Klonk;

public class Program {
    static int staircase(Klonk klonk) {
        if (klonk.isWall()) {
            klonk.turnLeft();
            klonk.turnLeft();
            return 0;
        }
        klonk.step();
        int distance = staircase(klonk) + 1;
        klonk.step();
        klonk.turnLeft();
        for (int i = 0; i < distance; i++) {
            klonk.placeBrick();
        }
        klonk.turnRight();
        return distance;
    }

    public static void main(String[] args) {
        staircase(new Klonk());
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

function staircase(klonk) {
  if (klonk.isWall()) {
    klonk.turnLeft()
    klonk.turnLeft()
    return 0
  }
  klonk.step()
  const distance = staircase(klonk) + 1
  klonk.step()
  klonk.turnLeft()
  for (let i = 0; i < distance; i++) {
    klonk.placeBrick()
  }
  klonk.turnRight()
  return distance
}

staircase(new Klonk())
`,
        typescript: `import { Klonk } from 'klonk'

function staircase(klonk: Klonk): number {
  if (klonk.isWall()) {
    klonk.turnLeft()
    klonk.turnLeft()
    return 0
  }
  klonk.step()
  const distance = staircase(klonk) + 1
  klonk.step()
  klonk.turnLeft()
  for (let i = 0; i < distance; i++) {
    klonk.placeBrick()
  }
  klonk.turnRight()
  return distance
}

staircase(new Klonk())
`,
        csharp: `using klonk;

Staircase(new Klonk());

int Staircase(Klonk klonk)
{
    if (klonk.IsWall())
    {
        klonk.TurnLeft();
        klonk.TurnLeft();
        return 0;
    }
    klonk.Step();
    var distance = Staircase(klonk) + 1;
    klonk.Step();
    klonk.TurnLeft();
    for (var i = 0; i < distance; i++)
    {
        klonk.PlaceBrick();
    }
    klonk.TurnRight();
    return distance;
}
`,
      },
      check: { position: true, direction: true, cells: true },
      requires: ['recursion', 'returnValue'],
    },
  ],
}
