/**
 * Prüft Weiterleitungsziele nach dem Login (Schutz vor Open Redirects):
 * relative Pfade der eigenen Seite oder absolute URLs auf erlaubten Origins (app, admin, auth, Website).
 */
export function safeRedirectTarget(target: unknown, allowedOrigins: string[], fallback = '/') {
  if (typeof target !== 'string' || !target) return fallback
  if (target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')) return target
  try {
    const url = new URL(target)
    const origins = allowedOrigins.filter(Boolean).map(o => new URL(o).origin)
    return origins.includes(url.origin) ? url.href : fallback
  }
  catch {
    return fallback
  }
}

/** Erlaubte Origins aus der öffentlichen Runtime-Config */
export function allowedRedirectOrigins(config: { appUrl: string, adminUrl: string, authUrl: string, websiteUrls: string }) {
  return [config.appUrl, config.adminUrl, config.authUrl, ...config.websiteUrls.split(',')].map(s => s.trim()).filter(Boolean)
}
