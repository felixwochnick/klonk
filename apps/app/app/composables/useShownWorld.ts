import type { WorldData } from '@klonk/world'

// Welt nach dem letzten Programmlauf der IDE (modulweit) – die Seite Datenbanken fragt sie per SQL ab
// („Wie viele Ziegel hat Klonk gelegt?“); `null` = Startwelt
const shown = shallowRef<WorldData | null>(null)

export function useShownWorld() {
  return shown
}
