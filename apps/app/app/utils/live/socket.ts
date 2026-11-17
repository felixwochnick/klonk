/**
 * WebSocket zu einem Raum der Zusammenarbeit (`/_live`) mit automatischem Wiederverbinden. Nachrichten sind binär,
 * das erste Byte ist die Art (`LIVE_KIND`); JSON-Nachrichten gibt es als Objekt.
 */
export type LiveStatus = 'connecting' | 'online' | 'offline' | 'denied'

export type LiveSocketHandlers = {
  /** Verbindung steht (auch nach Wiederverbinden) */
  open?: () => void
  close?: () => void
  json?: (message: Record<string, unknown>) => void
  binary?: (data: Uint8Array) => void
  status?: (status: LiveStatus) => void
}

export class LiveSocket {
  private ws?: WebSocket
  private retry = 0
  private timer?: ReturnType<typeof setTimeout>
  private closed = false
  status: LiveStatus = 'connecting'

  constructor(private query: Record<string, string>, private handlers: LiveSocketHandlers) {
    this.connect()
  }

  private connect() {
    if (this.closed) return
    const url = new URL('/_live', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    for (const [key, value] of Object.entries(this.query)) url.searchParams.set(key, value)
    // Lokaler Testmodus der Lizenz: Browser schicken bei WebSockets keine eigenen Kopfzeilen
    url.searchParams.set('host', window.location.hostname)
    this.setStatus('connecting')
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    this.ws = ws
    let opened = false
    ws.onopen = () => {
      opened = true
      this.retry = 0
      this.setStatus('online')
      this.handlers.open?.()
    }
    ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (typeof event.data === 'string') return
      const data = new Uint8Array(event.data)
      if (data[0] === LIVE_KIND.json) {
        try {
          this.handlers.json?.(JSON.parse(new TextDecoder().decode(data.subarray(1))) as Record<string, unknown>)
        }
        catch {
          // ungültig – ignorieren
        }
      }
      else this.handlers.binary?.(data)
    }
    ws.onclose = (event) => {
      if (this.ws !== ws) return
      this.handlers.close?.()
      if (this.closed) return
      // Abgelehnt (keine Berechtigung, Raum gibt es nicht) ⇒ nicht endlos neu versuchen
      if (!opened && this.retry >= 3) return this.setStatus('denied')
      if (event.code === 4401) return this.setStatus('denied')
      this.setStatus('offline')
      const delay = Math.min(30_000, 500 * 2 ** this.retry++)
      this.timer = setTimeout(() => this.connect(), delay)
    }
  }

  private setStatus(status: LiveStatus) {
    this.status = status
    this.handlers.status?.(status)
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  send(data: Uint8Array) {
    if (this.open) this.ws!.send(data)
  }

  sendJson(message: object) {
    const body = new TextEncoder().encode(JSON.stringify(message))
    const data = new Uint8Array(body.length + 1)
    data[0] = LIVE_KIND.json
    data.set(body, 1)
    this.send(data)
  }

  close() {
    this.closed = true
    clearTimeout(this.timer)
    this.ws?.close()
    this.ws = undefined
  }
}
