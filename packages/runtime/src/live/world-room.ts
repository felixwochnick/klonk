import { CHARACTER_MODELS, World, WorldError, isValidCharacterName, parseWorld, type CharacterData, type WorldData } from '@klonk/world'
import { applyCommand, parseRobotCommand } from '../commands'
import { liveColor, type LivePlayer, type LiveWorldClientMessage, type LiveWorldServerMessage } from './protocol'

/** Verbindung zum Raum (eine Person kann mehrere haben, z. B. zwei Tabs) */
export type WorldRoomPeer = {
  /** Eindeutig je Verbindung */
  id: string
  userId: string
  name: string
  /** Ohne eigene Figur zusehen (Lehrkraft, die nicht Mitglied der Untergruppe ist) */
  spectator: boolean
  /** Figuren, die die Person höchstens besitzt (Lizenz: ohne Feature `characters` nur die eigene) */
  maxCharacters: number
  send: (message: LiveWorldServerMessage) => void
}

type Player = {
  userId: string
  name: string
  color: string
  spectator: boolean
  /** Eigene Figuren, die erste ist die Figur der Person */
  figures: string[]
  connections: Set<string>
}

/** Mehr Figuren fasst das Weltformat nicht */
const MAX_FIGURES = 32

/**
 * Gemeinsame Welt einer Untergruppe – läuft auf dem Server, unabhängig vom Transport (WebSocket) testbar.
 * Jede Person bekommt beim ersten Beitreten eine Figur mit ihrem Namen: auf dem nächsten freien Startplatz (die Figuren
 * der Startwelt sind nur Startplätze mit Lage, Blickrichtung und Aussehen), sonst auf einem freien Feld. Befehle gelten
 * nur für eigene Figuren; der Raum führt sie nacheinander aus und schickt sie allen in derselben Reihenfolge.
 */
export class WorldRoom {
  readonly world: World
  private start: WorldData
  private slots: CharacterData[]
  /** Startplatz ⇒ Konto */
  private slotOwners: (string | null)[]
  private players = new Map<string, Player>()
  private peers = new Map<string, WorldRoomPeer>()
  /** Figur ⇒ Konto */
  private owners = new Map<string, string>()

  constructor(start: WorldData) {
    this.start = parseWorld(start)
    this.slots = this.start.characters
    this.slotOwners = this.slots.map(() => null)
    this.world = new World({ ...this.start, characters: [] })
  }

  get empty() {
    return this.peers.size === 0
  }

  join(peer: WorldRoomPeer) {
    this.peers.set(peer.id, peer)
    let player = this.players.get(peer.userId)
    if (!player) {
      player = { userId: peer.userId, name: peer.name, color: liveColor(peer.userId), spectator: peer.spectator, figures: [], connections: new Set() }
      this.players.set(peer.userId, player)
    }
    player.connections.add(peer.id)
    player.spectator = peer.spectator
    if (!player.spectator && !this.figureOf(player)) this.claim(player, peer.id)
    peer.send({
      t: 'welcome',
      world: this.world.toJSON(),
      you: { userId: player.userId, figure: this.figureOf(player), spectator: player.spectator },
      players: this.playerList(),
    })
    this.broadcast({ t: 'players', players: this.playerList() }, peer.id)
  }

  leave(peerId: string) {
    const peer = this.peers.get(peerId)
    if (!peer) return
    this.peers.delete(peerId)
    this.players.get(peer.userId)?.connections.delete(peerId)
    this.broadcast({ t: 'players', players: this.playerList() })
  }

  message(peerId: string, data: unknown) {
    const peer = this.peers.get(peerId)
    if (!peer || !data || typeof data !== 'object') return
    const message = data as Partial<LiveWorldClientMessage> & Record<string, unknown>
    if (message.t === 'cmd') this.command(peer, message.ref, message.command)
    else if (message.t === 'reset') this.reset(peer.id)
    else if (message.t === 'sync') peer.send({ t: 'world', world: this.world.toJSON(), reason: 'sync' })
  }

  /** Figur, die zu dieser Person gehört (falls noch in der Welt) */
  private figureOf(player: Player) {
    return player.figures.find(id => this.has(id)) ?? null
  }

  private has(id: string) {
    return this.world.getCharacters().some(c => c.id === id)
  }

