/**
 * Klonk Cloud: Projekte auf dem Server (mit lokaler Kopie im Browser) und gemeinsame Ordner von Gruppen.
 * Gemeinsame Typen für Server und App.
 */

/** Grenzen je Datei/Projekt (Kontingente pro Konto bzw. Gruppe stehen in der Runtime-Config) */
export const CLOUD_LIMITS = { fileBytes: 1_000_000, files: 2000, pathLength: 500, changes: 1000 } as const

export type CloudProjectKind = 'personal' | 'group' | 'submission'

export type CloudProjectInfo = {
  id: string
  name: string
  kind: CloudProjectKind
  /** Darf der Nutzer schreiben? (gemeinsamer Ordner: Gruppenleitung bzw. nach Freigabe; Abgaben anderer: nein) */
  writable: boolean
  groupId: string | null
  assignmentId: string | null
  size: number
  updatedAt: string
}

export type CloudAssignmentInfo = {
  id: string
  /** Ordner im gemeinsamen Ordner der Gruppe */
  path: string
  /** Eigene Bearbeitung (Projekt), falls schon begonnen */
  projectId: string | null
}

export type CloudGroupInfo = {
  id: string
  name: string
  leader: boolean
  membersCanWrite: boolean
  /** Gemeinsamer Ordner */
  projectId: string | null
  assignments: CloudAssignmentInfo[]
}

export type CloudStatus = {
  /** Synchronisieren erlaubt (Selbsthosting immer, gehostet mit Abo) – ohne bleiben vorhandene Daten lesbar */
  enabled: boolean
  /** Belegter Speicher und Kontingent des Kontos in Bytes */
  quota: { used: number, limit: number }
  projects: CloudProjectInfo[]
  groups: CloudGroupInfo[]
}

/** Änderung einer Datei oder eines Ordners (gelöscht = Grabstein) */
export type CloudChange = {
  path: string
  folder: boolean
  deleted: boolean
  revision: number
  content: string | null
}

export type CloudChanges = { revision: number, writable: boolean, changes: CloudChange[], more: boolean }

/** Gültiger Pfad: Teile ohne Pfadtricks (wie `isValidName` der Projekte) */
export function isValidCloudPath(path: string) {
  return path.length > 0 && path.length <= CLOUD_LIMITS.pathLength && path.split('/').every(part =>
    !!part && part.length <= 120 && !/[\\:*?"<>|]/.test(part) && !part.startsWith('.'))
}
