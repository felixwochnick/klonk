/** Eine Animation der Weltansicht: `update(t)` mit t von 0 bis 1, danach `done` */
export type WorldAnimation = { duration: number, update: (t: number) => void, done?: () => void }

type Lane = { queue: WorldAnimation[], current?: { animation: WorldAnimation, start: number, duration: number } }

/**
 * Warteschlangen der Animationen (3D- und 2D-Ansicht): sonst eine für alles (Befehle eines Programms nacheinander),
 * in der gemeinsamen Welt (`parallel`) eine je Figur – die Figuren mehrerer Personen bewegen sich gleichzeitig,
 * staut es sich, laufen die Animationen schneller.
 */
export class AnimationQueue {
  parallel = false
  private lanes = new Map<string, Lane>()

  /** `onStart` läuft, bevor eine Animation beginnt (z. B. Bewegung im Stand beenden) */
  constructor(private onStart?: () => void) {}

  /** Läuft gerade noch eine Animation? */
  get busy() {
    for (const lane of this.lanes.values()) if (lane.current || lane.queue.length) return true
    return false
  }

  clear() {
    this.lanes.clear()
  }

  /** Animation anhängen – in der gemeinsamen Welt in die Warteschlange der Figur `lane` */
  enqueue(animation: WorldAnimation, lane = '') {
    const key = this.parallel ? lane : ''
    let entry = this.lanes.get(key)
    if (!entry) {
      entry = { queue: [] }
      this.lanes.set(key, entry)
    }
    entry.queue.push(animation)
  }

  tick(now: number) {
    for (const lane of [...this.lanes.values()]) this.tickLane(lane, now)
  }

  private tickLane(lane: Lane, now: number) {
    if (!lane.current) {
      const next = lane.queue.shift()
      if (!next) return
      this.onStart?.()
      // Gemeinsame Welt: Rückstau aufholen (die anderen warten nicht auf die Animation)
      const catchUp = this.parallel && lane.queue.length > 1 ? 2 / (lane.queue.length + 1) : 1
      lane.current = { animation: next, start: now, duration: next.duration * catchUp }
    }
    const { animation, start, duration } = lane.current
    const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1
    animation.update(t)
    if (t >= 1) {
      animation.done?.()
      lane.current = undefined
      // Restliche Sofort-Animationen im selben Frame abarbeiten
      if (lane.queue[0]?.duration === 0) this.tickLane(lane, now)
    }
  }
}

export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}
