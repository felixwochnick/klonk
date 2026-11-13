import { map } from '../map'
import type { LearnModule } from '../types'

export const functions: LearnModule = {
  id: 'functions',
  title: { de: 'Funktionen mit Rückgabewert', en: 'Functions with return values' },
  summary: {
    de: 'Eigene Funktionen schreiben, die etwas herausfinden und das Ergebnis zurückgeben.',
    en: 'Write your own functions that find something out and return the result.',
  },
  objectives: [
    { de: 'Funktionen mit `funktion … ende` definieren und mit `zurück` einen Wert zurückgeben', en: 'Define functions with `function … end` and return a value with `return`' },
    { de: 'Den Rückgabewert in Bedingungen, Rechnungen und Ausgaben verwenden', en: 'Use the return value in conditions, calculations and output' },
    { de: 'Eigene Sensoren (Funktionen mit Wahrheitswert) bauen', en: 'Build your own sensors (functions returning a truth value)' },
  ],
  intro: {
    de: `Eine **Anweisung** tut etwas. Eine **Funktion** tut etwas *und* liefert ein Ergebnis – wie die Sensoren \`istWand\` oder \`ziegelAnzahl\`.

\`\`\`klonk
funktion schritteBisWand()
  var anzahl = 0
  wiederhole solange nicht istWand
    schritt
    anzahl = anzahl + 1
  ende
  zurück anzahl
ende

ausgabe("Abstand: " + schritteBisWand())
\`\`\`

\`zurück\` beendet die Funktion und gibt den Wert an die Stelle zurück, an der sie aufgerufen wurde. Eine Funktion kann auch \`wahr\` oder \`falsch\` zurückgeben – dann ist sie ein eigener Sensor und passt hinter \`wenn\` oder \`wiederhole solange\`.`,
    en: `A **procedure** does something. A **function** does something *and* delivers a result – like the sensors \`isWall\` or \`brickCount\`.

\`\`\`klonk
function stepsToWall()
  var count = 0
  repeat while not isWall
    step
    count = count + 1
  end
  return count
end

print("Distance: " + stepsToWall())
\`\`\`

\`return\` ends the function and passes the value back to the place where it was called. A function can also return \`true\` or \`false\` – then it is a sensor of your own and fits after \`if\` or \`repeat while\`.`,
  },
  teacher: {
    de: `**Zielgruppe:** Mittelschule 8 (*Funktionen mit Rückgabewert*), Förderschwerpunkte mit Mittelschul-Lehrplan, Realschule (Aufbauunterricht), FOS/BOS ohne Vorkenntnisse, Gymnasium als Übergang zu Methoden mit Rückgabe in Java/Python.

**Voraussetzungen:** Module 5 (Eigene Anweisungen) und 6 (Variablen).

**Zeitbedarf:** ein bis zwei Doppelstunden.

**Typische Schwierigkeiten:** \`ausgabe\` in der Funktion statt \`zurück\` – das Ergebnis lässt sich dann nicht weiterverwenden. Den Unterschied an Aufgabe 3 zeigen: Dort wird der Rückgabewert zweimal addiert. Bei Aufgabe 2 muss die Funktion Klonk wieder in die alte Richtung drehen, bevor sie zurückgibt (Seiteneffekt bewusst machen).

**Weiterführung:** In Java, Python und C# entspricht \`funktion\` einer Methode mit Rückgabetyp; der Klassen- und Objektbegriff folgt dort.`,
    en: `**Target group:** Mittelschule 8 (*functions with return values*), special educational focuses following the Mittelschule curriculum, Realschule (advanced course), FOS/BOS without prior knowledge, Gymnasium as a transition to methods with return values in Java/Python.

**Prerequisites:** modules 5 (your own procedures) and 6 (variables).

**Time needed:** one to two double lessons.

**Typical difficulties:** \`print\` inside the function instead of \`return\` – the result can then not be used further. Show the difference with task 3: there the return value is added twice. In task 2 the function must turn Klonk back to the old direction before returning (make the side effect explicit).

**Next steps:** in Java, Python and C#, \`function\` corresponds to a method with a return type; the concepts of class and object follow there.`,
  },
  tasks: [
    {
      id: 'distance',
      title: { de: 'Abstand messen', en: 'Measuring the distance' },
      text: {
        de: 'Schreib eine Funktion, die Klonk bis zur Wand laufen lässt und die Anzahl der Schritte **zurückgibt**. Gib das Ergebnis aus.',
        en: 'Write a function that makes Klonk walk to the wall and **returns** the number of steps. Print the result.',
      },
      hints: [
        { de: 'Zähle mit einer Variablen in der Funktion mit und gib sie am Ende mit `zurück` zurück.', en: 'Count along with a variable inside the function and hand it back at the end with `return`.' },
      ],
      worlds: [
        map('> . . . . .'),
        map('. . > . . .'),
        map('> . .'),
      ],
      solution: {
        de: `funktion schritteBisWand()
  var anzahl = 0
  wiederhole solange nicht istWand
    schritt
    anzahl = anzahl + 1
  ende
  zurück anzahl
ende

ausgabe("Abstand: " + schritteBisWand())`,
        en: `function stepsToWall()
  var count = 0
  repeat while not isWall
    step
    count = count + 1
  end
  return count
end

print("Distance: " + stepsToWall())`,
      },
      check: { position: true, output: 'numbers' },
      requires: ['function'],
    },
    {
      id: 'left-free',
      title: { de: 'Ein eigener Sensor', en: 'A sensor of your own' },
      text: {
        de: 'Klonk läuft an einer Mauer entlang. Irgendwo links ist eine Lücke. Schreib eine Funktion `linksFrei`, die `wahr` zurückgibt, wenn links von Klonk keine Wand ist. Lass Klonk bis zur Lücke laufen, hindurchgehen und das Feld dahinter markieren.',
        en: 'Klonk walks along a wall. Somewhere on the left there is a gap. Write a function `leftFree` that returns `true` if there is no wall to Klonk\'s left. Let Klonk walk to the gap, go through it and mark the cell behind it.',
      },
      hints: [
        { de: 'Die Funktion dreht Klonk nach links, merkt sich `nicht istWand` in einer Variablen, dreht zurück und gibt die Variable zurück.', en: 'The function turns Klonk left, remembers `not isWall` in a variable, turns back and returns the variable.' },
      ],
      worlds: [
        map(`
          # # . # # #
          > . . . . .
          . . . . . .
        `),
        map(`
          # # # # . #
          > . . . . .
          . . . . . .
        `),
        map(`
          . # # # # #
          > . . . . .
          . . . . . .
        `),
      ],
      solution: {
        de: `funktion linksFrei()
  linksDrehen
  var frei = nicht istWand
  rechtsDrehen
  zurück frei
ende

wiederhole solange nicht linksFrei()
  schritt
ende
linksDrehen
schritt
markieren`,
        en: `function leftFree()
  turnLeft
  var free = not isWall
  turnRight
  return free
end

repeat while not leftFree()
  step
end
turnLeft
step
setMark`,
      },
      check: { position: true, cells: true },
      requires: ['function', 'repeatWhile'],
    },
    {
      id: 'count-towers',
      title: { de: 'Türme zählen', en: 'Counting towers' },
      text: {
        de: 'Vor Klonk stehen drei Türme nebeneinander. Schreib eine Funktion, die Klonk vor den nächsten Turm stellt und dessen Höhe zurückgibt. Gib aus, wie viele Ziegel es insgesamt sind.',
        en: 'There are three towers next to each other in front of Klonk. Write a function that moves Klonk in front of the next tower and returns its height. Print how many bricks there are in total.',
      },
      hints: [
        { de: '`ziegelAnzahl` liefert die Höhe des Turms vor Klonk.', en: '`brickCount` gives the height of the tower in front of Klonk.' },
        { de: 'Beginne mit `var summe = ziegelAnzahl` für den ersten Turm.', en: 'Start with `var total = brickCount` for the first tower.' },
      ],
      worlds: [
        map(`
          . . .
          2 1 3
          ^ . .
        `),
        map(`
          . . .
          1 1 1
          ^ . .
        `),
        map(`
          . . .
          4 . 2
          ^ . .
        `),
      ],
      solution: {
        de: `funktion nächsterTurm()
  rechtsDrehen
  schritt
  linksDrehen
  zurück ziegelAnzahl
ende

var summe = ziegelAnzahl
summe = summe + nächsterTurm()
summe = summe + nächsterTurm()
ausgabe("Ziegel: " + summe)`,
        en: `function nextTower()
  turnRight
  step
  turnLeft
  return brickCount
end

var total = brickCount
total = total + nextTower()
total = total + nextTower()
print("Bricks: " + total)`,
      },
      check: { output: 'numbers' },
      requires: ['function', 'variable'],
    },
  ],
}
