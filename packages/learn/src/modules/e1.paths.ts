import { map } from '../map'
import type { LearnModule } from '../types'

/** Einstieg (Grundschule, Förderschule): Wege auf einer 3×3-Platte – alle Welten lassen sich drucken und nachbauen */
export const paths: LearnModule = {
  id: 'paths',
  track: 'start',
  title: { de: 'Wege finden', en: 'Finding the way' },
  summary: {
    de: 'Klonk Schritt für Schritt zum Ziel führen – links, rechts und geradeaus.',
    en: 'Guide Klonk to the goal step by step – left, right and straight ahead.',
  },
  objectives: [
    { de: 'Einen Weg in einzelne Schritte zerlegen', en: 'Break a path down into single steps' },
    { de: 'Links und rechts aus Sicht der Figur unterscheiden', en: 'Tell left from right from the character\'s point of view' },
    { de: 'Befehle in der richtigen Reihenfolge geben (`schritt`, `linksDrehen`, `rechtsDrehen`, `markieren`)', en: 'Give commands in the right order (`step`, `turnLeft`, `turnRight`, `setMark`)' },
  ],
  intro: {
    de: `Klonk macht genau das, was du sagst – nicht mehr und nicht weniger.

\`\`\`klonk
schritt
linksDrehen
schritt
\`\`\`

- \`schritt\` – Klonk geht ein Feld nach vorne
- \`linksDrehen\` – Klonk dreht sich nach links
- \`rechtsDrehen\` – Klonk dreht sich nach rechts
- \`markieren\` – Klonk malt das Feld unter sich gelb an

**Wichtig:** Links und rechts sind immer aus Klonks Sicht. Stell dich hinter Klonk – oder dreh die Welt, bis du Klonk von hinten siehst.`,
    en: `Klonk does exactly what you say – no more and no less.

\`\`\`klonk
step
turnLeft
step
\`\`\`

- \`step\` – Klonk moves one cell forward
- \`turnLeft\` – Klonk turns to the left
- \`turnRight\` – Klonk turns to the right
- \`setMark\` – Klonk paints the cell below it yellow

**Important:** Left and right are always from Klonk's point of view. Stand behind Klonk – or rotate the world until you see Klonk from behind.`,
  },
  teacher: {
    de: `**Zielgruppe:** Grundschule (Mathematik 1/2, *Sich im Raum orientieren*), Förderschule (Einstieg *Programmieren*), Unterstufe ohne Vorerfahrung.

**Zeitbedarf:** eine Doppelstunde, mit Rollenspiel davor.

**Vorbereitung ohne Computer:** Ein Kind spielt Klonk, die Klasse gibt die Befehle. Alle Welten sind 3 × 3 Felder groß und lassen sich mit den Druckvorlagen nachbauen: zuerst mit der gedruckten Figur auf der Platte legen, dann am Computer mit Blöcken.

**Typische Schwierigkeiten:** Schaut Klonk zur Klasse, sind links und rechts vertauscht. Die Kinder dürfen die Figur auf der Platte in die Hand nehmen und mitdrehen. Wer die Wörter noch nicht sicher liest, arbeitet zu zweit mit Bildkarten (Pfeil vor, Pfeil links, Pfeil rechts).

**Differenzierung:** Aufgabe 4 ist bewusst lang – das bereitet das Modul *Bauen nach Bauplan* und später die Wiederholung vor.`,
    en: `**Target group:** primary school (Mathematics 1/2, *orienting oneself in space*), special schools (introduction to *programming*), lower secondary without prior experience.

**Time needed:** one double lesson, with role play beforehand.

**Preparation without a computer:** one child plays Klonk, the class gives the commands. All worlds are 3 × 3 cells and can be rebuilt with the print templates: first lay them out with the printed character on the plate, then on the computer with blocks.

**Typical difficulties:** if Klonk faces the class, left and right are swapped. Children may pick up the character on the plate and turn it along. Those who cannot yet read the words reliably work in pairs with picture cards (arrow forward, arrow left, arrow right).

**Differentiation:** task 4 is deliberately long – it prepares the module *Building from a plan* and later repetition.`,
  },
  tasks: [
    {
      id: 'straight-ahead',
      title: { de: 'Geradeaus', en: 'Straight ahead' },
      text: {
        de: 'Bring Klonk auf die gelbe Marke.',
        en: 'Bring Klonk onto the yellow mark.',
      },
      hints: [
        { de: 'Zähle die Felder bis zur Marke.', en: 'Count the cells up to the mark.' },
      ],
      worlds: [map(`
        . . .
        > . y
        . . .
      `)],
      solution: { de: 'schritt\nschritt', en: 'step\nstep' },
      check: { position: true },
    },
    {
      id: 'turn',
      title: { de: 'Abbiegen', en: 'Turning' },
      text: {
        de: 'Die Marke liegt in der anderen Ecke. Klonk muss einmal abbiegen.',
        en: 'The mark is in the opposite corner. Klonk has to turn once.',
      },
      hints: [
        { de: 'Geh zuerst nach oben bis zum Rand. Muss Klonk dann nach links oder nach rechts?', en: 'First go up to the edge. Does Klonk then have to turn left or right?' },
      ],
      worlds: [map(`
        . . y
        . . .
        ^ . .
      `)],
      solution: {
        de: 'schritt\nschritt\nrechtsDrehen\nschritt\nschritt',
        en: 'step\nstep\nturnRight\nstep\nstep',
      },
      check: { position: true },
    },
    {
      id: 'around-the-block',
      title: { de: 'Um den Quader herum', en: 'Around the block' },
      text: {
        de: 'In der Mitte steht ein Quader. Klonk kann nicht hindurch. Bring Klonk auf die Marke.',
        en: 'There is a block in the middle. Klonk cannot walk through it. Bring Klonk onto the mark.',
      },
      hints: [
        { de: 'Klonk schaut nach oben. Diesmal biegt Klonk nach links ab.', en: 'Klonk faces up. This time Klonk turns left.' },
      ],
      worlds: [map(`
        y . .
        . # .
        . . ^
      `)],
      solution: {
        de: 'schritt\nschritt\nlinksDrehen\nschritt\nschritt',
        en: 'step\nstep\nturnLeft\nstep\nstep',
      },
      check: { position: true },
    },
    {
      id: 'four-corners',
      title: { de: 'Vier Ecken', en: 'Four corners' },
      text: {
        de: 'Klonk soll alle vier Ecken der Platte markieren.',
        en: 'Klonk should mark all four corners of the plate.',
      },
      hints: [
        { de: '`markieren` malt das Feld an, auf dem Klonk gerade steht. Fang in deiner Ecke an.', en: '`setMark` paints the cell Klonk is standing on. Start in your own corner.' },
        { de: 'Nach jeder Ecke dreht sich Klonk nach rechts.', en: 'After each corner Klonk turns right.' },
      ],
      worlds: [map(`
        . . .
        . . .
        ^ . .
      `)],
      solution: {
        de: `markieren
schritt
schritt
rechtsDrehen
markieren
schritt
schritt
rechtsDrehen
markieren
schritt
schritt
rechtsDrehen
markieren`,
        en: `setMark
step
step
turnRight
setMark
step
step
turnRight
setMark
step
step
turnRight
setMark`,
      },
      check: { cells: true },
    },
  ],
}
