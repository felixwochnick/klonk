import { map } from '../../map'
import type { LearnModule } from '../../types'

export const codeClasses: LearnModule = {
  id: 'code-classes',
  track: 'advanced',
  title: { de: 'Eigene Klassen', en: 'Your own classes' },
  summary: {
    de: 'Eigene Klassen mit Attributen, Konstruktor und Methoden schreiben – und mehrere Objekte davon unabhängig arbeiten lassen.',
    en: 'Write your own classes with attributes, a constructor and methods – and let several objects of them work independently.',
  },
  objectives: [
    { de: 'Eine Klasse mit Attributen, Konstruktor und Methoden deklarieren', en: 'Declare a class with attributes, a constructor and methods' },
    { de: 'Objekte der eigenen Klasse erzeugen und verstehen, dass jedes Objekt seinen eigenen Zustand hat', en: 'Create objects of your own class and understand that every object has its own state' },
    { de: 'Eine Beziehung „hat ein“ (Assoziation) nutzen: Ein Objekt der eigenen Klasse steuert eine Figur', en: 'Use a “has a” relationship (association): an object of your own class controls a character' },
  ],
  prerequisites: ['code-objects', 'code-lists'],
  intro: {
    de: `Bisher hast du Objekte der fertigen Klasse \`Klonk\` benutzt. Jetzt schreibst du **eigene Klassen**. Eine Klasse ist ein Bauplan: Sie legt fest, welche **Attribute** (Daten) und welche **Methoden** (Fähigkeiten) ihre Objekte haben. Der **Konstruktor** richtet jedes neue Objekt ein und gibt seinen Attributen die Startwerte.

Ein \`Builder\` hat zwei Attribute: die Figur, die er steuert, und einen Zähler für die gelegten Ziegel.

\`\`\`python
from klonk import Klonk

class Builder:
    def __init__(self, klonk):
        self.klonk = klonk
        self.bricks = 0

    def tower(self, height):
        for i in range(height):
            self.klonk.place_brick()
            self.bricks += 1

builder = Builder(Klonk())
builder.tower(3)
print(builder.bricks)
\`\`\`

\`\`\`java
import klonk.Klonk;

class Builder {
    private Klonk klonk;
    private int bricks = 0;

    Builder(Klonk klonk) {
        this.klonk = klonk;
    }

    void tower(int height) {
        for (int i = 0; i < height; i++) {
            klonk.placeBrick();
            bricks++;
        }
    }

    int getBricks() {
        return bricks;
    }
}

public class Programm {
    public static void main(String[] args) {
        Builder builder = new Builder(new Klonk());
        builder.tower(3);
        System.out.println(builder.getBricks());
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

class Builder {
  constructor(klonk) {
    this.klonk = klonk
    this.bricks = 0
  }

  tower(height) {
    for (let i = 0; i < height; i++) {
      this.klonk.placeBrick()
      this.bricks++
    }
  }
}

const builder = new Builder(new Klonk())
builder.tower(3)
console.log(builder.bricks)
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

class Builder {
  klonk: Klonk
  bricks = 0

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  tower(height: number) {
    for (let i = 0; i < height; i++) {
      this.klonk.placeBrick()
      this.bricks++
    }
  }
}

const builder = new Builder(new Klonk())
builder.tower(3)
console.log(builder.bricks)
\`\`\`

\`\`\`csharp
using klonk;

var builder = new Builder(new Klonk());
builder.Tower(3);
Console.WriteLine(builder.Bricks);

class Builder
{
    private readonly Klonk klonk;
    public int Bricks { get; private set; }

    public Builder(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public void Tower(int height)
    {
        for (var i = 0; i < height; i++)
        {
            klonk.PlaceBrick();
            Bricks++;
        }
    }
}
\`\`\`

Innerhalb der Klasse meint \`self\` (Python) bzw. \`this\` das Objekt, dessen Methode gerade läuft. Der Konstruktor heißt in Python \`__init__\`, in JavaScript und TypeScript \`constructor\`, in Java und C# wie die Klasse. Jedes Objekt hat **eigene** Attributwerte: Erzeugst du zwei Builder, zählt jeder nur seine eigenen Ziegel. In Java und C# sind die Attribute \`private\` – von außen liest man den Zähler über die Methode \`getBricks()\` bzw. die Eigenschaft \`Bricks\`.

Ein Builder **hat eine** Figur: Im Klassendiagramm ist das eine Assoziation von \`Builder\` zu \`Klonk\`. Öffnest du dein Programm unter **Programmieren**, zeichnet Klonk das Klassendiagramm im Tab **Diagramm** aus deinem Code.`,
    en: `So far you have used objects of the ready-made class \`Klonk\`. Now you write **your own classes**. A class is a blueprint: it defines which **attributes** (data) and which **methods** (abilities) its objects have. The **constructor** sets up every new object and gives its attributes their initial values.

A \`Builder\` has two attributes: the character it controls and a counter for the bricks it has placed.

\`\`\`python
from klonk import Klonk

class Builder:
    def __init__(self, klonk):
        self.klonk = klonk
        self.bricks = 0

    def tower(self, height):
        for i in range(height):
            self.klonk.place_brick()
            self.bricks += 1

builder = Builder(Klonk())
builder.tower(3)
print(builder.bricks)
\`\`\`

\`\`\`java
import klonk.Klonk;

class Builder {
    private Klonk klonk;
    private int bricks = 0;

    Builder(Klonk klonk) {
        this.klonk = klonk;
    }

    void tower(int height) {
        for (int i = 0; i < height; i++) {
            klonk.placeBrick();
            bricks++;
        }
    }

    int getBricks() {
        return bricks;
    }
}

public class Program {
    public static void main(String[] args) {
        Builder builder = new Builder(new Klonk());
        builder.tower(3);
        System.out.println(builder.getBricks());
    }
}
\`\`\`

\`\`\`javascript
import { Klonk } from 'klonk'

class Builder {
  constructor(klonk) {
    this.klonk = klonk
    this.bricks = 0
  }

  tower(height) {
    for (let i = 0; i < height; i++) {
      this.klonk.placeBrick()
      this.bricks++
    }
  }
}

const builder = new Builder(new Klonk())
builder.tower(3)
console.log(builder.bricks)
\`\`\`

\`\`\`typescript
import { Klonk } from 'klonk'

class Builder {
  klonk: Klonk
  bricks = 0

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  tower(height: number) {
    for (let i = 0; i < height; i++) {
      this.klonk.placeBrick()
      this.bricks++
    }
  }
}

const builder = new Builder(new Klonk())
builder.tower(3)
console.log(builder.bricks)
\`\`\`

\`\`\`csharp
using klonk;

var builder = new Builder(new Klonk());
builder.Tower(3);
Console.WriteLine(builder.Bricks);

class Builder
{
    private readonly Klonk klonk;
    public int Bricks { get; private set; }

    public Builder(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public void Tower(int height)
    {
        for (var i = 0; i < height; i++)
        {
            klonk.PlaceBrick();
            Bricks++;
        }
    }
}
\`\`\`

Inside the class, \`self\` (Python) or \`this\` means the object whose method is currently running. The constructor is called \`__init__\` in Python, \`constructor\` in JavaScript and TypeScript, and has the name of the class in Java and C#. Every object has **its own** attribute values: if you create two builders, each one counts only its own bricks. In Java and C# the attributes are \`private\` – from outside you read the counter with the method \`getBricks()\` or the property \`Bricks\`.

A builder **has a** character: in the class diagram this is an association from \`Builder\` to \`Klonk\`. If you open your program under **Code**, Klonk draws the class diagram from your code in the **Diagram** tab.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** Die Lernenden steuern mehrere Figuren als Objekte (F4), verwalten Objekte in Listen (F5) und schreiben Methoden mit Parametern und Rückgabewert (F3).

**Begriffe:** Klasse und Objekt (Instanz), Attribut, Methode, Konstruktor, Zustand eines Objekts, Datenkapselung. Der \`Builder\` *hat eine* Figur – eine Assoziation, keine Vererbung: Er ist selbst keine Figur, sondern steuert eine. Diese Abgrenzung bereitet F7 (Vererbung) vor. Aufgabe 3 zeigt zudem, dass zwei Variablen auf dieselbe Figur verweisen können (Referenzen).

**Diagramme:** Unter **Programmieren** zeichnet Klonk im Tab **Diagramm** das Klassendiagramm (UML) direkt aus dem Code, einschließlich der Assoziation zur Bibliotheksklasse \`Klonk\`. Setzt man einen Haltepunkt, zeigt das Objektdiagramm die einzelnen Objekte mit ihren Attributwerten – in Aufgabe 2 sieht man so, dass beide Builder getrennt zählen.

**Typische Schwierigkeiten:**
- Python: \`self\` fehlt als erster Parameter einer Methode, oder Attribute werden ohne \`self.\` angesprochen – dann entsteht eine lokale Variable, und der Zähler bleibt 0.
- JavaScript und TypeScript: \`this.\` vor Attributen vergessen. In TypeScript müssen Attribute mit ihrem Typ deklariert werden.
- Java und C#: Der Konstruktor hat keinen Rückgabetyp. Heißt der Parameter wie das Attribut, ist \`this.klonk = klonk\` nötig. Weitere Klassen stehen in Java ohne \`public\` in derselben Datei, in C# nach den Anweisungen des Hauptprogramms.
- Python und JavaScript: Die Klasse muss im Programm vor ihrer ersten Verwendung stehen.
- Der Zähler wird im Konstruktor auf seinen Startwert gesetzt, nicht in der Methode – sonst beginnt er bei jedem Aufruf neu.

**Datenkapselung:** Die Musterlösungen in Java und C# machen Attribute \`private\` und bieten zum Lesen eine Methode \`getBricks()\` bzw. eine Eigenschaft mit privatem Setter. In Python und JavaScript sind Attribute öffentlich; ein Unterstrich (\`_bricks\`) kennzeichnet sie nur als intern, in JavaScript macht \`#\` sie privat. Wie streng die Kapselung gehandhabt wird, entscheidet die Lehrkraft – die Prüfung bewertet nur die Welt und die Ausgabe.

**Differenzierung:** Schnelle Lernende ergänzen den Builder um eine Methode, die einen Turm wieder abbaut und den Zähler verringert, oder zeichnen das Klassendiagramm vorab von Hand und vergleichen es mit dem von Klonk erzeugten. Aufgabe 4 verbindet Klassen mit Listen und eignet sich als Abschluss oder Hausaufgabe.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** Students control several characters as objects (F4), manage objects in lists (F5) and write methods with parameters and return values (F3).

**Concepts:** class and object (instance), attribute, method, constructor, state of an object, encapsulation. The \`Builder\` *has a* character – an association, not inheritance: it is not a character itself but controls one. This distinction prepares F7 (inheritance). Task 3 also shows that two variables can refer to the same character (references).

**Diagrams:** Under **Code**, the **Diagram** tab shows the UML class diagram generated directly from the code, including the association to the library class \`Klonk\`. With a breakpoint, the object diagram shows the individual objects with their attribute values – in task 2 this makes visible that both builders count separately.

**Typical difficulties:**
- Python: \`self\` is missing as the first parameter of a method, or attributes are used without \`self.\` – this creates a local variable and the counter stays 0.
- JavaScript and TypeScript: \`this.\` is forgotten in front of attributes. In TypeScript, attributes have to be declared with their type.
- Java and C#: The constructor has no return type. If the parameter has the same name as the attribute, \`this.klonk = klonk\` is needed. Further classes are written without \`public\` in the same file in Java, and after the statements of the main program in C#.
- Python and JavaScript: The class has to come before its first use in the program.
- The counter gets its initial value in the constructor, not in the method – otherwise it starts again with every call.

**Encapsulation:** The sample solutions in Java and C# make attributes \`private\` and offer a method \`getBricks()\` or a property with a private setter for reading. In Python and JavaScript, attributes are public; an underscore (\`_bricks\`) only marks them as internal, in JavaScript \`#\` makes them private. How strictly encapsulation is handled is up to the teacher – the check only evaluates the world and the output.

**Differentiation:** Fast learners add a method to the builder that takes a tower down again and decreases the counter, or draw the class diagram by hand first and compare it with the one generated by Klonk. Task 4 combines classes with lists and is suitable as a conclusion or homework.`,
  },
  tasks: [
    {
      id: 'towers',
      title: { de: 'Türme ringsum', en: 'Towers all around' },
      text: {
        de: 'Schreibe eine Klasse `Builder`. Ein Builder steuert eine Figur und zählt in einem Attribut, wie viele Ziegel er gelegt hat. Seine Methode `tower(height)` baut vor der Figur einen Turm der Höhe `height` und dreht die Figur danach nach rechts.\n\nLass Klonk als Builder ringsum vier Türme bauen – zuerst einen der Höhe 1, dann 2, 3 und 4. Gib zum Schluss aus, wie viele Ziegel der Builder insgesamt gelegt hat.',
        en: 'Write a class `Builder`. A builder controls a character and counts in an attribute how many bricks it has placed. Its method `tower(height)` builds a tower of height `height` in front of the character and then turns the character to the right.\n\nLet Klonk build four towers all around as a builder – first one of height 1, then 2, 3 and 4. At the end, output how many bricks the builder has placed in total.',
      },
      hints: [
        { de: 'Den Zähler setzt der Konstruktor auf 0. `tower` erhöht ihn mit jedem Ziegel um 1.', en: 'The constructor sets the counter to 0. `tower` increases it by 1 with every brick.' },
        {
          de: 'Die vier Türme baut eine Zählschleife im Hauptprogramm:\n\n```python\nfor height in range(1, 5):\n    builder.tower(height)\n```\n\n```java\nfor (int height = 1; height <= 4; height++) {\n    builder.tower(height);\n}\n```\n\n```javascript\nfor (let height = 1; height <= 4; height++) {\n  builder.tower(height)\n}\n```\n\n```csharp\nfor (var height = 1; height <= 4; height++)\n{\n    builder.Tower(height);\n}\n```',
          en: 'A counting loop in the main program builds the four towers:\n\n```python\nfor height in range(1, 5):\n    builder.tower(height)\n```\n\n```java\nfor (int height = 1; height <= 4; height++) {\n    builder.tower(height);\n}\n```\n\n```javascript\nfor (let height = 1; height <= 4; height++) {\n  builder.tower(height)\n}\n```\n\n```csharp\nfor (var height = 1; height <= 4; height++)\n{\n    builder.Tower(height);\n}\n```',
        },
      ],
      worlds: [map(`
        . . .
        . v .
        . . .
      `)],
      solutions: {
        python: `from klonk import Klonk

class Builder:
    def __init__(self, klonk):
        self.klonk = klonk
        self.bricks = 0

    def tower(self, height):
        for i in range(height):
            self.klonk.place_brick()
            self.bricks += 1
        self.klonk.turn_right()

builder = Builder(Klonk())
for height in range(1, 5):
    builder.tower(height)
print(builder.bricks)
`,
        java: `import klonk.Klonk;

class Builder {
    private Klonk klonk;
    private int bricks = 0;

    Builder(Klonk klonk) {
        this.klonk = klonk;
    }

    void tower(int height) {
        for (int i = 0; i < height; i++) {
            klonk.placeBrick();
            bricks++;
        }
        klonk.turnRight();
    }

    int getBricks() {
        return bricks;
    }
}

public class Program {
    public static void main(String[] args) {
        Builder builder = new Builder(new Klonk());
        for (int height = 1; height <= 4; height++) {
            builder.tower(height);
        }
        System.out.println(builder.getBricks());
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

class Builder {
  constructor(klonk) {
    this.klonk = klonk
    this.bricks = 0
  }

  tower(height) {
    for (let i = 0; i < height; i++) {
      this.klonk.placeBrick()
      this.bricks++
    }
    this.klonk.turnRight()
  }
}

const builder = new Builder(new Klonk())
for (let height = 1; height <= 4; height++) {
  builder.tower(height)
}
console.log(builder.bricks)
`,
        typescript: `import { Klonk } from 'klonk'

class Builder {
  klonk: Klonk
  bricks = 0

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  tower(height: number) {
    for (let i = 0; i < height; i++) {
      this.klonk.placeBrick()
      this.bricks++
    }
    this.klonk.turnRight()
  }
}

const builder = new Builder(new Klonk())
for (let height = 1; height <= 4; height++) {
  builder.tower(height)
}
console.log(builder.bricks)
`,
        csharp: `using klonk;

var builder = new Builder(new Klonk());
for (var height = 1; height <= 4; height++)
{
    builder.Tower(height);
}
Console.WriteLine(builder.Bricks);

class Builder
{
    private readonly Klonk klonk;
    public int Bricks { get; private set; }

    public Builder(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public void Tower(int height)
    {
        for (var i = 0; i < height; i++)
        {
            klonk.PlaceBrick();
            Bricks++;
        }
        klonk.TurnRight();
    }
}
`,
      },
      check: { cells: true, output: 'numbers' },
      requires: ['class'],
    },
    {
      id: 'two-builders',
      title: { de: 'Zwei Bauleute', en: 'Two builders' },
      text: {
        de: 'Klara und Ben bekommen je einen eigenen Builder. Ändere deine Klasse so:\n\n- Der Konstruktor bekommt zusätzlich die Farbe der Ziegel und speichert sie in einem Attribut.\n- Die Methode `wall()` lässt die Figur bis zur Wand laufen. Nach jedem Schritt legt sie rechts neben sich einen Ziegel in ihrer Farbe.\n\nKlara baut eine rote Mauer, Ben eine blaue. Gib danach aus, wie viele Ziegel Klara gelegt hat, und dann, wie viele Ben gelegt hat.',
        en: 'Klara and Ben each get a builder of their own. Change your class like this:\n\n- The constructor also receives the colour of the bricks and stores it in an attribute.\n- The method `wall()` makes the character walk to the wall. After each step it places a brick in its colour to its right.\n\nKlara builds a red wall, Ben a blue one. Then output how many bricks Klara has placed, and then how many Ben has placed.',
      },
      hints: [
        { de: 'Rechts neben sich: nach rechts drehen, Ziegel legen, wieder nach links drehen.', en: 'To its right: turn right, place a brick, turn left again.' },
        {
          de: 'Beide Objekte entstehen aus derselben Klasse, haben aber eigene Attribute:\n\n```python\nklara = Builder(Klonk("Klara"), red)\nben = Builder(Klonk("Ben"), blue)\n```\n\n```java\nBuilder klara = new Builder(new Klonk("Klara"), RED);\nBuilder ben = new Builder(new Klonk("Ben"), BLUE);\n```\n\n```javascript\nconst klara = new Builder(new Klonk(\'Klara\'), red)\nconst ben = new Builder(new Klonk(\'Ben\'), blue)\n```\n\n```csharp\nvar klara = new Builder(new Klonk("Klara"), Red);\nvar ben = new Builder(new Klonk("Ben"), Blue);\n```',
          en: 'Both objects are created from the same class but have their own attributes:\n\n```python\nklara = Builder(Klonk("Klara"), red)\nben = Builder(Klonk("Ben"), blue)\n```\n\n```java\nBuilder klara = new Builder(new Klonk("Klara"), RED);\nBuilder ben = new Builder(new Klonk("Ben"), BLUE);\n```\n\n```javascript\nconst klara = new Builder(new Klonk(\'Klara\'), red)\nconst ben = new Builder(new Klonk(\'Ben\'), blue)\n```\n\n```csharp\nvar klara = new Builder(new Klonk("Klara"), Red);\nvar ben = new Builder(new Klonk("Ben"), Blue);\n```',
        },
      ],
      worlds: [
        map(`
          > . . . # . .
          . . . . . . .
          > . . . . . .
          . . . . . . .
        `, { names: ['Klara', 'Ben'] }),
        map(`
          > . . . . . . . .
          . . . . . . . . .
          > . # . . . . . .
          . . . . . . . . .
        `, { names: ['Klara', 'Ben'] }),
        map(`
          > . . . .
          . . . . .
          > . . # .
          . . . . .
        `, { names: ['Ben', 'Klara'] }),
      ],
      solutions: {
        python: `from klonk import Klonk, red, blue

class Builder:
    def __init__(self, klonk, color):
        self.klonk = klonk
        self.color = color
        self.bricks = 0

    def wall(self):
        while not self.klonk.is_wall():
            self.klonk.step()
            self.klonk.turn_right()
            self.klonk.place_brick(self.color)
            self.klonk.turn_left()
            self.bricks += 1

klara = Builder(Klonk("Klara"), red)
ben = Builder(Klonk("Ben"), blue)
klara.wall()
ben.wall()
print("Klara:", klara.bricks)
print("Ben:", ben.bricks)
`,
        java: `import klonk.Klonk;
import static klonk.Klonk.*;

class Builder {
    private Klonk klonk;
    private String color;
    private int bricks = 0;

    Builder(Klonk klonk, String color) {
        this.klonk = klonk;
        this.color = color;
    }

    void wall() {
        while (!klonk.isWall()) {
            klonk.step();
            klonk.turnRight();
            klonk.placeBrick(color);
            klonk.turnLeft();
            bricks++;
        }
    }

    int getBricks() {
        return bricks;
    }
}

public class Program {
    public static void main(String[] args) {
        Builder klara = new Builder(new Klonk("Klara"), RED);
        Builder ben = new Builder(new Klonk("Ben"), BLUE);
        klara.wall();
        ben.wall();
        System.out.println("Klara: " + klara.getBricks());
        System.out.println("Ben: " + ben.getBricks());
    }
}
`,
        javascript: `import { Klonk, red, blue } from 'klonk'

class Builder {
  constructor(klonk, color) {
    this.klonk = klonk
    this.color = color
    this.bricks = 0
  }

  wall() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.klonk.turnRight()
      this.klonk.placeBrick(this.color)
      this.klonk.turnLeft()
      this.bricks++
    }
  }
}

const klara = new Builder(new Klonk('Klara'), red)
const ben = new Builder(new Klonk('Ben'), blue)
klara.wall()
ben.wall()
console.log('Klara:', klara.bricks)
console.log('Ben:', ben.bricks)
`,
        typescript: `import { Klonk, red, blue, type KlonkColor } from 'klonk'

class Builder {
  klonk: Klonk
  color: KlonkColor
  bricks = 0

  constructor(klonk: Klonk, color: KlonkColor) {
    this.klonk = klonk
    this.color = color
  }

  wall() {
    while (!this.klonk.isWall()) {
      this.klonk.step()
      this.klonk.turnRight()
      this.klonk.placeBrick(this.color)
      this.klonk.turnLeft()
      this.bricks++
    }
  }
}

const klara = new Builder(new Klonk('Klara'), red)
const ben = new Builder(new Klonk('Ben'), blue)
klara.wall()
ben.wall()
console.log('Klara:', klara.bricks)
console.log('Ben:', ben.bricks)
`,
        csharp: `using klonk;
using static klonk.Klonk;

var klara = new Builder(new Klonk("Klara"), Red);
var ben = new Builder(new Klonk("Ben"), Blue);
klara.Wall();
ben.Wall();
Console.WriteLine("Klara: " + klara.Bricks);
Console.WriteLine("Ben: " + ben.Bricks);

class Builder
{
    private readonly Klonk klonk;
    private readonly string color;
    public int Bricks { get; private set; }

    public Builder(Klonk klonk, string color)
    {
        this.klonk = klonk;
        this.color = color;
    }

    public void Wall()
    {
        while (!klonk.IsWall())
        {
            klonk.Step();
            klonk.TurnRight();
            klonk.PlaceBrick(color);
            klonk.TurnLeft();
            Bricks++;
        }
    }
}
`,
      },
      check: { cells: true, output: 'numbers' },
      requires: ['class'],
      characters: 2,
    },
    {
      id: 'carrier',
      title: { de: 'Ziegel einsammeln', en: 'Collecting bricks' },
      text: {
        de: 'Auf Klonks Weg zur Wand liegen Ziegelstapel. Schreibe eine Klasse `Carrier` (Träger), die sich in einem Attribut merkt, wie viele Ziegel ihre Figur gerade trägt:\n\n- `collect()` hebt alle Ziegel vor der Figur auf.\n- `unload()` legt alle getragenen Ziegel vor der Figur ab.\n\nKlonk sammelt auf dem Weg zur Wand alle Ziegel ein. An der Wand dreht er sich um, gibt aus, wie viele Ziegel er trägt, und baut aus ihnen einen Turm vor sich.',
        en: 'There are stacks of bricks on Klonk\'s way to the wall. Write a class `Carrier` that remembers in an attribute how many bricks its character is carrying:\n\n- `collect()` picks up all bricks in front of the character.\n- `unload()` places all carried bricks in front of the character.\n\nOn its way to the wall, Klonk collects all the bricks. At the wall it turns around, outputs how many bricks it is carrying and builds a tower out of them in front of itself.',
      },
      hints: [
        { de: 'Bevor Klonk einen Schritt macht, sammelt er ein – so ist das Feld vor ihm immer frei.', en: 'Before Klonk takes a step, it collects – this way the cell in front of it is always clear.' },
        { de: '`collect()` erhöht den Zähler mit jedem aufgehobenen Ziegel, `unload()` verringert ihn mit jedem abgelegten, bis er wieder 0 ist. Zum Laufen kannst du die Figur auch direkt steuern: Die Variable im Hauptprogramm und das Attribut des Carriers verweisen auf dieselbe Figur.', en: '`collect()` increases the counter with every brick picked up, `unload()` decreases it with every brick placed until it is 0 again. For walking you can also control the character directly: the variable in the main program and the attribute of the carrier refer to the same character.' },
      ],
      worlds: [
        map('> 1 . 2 . 1'),
        map('> 2 2 . 1 . . 1'),
        map('> . 3'),
        map('> 1 1 # .'),
      ],
      solutions: {
        python: `from klonk import Klonk

class Carrier:
    def __init__(self, klonk):
        self.klonk = klonk
        self.load = 0

    def collect(self):
        while self.klonk.is_brick():
            self.klonk.pick_brick()
            self.load += 1

    def unload(self):
        while self.load > 0:
            self.klonk.place_brick()
            self.load -= 1

klonk = Klonk()
carrier = Carrier(klonk)
while not klonk.is_wall():
    carrier.collect()
    klonk.step()
klonk.turn_left()
klonk.turn_left()
print(carrier.load)
carrier.unload()
`,
        java: `import klonk.Klonk;

class Carrier {
    private Klonk klonk;
    private int load = 0;

    Carrier(Klonk klonk) {
        this.klonk = klonk;
    }

    void collect() {
        while (klonk.isBrick()) {
            klonk.pickBrick();
            load++;
        }
    }

    void unload() {
        while (load > 0) {
            klonk.placeBrick();
            load--;
        }
    }

    int getLoad() {
        return load;
    }
}

public class Program {
    public static void main(String[] args) {
        Klonk klonk = new Klonk();
        Carrier carrier = new Carrier(klonk);
        while (!klonk.isWall()) {
            carrier.collect();
            klonk.step();
        }
        klonk.turnLeft();
        klonk.turnLeft();
        System.out.println(carrier.getLoad());
        carrier.unload();
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

class Carrier {
  constructor(klonk) {
    this.klonk = klonk
    this.load = 0
  }

  collect() {
    while (this.klonk.isBrick()) {
      this.klonk.pickBrick()
      this.load++
    }
  }

  unload() {
    while (this.load > 0) {
      this.klonk.placeBrick()
      this.load--
    }
  }
}

const klonk = new Klonk()
const carrier = new Carrier(klonk)
while (!klonk.isWall()) {
  carrier.collect()
  klonk.step()
}
klonk.turnLeft()
klonk.turnLeft()
console.log(carrier.load)
carrier.unload()
`,
        typescript: `import { Klonk } from 'klonk'

class Carrier {
  klonk: Klonk
  load = 0

  constructor(klonk: Klonk) {
    this.klonk = klonk
  }

  collect() {
    while (this.klonk.isBrick()) {
      this.klonk.pickBrick()
      this.load++
    }
  }

  unload() {
    while (this.load > 0) {
      this.klonk.placeBrick()
      this.load--
    }
  }
}

const klonk = new Klonk()
const carrier = new Carrier(klonk)
while (!klonk.isWall()) {
  carrier.collect()
  klonk.step()
}
klonk.turnLeft()
klonk.turnLeft()
console.log(carrier.load)
carrier.unload()
`,
        csharp: `using klonk;

var klonk = new Klonk();
var carrier = new Carrier(klonk);
while (!klonk.IsWall())
{
    carrier.Collect();
    klonk.Step();
}
klonk.TurnLeft();
klonk.TurnLeft();
Console.WriteLine(carrier.Load);
carrier.Unload();

class Carrier
{
    private readonly Klonk klonk;
    public int Load { get; private set; }

    public Carrier(Klonk klonk)
    {
        this.klonk = klonk;
    }

    public void Collect()
    {
        while (klonk.IsBrick())
        {
            klonk.PickBrick();
            Load++;
        }
    }

    public void Unload()
    {
        while (Load > 0)
        {
            klonk.PlaceBrick();
            Load--;
        }
    }
}
`,
      },
      check: { position: true, cells: true, output: 'numbers' },
      requires: ['class', 'loop'],
    },
    {
      id: 'crew',
      title: { de: 'Die ganze Mannschaft', en: 'The whole crew' },
      text: {
        de: 'Alle Figuren der Welt bauen Mauern – wie viele Figuren es gibt, ist in jeder Welt anders. Jeder Builder bekommt beim Erzeugen einen **Vorrat von 5 Ziegeln**. Seine Methode `wall()` lässt die Figur wie in Aufgabe 2 laufen und nach jedem Schritt rechts neben sich einen (roten) Ziegel legen. Sie hört auf, sobald die Wand erreicht oder der Vorrat aufgebraucht ist.\n\nErzeuge für jede Figur aus `Klonk.all()` einen Builder und speichere alle in einer Liste. Lass dann jeden Builder seine Mauer bauen und gib zum Schluss für jeden – in derselben Reihenfolge – aus, wie viele Ziegel ihm übrig geblieben sind.',
        en: 'All characters in the world build walls – how many characters there are differs in each world. Every builder gets a **supply of 5 bricks** when it is created. Its method `wall()` makes the character walk as in task 2 and place a (red) brick to its right after each step. It stops as soon as the wall is reached or the supply is used up.\n\nCreate a builder for each character from `Klonk.all()` and store all of them in a list. Then let every builder build its wall and finally output for each one – in the same order – how many bricks it has left.',
      },
      hints: [
        { de: 'Die Schleife in `wall()` braucht zwei Bedingungen: Vorrat größer als 0 **und** keine Wand (Python `and`, sonst `&&`).', en: 'The loop in `wall()` needs two conditions: supply greater than 0 **and** no wall (Python `and`, otherwise `&&`).' },
        {
          de: 'Für jede Figur ein Builder in der Liste:\n\n```python\nbuilders = []\nfor klonk in Klonk.all():\n    builders.append(Builder(klonk, 5))\n```\n\n```java\nArrayList<Builder> builders = new ArrayList<>();\nfor (Klonk klonk : Klonk.all()) {\n    builders.add(new Builder(klonk, 5));\n}\n```\n\n```javascript\nconst builders = []\nfor (const klonk of Klonk.all()) {\n  builders.push(new Builder(klonk, 5))\n}\n```\n\n```csharp\nvar builders = new List<Builder>();\nforeach (var klonk in Klonk.All())\n{\n    builders.Add(new Builder(klonk, 5));\n}\n```',
          en: 'One builder in the list for each character:\n\n```python\nbuilders = []\nfor klonk in Klonk.all():\n    builders.append(Builder(klonk, 5))\n```\n\n```java\nArrayList<Builder> builders = new ArrayList<>();\nfor (Klonk klonk : Klonk.all()) {\n    builders.add(new Builder(klonk, 5));\n}\n```\n\n```javascript\nconst builders = []\nfor (const klonk of Klonk.all()) {\n  builders.push(new Builder(klonk, 5))\n}\n```\n\n```csharp\nvar builders = new List<Builder>();\nforeach (var klonk in Klonk.All())\n{\n    builders.Add(new Builder(klonk, 5));\n}\n```',
        },
      ],
      worlds: [
        map(`
          > . . . . . . . .
          . . . . . . . . .
          > . . # . . . . .
          . . . . . . . . .
        `, { names: ['Klara', 'Ben'] }),
        map(`
          > . . . # . .
          . . . . . . .
          > . . . . . .
          . . . . . . .
          > . . . . # .
          . . . . . . .
        `, { names: ['Klara', 'Ben', 'Kim'] }),
        map(`
          > . . . . .
          . . . . . .
          > # . . . .
          . . . . . .
          > . . . . .
          . . . . . .
          > . . # . .
          . . . . . .
        `, { names: ['Lea', 'Tom', 'Kim', 'Ben'] }),
      ],
      solutions: {
        python: `from klonk import Klonk

class Builder:
    def __init__(self, klonk, stock):
        self.klonk = klonk
        self.stock = stock

    def wall(self):
        while self.stock > 0 and not self.klonk.is_wall():
            self.klonk.step()
            self.klonk.turn_right()
            self.klonk.place_brick()
            self.klonk.turn_left()
            self.stock -= 1

builders = []
for klonk in Klonk.all():
    builders.append(Builder(klonk, 5))
for builder in builders:
    builder.wall()
for builder in builders:
    print(builder.stock)
`,
        java: `import klonk.Klonk;
import java.util.ArrayList;

class Builder {
    private Klonk klonk;
    private int stock;

    Builder(Klonk klonk, int stock) {
        this.klonk = klonk;
        this.stock = stock;
    }

    void wall() {
        while (stock > 0 && !klonk.isWall()) {
            klonk.step();
            klonk.turnRight();
            klonk.placeBrick();
            klonk.turnLeft();
            stock--;
        }
    }

    int getStock() {
        return stock;
    }
}

public class Program {
    public static void main(String[] args) {
        ArrayList<Builder> builders = new ArrayList<>();
        for (Klonk klonk : Klonk.all()) {
            builders.add(new Builder(klonk, 5));
        }
        for (Builder builder : builders) {
            builder.wall();
        }
        for (Builder builder : builders) {
            System.out.println(builder.getStock());
        }
    }
}
`,
        javascript: `import { Klonk } from 'klonk'

class Builder {
  constructor(klonk, stock) {
    this.klonk = klonk
    this.stock = stock
  }

  wall() {
    while (this.stock > 0 && !this.klonk.isWall()) {
      this.klonk.step()
      this.klonk.turnRight()
      this.klonk.placeBrick()
      this.klonk.turnLeft()
      this.stock--
    }
  }
}

const builders = []
for (const klonk of Klonk.all()) {
  builders.push(new Builder(klonk, 5))
}
for (const builder of builders) {
  builder.wall()
}
for (const builder of builders) {
  console.log(builder.stock)
}
`,
        typescript: `import { Klonk } from 'klonk'

class Builder {
  klonk: Klonk
  stock: number

  constructor(klonk: Klonk, stock: number) {
    this.klonk = klonk
    this.stock = stock
  }

  wall() {
    while (this.stock > 0 && !this.klonk.isWall()) {
      this.klonk.step()
      this.klonk.turnRight()
      this.klonk.placeBrick()
      this.klonk.turnLeft()
      this.stock--
    }
  }
}

const builders: Builder[] = []
for (const klonk of Klonk.all()) {
  builders.push(new Builder(klonk, 5))
}
for (const builder of builders) {
  builder.wall()
}
for (const builder of builders) {
  console.log(builder.stock)
}
`,
        csharp: `using klonk;

var builders = new List<Builder>();
foreach (var klonk in Klonk.All())
{
    builders.Add(new Builder(klonk, 5));
}
foreach (var builder in builders)
{
    builder.Wall();
}
foreach (var builder in builders)
{
    Console.WriteLine(builder.Stock);
}

class Builder
{
    private readonly Klonk klonk;
    public int Stock { get; private set; }

    public Builder(Klonk klonk, int stock)
    {
        this.klonk = klonk;
        Stock = stock;
    }

    public void Wall()
    {
        while (Stock > 0 && !klonk.IsWall())
        {
            klonk.Step();
            klonk.TurnRight();
            klonk.PlaceBrick();
            klonk.TurnLeft();
            Stock--;
        }
    }
}
`,
      },
      check: { position: true, cells: true, output: 'numbers' },
      requires: ['class', 'loop'],
      characters: 4,
    },
  ],
}
