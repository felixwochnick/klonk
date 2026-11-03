import type { WorldData } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { jsHeap } from '../src/heap'
import { runJavaScript } from '../src/js/run'
import { CONTROL, createSharedState, views } from '../src/js/shared'
import type { FromWorker } from '../src/protocol'

const world: WorldData = {
  version: 1,
  size: { width: 5, depth: 5, height: 3 },
  cells: [],
  characters: [{ id: 'k', model: 'male', x: 0, z: 0, direction: 'east' }],
}

describe('Speicherabbild JS/TS (Objektdiagramm)', () => {
  it('Objekte, Arrays, Map, Zyklen und einfache Werte', () => {
    const a: Record<string, unknown> = { name: 'Klara' }
    const b = { name: 'Ben', freund: a }
    a.freund = b
    const heap = jsHeap({ a, b, team: [a, b], noten: new Map([['mathe', 1]]), n: 3, s: 'x', f: () => 1 })
    expect(heap).toEqual({
      variables: [['a', { ref: 1 }], ['b', { ref: 2 }], ['team', { ref: 3 }], ['noten', { ref: 4 }], ['n', { value: '3' }], ['s', { value: '"x"' }]],
      objects: [
        { id: 1, className: 'Object', fields: [['name', { value: '"Klara"' }], ['freund', { ref: 2 }]] },
        { id: 2, className: 'Object', fields: [['name', { value: '"Ben"' }], ['freund', { ref: 1 }]] },
        { id: 3, className: 'Array', fields: [['[0]', { ref: 1 }], ['[1]', { ref: 2 }]] },
        { id: 4, className: 'Map', fields: [['["mathe"]', { value: '1' }]] },
      ],
    })
  })

  it('beim Anhalten: eigene Klassen, `this` in Methoden und Figuren', () => {
    const shared = createSharedState()
    views(shared).breakpoints[5] = 1
    const paused: Extract<FromWorker, { type: 'paused' }>[] = []
    const messages: FromWorker[] = []
    runJavaScript({
      type: 'run',
      language: 'javascript',
      source: 'import { Klonk } from \'klonk\'\nclass Held {\n  constructor(name) { this.name = name; this.figur = new Klonk() }\n  gehe() {\n    this.figur.step()\n  }\n}\nconst h = new Held(\'Klara\')\nh.gehe()\n',
      world, breakpoints: [5], delay: 0, allowImports: false, files: {}, shared,
    }, (m) => {
      messages.push(m)
      if (m.type === 'paused') {
        paused.push(m)
        // sofort weiter – sonst blockiert Atomics.wait den Testthread
        Atomics.store(views(shared).control, CONTROL.SIGNAL, 1)
      }
    })
    expect(messages.at(-1)).toEqual({ type: 'done' })
    expect(paused[0]!.heap).toEqual({
      variables: [['this', { ref: 1 }]],
      objects: [
        { id: 1, className: 'Held', fields: [['name', { value: '"Klara"' }], ['figur', { ref: 2 }]] },
        { id: 2, className: 'Klonk', robot: 'k', fields: [['name', { value: '"k"' }]] },
      ],
    })
  })
})
