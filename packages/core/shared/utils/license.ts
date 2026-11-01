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
  expiresAt: null,
  problem: null,
}

export function hasFeature(license: Pick<LicenseInfo, 'features'>, feature: LicenseFeature) {
  return license.features.includes(feature)
}
