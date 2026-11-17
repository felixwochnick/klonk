// In der Verwaltung: Organisations-, Privat- (Betreiberrechte vergeben Besitzer:innen) und Betreiber-Login
export default defineAppConfig({
  klonk: {
    socialLogin: true,
    operatorLogin: true,
    setupRoute: '/setup',
    // MCP-Server unter /mcp (Konten, Gruppen, Organisation)
    mcp: 'admin',
  },
})
