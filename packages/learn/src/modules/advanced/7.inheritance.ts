import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeInheritance: LearnModule = {
  id: 'code-inheritance',
  track: 'advanced',
  title: { de: 'Vererbung und Polymorphie', en: 'Inheritance and polymorphism' },
  summary: {
    de: 'Unterklassen erben Attribute und Methoden, überschreiben Methoden und arbeiten gemeinsam in einer Liste – jedes Objekt auf seine Art.',
    en: 'Subclasses inherit attributes and methods, override methods and work together in one list – each object in its own way.',
  },
  objectives: [
    { de: 'Eine Unterklasse von einer Oberklasse ableiten und geerbte Attribute und Methoden nutzen', en: 'Derive a subclass from a superclass and use inherited attributes and methods' },
    { de: 'Methoden überschreiben und mit `super` (C#: `base`) Konstruktor und Methoden der Oberklasse aufrufen', en: 'Override methods and call the constructor and methods of the superclass with `super` (C#: `base`)' },
    { de: 'Objekte verschiedener Unterklassen über Referenzen vom Typ der Oberklasse gemeinsam verarbeiten (Polymorphie)', en: 'Process objects of different subclasses together through references of the superclass type (polymorphism)' },
  ],
  prerequisites: ['code-classes'],
  intro: {
    de: `Eine Klasse kann von einer anderen **erben**. Die **Unterklasse** übernimmt alle Attribute und Methoden der **Oberklasse**, kann neue hinzufügen und geerbte Methoden **überschreiben**, also durch eine eigene Fassung ersetzen. Ein \`Painter\` (Maler) *ist ein* \`Worker\` (Arbeiter): Er macht seine Schicht wie jeder Worker – bis zur Wand laufen und auf jedem Feld arbeiten –, arbeitet aber auf seine eigene Art.

\`\`\`python
from klonk import Klonk

class Worker:
    def __init__(self, klonk):
        self.klonk = klonk

    def work(self):
        pass

    def shift(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.work()

class Painter(Worker):
    def work(self):
        self.klonk.set_mark()

painter = Painter(Klonk())
painter.shift()
\`\`\`

\`\`\`java
import klonk.Klonk;

class Worker {
    protected Klonk klonk;

    Worker(Klonk klonk) {
        this.klonk = klonk;
    }

    void work() {
    }

    void shift() {
        while (!klonk.isWall()) {
            klonk.step();
            work();
        }
    }
}

class Painter extends Worker {
    Painter(Klonk klonk) {
        super(klonk);
    }

    @Override
    void work() {
        klonk.setMark();
    }
}

public class Programm {
    public static void main(String[] args) {
        Worker painter = new Painter(new Klonk());
        painter.shift();
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

class Worker {
  constructor(klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  work() {
    this.klonk.setMark()
  }
}

const painter = new Painter(new Klonk())
painter.shift()
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

class Worker {
  protected klonk: Klonk

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  work() {
    this.klonk.setMark()
  }
}

const painter: Worker = new Painter(new Klonk())
painter.shift()
\`\`\`

\`\`\`csharp
using klonk;

Worker painter = new Painter(new Klonk());
painter.Shift();

class Worker
{
    protected readonly Klonk klonk;

    public Worker(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public virtual void Work()
    {
    }

    public void Shift()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            Work();
        }
    }
}

class Painter : Worker
{
    public Painter(Klonk klonk) : base(klonk)
    {
    }

    public override void Work()
    {
        klonk.SetMark();
    }
}
\`\`\`

\`shift()\` steht nur in \`Worker\` und ruft \`work()\` auf. Welches \`work()\` dabei läuft, entscheidet das Objekt selbst: Bei einem \`Painter\` ist es seine eigene Fassung. Das heißt **Polymorphie** (Vielgestaltigkeit). Deshalb kann eine Variable oder Liste vom Typ \`Worker\` Objekte jeder Unterklasse aufnehmen.

So sieht Vererbung in den Sprachen aus:

- Python: \`class Painter(Worker):\` – Methode der Oberklasse aufrufen mit \`super().work()\`, ihren Konstruktor mit \`super().__init__(klonk)\`
- Java: \`class Painter extends Worker\` – \`super.work()\`; ein eigener Konstruktor ruft als Erstes \`super(klonk)\` auf. \`@Override\` lässt den Compiler prüfen, dass wirklich eine Methode überschrieben wird.
- JavaScript und TypeScript: \`class Painter extends Worker\` – \`super.work()\`; ein eigener Konstruktor ruft \`super(klonk)\` vor dem ersten \`this\` auf
- C#: \`class Painter : Worker\` – die Methode der Oberklasse ist \`virtual\`, die neue Fassung \`override\`; \`base.Work()\`, Konstruktor mit \`: base(klonk)\``,
    en: `A class can **inherit** from another one. The **subclass** takes over all attributes and methods of the **superclass**, can add new ones and **override** inherited methods, i.e. replace them with its own version. A \`Painter\` *is a* \`Worker\`: it does its shift like every worker – walk to the wall and work on every cell – but it works in its own way.

\`\`\`python
from klonk import Klonk

class Worker:
    def __init__(self, klonk):
        self.klonk = klonk

    def work(self):
        pass

    def shift(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.work()

class Painter(Worker):
    def work(self):
        self.klonk.set_mark()

painter = Painter(Klonk())
painter.shift()
\`\`\`

\`\`\`java
import klonk.Klonk;

class Worker {
    protected Klonk klonk;

    Worker(Klonk klonk) {
        this.klonk = klonk;
    }

    void work() {
    }

    void shift() {
        while (!klonk.isWall()) {
            klonk.step();
            work();
        }
    }
}

class Painter extends Worker {
    Painter(Klonk klonk) {
        super(klonk);
    }

    @Override
    void work() {
        klonk.setMark();
    }
}

public class Program {
    public static void main(String[] args) {
        Worker painter = new Painter(new Klonk());
        painter.shift();
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

class Worker {
  constructor(klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  work() {
    this.klonk.setMark()
  }
}

const painter = new Painter(new Klonk())
painter.shift()
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

class Worker {
  protected klonk: Klonk

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  work() {
    this.klonk.setMark()
  }
}

const painter: Worker = new Painter(new Klonk())
painter.shift()
\`\`\`

\`\`\`csharp
using klonk;

Worker painter = new Painter(new Klonk());
painter.Shift();

class Worker
{
    protected readonly Klonk klonk;

    public Worker(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public virtual void Work()
    {
    }

    public void Shift()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            Work();
        }
    }
}

class Painter : Worker
{
    public Painter(Klonk klonk) : base(klonk)
    {
    }

    public override void Work()
    {
        klonk.SetMark();
    }
}
\`\`\`

\`shift()\` exists only in \`Worker\` and calls \`work()\`. Which \`work()\` runs is decided by the object itself: for a \`Painter\` it is its own version. This is called **polymorphism** (“many forms”). That is why a variable or list of type \`Worker\` can hold objects of every subclass.

This is how inheritance looks in the languages:

- Python: \`class Painter(Worker):\` – call the superclass method with \`super().work()\`, its constructor with \`super().__init__(klonk)\`
- Java: \`class Painter extends Worker\` – \`super.work()\`; a constructor of its own calls \`super(klonk)\` first. \`@Override\` makes the compiler check that a method really is overridden.
- JavaScript and TypeScript: \`class Painter extends Worker\` – \`super.work()\`; a constructor of its own calls \`super(klonk)\` before the first \`this\`
- C#: \`class Painter : Worker\` – the superclass method is \`virtual\`, the new version \`override\`; \`base.Work()\`, constructor with \`: base(klonk)\``,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** eigene Klassen mit Attributen, Konstruktor und Methoden (F6) und Listen von Objekten (F5).

**Begriffe:** Ober- und Unterklasse (in C# auch Basisklasse und abgeleitete Klasse), Vererbung („ist ein“) im Unterschied zur Assoziation („hat ein“, F6), Überschreiben, Polymorphie, dynamisches Binden, Aufruf von Konstruktor und Methoden der Oberklasse. Alle Aufgaben folgen demselben Muster: \`shift()\` in der Oberklasse ruft das überschriebene \`work()\` auf (Schablonenmethode). So zeigt sich Polymorphie, ohne dass die Lernenden Typen abfragen müssen.

**Diagramme:** Unter **Programmieren** zeigt das Klassendiagramm im Tab **Diagramm** die Generalisierung (Pfeil mit hohler Spitze von der Unter- zur Oberklasse) und die Assoziation zu \`Klonk\`. Mit einem Haltepunkt nach dem Füllen der Liste zeigt das Objektdiagramm, dass eine Liste vom Typ \`Worker\` Verweise auf Objekte verschiedener Klassen enthält – geeignet, um Referenzen und Polymorphie an Aufgabe 2 zu besprechen.

**Typische Schwierigkeiten:**
- C#: Ohne \`override\` in der Unterklasse wird die Methode nur verdeckt – \`Shift()\` ruft dann weiter die Fassung der Oberklasse auf, und der Compiler gibt höchstens eine Warnung aus. \`override\` ist nur erlaubt, wenn die Methode der Oberklasse \`virtual\` ist.
- Java und C#: Hat die Oberklasse nur einen Konstruktor mit Parameter, braucht jede Unterklasse einen eigenen Konstruktor, der ihn mit \`super(klonk)\` bzw. \`: base(klonk)\` aufruft. Python und JavaScript erben den Konstruktor, solange die Unterklasse keinen eigenen hat.
- Python: In einem eigenen \`__init__\` der Unterklasse fehlt \`super().__init__(klonk)\` – dann gibt es \`self.klonk\` nicht. JavaScript meldet einen Fehler, wenn \`this\` vor \`super(…)\` benutzt wird.
- Aufgabe 3: Ruft eine Unterklasse die Methode der Oberklasse nicht auf, geht deren Verhalten (das Zählen) verloren – das fällt erst an der falschen Ausgabe auf.
- Aufgabe 4: Die Variable bzw. Liste braucht in Java, C# und TypeScript den Typ der Oberklasse (\`ArrayList<Worker>\`, \`List<Worker>\`, \`Worker[]\`). Wer statt Listen Arrays von Objekten verwendet, legt in Java bzw. C# ein Array der Länge \`Klonk.all().length\` bzw. \`Klonk.All().Length\` an.

**Abstrakte Klassen:** \`Worker\` bleibt eine gewöhnliche Klasse, weil Aufgabe 3 und 4 auch Figuren ohne besonderen Beruf brauchen. Als Erweiterung lässt sich eine abstrakte Oberklasse besprechen (Java und C# \`abstract\`, Python über das Modul \`abc\`).

**Differenzierung:** Schnelle Lernende ergänzen eine weitere Unterklasse – etwa einen Aufräumer, der vorhandene Marken entfernt – und nehmen sie in Aufgabe 4 auf, oder sie zeichnen das Klassendiagramm vorab von Hand.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** own classes with attributes, constructor and methods (F6) and lists of objects (F5).

**Concepts:** superclass and subclass (in C# also base class and derived class), inheritance (“is a”) as opposed to association (“has a”, F6), overriding, polymorphism, dynamic binding, calling the constructor and methods of the superclass. All tasks follow the same pattern: \`shift()\` in the superclass calls the overridden \`work()\` (template method). This shows polymorphism without students having to query types.

**Diagrams:** Under **Code**, the class diagram in the **Diagram** tab shows the generalisation (arrow with a hollow head from the subclass to the superclass) and the association to \`Klonk\`. With a breakpoint after filling the list, the object diagram shows that a list of type \`Worker\` contains references to objects of different classes – suitable for discussing references and polymorphism with task 2.

**Typical difficulties:**
- C#: Without \`override\` in the subclass, the method is only hidden – \`Shift()\` then still calls the superclass version, and the compiler issues a warning at most. \`override\` is only allowed if the superclass method is \`virtual\`.
- Java and C#: If the superclass only has a constructor with a parameter, every subclass needs a constructor of its own that calls it with \`super(klonk)\` or \`: base(klonk)\`. Python and JavaScript inherit the constructor as long as the subclass has none of its own.
- Python: In a subclass's own \`__init__\`, \`super().__init__(klonk)\` is missing – then \`self.klonk\` does not exist. JavaScript reports an error if \`this\` is used before \`super(…)\`.
- Task 3: If a subclass does not call the superclass method, its behaviour (counting) is lost – this only shows in the wrong output.
- Task 4: In Java, C# and TypeScript, the variable or list needs the type of the superclass (\`ArrayList<Worker>\`, \`List<Worker>\`, \`Worker[]\`). Classes that use arrays of objects instead of lists create an array of length \`Klonk.all().length\` or \`Klonk.All().Length\` in Java or C#.

**Abstract classes:** \`Worker\` stays an ordinary class because tasks 3 and 4 also need characters without a particular job. As an extension, an abstract superclass can be discussed (Java and C# \`abstract\`, Python via the module \`abc\`).

**Differentiation:** Fast learners add another subclass – for example a cleaner who removes existing marks – and include it in task 4, or draw the class diagram by hand first.`,
  },
  tasks: [
    {
      id: 'bricklayer',
      title: { de: 'Der Maurer', en: 'The bricklayer' },
      text: {
        de: 'Schreibe die Oberklasse `Worker` wie im Beispiel und dazu die Unterklasse `Bricklayer` (Maurer). Ein Maurer arbeitet so: Er legt rechts neben sich einen Ziegel.\n\nLass Klonk als Maurer seine Schicht machen.',
        en: 'Write the superclass `Worker` as in the example and the subclass `Bricklayer`. A bricklayer works like this: it places a brick to its right.\n\nLet Klonk do its shift as a bricklayer.',
      },
      hints: [
        {
          de: 'Der Maurer erbt `shift()` und überschreibt nur `work()`:\n\n```python\nclass Bricklayer(Worker):\n    def work(self):\n        ...\n```\n\n```java\nclass Bricklayer extends Worker {\n    Bricklayer(Klonk klonk) {\n        super(klonk);\n    }\n\n    @Override\n    void work() {\n        ...\n    }\n}\n```\n\n```javascript\nclass Bricklayer extends Worker {\n  work() {\n    ...\n  }\n}\n```\n\n```csharp\nclass Bricklayer : Worker\n{\n    public Bricklayer(Klonk klonk) : base(klonk)\n    {\n    }\n\n    public override void Work()\n    {\n        ...\n    }\n}\n```',
          en: 'The bricklayer inherits `shift()` and only overrides `work()`:\n\n```python\nclass Bricklayer(Worker):\n    def work(self):\n        ...\n```\n\n```java\nclass Bricklayer extends Worker {\n    Bricklayer(Klonk klonk) {\n        super(klonk);\n    }\n\n    @Override\n    void work() {\n        ...\n    }\n}\n```\n\n```javascript\nclass Bricklayer extends Worker {\n  work() {\n    ...\n  }\n}\n```\n\n```csharp\nclass Bricklayer : Worker\n{\n    public Bricklayer(Klonk klonk) : base(klonk)\n    {\n    }\n\n    public override void Work()\n    {\n        ...\n    }\n}\n```',
        },
        { de: 'Rechts neben sich: nach rechts drehen, Ziegel legen, wieder nach links drehen.', en: 'To its right: turn right, place a brick, turn left again.' },
      ],
      worlds: [
        map(`
          > . . . . .
          . . . . . .
        `),
        map(`
          > . . # . . .
          . . . . . . .
        `),
      ],
      solutions: {
        python: `from klonk import Klonk

class Worker:
    def __init__(self, klonk):
        self.klonk = klonk

    def work(self):
        pass

    def shift(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.work()

class Bricklayer(Worker):
    def work(self):
        self.klonk.turn_right()
        self.klonk.place_brick()
        self.klonk.turn_left()

bricklayer = Bricklayer(Klonk())
bricklayer.shift()
`,
        java: `import klonk.Klonk;

class Worker {
    protected Klonk klonk;

    Worker(Klonk klonk) {
        this.klonk = klonk;
    }

    void work() {
    }

    void shift() {
        while (!klonk.isWall()) {
            klonk.step();
            work();
        }
    }
}

class Bricklayer extends Worker {
    Bricklayer(Klonk klonk) {
        super(klonk);
    }

    @Override
    void work() {
        klonk.turnRight();
        klonk.placeBrick();
        klonk.turnLeft();
    }
}

public class Program {
    public static void main(String[] args) {
        Worker bricklayer = new Bricklayer(new Klonk());
        bricklayer.shift();
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

class Worker {
  constructor(klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Bricklayer extends Worker {
  work() {
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const bricklayer = new Bricklayer(new Klonk())
bricklayer.shift()
`,
        typescript: `import { Klonk } from 'klonk'

class Worker {
  protected klonk: Klonk

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Bricklayer extends Worker {
  work() {
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const bricklayer: Worker = new Bricklayer(new Klonk())
bricklayer.shift()
`,
        csharp: `using klonk;

Worker bricklayer = new Bricklayer(new Klonk());
bricklayer.Shift();

class Worker
{
    protected readonly Klonk klonk;

    public Worker(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public virtual void Work()
    {
    }

    public void Shift()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            Work();
        }
    }
}

class Bricklayer : Worker
{
    public Bricklayer(Klonk klonk) : base(klonk)
    {
    }

    public override void Work()
    {
        klonk.TurnRight();
        klonk.PlaceBrick();
        klonk.TurnLeft();
    }
}
`,
      },
      check: { position: true, cells: true },
      requires: ['class', 'inheritance'],
    },
    {
      id: 'team',
      title: { de: 'Maler und Maurer', en: 'Painters and a bricklayer' },
      text: {
        de: 'Klara und Kim sind Malerinnen, Ben ist Maurer. Ein `Painter` bekommt jetzt im Konstruktor die Farbe seiner Marken: Klara malt blau, Kim grün. Der Konstruktor ruft dazu den Konstruktor der Oberklasse auf.\n\nSpeichere alle drei in **einer** Liste von Workern und lass sie in einer Schleife nacheinander ihre Schicht machen.',
        en: 'Klara and Kim are painters, Ben is a bricklayer. A `Painter` now receives the colour of its marks in the constructor: Klara paints blue, Kim green. For this, the constructor calls the constructor of the superclass.\n\nStore all three in **one** list of workers and let them do their shifts one after another in a loop.',
      },
      hints: [
        {
          de: 'Der Konstruktor des Malers:\n\n```python\ndef __init__(self, klonk, color):\n    super().__init__(klonk)\n    self.color = color\n```\n\n```java\nPainter(Klonk klonk, String color) {\n    super(klonk);\n    this.color = color;\n}\n```\n\n```javascript\nconstructor(klonk, color) {\n  super(klonk)\n  this.color = color\n}\n```\n\n```csharp\npublic Painter(Klonk klonk, string color) : base(klonk)\n{\n    this.color = color;\n}\n```',
          en: 'The constructor of the painter:\n\n```python\ndef __init__(self, klonk, color):\n    super().__init__(klonk)\n    self.color = color\n```\n\n```java\nPainter(Klonk klonk, String color) {\n    super(klonk);\n    this.color = color;\n}\n```\n\n```javascript\nconstructor(klonk, color) {\n  super(klonk)\n  this.color = color\n}\n```\n\n```csharp\npublic Painter(Klonk klonk, string color) : base(klonk)\n{\n    this.color = color;\n}\n```',
        },
        {
          de: 'Die Liste hat den Typ der Oberklasse und nimmt Maler und Maurer auf:\n\n```python\nworkers = [Painter(Klonk("Klara"), blue), Bricklayer(Klonk("Ben")), Painter(Klonk("Kim"), green)]\n```\n\n```java\nArrayList<Worker> workers = new ArrayList<>();\nworkers.add(new Painter(new Klonk("Klara"), BLUE));\n```\n\n```javascript\nconst workers = [new Painter(new Klonk(\'Klara\'), blue), new Bricklayer(new Klonk(\'Ben\')), new Painter(new Klonk(\'Kim\'), green)]\n```\n\n```typescript\nconst workers: Worker[] = [new Painter(new Klonk(\'Klara\'), blue), new Bricklayer(new Klonk(\'Ben\')), new Painter(new Klonk(\'Kim\'), green)]\n```\n\n```csharp\nvar workers = new List<Worker> { new Painter(new Klonk("Klara"), Blue), new Bricklayer(new Klonk("Ben")), new Painter(new Klonk("Kim"), Green) };\n```',
          en: 'The list has the type of the superclass and takes painters and bricklayers:\n\n```python\nworkers = [Painter(Klonk("Klara"), blue), Bricklayer(Klonk("Ben")), Painter(Klonk("Kim"), green)]\n```\n\n```java\nArrayList<Worker> workers = new ArrayList<>();\nworkers.add(new Painter(new Klonk("Klara"), BLUE));\n```\n\n```javascript\nconst workers = [new Painter(new Klonk(\'Klara\'), blue), new Bricklayer(new Klonk(\'Ben\')), new Painter(new Klonk(\'Kim\'), green)]\n```\n\n```typescript\nconst workers: Worker[] = [new Painter(new Klonk(\'Klara\'), blue), new Bricklayer(new Klonk(\'Ben\')), new Painter(new Klonk(\'Kim\'), green)]\n```\n\n```csharp\nvar workers = new List<Worker> { new Painter(new Klonk("Klara"), Blue), new Bricklayer(new Klonk("Ben")), new Painter(new Klonk("Kim"), Green) };\n```',
        },
      ],
      worlds: [
        map(`
          > . . . . .
          . . . . . .
          > . . . # .
          . . . . . .
          > . . . . .
        `, { names: ['Klara', 'Ben', 'Kim'] }),
        map(`
          > . . . . . . .
          . . . . . . . .
          > . . # . . . .
          . . . . . . . .
          > . . . . . # .
        `, { names: ['Ben', 'Kim', 'Klara'] }),
        map(`
          > . .
          . . .
          > # .
          . . .
          > . .
          . . .
        `, { names: ['Kim', 'Klara', 'Ben'] }),
      ],
      solutions: {
        python: `from klonk import Klonk, blue, green

class Worker:
    def __init__(self, klonk):
        self.klonk = klonk

    def work(self):
        pass

    def shift(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.work()

class Painter(Worker):
    def __init__(self, klonk, color):
        super().__init__(klonk)
        self.color = color

    def work(self):
        self.klonk.set_mark(self.color)

class Bricklayer(Worker):
    def work(self):
        self.klonk.turn_right()
        self.klonk.place_brick()
        self.klonk.turn_left()

workers = [Painter(Klonk("Klara"), blue), Bricklayer(Klonk("Ben")), Painter(Klonk("Kim"), green)]
for worker in workers:
    worker.shift()
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;
import java.util.ArrayList;

class Worker {
    protected Klonk klonk;

    Worker(Klonk klonk) {
        this.klonk = klonk;
    }

    void work() {
    }

    void shift() {
        while (!klonk.isWall()) {
            klonk.step();
            work();
        }
    }
}

class Painter extends Worker {
    private String color;

    Painter(Klonk klonk, String color) {
        super(klonk);
        this.color = color;
    }

    @Override
    void work() {
        klonk.setMark(color);
    }
}

class Bricklayer extends Worker {
    Bricklayer(Klonk klonk) {
        super(klonk);
    }

    @Override
    void work() {
        klonk.turnRight();
        klonk.placeBrick();
        klonk.turnLeft();
    }
}

public class Program {
    public static void main(String[] args) {
        ArrayList<Worker> workers = new ArrayList<>();
        workers.add(new Painter(new Klonk("Klara"), BLUE));
        workers.add(new Bricklayer(new Klonk("Ben")));
        workers.add(new Painter(new Klonk("Kim"), GREEN));
        for (Worker worker : workers) {
            worker.shift();
        }
    }
}
`,
        javascript: `import { Klonk, blue, green } from 'klonk'

class Worker {
  constructor(klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  constructor(klonk, color) {
    super(klonk)
    this.color = color
  }

  work() {
    this.klonk.setMark(this.color)
  }
}

class Bricklayer extends Worker {
  work() {
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const workers = [new Painter(new Klonk('Klara'), blue), new Bricklayer(new Klonk('Ben')), new Painter(new Klonk('Kim'), green)]
for (const worker of workers) {
  worker.shift()
}
`,
        typescript: `import { Klonk, blue, green, type KlonkMarkColor } from 'klonk'

class Worker {
  protected klonk: Klonk

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  work() {}

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  private color: KlonkMarkColor

  constructor(klonk: Klonk, color: KlonkMarkColor) {
    super(klonk)
    this.color = color
  }

  work() {
    this.klonk.setMark(this.color)
  }
}

class Bricklayer extends Worker {
  work() {
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const workers: Worker[] = [new Painter(new Klonk('Klara'), blue), new Bricklayer(new Klonk('Ben')), new Painter(new Klonk('Kim'), green)]
for (const worker of workers) {
  worker.shift()
}
`,
        csharp: `using klonk;
using static klonk.Klonk;

var workers = new List<Worker> { new Painter(new Klonk("Klara"), Blue), new Bricklayer(new Klonk("Ben")), new Painter(new Klonk("Kim"), Green) };
foreach (var worker in workers)
{
    worker.Shift();
}

class Worker
{
    protected readonly Klonk klonk;

    public Worker(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public virtual void Work()
    {
    }

    public void Shift()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            Work();
        }
    }
}

class Painter : Worker
{
    private readonly string color;

    public Painter(Klonk klonk, string color) : base(klonk)
    {
        this.color = color;
    }

    public override void Work()
    {
        klonk.SetMark(color);
    }
}

class Bricklayer : Worker
{
    public Bricklayer(Klonk klonk) : base(klonk)
    {
    }

    public override void Work()
    {
        klonk.TurnRight();
        klonk.PlaceBrick();
        klonk.TurnLeft();
    }
}
`,
      },
      check: { position: true, cells: true },
      requires: ['class', 'inheritance', 'loop'],
      characters: 3,
    },
    {
      id: 'count-work',
      title: { de: 'Mitzählen mit super', en: 'Counting with super' },
      text: {
        de: 'Jeder Worker zählt jetzt in einem Attribut, auf wie vielen Feldern er gearbeitet hat. Das Zählen übernimmt `work()` in der Oberklasse `Worker`. Maler und Maurer rufen in ihrem `work()` zuerst die Methode der Oberklasse auf und arbeiten dann auf ihre Art.\n\nKlara ist Malerin und malt gelb, Ben ist Maurer und Kim ein gewöhnlicher Worker ohne besonderen Beruf. Nach der Schicht gibt das Programm für jeden aus, auf wie vielen Feldern er gearbeitet hat – zuerst für Klara, dann für Ben, dann für Kim.',
        en: 'Every worker now counts in an attribute on how many cells it has worked. The counting is done by `work()` in the superclass `Worker`. Painters and bricklayers first call the superclass method in their `work()` and then work in their own way.\n\nKlara is a painter and paints yellow, Ben is a bricklayer and Kim an ordinary worker without a particular job. After the shift, the program outputs for each of them on how many cells they have worked – first for Klara, then for Ben, then for Kim.',
      },
      hints: [
        {
          de: 'Die Methode der Oberklasse aufrufen:\n\n```python\ndef work(self):\n    super().work()\n    ...\n```\n\n```java\n@Override\nvoid work() {\n    super.work();\n    ...\n}\n```\n\n```javascript\nwork() {\n  super.work()\n  ...\n}\n```\n\n```csharp\npublic override void Work()\n{\n    base.Work();\n    ...\n}\n```',
          en: 'Calling the superclass method:\n\n```python\ndef work(self):\n    super().work()\n    ...\n```\n\n```java\n@Override\nvoid work() {\n    super.work();\n    ...\n}\n```\n\n```javascript\nwork() {\n  super.work()\n  ...\n}\n```\n\n```csharp\npublic override void Work()\n{\n    base.Work();\n    ...\n}\n```',
        },
        { de: 'Kim ist ein Objekt der Klasse `Worker` selbst: Sein `work()` zählt nur.', en: 'Kim is an object of the class `Worker` itself: its `work()` only counts.' },
      ],
      worlds: [
        map(`
          > . . . # .
          . . . . . .
          > . . . . .
          . . . . . .
          > . . . . .
        `, { names: ['Klara', 'Ben', 'Kim'] }),
        map(`
          > . . . . . .
          . . . . . . .
          > . . . . # .
          . . . . . . .
          > # . . . . .
        `, { names: ['Kim', 'Klara', 'Ben'] }),
        map(`
          > . # .
          . . . .
          > . . .
          . . . .
          > . . .
          . . . .
        `, { names: ['Ben', 'Kim', 'Klara'] }),
      ],
      solutions: {
        python: `from klonk import Klonk, yellow

class Worker:
    def __init__(self, klonk):
        self.klonk = klonk
        self.count = 0

    def work(self):
        self.count += 1

    def shift(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.work()

class Painter(Worker):
    def __init__(self, klonk, color):
        super().__init__(klonk)
        self.color = color

    def work(self):
        super().work()
        self.klonk.set_mark(self.color)

class Bricklayer(Worker):
    def work(self):
        super().work()
        self.klonk.turn_right()
        self.klonk.place_brick()
        self.klonk.turn_left()

workers = [Painter(Klonk("Klara"), yellow), Bricklayer(Klonk("Ben")), Worker(Klonk("Kim"))]
for worker in workers:
    worker.shift()
for worker in workers:
    print(worker.count)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;
import java.util.ArrayList;

class Worker {
    protected Klonk klonk;
    private int count = 0;

    Worker(Klonk klonk) {
        this.klonk = klonk;
    }

    void work() {
        count++;
    }

    void shift() {
        while (!klonk.isWall()) {
            klonk.step();
            work();
        }
    }

    int getCount() {
        return count;
    }
}

class Painter extends Worker {
    private String color;

    Painter(Klonk klonk, String color) {
        super(klonk);
        this.color = color;
    }

    @Override
    void work() {
        super.work();
        klonk.setMark(color);
    }
}

class Bricklayer extends Worker {
    Bricklayer(Klonk klonk) {
        super(klonk);
    }

    @Override
    void work() {
        super.work();
        klonk.turnRight();
        klonk.placeBrick();
        klonk.turnLeft();
    }
}

public class Program {
    public static void main(String[] args) {
        ArrayList<Worker> workers = new ArrayList<>();
        workers.add(new Painter(new Klonk("Klara"), YELLOW));
        workers.add(new Bricklayer(new Klonk("Ben")));
        workers.add(new Worker(new Klonk("Kim")));
        for (Worker worker : workers) {
            worker.shift();
        }
        for (Worker worker : workers) {
            System.out.println(worker.getCount());
        }
    }
}
`,
        javascript: `import { Klonk, yellow } from 'klonk'

class Worker {
  constructor(klonk) {
    this.klonk = klonk
    this.count = 0
  }

  work() {
    this.count++
  }

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  constructor(klonk, color) {
    super(klonk)
    this.color = color
  }

  work() {
    super.work()
    this.klonk.setMark(this.color)
  }
}

class Bricklayer extends Worker {
  work() {
    super.work()
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const workers = [new Painter(new Klonk('Klara'), yellow), new Bricklayer(new Klonk('Ben')), new Worker(new Klonk('Kim'))]
for (const worker of workers) {
  worker.shift()
}
for (const worker of workers) {
  console.log(worker.count)
}
`,
        typescript: `import { Klonk, yellow, type KlonkMarkColor } from 'klonk'

class Worker {
  protected klonk: Klonk
  count = 0

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  work() {
    this.count++
  }

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  private color: KlonkMarkColor

  constructor(klonk: Klonk, color: KlonkMarkColor) {
    super(klonk)
    this.color = color
  }

  work() {
    super.work()
    this.klonk.setMark(this.color)
  }
}

class Bricklayer extends Worker {
  work() {
    super.work()
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const workers: Worker[] = [new Painter(new Klonk('Klara'), yellow), new Bricklayer(new Klonk('Ben')), new Worker(new Klonk('Kim'))]
for (const worker of workers) {
  worker.shift()
}
for (const worker of workers) {
  console.log(worker.count)
}
`,
        csharp: `using klonk;
using static klonk.Klonk;

var workers = new List<Worker> { new Painter(new Klonk("Klara"), Yellow), new Bricklayer(new Klonk("Ben")), new Worker(new Klonk("Kim")) };
foreach (var worker in workers)
{
    worker.Shift();
}
foreach (var worker in workers)
{
    Console.WriteLine(worker.Count);
}

class Worker
{
    protected readonly Klonk klonk;
    public int Count { get; private set; }

    public Worker(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public virtual void Work()
    {
        Count++;
    }

    public void Shift()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            Work();
        }
    }
}

class Painter : Worker
{
    private readonly string color;

    public Painter(Klonk klonk, string color) : base(klonk)
    {
        this.color = color;
    }

    public override void Work()
    {
        base.Work();
        klonk.SetMark(color);
    }
}

class Bricklayer : Worker
{
    public Bricklayer(Klonk klonk) : base(klonk)
    {
    }

    public override void Work()
    {
        base.Work();
        klonk.TurnRight();
        klonk.PlaceBrick();
        klonk.TurnLeft();
    }
}
`,
      },
      check: { position: true, cells: true, output: 'numbers' },
      requires: ['class', 'inheritance'],
      characters: 3,
    },
    {
      id: 'jobs',
      title: { de: 'Berufe nach Marken', en: 'Jobs by marks' },
      text: {
        de: 'Jede Figur steht zu Beginn auf einer Marke oder auf einem leeren Feld. Daran erkennst du ihren Beruf: Auf einer **blauen** Marke ist sie Maler und malt blau, auf einer **roten** Marke ist sie Maurer, ohne Marke ein gewöhnlicher Worker. Wie viele Figuren es gibt und wer welchen Beruf hat, ist in jeder Welt anders.\n\nErzeuge für jede Figur aus `Klonk.all()` ein Objekt der passenden Klasse und speichere alle in einer Liste. Lass dann alle ihre Schicht machen und gib zum Schluss aus, auf wie vielen Feldern insgesamt gearbeitet wurde – wie in Aufgabe 3 zählen dabei alle mit, auch die gewöhnlichen Worker.',
        en: 'At the start, every character stands on a mark or on an empty cell. This tells you its job: on a **blue** mark it is a painter and paints blue, on a **red** mark it is a bricklayer, without a mark an ordinary worker. How many characters there are and who has which job differs in each world.\n\nCreate an object of the matching class for each character from `Klonk.all()` and store all of them in a list. Then let all of them do their shift and finally output on how many cells work was done in total – as in task 3, everyone counts, including the ordinary workers.',
      },
      hints: [
        { de: 'Die Figur fragst du vor dem Erzeugen des Objekts: `isMark(blue)` bzw. `isMark(red)` (Python `is_mark`, C# `IsMark`). Die Liste hat den Typ der Oberklasse – welche Unterklasse ein Eintrag hat, entscheidet erst die Verzweigung.', en: 'Ask the character before creating the object: `isMark(blue)` or `isMark(red)` (Python `is_mark`, C# `IsMark`). The list has the type of the superclass – which subclass an entry has is only decided by the branch.' },
        { de: 'Die Zähler aus Aufgabe 3 helfen beim Ausgeben: Addiere nach der Schicht die Zähler aller Worker.', en: 'The counters from task 3 help with the output: after the shift, add up the counters of all workers.' },
      ],
      worlds: [
        map(`
          >b . . . . .
          . . . . . .
          >r . . . # .
          . . . . . .
          > . . . . .
          . . . . . .
        `, { names: ['Klara', 'Ben', 'Kim'] }),
        map(`
          >r . . . . . . .
          . . . . . . . .
          > . . # . . . .
          . . . . . . . .
        `, { names: ['Ben', 'Kim'] }),
        map(`
          >b . . .
          . . . .
          >b # . .
          . . . .
          >r . . .
          . . . .
          >r . # .
          . . . .
        `, { names: ['Lea', 'Tom', 'Kim', 'Ben'] }),
      ],
      solutions: {
        python: `from klonk import Klonk, blue, red

class Worker:
    def __init__(self, klonk):
        self.klonk = klonk
        self.count = 0

    def work(self):
        self.count += 1

    def shift(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.work()

class Painter(Worker):
    def __init__(self, klonk, color):
        super().__init__(klonk)
        self.color = color

    def work(self):
        super().work()
        self.klonk.set_mark(self.color)

class Bricklayer(Worker):
    def work(self):
        super().work()
        self.klonk.turn_right()
        self.klonk.place_brick()
        self.klonk.turn_left()

workers = []
for klonk in Klonk.all():
    if klonk.is_mark(blue):
        workers.append(Painter(klonk, blue))
    elif klonk.is_mark(red):
        workers.append(Bricklayer(klonk))
    else:
        workers.append(Worker(klonk))
total = 0
for worker in workers:
    worker.shift()
    total += worker.count
print(total)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;
import java.util.ArrayList;

class Worker {
    protected Klonk klonk;
    private int count = 0;

    Worker(Klonk klonk) {
        this.klonk = klonk;
    }

    void work() {
        count++;
    }

    void shift() {
        while (!klonk.isWall()) {
            klonk.step();
            work();
        }
    }

    int getCount() {
        return count;
    }
}

class Painter extends Worker {
    private String color;

    Painter(Klonk klonk, String color) {
        super(klonk);
        this.color = color;
    }

    @Override
    void work() {
        super.work();
        klonk.setMark(color);
    }
}

class Bricklayer extends Worker {
    Bricklayer(Klonk klonk) {
        super(klonk);
    }

    @Override
    void work() {
        super.work();
        klonk.turnRight();
        klonk.placeBrick();
        klonk.turnLeft();
    }
}

public class Program {
    public static void main(String[] args) {
        ArrayList<Worker> workers = new ArrayList<>();
        for (Klonk klonk : Klonk.all()) {
            if (klonk.isMark(BLUE)) {
                workers.add(new Painter(klonk, BLUE));
            } else if (klonk.isMark(RED)) {
                workers.add(new Bricklayer(klonk));
            } else {
                workers.add(new Worker(klonk));
            }
        }
        int total = 0;
        for (Worker worker : workers) {
            worker.shift();
            total += worker.getCount();
        }
        System.out.println(total);
    }
}
`,
        javascript: `import { Klonk, blue, red } from 'klonk'

class Worker {
  constructor(klonk) {
    this.klonk = klonk
    this.count = 0
  }

  work() {
    this.count++
  }

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  constructor(klonk, color) {
    super(klonk)
    this.color = color
  }

  work() {
    super.work()
    this.klonk.setMark(this.color)
  }
}

class Bricklayer extends Worker {
  work() {
    super.work()
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const workers = []
for (const klonk of Klonk.all()) {
  if (klonk.isMark(blue)) {
    workers.push(new Painter(klonk, blue))
  } else if (klonk.isMark(red)) {
    workers.push(new Bricklayer(klonk))
  } else {
    workers.push(new Worker(klonk))
  }
}
let total = 0
for (const worker of workers) {
  worker.shift()
  total += worker.count
}
console.log(total)
`,
        typescript: `import { Klonk, blue, red, type KlonkMarkColor } from 'klonk'

class Worker {
  protected klonk: Klonk
  count = 0

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  work() {
    this.count++
  }

  shift() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.work()
    }
  }
}

class Painter extends Worker {
  private color: KlonkMarkColor

  constructor(klonk: Klonk, color: KlonkMarkColor) {
    super(klonk)
    this.color = color
  }

  work() {
    super.work()
    this.klonk.setMark(this.color)
  }
}

class Bricklayer extends Worker {
  work() {
    super.work()
    this.klonk.turnRight()
    this.klonk.placeBrick()
    this.klonk.turnLeft()
  }
}

const workers: Worker[] = []
for (const klonk of Klonk.all()) {
  if (klonk.isMark(blue)) {
    workers.push(new Painter(klonk, blue))
  } else if (klonk.isMark(red)) {
    workers.push(new Bricklayer(klonk))
  } else {
    workers.push(new Worker(klonk))
  }
}
let total = 0
for (const worker of workers) {
  worker.shift()
  total += worker.count
}
console.log(total)
`,
        csharp: `using klonk;
using static klonk.Klonk;

var workers = new List<Worker>();
foreach (var klonk in Klonk.All())
{
    if (klonk.IsMark(Blue))
    {
        workers.Add(new Painter(klonk, Blue));
    }
    else if (klonk.IsMark(Red))
    {
        workers.Add(new Bricklayer(klonk));
    }
    else
    {
        workers.Add(new Worker(klonk));
    }
}
var total = 0;
foreach (var worker in workers)
{
    worker.Shift();
    total += worker.Count;
}
Console.WriteLine(total);

class Worker
{
    protected readonly Klonk klonk;
    public int Count { get; private set; }

    public Worker(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public virtual void Work()
    {
        Count++;
    }

    public void Shift()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            Work();
        }
    }
}

class Painter : Worker
{
    private readonly string color;

    public Painter(Klonk klonk, string color) : base(klonk)
    {
        this.color = color;
    }

    public override void Work()
    {
        base.Work();
        klonk.SetMark(color);
    }
}

class Bricklayer : Worker
{
    public Bricklayer(Klonk klonk) : base(klonk)
    {
    }

    public override void Work()
    {
        base.Work();
        klonk.TurnRight();
        klonk.PlaceBrick();
        klonk.TurnLeft();
    }
}
`,
      },
      check: { position: true, cells: true, output: 'numbers' },
      requires: ['class', 'inheritance', 'if'],
      characters: 4,
    },
  ],
}
