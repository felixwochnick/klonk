export default defineAppConfig({
  klonk: {
    /** Buttons für Google, Microsoft, Apple, GitHub auf der Login-Seite */
    socialLogin: true as boolean,
  },
})

declare module '@nuxt/schema' {
  interface AppConfigInput {
    klonk?: {
      socialLogin?: boolean
    }
  }
}
