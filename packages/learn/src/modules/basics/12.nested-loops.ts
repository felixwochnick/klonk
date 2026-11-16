import { map } from '../../map'
import type { LearnModule } from '../../types'

/** Rasenfläche: jedes Feld mit gelber Marke („hohes Gras“), Klonk links oben mit Blick nach Osten */
const lawn = (width: number, depth: number) => map(Array.from({ length: depth }, (_, z) =>
  Array.from({ length: width }, (_, x) => (x === 0 && z === 0 ? '>y' : 'y')).join(' ')).join('\n'))

/** Leerer Raum, Klonk links oben mit Blick nach Osten */
const room = (width: number, depth: number) => map(Array.from({ length: depth }, (_, z) =>
  Array.from({ length: width }, (_, x) => (x === 0 && z === 0 ? '>' : '.')).join(' ')).join('\n'))

export const nestedLoops: LearnModule = {
  id: 'nested-loops',
  track: 'basics',
  title: { de: 'Muster und verschachtelte Schleifen', en: 'Patterns and nested loops' },
  summary: {
    de: 'Rechtecke, Treppen und Schachbretter: Muster mit Schleifen in Schleifen.',
    en: 'Rectangles, staircases and chessboards: patterns with loops inside loops.',
  },
  objectives: [
    { de: 'Wiederkehrende Muster erkennen und mit geschachtelten Schleifen umsetzen', en: 'Recognize recurring patterns and implement them with nested loops' },
    { de: 'Die Anzahl der inneren Durchläufe mit einer Variablen von Durchlauf zu Durchlauf ändern', en: 'Change the number of inner passes from pass to pass with a variable' },
    { de: 'Eine Fläche beliebiger Größe Reihe für Reihe vollständig abarbeiten', en: 'Work through an area of any size completely, row by row' },
  ],
  prerequisites: ['repeat', 'procedures', 'variables'],
  intro: {
    de: `Viele Aufgaben bestehen aus **Mustern**: Reihen, die sich wiederholen, Mauern, Treppen. Dafür schachtelst du Schleifen ineinander. Die **innere** Schleife erledigt einen Teil – etwa eine Säule –, die **äußere** wiederholt das für jeden Teil:

\`\`\`klonk
wiederhole 4 mal           // vier Säulen …
  linksDrehen
  wiederhole 3 mal         // … aus je drei Ziegeln
    hinlegen
  ende
  rechtsDrehen
  schritt
ende
\`\`\`

Bei jedem Durchlauf der äußeren Schleife läuft die innere vollständig: Hier entsteht eine Mauer aus 4 × 3 = 12 Ziegeln.

Die innere Schleife muss nicht jedes Mal gleich oft laufen. Mit einer Variablen, die die äußere Schleife verändert, wird jede Säule höher als die vorige:

\`\`\`klonk
var höhe = 1
wiederhole 4 mal
  linksDrehen
  wiederhole höhe mal
    hinlegen
  ende
  rechtsDrehen
  schritt
  höhe = höhe + 1
ende
\`\`\`

Und wenn du nicht weißt, wie groß eine Fläche ist, wird die äußere (oder innere) Schleife eine \`wiederhole solange\`-Schleife.`,
    en: `Many tasks consist of **patterns**: rows that repeat, walls, staircases. For these you nest loops inside each other. The **inner** loop does one part – such as a column –, the **outer** one repeats that for every part:

\`\`\`klonk
repeat 4 times             // four columns …
  turnLeft
  repeat 3 times           // … of three bricks each
    placeBrick
  end
  turnRight
  step
end
\`\`\`

In each pass of the outer loop the inner one runs completely: this builds a wall of 4 × 3 = 12 bricks.

The inner loop does not have to run equally often every time. With a variable that the outer loop changes, each column becomes higher than the previous one:

\`\`\`klonk
var height = 1
repeat 4 times
  turnLeft
  repeat height times
    placeBrick
  end
  turnRight
  step
  height = height + 1
end
\`\`\`

And if you do not know how big an area is, the outer (or inner) loop becomes a \`repeat while\` loop.`,
  },
  teacher: {
    de: `**Zeitbedarf:** zwei Doppelstunden.

**Voraussetzungen:** Zählschleife, bedingte Wiederholung, Verzweigung, eigene Anweisungen und Variablen. Aufgabe 3 und 4 nutzen den Sensor \`positionX\` bzw. \`positionY\` (Spalte bzw. Zeile ab 1).

**Typische Schwierigkeiten:** Was gehört in die innere, was in die äußere Schleife? Hilfreich ist es, erst **einen** Durchlauf der äußeren Schleife als Anweisungsfolge aufzuschreiben (eine Reihe, eine Stufe) und darauf zu achten, dass Klonk danach wieder so steht wie davor – nur eine Reihe bzw. ein Feld weiter. Beim Rasenmähen (Aufgabe 3) wechselt die Drehrichtung am Ende jeder Bahn; das lässt sich über die Position (\`positionX = 1\` am linken Rand), die Blickrichtung (\`schautNachOsten\`) oder eine Variable lösen. Beim Schachbrett (Aufgabe 4) scheitern Lösungen, die nur innerhalb einer Reihe abwechseln, an Räumen mit gerader Breite – deshalb wird in mehreren Welten geprüft.

**Mathematischer Bezug:** Die Treppe in Aufgabe 2 besteht aus 1 + 2 + … + n Ziegeln (Gaußsche Summenformel); das Schachbrett lässt sich über die Parität von Spalte + Zeile beschreiben (\`%\` = Rest beim Teilen).

**Differenzierung:** Schnelle Lernende bauen in Aufgabe 2 eine Pyramide (Treppe hinauf und wieder hinab) oder färben im Schachbrett auch die übrigen Felder in einer zweiten Farbe.`,
    en: `**Time needed:** two double lessons.

**Prerequisites:** Counting loop, conditional repetition, branching, procedures and variables. Tasks 3 and 4 use the sensor \`positionX\` or \`positionY\` (column or row from 1).

**Typical difficulties:** What belongs in the inner loop, what in the outer one? It helps to first write down **one** pass of the outer loop as a sequence (one row, one stair) and to make sure that Klonk afterwards stands as before – just one row or cell further. When mowing (task 3) the turning direction changes at the end of each lane; this can be solved via the position (\`positionX = 1\` at the left edge), the direction (\`isFacingEast\`) or a variable. With the chessboard (task 4), solutions that only alternate within a row fail in rooms of even width – that is why several worlds are checked.

**Link to mathematics:** The staircase in task 2 consists of 1 + 2 + … + n bricks (Gauss's sum formula); the chessboard can be described by the parity of column + row (\`%\` = remainder of division).

**Differentiation:** Fast learners build a pyramid in task 2 (staircase up and down again) or color the remaining chessboard cells in a second color.`,
  },
  tasks: [
    {
      id: 'flower-bed',
      title: { de: 'Das Beet', en: 'The flower bed' },
      text: {
        de: 'Klonk legt ein Beet an: 3 Reihen mit je 5 Feldern, jedes Feld grün markiert. Die gelben Marken zeigen die Ecken des Beets. Klonk steht in der linken oberen Ecke und schaut nach rechts; die Reihen liegen untereinander. Nutze zwei ineinander geschachtelte Schleifen. Wo Klonk am Ende steht, ist egal.',
        en: 'Klonk lays out a flower bed: 3 rows of 5 cells each, every cell marked green. The yellow marks show the corners of the bed. Klonk stands in the top left corner, facing right; the rows lie one below the other. Use two nested loops. Where Klonk ends up does not matter.',
      },
      hints: [
        { de: 'Die innere Schleife markiert eine Reihe. Danach läuft Klonk zurück an den Anfang der Reihe und eine Reihe nach unten – wie eine Schreibmaschine.', en: 'The inner loop marks one row. Then Klonk walks back to the beginning of the row and one row down – like a typewriter.' },
        { de: '`markieren(grün)` färbt auch die gelben Marken grün.', en: '`setMark(green)` also colors the yellow marks green.' },
      ],
      worlds: [map(`
        . .  . . . . .
        . >y . . . y .
        . .  . . . . .
        . y  . . . y .
        . .  . . . . .
      `)],
      solution: {
        de: `wiederhole 3 mal
  wiederhole 5 mal
    markieren(grün)
    schritt
  ende
  linksDrehen
  linksDrehen
  schritt(5)
  linksDrehen
  schritt
  linksDrehen
ende`,
        en: `repeat 3 times
  repeat 5 times
    setMark(green)
    step
  end
  turnLeft
  turnLeft
  step(5)
  turnLeft
  step
  turnLeft
end`,
      },
      check: { cells: true },
      requires: ['repeatTimes'],
    },
    {
      id: 'climb-stairs',
      title: { de: 'Treppe hinauf', en: 'Up the stairs' },
      text: {
        de: 'Klonk baut vor sich eine Treppe bis zur Wand und steigt dabei hinauf: Die erste Stufe ist 1 Ziegel hoch, jede weitere 1 Ziegel höher als die vorige. Am Ende steht Klonk oben auf der höchsten Stufe an der Wand. Die Welten sind unterschiedlich lang.',
        en: 'Klonk builds a staircase in front of itself up to the wall and climbs it at the same time: the first stair is 1 brick high, each further one 1 brick higher than the previous one. In the end Klonk stands on the highest stair at the wall. The worlds differ in length.',
      },
      hints: [
        { de: 'Klonk kann nur einen Ziegel hoch steigen. Er legt also die nächste Stufe vor sich und steigt dann hinauf.', en: 'Klonk can only climb one brick high. So it places the next stair in front of itself and then climbs up.' },
        { de: 'Merk dir die Höhe der nächsten Stufe in einer Variablen. Die innere Schleife legt so viele Ziegel, die äußere läuft, bis Klonk vor der Wand steht.', en: 'Remember the height of the next stair in a variable. The inner loop places that many bricks, the outer one runs until Klonk faces the wall.' },
      ],
      worlds: [
        map('> . . . .'),
        map('> . . . . . .'),
        map('> . .'),
        map('> . . . . .'),
      ],
      solution: {
        de: `var höhe = 0
wiederhole solange nicht istWand
  höhe = höhe + 1
  wiederhole höhe mal
    hinlegen
  ende
  schritt
ende`,
        en: `var height = 0
repeat while not isWall
  height = height + 1
  repeat height times
    placeBrick
  end
  step
end`,
      },
      check: { position: true, cells: true },
      requires: ['repeatTimes', 'repeatWhile', 'variable'],
    },
    {
      id: 'mow-the-lawn',
      title: { de: 'Rasen mähen', en: 'Mowing the lawn' },
      text: {
        de: 'Der Rasen ist hoch gewachsen (gelbe Marken). Klonk mäht ihn Bahn für Bahn: Er läuft die oberste Reihe bis zur Wand entlang, wendet, läuft die nächste Reihe zurück und so weiter, bis er alle Reihen geschafft hat. Jedes gemähte Feld markiert er grün. Klonk startet in der linken oberen Ecke mit Blick nach rechts. Die Rasenflächen sind unterschiedlich groß.',
        en: 'The lawn has grown high (yellow marks). Klonk mows it lane by lane: it walks along the top row to the wall, turns, walks back along the next row and so on until it has done all rows. It marks every mowed cell green. Klonk starts in the top left corner, facing right. The lawns differ in size.',
      },
      hints: [
        { de: 'Schreib eine Anweisung `bahn`, die eine Reihe bis zur Wand mäht. Zwischen zwei Bahnen wendet Klonk: drehen, Schritt nach unten, noch einmal gleich herum drehen.', en: 'Write a procedure `lane` that mows one row up to the wall. Between two lanes Klonk turns: turn, step down, turn the same way again.' },
        { de: 'Ob Klonk links- oder rechtsherum wenden muss, hängt davon ab, an welchem Rand er steht: Am linken Rand ist `positionX` gleich 1.', en: 'Whether Klonk has to turn left or right depends on the edge it stands at: at the left edge `positionX` equals 1.' },
      ],
      worlds: [
        lawn(4, 3),
        lawn(6, 5),
        lawn(2, 2),
        lawn(5, 4),
      ],
      solution: {
        de: `anweisung bahn
  markieren(grün)
  wiederhole solange nicht istWand
    schritt
    markieren(grün)
  ende
ende

anweisung wenden
  wenn positionX = 1 dann
    linksDrehen
  sonst
    rechtsDrehen
  ende
ende

bahn
wenden
wiederhole solange nicht istWand
  schritt
  wenden
  bahn
  wenden
ende`,
        en: `procedure lane
  setMark(green)
  repeat while not isWall
    step
    setMark(green)
  end
end

procedure turn
  if positionX = 1 then
    turnLeft
  else
    turnRight
  end
end

lane
turn
repeat while not isWall
  step
  turn
  lane
  turn
end`,
      },
      check: { cells: true },
      requires: ['repeatWhile', 'if'],
    },
    {
      id: 'chessboard',
      title: { de: 'Schachbrett', en: 'Chessboard' },
      text: {
        de: 'Klonk markiert den Boden wie ein Schachbrett: Sein Startfeld in der linken oberen Ecke bekommt eine Marke, die Nachbarfelder nicht, deren Nachbarfelder wieder und so weiter – markierte Felder berühren sich nur an den Ecken. Die Räume sind unterschiedlich groß, manche mit gerader, manche mit ungerader Breite.',
        en: 'Klonk marks the floor like a chessboard: its start cell in the top left corner gets a mark, the neighboring cells do not, their neighbors do again and so on – marked cells only touch at the corners. The rooms differ in size, some with even, some with odd width.',
      },
      hints: [
        { de: 'Den Weg durch den ganzen Raum kennst du vom Rasenmähen. Jetzt markiert Klonk nur jedes zweite Feld.', en: 'You know the way through the whole room from mowing the lawn. Now Klonk only marks every other cell.' },
        { de: 'Ein Feld wird markiert, wenn Spalte + Zeile gerade ist: `(positionX + positionY) % 2 = 0`. `%` liefert den Rest beim Teilen.', en: 'A cell is marked if column + row is even: `(positionX + positionY) % 2 = 0`. `%` gives the remainder of a division.' },
      ],
      worlds: [
        room(4, 4),
        room(5, 3),
        room(6, 5),
        room(3, 2),
      ],
      solution: {
        de: `anweisung feld
  wenn (positionX + positionY) % 2 = 0 dann
    markieren
  ende
ende

anweisung bahn
  feld
  wiederhole solange nicht istWand
    schritt
    feld
  ende
ende

anweisung wenden
  wenn positionX = 1 dann
    linksDrehen
  sonst
    rechtsDrehen
  ende
ende

bahn
wenden
wiederhole solange nicht istWand
  schritt
  wenden
  bahn
  wenden
ende`,
        en: `procedure cell
  if (positionX + positionY) % 2 = 0 then
    setMark
  end
end

procedure lane
  cell
  repeat while not isWall
    step
    cell
  end
end

procedure turn
  if positionX = 1 then
    turnLeft
  else
    turnRight
  end
end

lane
turn
repeat while not isWall
  step
  turn
  lane
  turn
end`,
      },
      check: { cells: true },
      requires: ['repeatWhile', 'if'],
    },
  ],
}
