import { z } from 'zod'

// Gruppe anlegen (optional gleich in eine Jahrgangsstufe bzw. die Zusatzkurse): Lehrkräfte werden Gruppenleitung; dazu der gemeinsame Cloud-Ordner
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const { name, level } = await readValidated(event, z.object({ name: groupNameSchema, level: groupLevelSchema.optional() }))
  const leader = user.role === 'teacher' && user.organizationId === organizationId ? user.id : undefined
  return withUserDb(user.id, async tx => ({ id: await insertGroup(tx, organizationId, name, level, leader) }))
})
