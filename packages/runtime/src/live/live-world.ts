import type { RobotCommand } from '@klonk/klonk-script'
import { World, WorldError, type BrickColor, type CharacterData, type MarkColor, type Position, type WorldData, type WorldErrorCode } from '@klonk/world'
import { applyCommand } from '../commands'
import { LiveChannel } from './channel'

/**
 * Welt im Worker für die gemeinsame Welt: eine Kopie der Server-Welt. Befehle der eigenen Figur gehen zuerst an den
 * Server (synchron über den gemeinsamen Speicher) und wirken erst, wenn er sie bestätigt; vor jedem Lesen kommen die
 * bestätigten Befehle aller Figuren dazu – Sensoren sehen also auch, was die anderen gerade tun.
 * Ohne Namen meint `new Klonk()` bzw. das Programm die eigene Figur (nicht die erste der Welt).
 */
export class LiveWorld extends World {
  /** Bestätigte Befehle werden gerade eingespielt (dann wirken die Befehle direkt) */
  private applying = false
  /** Verschachtelte Zugriffe (eine Methode ruft die nächste) lesen den Eingang nur einmal */
  private nesting = 0

  constructor(data: WorldData, private channel: LiveChannel, private own?: string) {
    super(data)
  }

  /** Bestätigte Änderungen einlesen */
  sync() {
    if (this.applying || this.nesting > 0) return
    const events = this.channel.drain()
    if (!events.length) return
    this.applying = true
    try {
      for (const event of events) {
        if (event.type === 'world') {
          this.reset(event.world)
          continue
        }
        try {
          applyCommand(this, event.command)
        }
        catch {
          // Reihenfolge weicht ab (sollte nicht vorkommen) – der nächste Befehl klärt es mit dem Server
        }
      }
    }
    finally {
      this.applying = false
    }
  }

  private read<T>(fn: () => T): T {
    this.sync()
    this.nesting++
    try {
      return fn()
    }
    finally {
      this.nesting--
    }
  }

  /** Befehl der eigenen Figur über den Server ausführen; abgelehnt ⇒ derselbe Fehler wie in einer eigenen Welt */
  private remote(command: RobotCommand) {
    this.sync()
    const response = this.channel.request(command)
    // Der bestätigte Befehl liegt schon im Eingang (in Server-Reihenfolge mit denen der anderen)
    this.sync()
    if (!response.ok) throw new WorldError(response.code as WorldErrorCode, response.params)
  }

  // Lesen ---------------------------------------------------------------------

  override getCharacters() {
    return this.read(() => super.getCharacters())
  }

  override getCharacter(id: string) {
    return this.read(() => super.getCharacter(id))
  }

  override findCharacter(name?: string | number) {
    return this.read(() => {
      if (name === undefined && this.own && super.getCharacters().some(c => c.id === this.own)) return super.getCharacter(this.own)
      return super.findCharacter(name)
    })
  }

  override cell(position: Position) {
    return this.read(() => super.cell(position))
  }

  override characterAt(position: Position) {
    return this.read(() => super.characterAt(position))
  }

  override isWall(id: string) {
    return this.read(() => super.isWall(id))
  }

  override isBrick(id: string, color?: BrickColor) {
    return this.read(() => super.isBrick(id, color))
  }

  override isMark(id: string, color?: MarkColor) {
    return this.read(() => super.isMark(id, color))
  }

  override bricksInFront(id: string) {
    return this.read(() => super.bricksInFront(id))
  }

  // Befehle -------------------------------------------------------------------

  override step(id: string) {
    if (this.applying) return super.step(id)
    this.remote({ name: 'step', id })
  }

  override turnLeft(id: string) {
    if (this.applying) return super.turnLeft(id)
    this.remote({ name: 'turnLeft', id })
  }

  override turnRight(id: string) {
    if (this.applying) return super.turnRight(id)
    this.remote({ name: 'turnRight', id })
  }

  override placeBrick(id: string, color: BrickColor = 'red') {
    if (this.applying) return super.placeBrick(id, color)
    this.remote({ name: 'placeBrick', id, color })
  }

  override pickBrick(id: string) {
    if (this.applying) return super.pickBrick(id)
    this.remote({ name: 'pickBrick', id })
  }

  override setMark(id: string, color: MarkColor = 'yellow') {
    if (this.applying) return super.setMark(id, color)
    this.remote({ name: 'setMark', id, color })
  }

  override removeMark(id: string) {
    if (this.applying) return super.removeMark(id)
    this.remote({ name: 'removeMark', id })
  }

  /** Neue Figur (`erstelle`, `Klonk.create`) – gehört danach diesem Programm */
  override addCharacter(character: CharacterData, maxCharacters = Infinity) {
    if (this.applying) return super.addCharacter(character, maxCharacters)
    // Örtliche Prüfung (Name, Feld, Lizenzgrenze) wie in einer eigenen Welt, dann der Server
    const probe = new World(super.toJSON())
    probe.addCharacter(character, maxCharacters)
    this.remote({ name: 'createCharacter', id: character.id, character: { ...character } })
  }
}

/** Welt für einen Programmlauf: gemeinsame Welt (mit Speicher für den Server-Abgleich) oder eigene Kopie */
export function createWorld(message: { world: WorldData, live?: SharedArrayBuffer, characterId?: string }, post: (message: { type: 'live', command: RobotCommand }) => void): World {
  return message.live ? new LiveWorld(message.world, new LiveChannel(message.live, post), message.characterId) : new World(message.world)
}
