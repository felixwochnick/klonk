import { Interpreter } from '@klonk/klonk-script'
import { World, type WorldData } from '@klonk/world'
import { describe, expect, it } from 'vitest'
import { applyCommand } from '../src/commands'
import { createApi } from '../src/js/api'
import { LIVE_INBOX_BYTES, LiveChannel, createLiveBuffer, pushLiveInbox, writeLiveResponse } from '../src/live/channel'
import { LiveWorld } from '../src/live/live-world'
import type { LiveWorldServerMessage } from '../src/live/protocol'
import { WorldRoom, type WorldRoomPeer } from '../src/live/world-room'

// Gemeinsame Welt ohne Netz: Raum (Server), angezeigte Welt (Hauptthread) und LiveWorld (Worker) in einem Thread.
// Der Raum antwortet synchron – die Antwort steht im gemeinsamen Speicher, bevor der Worker per Atomics.wait wartet.
const start: WorldData = {
  version: 1,
  size: { width: 5, depth: 5, height: 3 },
  cells: [{ x: 3, z: 0, block: true }],
  characters: [
    { id: 'Start 1', model: 'male', x: 0, z: 0, direction: 'east' },
    { id: 'Start 2', model: 'female', x: 4, z: 4, direction: 'north' },
  ],
}

function client(room: WorldRoom, name: string, options: Partial<WorldRoomPeer> = {}) {
  const messages: LiveWorldServerMessage[] = []
  let display: World | undefined
  let figure: string | null = null
  let buffer: SharedArrayBuffer | undefined
  let ref = 0
  const peer: WorldRoomPeer = {
    id: `${name}#1`,
    userId: name.toLowerCase(),
    name,
    spectator: false,
    maxCharacters: 1,
    ...options,
    send: (message) => {
      messages.push(message)
      switch (message.t) {
        case 'welcome':
          display = new World(message.world)
          figure = message.you.figure
          break
        case 'cmd':
          applyCommand(display!, message.command)
          if (buffer) pushLiveInbox(buffer, { type: 'command', command: message.command })
          if (buffer && message.ref) writeLiveResponse(buffer, { ok: true })
          break
        case 'reject':
          if (buffer) writeLiveResponse(buffer, { ok: false, code: message.code, params: message.params })
          break
        case 'world':
          display = new World(message.world)
          if (buffer) pushLiveInbox(buffer, { type: 'world', world: message.world })
          break
        case 'you':
          figure = message.figure
          break
      }
    },
  }
  room.join(peer)
  return {
    peer,
    messages,
    get display() {
      return display!
    },
    get figure() {
      return figure
    },
    send: (data: unknown) => room.message(peer.id, data),
    /** Programmlauf: Welt im Worker ab dem angezeigten Stand, danach nur noch über den Eingang */
    run() {
      buffer = createLiveBuffer()
      const channel = new LiveChannel(buffer, ({ command }) => room.message(peer.id, { t: 'cmd', ref: ++ref, command }))
      return new LiveWorld(display!.toJSON(), channel, figure ?? undefined)
    },
  }
}

const positions = (world: World) => Object.fromEntries(world.getCharacters().map(c => [c.id, [c.x, c.z, c.direction]]))

describe('Gemeinsame Welt: Raum', () => {
  it('vergibt Startplätze in Beitrittsreihenfolge, Figuren tragen den Anzeigenamen', () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const lisa = client(room, 'Lisa Müller')
    const anna = client(room, 'Anna')
    expect(tim.figure).toBe('Tim')
    expect(lisa.figure).toBe('Lisa Müller')
    expect(positions(tim.display)).toEqual({
      'Tim': [0, 0, 'east'],
      'Lisa Müller': [4, 4, 'north'],
      'Anna': [1, 0, 'south'],
    })
    // Alle sehen dieselbe Welt
    expect(lisa.display.toJSON()).toEqual(tim.display.toJSON())
    expect(anna.display.toJSON()).toEqual(room.world.toJSON())
    expect(room.world.getCharacter('Tim').model).toBe('male')
  })

  it('führt nur Befehle für eigene Figuren aus und schickt sie allen', () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const lisa = client(room, 'Lisa')
    tim.send({ t: 'cmd', ref: 1, command: { name: 'step', id: 'Tim' } })
    expect(positions(lisa.display).Tim).toEqual([1, 0, 'east'])
    expect(tim.messages.at(-1)).toMatchObject({ t: 'cmd', ref: 1, by: 'tim' })
    expect(lisa.messages.at(-1)).not.toHaveProperty('ref')

    lisa.send({ t: 'cmd', ref: 7, command: { name: 'step', id: 'Tim' } })
    expect(lisa.messages.at(-1)).toEqual({ t: 'reject', ref: 7, code: 'live_not_owner', params: { id: 'Tim' } })
    lisa.send({ t: 'cmd', ref: 8, command: { name: 'teleport', id: 'Lisa' } })
    expect(lisa.messages.at(-1)).toMatchObject({ t: 'reject', ref: 8, code: 'live_invalid' })
    // Fehler der Welt wie sonst auch
    tim.send({ t: 'cmd', ref: 2, command: { name: 'step', id: 'Tim' } })
    tim.send({ t: 'cmd', ref: 3, command: { name: 'step', id: 'Tim' } })
    expect(tim.messages.at(-1)).toMatchObject({ t: 'reject', ref: 3, code: 'block' })
  })

  it('Zuschauende (Lehrkraft) bekommen keine Figur und steuern nichts', () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const teacher = client(room, 'Frau Lehmann', { spectator: true })
    expect(teacher.figure).toBeNull()
    expect(teacher.display.getCharacters().map(c => c.id)).toEqual(['Tim'])
    teacher.send({ t: 'cmd', ref: 1, command: { name: 'turnLeft', id: 'Tim' } })
    expect(teacher.messages.at(-1)).toMatchObject({ t: 'reject', code: 'live_not_owner' })
    expect(tim.messages.at(-1)).toMatchObject({ t: 'players' })
  })

  it('neue Figuren nur im Rahmen der Lizenz, danach gehören sie der Person', () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const create = { name: 'createCharacter', id: 'Helfer', character: { id: 'Helfer', model: 'female', x: 2, z: 2, direction: 'south' } }
    tim.send({ t: 'cmd', ref: 1, command: create })
    expect(tim.messages.at(-1)).toMatchObject({ t: 'reject', code: 'character_limit', params: { max: 1 } })

    const kim = client(room, 'Kim', { maxCharacters: 32 })
    kim.send({ t: 'cmd', ref: 1, command: create })
    kim.send({ t: 'cmd', ref: 2, command: { name: 'step', id: 'Helfer' } })
    expect(positions(tim.display).Helfer).toEqual([2, 3, 'south'])
    tim.send({ t: 'cmd', ref: 2, command: { name: 'step', id: 'Helfer' } })
    expect(tim.messages.at(-1)).toMatchObject({ t: 'reject', code: 'live_not_owner' })
  })

  it('setzt auf die Startwelt zurück, Anwesende bekommen wieder eine Figur', () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const lisa = client(room, 'Lisa')
    tim.send({ t: 'cmd', ref: 1, command: { name: 'placeBrick', id: 'Tim', color: 'blue' } })
    room.leave(tim.peer.id)
    lisa.send({ t: 'reset' })
    expect(lisa.display.cell({ x: 1, z: 0 }).bricks).toEqual([])
    // Tim ist gegangen ⇒ nur Lisa hat eine Figur, jetzt auf dem ersten Startplatz
    expect(positions(lisa.display)).toEqual({ Lisa: [0, 0, 'east'] })
    expect(lisa.figure).toBe('Lisa')
    expect(lisa.messages.some(m => m.t === 'world' && m.reason === 'reset' && m.by === 'lisa')).toBe(true)
  })
})

