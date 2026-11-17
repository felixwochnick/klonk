// Zusammenarbeit in Untergruppen: WebSocket je Raum (`/_live?project=<id>` bzw. `?world=<id>`), siehe server/utils/live.ts
const socketOf = (peer: { id: string, send: (data: Uint8Array) => unknown }): LiveSocket => ({ id: peer.id, send: data => void peer.send(data) })
const contextOf = (peer: { context: Record<string, unknown> }) => peer.context.live as LivePeerContext | undefined
/** Größte Nachricht (eine Datei ist höchstens 1 MB groß, siehe CLOUD_LIMITS) */
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024

export default defineWebSocketHandler({
  async upgrade(request) {
    // Session und Zugriff prüfen – abgelehnt wird mit einer Response (401/403/404)
    request.context.live = await authorizeLive(request)
  },
  async open(peer) {
    const context = contextOf(peer)
    if (!context) return peer.close(4401, 'unauthorized')
    await liveOpen(socketOf(peer), context)
  },
  async message(peer, message) {
    const context = contextOf(peer)
    const data = message.uint8Array()
    if (!context) return
    if (data.byteLength > MAX_MESSAGE_BYTES) return peer.close(1009, 'too_large')
    await liveMessage(socketOf(peer), context, data)
  },
  close(peer) {
    const context = contextOf(peer)
    if (context) liveClose(socketOf(peer), context)
  },
})
