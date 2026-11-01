export default defineAppConfig({
  klonk: {
    /** Buttons für Google, Microsoft, Apple, GitHub auf der Login-Seite */
    socialLogin: true as boolean,
    /** Betreiber-Login per Klonk ID (nur in der Verwaltung) */
    operatorLogin: false as boolean,
    /** Diese App ist die zentrale Anmeldung (auth.klonk.*) */
    authServer: false as boolean,
    /** Pfad des Einrichtungsassistenten (nur admin) */
    setupRoute: '' as string,
  },
})

declare module '@nuxt/schema' {
  interface AppConfigInput {
    klonk?: {
      socialLogin?: boolean
      operatorLogin?: boolean
      authServer?: boolean
      setupRoute?: string
    }
  }
}
