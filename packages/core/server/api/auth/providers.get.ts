// Konfigurierte Anmeldeanbieter für Privatkonten (Buttons auf der Login-Seite)
export default defineEventHandler(() => {
  const { oauth, platformOidc } = useRuntimeConfig() as ReturnType<typeof useRuntimeConfig> & {
    oauth: Record<string, { clientId?: string, teamId?: string } | undefined>
  }

  const social = (['google', 'microsoft', 'apple', 'github'] as const)
    .filter(p => !!(oauth[p]?.clientId))

  return {
    platform: platformOidc.issuer && platformOidc.clientId ? { name: platformOidc.name } : null,
    social,
  }
})
