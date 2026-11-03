/**
 * Lizenzmodell (Open Core): ohne Token gelten die Grenzen der kostenlosen Version.
 * Tokens stellt ausschließlich klonk.* aus (privates Repo); hier wird nur geprüft.
 */
export const LICENSE_FEATURES = [
  /** Single Sign-on per OIDC für Organisationen (LDAP und lokale Konten sind kostenlos) */
  'oidc',
  /** Alle Figuren statt nur einer */
  'characters',
  /** Zusätzliche 3D-Modelle über die Standardmodelle hinaus */
  'models',
  /** Bibliotheken/Importe in Klonk-Script und TypeScript */
  'libraries',
  /** KI-Assistent */
  'ai',
  /** Gehostete Plattform: Grenzen gelten pro Organisation (über deren eigenes Token) */
  'hosted',
] as const

export type LicenseFeature = typeof LICENSE_FEATURES[number]

export type LicenseInfo = {
  plan: string
  /** Kunde laut Token, `null` bei der kostenlosen Version */
  licensee: string | null
  /** `null` = unbegrenzt */
  maxUsers: number | null
  features: LicenseFeature[]
  /** Gehostete Plattform: KI-Credits pro Monat für die abgerechnete Klonk-KI (1 Credit ≈ 1 Cent API-Kosten) */
  aiCredits: number
  expiresAt: string | null
  /** Token vorhanden, aber abgelaufen/ungültig ⇒ es gelten die kostenlosen Grenzen */
  /**
   * `grace` = abgelaufen, aber noch in der Kulanzzeit (Funktionen bleiben aktiv);
   * sonst gelten bei einem Problem die kostenlosen Grenzen
   */
  problem: 'grace' | 'expired' | 'invalid' | 'wrong_domain' | null
}

/** Nach Ablauf bleiben die Funktionen so lange aktiv – kein plötzlicher Ausfall z. B. des Schul-SSO */
export const LICENSE_GRACE_DAYS = 14

export const FREE_MAX_USERS = 10
/** Ohne Feature `characters` steht genau eine Figur zur Verfügung */
export const FREE_MAX_CHARACTERS = 1

export const FREE_LICENSE: LicenseInfo = {
  plan: 'free',
  licensee: null,
  maxUsers: FREE_MAX_USERS,
  features: [],
  aiCredits: 0,
  expiresAt: null,
  problem: null,
}

/**
 * Pläne fürs Selbsthosten (Preise pflegt der Shop auf klonk.*). Der Plan steht im Token,
 * die Grenze in `maxUsers` – hier nur die Standardwerte fürs Ausstellen und die Anzeige.
 */
export const SELF_HOSTED_PLANS = {
  'self-hosted': { maxUsers: 1000 },
  'self-hosted-enterprise': { maxUsers: null },
} as const satisfies Record<string, { maxUsers: number | null }>

/** Ab diesem Anteil der Grenze warnt die Verwaltung */
export const USER_LIMIT_WARNING = 0.9
/** Puffer über der Grenze, bevor gesperrt wird (z. B. neuer Jahrgang) – nicht in der kostenlosen Version */
export const USER_LIMIT_BUFFER = 0.1

export type UserUsage = {
  used: number
  /** Grenze laut Lizenz, `null` = unbegrenzt */
  max: number | null
  /** Ab hier können keine Konten mehr angelegt werden */
  hardMax: number | null
  /** `warning` ≥ 90 %, `over` Grenze erreicht (Puffer läuft), `blocked` keine neuen Konten */
  status: 'ok' | 'warning' | 'over' | 'blocked'
}

export function userUsage(used: number, license: Pick<LicenseInfo, 'plan' | 'maxUsers'>): UserUsage {
  const max = license.maxUsers
  if (max === null) return { used, max, hardMax: null, status: 'ok' }

  const buffer = license.plan === 'free' ? 0 : Math.max(1, Math.floor(max * USER_LIMIT_BUFFER))
  const hardMax = max + buffer
  const status = used >= hardMax ? 'blocked' : used >= max ? 'over' : used >= max * USER_LIMIT_WARNING ? 'warning' : 'ok'
  return { used, max, hardMax, status }
}

export function hasFeature(license: Pick<LicenseInfo, 'features'>, feature: LicenseFeature) {
  return license.features.includes(feature)
}