describe('Gemeinsame Welt: Programme', () => {
  it('Sensoren sehen, was andere gleichzeitig tun; fremde Figuren lassen sich nicht steuern', async () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const lisa = client(room, 'Lisa')
    const world = tim.run()
    const output: string[] = []
    let commands = 0
    const program = Interpreter.fromSource('schritt\nwechsle("Lisa")\nausgabe(positionY())\nschritt', world, {
      // Während Tims Programm läuft, bewegt sich Lisa (eigenes Programm, anderer Rechner)
      command: () => {
        if (commands++ === 0) lisa.send({ t: 'cmd', ref: 1, command: { name: 'step', id: 'Lisa' } })
      },
      print: text => output.push(text),
    }, tim.figure!)
    await expect(program.run()).rejects.toMatchObject({ code: 'world', params: { worldCode: 'live_not_owner', id: 'Lisa' }, range: { line: 4 } })
    expect(output).toEqual(['4'])
    expect(positions(world)).toEqual(positions(lisa.display))
    expect(positions(world)).toEqual({ Tim: [1, 0, 'east'], Lisa: [4, 3, 'north'] })
  })

  it('ohne Namen ist in den Objekt-Sprachen die eigene Figur gemeint', () => {
    const room = new WorldRoom(start)
    client(room, 'Tim')
    const lisa = client(room, 'Lisa')
    const api = createApi({ world: lisa.run(), command: () => {}, print: () => {}, sleep: () => {} })
    const me = api.robot()
    expect(me.name).toBe('Lisa')
    me.turnLeft!()
    expect(api.robot('tim').isWall!()).toBe(false)
    expect(() => api.robot('Tim').step!()).toThrow(expect.objectContaining({ code: 'world', params: expect.objectContaining({ worldCode: 'live_not_owner' }) }))
    expect(room.world.getCharacter('Lisa').direction).toBe('west')
  })

  it('übernimmt eine zurückgesetzte Welt während des Laufs', () => {
    const room = new WorldRoom(start)
    const tim = client(room, 'Tim')
    const world = tim.run()
    world.turnRight('Tim')
    expect(world.getCharacter('Tim').direction).toBe('south')
    tim.send({ t: 'reset' })
    expect(world.getCharacter('Tim').direction).toBe('east')
  })
})

describe('Gemeinsame Welt: Eingang im gemeinsamen Speicher', () => {
  it('liefert Einträge in Reihenfolge und ersetzt sie bei Überlauf durch den Stand der Welt', () => {
    const buffer = createLiveBuffer()
    const channel = new LiveChannel(buffer, () => {})
    pushLiveInbox(buffer, { type: 'command', command: { name: 'step', id: 'a' } })
    pushLiveInbox(buffer, { type: 'command', command: { name: 'turnLeft', id: 'a' } })
    expect(channel.drain().map(e => e.type === 'command' && e.command.name)).toEqual(['step', 'turnLeft'])
    expect(channel.drain()).toEqual([])

    const entry = { type: 'command' as const, command: { name: 'step' as const, id: 'x'.repeat(60) } }
    const count = Math.ceil(LIVE_INBOX_BYTES / JSON.stringify(entry).length) + 10
    for (let i = 0; i < count; i++) pushLiveInbox(buffer, entry, () => start)
    const events = channel.drain()
    expect(events.at(0)).toEqual({ type: 'world', world: start })
    expect(events.length).toBeLessThan(count)
  })
})
