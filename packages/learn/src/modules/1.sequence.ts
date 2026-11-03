import { map } from '../map'
import type { LearnModule } from '../types'

export const sequence: LearnModule = {
  id: 'sequence',
  title: { de: 'Erste Schritte: Anweisungen', en: 'First steps: instructions' },
  summary: {
    de: 'Klonk mit einzelnen Befehlen steuern – eine Anweisung nach der anderen.',
    en: 'Control Klonk with single commands – one instruction after the other.',
  },
  objectives: [
    { de: 'Ein Programm als Folge von Anweisungen verstehen (Sequenz)', en: 'Understand a program as a sequence of instructions' },
    { de: 'Die Befehle `schritt`, `linksDrehen`, `rechtsDrehen`, `hinlegen`, `aufheben` und `markieren` sicher verwenden', en: 'Use the commands `step`, `turnLeft`, `turnRight`, `placeBrick`, `pickBrick` and `setMark` confidently' },
    { de: 'Den Weg einer Figur vorausdenken und mit dem Einzelschritt überprüfen', en: 'Plan the path of a character ahead and check it step by step' },
  ],
  intro: {
    de: `Ein Programm ist eine Folge von **Anweisungen**. Klonk führt sie der Reihe nach aus – von oben nach unten, jede genau einmal.

\`\`\`klonk
schritt
schritt
linksDrehen
hinlegen
markieren
\`\`\`

- \`schritt\` – ein Feld vorwärts (\`schritt(3)\` geht drei Felder)
- \`linksDrehen\` / \`rechtsDrehen\` – eine Vierteldrehung
- \`hinlegen\` – einen Ziegel auf das Feld **vor** Klonk legen, \`aufheben\` nimmt ihn wieder weg
- \`markieren\` – das Feld **unter** Klonk markieren

Mit **Einzelschritt** (F10) läuft dein Programm Zeile für Zeile. So siehst du genau, was jede Anweisung bewirkt.`,
    en: `A program is a sequence of **instructions**. Klonk carries them out in order – from top to bottom, each exactly once.

\`\`\`klonk
step
step
turnLeft
placeBrick
setMark
\`\`\`

- \`step\` – one cell forward (\`step(3)\` moves three cells)
- \`turnLeft\` / \`turnRight\` – a quarter turn
- \`placeBrick\` – place a brick on the cell **in front of** Klonk, \`pickBrick\` takes it away again
- \`setMark\` – mark the cell **under** Klonk

With **Step** (F10) your program runs line by line. That way you can see exactly what each instruction does.`,
  },
  teacher: {
    de: `**Zeitbedarf:** etwa eine Doppelstunde.

**Typische Schwierigkeiten:** Links und rechts aus Sicht der Figur (nicht aus Sicht der Betrachtenden) – es hilft, die Welt zu drehen oder die Bewegung mit dem eigenen Körper nachzustellen. \`hinlegen\` und \`aufheben\` wirken auf das Feld **vor** der Figur, \`markieren\` auf das Feld **unter** ihr.

**Differenzierung:** Lernende ohne Vorerfahrung beginnen mit Blöcken und blenden über „Code anzeigen“ das erzeugte Klonk-Script ein. Schnelle Lernende lösen Aufgabe 3 mit möglichst wenigen Anweisungen und vergleichen ihre Lösungen.

**Überleitung:** Die langen Anweisungsfolgen in Aufgabe 3 und 4 motivieren das nächste Modul (Wiederholung).`,
    en: `**Time needed:** about one double lesson.

**Typical difficulties:** Left and right from the character's point of view (not the viewer's) – rotating the world or acting out the movement helps. \`placeBrick\` and \`pickBrick\` affect the cell **in front of** the character, \`setMark\` the cell **under** it.

**Differentiation:** Students without prior experience start with blocks and use “Show code” to see the generated Klonk-Script. Fast learners solve task 3 with as few instructions as possible and compare their solutions.

**Transition:** The long sequences in tasks 3 and 4 motivate the next module (repetition).`,
  },
  tasks: [
    {
      id: 'to-the-mark',
      title: { de: 'Zur Marke', en: 'To the mark' },
      text: {
        de: 'Klonk soll genau auf der gelben Marke stehen bleiben.',
        en: 'Klonk should stop exactly on the yellow mark.',
      },
      hints: [
        { de: 'Zähle die Felder bis zur Marke. Jedes `schritt` bringt Klonk ein Feld weiter.', en: 'Count the cells up to the mark. Each `step` moves Klonk one cell further.' },
      ],
      worlds: [map(`
        . . . . . .
        > . . . y .
        . . . . . .
      `)],
      solution: {
        de: 'schritt\nschritt\nschritt\nschritt',
        en: 'step\nstep\nstep\nstep',
      },
      check: { position: true },
    },
    {
      id: 'around-the-corner',
      title: { de: 'Um die Ecke', en: 'Around the corner' },
      text: {
        de: 'Der Weg zur Marke führt um eine Ecke. Bring Klonk auf die gelbe Marke – ohne gegen einen Quader zu laufen.',
        en: 'The way to the mark leads around a corner. Bring Klonk to the yellow mark – without walking into a block.',
      },
      hints: [
        { de: 'Klonk schaut nach Osten (rechts). Überlege, ob Klonk an der Ecke nach links oder nach rechts abbiegen muss – aus seiner Sicht.', en: 'Klonk faces east (right). Think about whether Klonk has to turn left or right at the corner – from its own point of view.' },
      ],
      worlds: [map(`
        > . . #
        . . . .
        . . . .
        . . y .
      `)],
      solution: {
        de: 'schritt\nschritt\nrechtsDrehen\nschritt\nschritt\nschritt',
        en: 'step\nstep\nturnRight\nstep\nstep\nstep',
      },
      check: { position: true },
    },
    {
      id: 'wall',
      title: { de: 'Eine kleine Mauer', en: 'A small wall' },
      text: {
        de: 'Lege links neben Klonks Weg eine Mauer aus drei Ziegeln – auf die drei Felder mit den gelben Marken gegenüber. Wo Klonk am Ende steht, ist egal.',
        en: 'Build a wall of three bricks to the left of Klonk\'s path – on the three cells next to the yellow marks. It does not matter where Klonk ends up.',
      },
      hints: [
        { de: '`hinlegen` legt den Ziegel vor Klonk. Klonk muss sich also erst zur Mauer drehen und danach wieder zurück.', en: '`placeBrick` puts the brick in front of Klonk. So Klonk first has to turn towards the wall and then back again.' },
      ],
      worlds: [map(`
        . . . . .
        > y y y .
      `)],
      solution: {
        de: `schritt
linksDrehen
hinlegen
rechtsDrehen
schritt
linksDrehen
hinlegen
rechtsDrehen
schritt
linksDrehen
hinlegen`,
        en: `step
turnLeft
placeBrick
turnRight
step
turnLeft
placeBrick
turnRight
step
turnLeft
placeBrick`,
      },
      check: { cells: true },
    },
    {
      id: 'tidy-up',
      title: { de: 'Aufräumen', en: 'Tidying up' },
      text: {
        de: 'Auf Klonks Weg liegen zwei Ziegel. Hebe beide auf, geh bis ans Ende des Wegs und markiere dort das Feld.',
        en: 'Two bricks lie on Klonk\'s path. Pick up both, walk to the end of the path and mark the cell there.',
      },
      hints: [
        { de: '`aufheben` nimmt den Ziegel **vor** Klonk. Stell Klonk also direkt vor den Ziegel.', en: '`pickBrick` takes the brick **in front of** Klonk. So place Klonk directly in front of the brick.' },
        { de: 'Klonk kann auch auf einen einzelnen Ziegel steigen – dann bleibt der Ziegel aber liegen.', en: 'Klonk can also climb onto a single brick – but then the brick stays where it is.' },
      ],
      worlds: [map(`
        # # # # # #
        > . 1 . 1 .
        # # # # # #
      `)],
      solution: {
        de: 'schritt\naufheben\nschritt\nschritt\naufheben\nschritt\nschritt\nmarkieren',
        en: 'step\npickBrick\nstep\nstep\npickBrick\nstep\nstep\nsetMark',
      },
      check: { position: true, cells: true },
    },
  ],
}
