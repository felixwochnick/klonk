export default defineAppConfig({
  klonk: {
    /** Buttons für Google, Microsoft, Apple, GitHub auf der Login-Seite */
    socialLogin: true as boolean,
    /** Betreiber-Login per Klonk ID (nur in der Verwaltung) */
    operatorLogin: false as boolean,
  },
})

declare module '@nuxt/schema' {
  interface AppConfigInput {
    klonk?: {
      socialLogin?: boolean
      operatorLogin?: boolean
    }
  }
}
