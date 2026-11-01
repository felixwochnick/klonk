// In der Verwaltung nur Organisations- und Betreiber-Login, keine Privat-Anbieter
export default defineAppConfig({
  klonk: {
    socialLogin: false,
    operatorLogin: true,
    setupRoute: '/setup',
  },
})
