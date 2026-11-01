type T = (key: string, params?: Record<string, unknown>) => string
type TE = (key: string) => boolean

/** Fehlermeldung zu einem Klonk-Script-Fehlercode (Weltfehler kommen als `world` + `worldCode`) */
export function scriptErrorMessage(t: T, te: TE, code: string, params: Record<string, string | number> = {}) {
  if (code === 'world' && params.worldCode) return t(`world.errors.${params.worldCode}`, params)
  if (te(`script.errors.${code}`)) return t(`script.errors.${code}`, params)
  return t('script.errors.unknown', { code })
}