  private command(peer: WorldRoomPeer, ref: unknown, raw: unknown) {
    const reference = typeof ref === 'number' && Number.isInteger(ref) ? ref : 0
    const reject = (code: string, params: Record<string, string | number> = {}) => peer.send({ t: 'reject', ref: reference, code, params })
    const command = parseRobotCommand(raw)
    const player = this.players.get(peer.userId)
    if (!command) return reject('live_invalid')
    if (!player || player.spectator) return reject('live_not_owner', { id: command.id })
    if (command.name === 'createCharacter') {
      const owned = player.figures.filter(id => this.has(id)).length
      if (owned >= peer.maxCharacters) return reject('character_limit', { max: peer.maxCharacters })
    }
    else if (this.owners.get(command.id) !== player.userId) {
      return reject(this.has(command.id) ? 'live_not_owner' : 'unknown_character', { id: command.id })
    }
    try {
      if (command.name === 'createCharacter') this.world.addCharacter(command.character, MAX_FIGURES)
      else applyCommand(this.world, command)
    }
    catch (error) {
      if (error instanceof WorldError) return reject(error.code, error.params)
      return reject('live_invalid')
    }
    if (command.name === 'createCharacter') {
      player.figures.push(command.id)
      this.owners.set(command.id, player.userId)
    }
    for (const other of this.peers.values()) {
      other.send({ t: 'cmd', command, by: peer.userId, ...(other.id === peer.id ? { ref: reference } : {}) })
    }
  }

  /** Zurück zur Startwelt (optional einer neuen, z. B. inzwischen geänderten); wer gerade da ist, bekommt wieder eine Figur */
  reset(peerId: string, start?: WorldData) {
    const peer = this.peers.get(peerId)
    if (!peer) return
    if (start) {
      this.start = parseWorld(start)
      this.slots = this.start.characters
    }
    this.world.reset({ ...this.start, characters: [] })
    this.owners.clear()
    this.slotOwners = this.slots.map(() => null)
    for (const player of this.players.values()) {
      player.figures = []
      if (!player.spectator && player.connections.size) this.claim(player)
    }
    this.broadcast({ t: 'world', world: this.world.toJSON(), reason: 'reset', by: peer.userId })
    for (const other of this.peers.values()) {
      const player = this.players.get(other.userId)
      other.send({ t: 'you', figure: player ? this.figureOf(player) : null })
    }
    this.broadcast({ t: 'players', players: this.playerList() })
  }

  /** Figur für eine Person: freier Startplatz (sonst freies Feld) – alle anderen erfahren es als neuen Befehl */
  private claim(player: Player, except?: string) {
    const index = this.slotOwners.findIndex(owner => owner === null)
    const slot = index >= 0 ? this.slots[index] : undefined
    const free = (p: { x: number, z: number }) => !this.world.cell(p).block && !this.world.characterAt(p)
    const position = slot && free(slot) ? { x: slot.x, z: slot.z } : this.world.freeCellNear(slot)
    if (!position || this.world.getCharacters().length >= MAX_FIGURES) return
    const character: CharacterData = {
      id: this.uniqueName(player.name),
      model: slot?.model ?? CHARACTER_MODELS[this.players.size % CHARACTER_MODELS.length]!,
      ...(slot?.design ? { design: slot.design } : {}),
      direction: slot?.direction ?? 'south',
      ...position,
    }
    try {
      this.world.addCharacter(character, MAX_FIGURES)
    }
    catch {
      return
    }
    if (index >= 0) this.slotOwners[index] = player.userId
    player.figures = [character.id, ...player.figures.filter(id => id !== character.id)]
    this.owners.set(character.id, player.userId)
    if (except !== undefined) this.broadcast({ t: 'cmd', command: { name: 'createCharacter', id: character.id, character }, by: player.userId }, except)
  }

  /** Name der Figur aus dem Anzeigenamen (gültig und in der Welt eindeutig) */
  private uniqueName(name: string) {
    const cleaned = name.normalize('NFC').replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32).trim()
    const base = isValidCharacterName(cleaned) ? cleaned : 'Klonk'
    const taken = new Set(this.world.getCharacters().map(c => c.id.toLowerCase()))
    if (!taken.has(base.toLowerCase())) return base
    for (let i = 2; ; i++) {
      const candidate = `${base.slice(0, 32 - String(i).length - 1).trim()} ${i}`
      if (!taken.has(candidate.toLowerCase())) return candidate
    }
  }

  private playerList(): LivePlayer[] {
    return [...this.players.values()]
      .filter(p => p.connections.size > 0 || this.figureOf(p))
      .map(p => ({ userId: p.userId, name: p.name, figure: this.figureOf(p), online: p.connections.size > 0, spectator: p.spectator, color: p.color }))
  }

  private broadcast(message: LiveWorldServerMessage, except?: string) {
    for (const peer of this.peers.values()) if (peer.id !== except) peer.send(message)
  }
}

/** Startwelt einer neuen Untergruppe: 10 × 10 Felder, vier Startplätze in den Ecken (Blick zur Mitte) */
export function defaultStartWorld(): WorldData {
  return {
    version: 1,
    size: { width: 10, depth: 10, height: 6 },
    cells: [],
    characters: [
      { id: 'Start 1', model: 'male', x: 0, z: 0, direction: 'south' },
      { id: 'Start 2', model: 'female', x: 9, z: 9, direction: 'north' },
      { id: 'Start 3', model: 'diverse', x: 9, z: 0, direction: 'west' },
      { id: 'Start 4', model: 'male', x: 0, z: 9, direction: 'east' },
    ],
  }
}
