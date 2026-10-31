import type { SessionUser } from './auth'

declare module '#auth-utils' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends SessionUser {}

  interface UserSession {
    sessionId: string
  }
}

export {}
