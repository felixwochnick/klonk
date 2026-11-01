export type OrganizationType = 'school' | 'company'
export type MemberRole = 'member' | 'teacher' | 'admin'
export type PlatformRole = 'user' | 'developer' | 'owner'
export type LoginMethod = 'password' | 'ldap' | 'oidc'

export type SessionUser = {
  id: string
  displayName: string
  username: string | null
  email: string | null
  organizationId: string | null
  organizationName: string | null
  organizationType: OrganizationType | null
  domain: string | null
  role: MemberRole
  platformRole: PlatformRole
  mustChangePassword: boolean
  /** Lokales Passwort vorhanden (sonst nur SSO) */
  hasPassword: boolean
}

export type LoginLookup = {
  organizationId: string
  organizationName: string
  methods: LoginMethod[]
}
