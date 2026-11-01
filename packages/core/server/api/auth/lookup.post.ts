import { z } from 'zod'

// Liefert die Login-Methoden der Organisation zur Domain – verrät nichts über einzelne Konten
export default defineEventHandler(async (event): Promise<LoginLookup> => {
  const { identifier } = await readValidated(event, z.object({ identifier: z.string().min(3).max(320) }))

  const parsed = parseIdentifier(identifier)
  if (!parsed) throw createError({ statusCode: 400, message: 'invalid_identifier' })

  const org = await findOrganizationByDomain(parsed.domain)
  if (!org) throw createError({ statusCode: 404, message: 'unknown_organization' })

  return {
    organizationId: org.organization.id,
    organizationName: org.organization.name,
    methods: await loginMethods(org.organization.id, org.settings),
  }
})
