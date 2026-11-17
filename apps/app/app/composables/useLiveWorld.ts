import type { LivePlayer } from '@klonk/runtime/live'
import type { World } from '@klonk/world'
import { LiveWorldSession } from '~/utils/live/world-session'
import type { LiveStatus } from '~/utils/live/socket'

// Zustand außerhalb von Komponenten: die IDE bleibt beim Seitenwechsel in der gemeinsamen Welt
const session = shallowRef<LiveWorldSession | null>(null)
const target = ref<{ id: string, name: string } | null>(null)
const world = shallowRef<World | null>(null)
const players = ref<LivePlayer[]>([])
const figure = ref<string | null>(null)
const spectator = ref(false)
const status = ref<LiveStatus | null>(null)
/** Zählt Änderungen der angezeigten Welt (die Welt selbst ist nicht reaktiv) */
const version = ref(0)
const resetListeners = new Set<(by: LivePlayer | undefined) => void>()

/**
 * Gemeinsame Welt einer Untergruppe (Modus `world`): Jede:r programmiert im eigenen Projekt, alle Figuren stehen in
 * derselben Welt. Die IDE zeigt dann diese Welt und führt Programme darin aus (siehe ProgramRunner `live`).
 */
export function useLiveWorld() {
  function join(group: { id: string, name: string }) {
    if (target.value?.id === group.id && session.value) return
    leave()
    const live = new LiveWorldSession(group.id)
    live.onChange = () => {
      players.value = live.players
      figure.value = live.figure
      spectator.value = live.spectator
      status.value = live.status
      version.value++
    }
    live.onWorld = (next) => {
      world.value = next
    }
    live.onReset = (by) => {
      for (const listener of resetListeners) listener(by)
    }
    session.value = live
    target.value = { id: group.id, name: group.name }
  }

  function leave() {
    session.value?.close()
    session.value = null
    target.value = null
    world.value = null
    players.value = []
    figure.value = null
    spectator.value = false
    status.value = null
  }

  /** Bescheid bekommen, wenn jemand die Welt zurücksetzt (nur solange die Komponente lebt) */
  function onReset(listener: (by: LivePlayer | undefined) => void) {
    resetListeners.add(listener)
    if (getCurrentInstance()) onBeforeUnmount(() => resetListeners.delete(listener))
    return () => resetListeners.delete(listener)
  }

  return {
    session, target, world, players, figure, spectator, status, version,
    active: computed(() => !!session.value),
    join, leave, onReset,
    reset: () => session.value?.reset(),
  }
}
