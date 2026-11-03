import type { DbRequest, DbResponse, FromWorker } from '../protocol'

/**
 * Datenbankzugriff aus Programmen: Der Nutzercode läuft synchron im Worker, die Datenbanken liegen aber im
 * Datenbank-Worker (PGlite antwortet nur asynchron). Der Programm-Worker schickt die Anfrage an den Hauptthread
 * und wartet per Atomics.wait, bis die Antwort (JSON) im gemeinsamen Speicher steht.
 */
const HEADER_BYTES = 8
/** Größte Antwort (Ergebnis einer Abfrage als JSON) */
export const DB_BUFFER_BYTES = 8 * 1024 * 1024

export function createDbBuffer() {
  return new SharedArrayBuffer(HEADER_BYTES + DB_BUFFER_BYTES)
}

/** Hauptthread: Antwort ablegen und den wartenden Worker wecken */
export function writeDbResponse(buffer: SharedArrayBuffer, response: DbResponse) {
  let bytes = new TextEncoder().encode(JSON.stringify(response))
  if (bytes.length > DB_BUFFER_BYTES) bytes = new TextEncoder().encode(JSON.stringify({ ok: false, code: 'db_result_too_large', params: {} } satisfies DbResponse))
  const header = new Int32Array(buffer, 0, 2)
  new Uint8Array(buffer, HEADER_BYTES, bytes.length).set(bytes)
  Atomics.store(header, 1, bytes.length)
  Atomics.store(header, 0, 1)
  Atomics.notify(header, 0)
}

/** Worker: Anfrage stellen und blockierend auf die Antwort warten */
export function createDbCall(buffer: SharedArrayBuffer | undefined, post: (message: FromWorker) => void) {
  return (request: DbRequest): DbResponse => {
    if (!buffer) return { ok: false, code: 'db_unavailable', params: {} }
    const header = new Int32Array(buffer, 0, 2)
    Atomics.store(header, 0, 0)
    post({ type: 'db', request })
    Atomics.wait(header, 0, 0)
    const length = Atomics.load(header, 1)
    // TextDecoder nimmt keine Ansichten auf gemeinsamen Speicher ⇒ kopieren
    const text = new TextDecoder().decode(new Uint8Array(buffer, HEADER_BYTES, length).slice())
    return JSON.parse(text) as DbResponse
  }
}
