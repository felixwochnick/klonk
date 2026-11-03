import { map } from '../map'
import type { LearnModule } from '../types'

export const conditions: LearnModule = {
  id: 'conditions',
  title: { de: 'Verzweigung', en: 'Branching' },
  summary: {
    de: 'Je nach Situation etwas anderes tun: wenn … dann … sonst.',
    en: 'Do something different depending on the situation: if … then … else.',
  },
  objectives: [
    { de: 'Ein- und zweiseitige Verzweigungen (`wenn … dann`, `wenn … dann … sonst`) verwenden', en: 'Use one- and two-way branches (`if … then`, `if … then … else`)' },
    { de: 'Sensoren mit Farben abfragen, z. B. `istMarke(gelb)`', en: 'Query sensors with colors, e.g. `isMark(yellow)`' },
    { de: 'Verzweigungen in Schleifen einsetzen', en: 'Use branches inside loops' },
  ],
  intro: {
    de: `Mit \`wenn\` entscheidet Klonk selbst, was zu tun ist. Die Anweisungen nach \`dann\` laufen nur, wenn die Bedingung erfüllt ist; die nach \`sonst\` nur, wenn nicht:

\`\`\`klonk
wenn istZiegel dann
  aufheben
sonst
  schritt
ende
\`\`\`

Der \`sonst\`-Teil darf fehlen. Sensoren lassen sich auch nach Farben fragen: \`istMarke(gelb)\` ist nur auf einer gelben Marke wahr, \`istZiegel(blau)\` nur, wenn obenauf ein blauer Ziegel liegt.

Steht eine Verzweigung in einer Schleife, trifft Klonk die Entscheidung bei jedem Durchlauf neu.`,
    en: `With \`if\`, Klonk decides by itself what to do. The instructions after \`then\` only run if the condition holds; those after \`else\` only if it does not:

\`\`\`klonk
if isBrick then
  pickBrick
else
  step
end
\`\`\`

The \`else\` part may be left out. Sensors can also be asked about colors: \`isMark(yellow)\` is only true on a yellow mark, \`isBrick(blue)\` only if a blue brick lies on top.

If a branch is inside a loop, Klonk makes the decision anew in each pass.`,
  },
  teacher: {
    de: `**Zeitbedarf:** ein bis zwei Doppelstunden.

**Typische Schwierigkeiten:** Die Reihenfolge von Bewegung und Abfrage in der Schleife (in Aufgabe 1 entscheidet sie, ob das letzte Feld noch bearbeitet wird). In Aufgabe 2 versuchen Lernende oft, nach \`aufheben\` sofort einen Schritt zu machen – das scheitert an Stapeln aus mehreren Ziegeln. Das Struktogramm (bzw. Programmablaufplan) zur Lösung hilft, Schleife und Verzweigung zu trennen.

**Mehrere Welten:** Wie im vorigen Modul wird jede Aufgabe in mehreren Welten geprüft; die Lösung muss also wirklich auf die Sensoren reagieren.

**Leistungsfeststellung:** Geeignet ist eine neue Welt mit kurzer Aufgabenbeschreibung, zu der ein Programm mit Schleife und Verzweigung geschrieben wird, oder das Vorhersagen des Endzustands zu einem gegebenen Programm.`,
    en: `**Time needed:** one to two double lessons.

**Typical difficulties:** The order of movement and query in the loop (in task 1 it determines whether the last cell is still processed). In task 2 students often try to take a step right after \`pickBrick\` – this fails with stacks of several bricks. A structure chart (or flowchart) of the solution helps to separate loop and branch.

**Several worlds:** As in the previous module, each task is checked in several worlds; the solution really has to react to the sensors.

**Assessment:** Suitable is a new world with a short task description for which a program with loop and branch is written, or predicting the final state for a given program.`,
  },
  tasks: [
    {
      id: 'recolor',
      title: { de: 'Marken umfärben', en: 'Recolor the marks' },
      text: {
        de: 'Auf dem Weg bis zur Wand liegen Marken in verschiedenen Farben. Mach aus jeder **gelben** Marke eine **grüne**; alle anderen Felder bleiben, wie sie sind.',
        en: 'On the way to the wall there are marks in different colors. Turn every **yellow** mark into a **green** one; all other cells stay as they are.',
      },
      hints: [
        { de: '`markieren(grün)` färbt die Marke unter Klonk grün – auch wenn dort schon eine Marke liegt.', en: '`setMark(green)` colors the mark under Klonk green – even if there is already a mark.' },
        { de: 'Klonks Startfeld ist immer leer. Mach in der Schleife zuerst den Schritt und frage dann.', en: 'Klonk\'s start cell is always empty. In the loop, first take the step and then ask.' },
      ],
      worlds: [
        map('> y . r y . y'),
        map('> . b y y . r y .'),
        map('> r . . b'),
      ],
      solution: {
        de: `wiederhole solange nicht istWand
  schritt
  wenn istMarke(gelb) dann
    markieren(grün)
  ende
ende`,
        en: `repeat while not isWall
  step
  if isMark(yellow) then
    setMark(green)
  end
end`,
      },
      check: { cells: true },
      requires: ['repeatWhile', 'if'],
    },
    {
      id: 'collect',
      title: { de: 'Ziegel einsammeln', en: 'Collect the bricks' },
      text: {
        de: 'Klonk läuft bis zur Wand und hebt dabei alle Ziegel auf, die auf dem Weg liegen. Manche Felder sind leer, auf manchen liegen mehrere Ziegel übereinander.',
        en: 'Klonk walks to the wall and picks up all the bricks lying on the way. Some cells are empty, on some several bricks are stacked.',
      },
      hints: [
        { de: 'Liegt ein Ziegel vor Klonk, hebt er ihn auf – **sonst** geht er einen Schritt.', en: 'If a brick lies in front of Klonk, it picks it up – **otherwise** it takes a step.' },
      ],
      worlds: [
        map('> 1 . 2 . 1'),
        map('> . . 3 1 . . 2'),
        map('> . 1'),
      ],
      solution: {
        de: `wiederhole solange nicht istWand
  wenn istZiegel dann
    aufheben
  sonst
    schritt
  ende
ende`,
        en: `repeat while not isWall
  if isBrick then
    pickBrick
  else
    step
  end
end`,
      },
      check: { position: true, cells: true },
      requires: ['if'],
    },
    {
      id: 'fill-gaps',
      title: { de: 'Lücken schließen', en: 'Close the gaps' },
      text: {
        de: 'Links neben Klonks Weg steht eine Mauer mit Lücken. Klonk läuft bis zur Wand und füllt jede Lücke mit einem Ziegel. Das Feld neben Klonks letztem Feld ist nie eine Lücke.',
        en: 'To the left of Klonk\'s path there is a wall with gaps. Klonk walks to the wall and fills every gap with a brick. The cell next to Klonk\'s last cell is never a gap.',
      },
      hints: [
        { de: 'Dreh Klonk zur Mauer, bevor du `istZiegel` fragst – der Sensor schaut nach vorn.', en: 'Turn Klonk towards the wall before asking `isBrick` – the sensor looks ahead.' },
      ],
      worlds: [
        map(`
          1 . 1 . . 1
          > . . . . .
        `),
        map(`
          . 1 1 . 1 1 . 1
          > . . . . . . .
        `),
        map(`
          . . 1
          > . .
        `),
      ],
      solution: {
        de: `wiederhole solange nicht istWand
  linksDrehen
  wenn nicht istZiegel dann
    hinlegen
  ende
  rechtsDrehen
  schritt
ende`,
        en: `repeat while not isWall
  turnLeft
  if not isBrick then
    placeBrick
  end
  turnRight
  step
end`,
      },
      check: { cells: true },
      requires: ['repeatWhile', 'if'],
    },
  ],
}
