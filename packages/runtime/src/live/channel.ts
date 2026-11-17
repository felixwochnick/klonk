import type { RobotCommand } from '@klonk/klonk-script'
import type { WorldData } from '@klonk/world'

/**
 * Gemeinsame Welt: Der Nutzercode läuft synchron im Worker, die Welt gehört aber dem Server. Zwei Wege über einen
 * gemeinsamen Speicher (wie bei den Datenbanken, siehe db/channel.ts):
 *  - Anfrage/Antwort: Der Worker meldet einen Befehl seiner Figur (`{ type: 'live' }`) und wartet per Atomics.wait,
 *    bis der Server ihn bestätigt oder ablehnt.
 *  - Eingang: Der Hauptthread legt jeden bestätigten Befehl aller Figuren (in Server-Reihenfolge) hier ab; die Welt
 *    im Worker liest ihn vor jedem Zugriff ein – auch während der Nutzercode den Worker blockiert.
 */

/** Antwort des Servers auf einen Befehl der eigenen Figur */
export type LiveResponse = { ok: true } | { ok: false, code: string, params: Record<string, string | number> }

/** Bestätigte Änderung der gemeinsamen Welt (Befehl einer Figur oder komplett neue Welt) */
export type LiveInboxEvent = { type: 'command', command: RobotCommand } | { type: 'world', world: WorldData }

const HEADER = { FLAG: 0, LENGTH: 1, LOCK: 2, WRITE: 3, READ: 4 } as const
const HEADER_BYTES = 32
const RESPONSE_BYTES = 64 * 1024
/** Eingang: bestätigte Befehle als JSON-Zeilen */
export const LIVE_INBOX_BYTES = 1024 * 1024

export function createLiveBuffer() {
  return new SharedArrayBuffer(HEADER_BYTES + RESPONSE_BYTES + LIVE_INBOX_BYTES)
}

const header = (buffer: SharedArrayBuffer) => new Int32Array(buffer, 0, HEADER_BYTES / 4)
const inbox = (buffer: SharedArrayBuffer) => new Uint8Array(buffer, HEADER_BYTES + RESPONSE_BYTES, LIVE_INBOX_BYTES)

/** Kurze Sperre um den Eingang (der Hauptthread darf nicht mit Atomics.wait warten ⇒ kurz drehen) */
function locked<T>(buffer: SharedArrayBuffer, fn: () => T): T {
  const h = header(buffer)
  while (Atomics.compareExchange(h, HEADER.LOCK, 0, 1) !== 0) {
    // Die andere Seite hält die Sperre nur für ein Kopieren
  }
  try {
    return fn()
  }
  finally {
    Atomics.store(h, HEADER.LOCK, 0)
  }
}

/** Hauptthread: Antwort ablegen und den wartenden Worker wecken */
export function writeLiveResponse(buffer: SharedArrayBuffer, response: LiveResponse) {
  const bytes = new TextEncoder().encode(JSON.stringify(response)).slice(0, RESPONSE_BYTES)
  const h = header(buffer)
  new Uint8Array(buffer, HEADER_BYTES, bytes.length).set(bytes)
  Atomics.store(h, HEADER.LENGTH, bytes.length)
  Atomics.store(h, HEADER.FLAG, 1)
  Atomics.notify(h, HEADER.FLAG)
}

/**
 * Hauptthread: bestätigte Änderung in den Eingang legen. Ist er voll (der Worker liest lange nicht), ersetzt der
 * aktuelle Stand der Welt (`snapshot`) alle wartenden Einträge.
 */
export function pushLiveInbox(buffer: SharedArrayBuffer, event: LiveInboxEvent, snapshot?: () => WorldData) {
  const encode = (e: LiveInboxEvent) => new TextEncoder().encode(`${JSON.stringify(e)}\n`)
  let bytes = encode(event)
  locked(buffer, () => {
    const h = header(buffer)
    const data = inbox(buffer)
    let write = Atomics.load(h, HEADER.WRITE)
    const read = Atomics.load(h, HEADER.READ)
    if (write + bytes.length > LIVE_INBOX_BYTES) {
      // Gelesenes vorne entfernen
      data.copyWithin(0, read, write)
      write -= read
      Atomics.store(h, HEADER.READ, 0)
      if (write + bytes.length > LIVE_INBOX_BYTES) {
        if (!snapshot) return
        bytes = encode({ type: 'world', world: snapshot() })
        write = 0
        if (bytes.length > LIVE_INBOX_BYTES) return
      }
    }
    data.set(bytes, write)
    Atomics.store(h, HEADER.WRITE, write + bytes.length)
  })
}

/** Worker: Befehle an den Server melden und bestätigte Änderungen einlesen */
export class LiveChannel {
  constructor(
    private buffer: SharedArrayBuffer,
    private post: (message: { type: 'live', command: RobotCommand }) => void,
  ) {}

  /** Befehl der eigenen Figur – blockiert, bis der Server antwortet */
  request(command: RobotCommand): LiveResponse {
    const h = header(this.buffer)
    Atomics.store(h, HEADER.FLAG, 0)
    this.post({ type: 'live', command })
    Atomics.wait(h, HEADER.FLAG, 0)
    const length = Atomics.load(h, HEADER.LENGTH)
    // TextDecoder nimmt keine Ansichten auf gemeinsamen Speicher ⇒ kopieren
    return JSON.parse(new TextDecoder().decode(new Uint8Array(this.buffer, HEADER_BYTES, length).slice())) as LiveResponse
  }

  /** Alle noch nicht gelesenen Änderungen (in Server-Reihenfolge) */
  drain(): LiveInboxEvent[] {
    const h = header(this.buffer)
    if (Atomics.load(h, HEADER.READ) === Atomics.load(h, HEADER.WRITE)) return []
    const bytes = locked(this.buffer, () => {
      const read = Atomics.load(h, HEADER.READ)
      const write = Atomics.load(h, HEADER.WRITE)
      const copy = inbox(this.buffer).slice(read, write)
      // Alles gelesen ⇒ wieder vorne anfangen
      Atomics.store(h, HEADER.READ, 0)
      Atomics.store(h, HEADER.WRITE, 0)
      return copy
    })
    return new TextDecoder().decode(bytes).split('\n').filter(Boolean).map(line => JSON.parse(line) as LiveInboxEvent)
  }
}
