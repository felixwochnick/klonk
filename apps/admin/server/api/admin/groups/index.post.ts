import { z } from 'zod'

// Gruppe anlegen: Lehrkräfte werden Gruppenleitung; dazu der gemeinsame Cloud-Ordner
export default defineEventHandler(async (event) => {
  const { user, isPlatformAdmin } = await requireAuth(event, { roles: ['teacher', 'admin'] })
  const organizationId = await resolveOrganizationId(event, user, isPlatformAdmin)
  const { name } = await readValidated(event, z.object({ name: groupNameSchema }))
  return withUserDb(user.id, async (tx) => {
    const [group] = await tx.insert(schema.groups).values({ organizationId, name }).returning()
      .catch(error => rethrowUnique(error, 'group_exists'))
    if (user.role === 'teacher' && user.organizationId === organizationId)
      await tx.insert(schema.groupMembers).values({ groupId: group!.id, userId: user.id, role: 'leader' })
    await tx.insert(schema.cloudProjects).values({ groupId: group!.id, name })
    return { id: group!.id }
  })
})
