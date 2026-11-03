import { map } from '../map'
import type { LearnModule } from '../types'

export const procedures: LearnModule = {
  id: 'procedures',
  title: { de: 'Eigene Anweisungen', en: 'Your own procedures' },
  summary: {
    de: 'Klonk neue Befehle beibringen und Programme in Teile zerlegen.',
    en: 'Teach Klonk new commands and break programs into parts.',
  },
  objectives: [
    { de: 'Eigene Anweisungen mit `anweisung … ende` definieren und aufrufen', en: 'Define and call your own procedures with `procedure … end`' },
    { de: 'Ein Problem in Teilprobleme zerlegen (Modularisierung)', en: 'Break a problem down into sub-problems (modularization)' },
    { de: 'Anweisungen mit Parametern verwenden', en: 'Use procedures with parameters' },
  ],
  intro: {
    de: `Klonk kennt kein \`umdrehen\` – aber du kannst es ihm beibringen. Eine **eigene Anweisung** fasst mehrere Anweisungen unter einem Namen zusammen:

\`\`\`klonk
anweisung umdrehen
  linksDrehen
  linksDrehen
ende

umdrehen
schritt
\`\`\`

Danach verwendest du \`umdrehen\` wie jeden anderen Befehl. Gute Namen machen ein Programm lesbar wie eine Beschreibung.

Anweisungen können **Parameter** haben – Werte, die beim Aufruf übergeben werden:

\`\`\`klonk
anweisung turm(höhe)
  wiederhole höhe mal
    hinlegen
  ende
ende

turm(3)
\`\`\``,
    en: `Klonk does not know \`turnAround\` – but you can teach it. A **procedure** groups several instructions under one name:

\`\`\`klonk
procedure turnAround
  turnLeft
  turnLeft
end

turnAround
step
\`\`\`

After that you use \`turnAround\` like any other command. Good names make a program read like a description.

Procedures can have **parameters** – values that are passed when calling them:

\`\`\`klonk
procedure tower(height)
  repeat height times
    placeBrick
  end
end

tower(3)
\`\`\``,
  },
  teacher: {
    de: `**Zeitbedarf:** ein bis zwei Doppelstunden.

**Typische Schwierigkeiten:** Definition und Aufruf werden verwechselt – eine Definition allein bewirkt nichts. Bei Parametern ist der Unterschied zwischen dem Namen in der Definition (\`höhe\`) und dem Wert beim Aufruf (\`3\`) zu klären; der Einzelschritt zeigt den Wert in der Variablenanzeige.

**Didaktischer Hinweis:** Aufgabe 2 lässt sich zunächst mit dem Ablauf „Was tut Klonk an einem Hindernis?“ als Teilproblem besprechen, bevor die Schleife drumherum entsteht (Top-down-Entwurf).

**Differenzierung:** Schnelle Lernende formulieren Lösungen früherer Aufgaben mit eigenen Anweisungen um (z. B. die Türme aus dem Modul „Wiederholung mit fester Anzahl“).`,
    en: `**Time needed:** one to two double lessons.

**Typical difficulties:** Definition and call get mixed up – a definition alone does nothing. With parameters, the difference between the name in the definition (\`height\`) and the value at the call (\`3\`) needs clarifying; step mode shows the value in the variables view.

**Didactic note:** Task 2 can first be discussed as the sub-problem “What does Klonk do at an obstacle?” before the loop around it is built (top-down design).

**Differentiation:** Fast learners rewrite solutions to earlier tasks with their own procedures (e.g. the towers from the module “Repetition with a fixed count”).`,
  },
  tasks: [
    {
      id: 'there-and-back',
      title: { de: 'Hin und zurück', en: 'There and back' },
      text: {
        de: 'Klonk läuft bis zur Wand, dreht um, läuft zurück bis zur anderen Wand und markiert dort das Feld. Schreib dafür eigene Anweisungen, z. B. `umdrehen` und `zurWand`.',
        en: 'Klonk walks to the wall, turns around, walks back to the other wall and marks the cell there. Write your own procedures for it, e.g. `turnAround` and `toTheWall`.',
      },
      worlds: [
        map('> . . . .'),
        map('. . > . . . . .'),
        map('. >'),
      ],
      solution: {
        de: `anweisung umdrehen
  linksDrehen
  linksDrehen
ende

anweisung zurWand
  wiederhole solange nicht istWand
    schritt
  ende
ende

zurWand
umdrehen
zurWand
markieren`,
        en: `procedure turnAround
  turnLeft
  turnLeft
end

procedure toTheWall
  repeat while not isWall
    step
  end
end

toTheWall
turnAround
toTheWall
setMark`,
      },
      check: { position: true, direction: true, cells: true },
      requires: ['procedure'],
    },
    {
      id: 'obstacles',
      title: { de: 'Hindernislauf', en: 'Obstacle course' },
      text: {
        de: 'Klonk läuft bis zur gelben Marke. Auf dem Weg stehen einzelne Quader, um die er oben herum gehen muss. Schreib eine Anweisung `umgehen` für ein Hindernis.',
        en: 'Klonk walks to the yellow mark. Single blocks stand on the way, which it has to walk around via the top. Write a procedure `goAround` for one obstacle.',
      },
      hints: [
        { de: 'Beim Umgehen landet Klonk zwei Felder weiter in derselben Reihe und schaut wieder nach rechts.', en: 'When going around, Klonk lands two cells further in the same row, facing right again.' },
        { de: 'Solange Klonk nicht auf der Marke steht: Ist vor ihm eine Wand, umgeht er sie – sonst geht er einen Schritt.', en: 'As long as Klonk is not on the mark: if there is a wall in front of it, it goes around – otherwise it takes a step.' },
      ],
      worlds: [
        map(`
          . . . . . . . .
          > . # . . # . y
        `),
        map(`
          . . . . . .
          > # . # . y
        `),
        map(`
          . . . . . . . . .
          > . . . # . . y .
        `),
      ],
      solution: {
        de: `anweisung umgehen
  linksDrehen
  schritt
  rechtsDrehen
  schritt(2)
  rechtsDrehen
  schritt
  linksDrehen
ende

wiederhole bis istMarke
  wenn istWand dann
    umgehen
  sonst
    schritt
  ende
ende`,
        en: `procedure goAround
  turnLeft
  step
  turnRight
  step(2)
  turnRight
  step
  turnLeft
end

repeat until isMark
  if isWall then
    goAround
  else
    step
  end
end`,
      },
      check: { position: true },
      requires: ['procedure'],
    },
    {
      id: 'stairs',
      title: { de: 'Treppe', en: 'Staircase' },
      text: {
        de: 'Baue links neben Klonks Weg eine Treppe: Säulen aus 1, 2, 3 und 4 Ziegeln nebeneinander, gegenüber den gelben Marken. Schreib eine Anweisung mit Parameter, z. B. `säule(höhe)`.',
        en: 'Build a staircase to the left of Klonk\'s path: columns of 1, 2, 3 and 4 bricks next to each other, next to the yellow marks. Write a procedure with a parameter, e.g. `column(height)`.',
      },
      hints: [
        { de: 'In der Anweisung: zur Mauer drehen, `höhe`-mal hinlegen, zurückdrehen.', en: 'In the procedure: turn towards the wall, place `height` bricks, turn back.' },
      ],
      worlds: [map(`
        . . . . .
        >y y y y .
      `)],
      solution: {
        de: `anweisung säule(höhe)
  linksDrehen
  wiederhole höhe mal
    hinlegen
  ende
  rechtsDrehen
ende

säule(1)
schritt
säule(2)
schritt
säule(3)
schritt
säule(4)`,
        en: `procedure column(height)
  turnLeft
  repeat height times
    placeBrick
  end
  turnRight
end

column(1)
step
column(2)
step
column(3)
step
column(4)`,
      },
      check: { cells: true },
      requires: ['procedure'],
    },
  ],
}
