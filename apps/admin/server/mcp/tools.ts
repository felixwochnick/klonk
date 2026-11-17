import { randomInt } from 'node:crypto'
import { asc, count, eq } from 'drizzle-orm'
import { z } from 'zod'
import en from '../../i18n/locales/en.json'

/**
 * MCP-Werkzeuge der Verwaltung: Organisation (Schulform), Konten, Klassen/Gruppen und Mitglieder. Dieselben Funktionen wie
 * die REST-API (`server/utils/directory.ts`) – RLS prüft, Rollen wie in den Routen. Betreiber:innen wählen die
 * Organisation per `organizationId`.
 */
const organizationId = z.uuid().optional().describe('Only for platform operators: organization to work on (see list_organizations)')
const groupRef = z.string().min(1).describe('Class/group: its id or its name, e.g. "7a"')
const groupLevel = z.string().regex(/^(\d{1,2}|courses)$/).nullable().describe('Grade level ("5", "7" …), "courses" for extra courses, null = not assigned')

const normalize = (value: string) => value.trim().toLowerCase()

/** Lesbares Startpasswort ohne verwechselbare Zeichen (Pflichtänderung beim ersten Login) */
function initialPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 10 }, () => alphabet[randomInt(alphabet.length)]).join('')
}

/** Benutzername aus dem Anzeigenamen (`Lisa Müller` ⇒ `lisa.mueller`) */
function usernameFrom(displayName: string) {
  return displayName.trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '').slice(0, 64)
}

async function resolveGroup(user: SessionUser, orgId: string, ref: string) {
  const groups = await listGroups(user, orgId)
  const found = groups.find(g => g.id === ref) ?? groups.find(g => normalize(g.name) === normalize(ref))
  if (!found) throw createError({ statusCode: 404, message: `group_not_found – groups: ${groups.map(g => g.name).join(', ') || '–'}` })
  return found
}

type Account = Awaited<ReturnType<typeof listUsers>>[number]

/** Konten über ID, Benutzernamen (mit/ohne Domain), Anzeigenamen oder eindeutigen Namensanfang */
function resolveAccounts(accounts: Account[], refs: string[]) {
  const found: Account[] = []
  const problems: string[] = []
  for (const ref of refs) {
    const key = normalize(ref)
    const username = key.split('@')[0]
    let matches = accounts.filter(a => a.id === ref || a.username === username || normalize(a.displayName) === key)
    if (!matches.length) matches = accounts.filter(a => normalize(a.displayName).startsWith(key) || normalize(a.displayName).split(/\s+/).includes(key))
    if (matches.length === 1) found.push(matches[0]!)
    else problems.push(matches.length ? `"${ref}" is ambiguous (${matches.map(m => `${m.displayName} <${m.username}>`).join(', ')})` : `"${ref}" not found`)
  }
  if (problems.length) throw createError({ statusCode: 400, message: `invalid_input – ${problems.join('; ')}` })
  return [...new Map(found.map(a => [a.id, a])).values()]
}

const orgOf = (ctx: McpToolContext, requested?: string) => organizationIdFor(ctx.user, ctx.isPlatformAdmin, requested)

export const adminMcpTools = [
  whoamiTool,

  defineMcpTool({
    name: 'list_organizations',
    title: 'Organizations',
    description: 'Platform operators only: all schools and companies of this Klonk instance with number of accounts.',
    access: 'read',
    platformAdmin: true,
    input: {},
    handler: async (_input, { user }) => {
      const { organizations, users } = schema
      return withUserDb(user.id, tx => tx.select({ id: organizations.id, name: organizations.name, type: organizations.type, domain: organizations.domain, accounts: count(users.id) })
        .from(organizations).leftJoin(users, eq(users.organizationId, organizations.id)).groupBy(organizations.id).orderBy(asc(organizations.name)))
    },
  }),

  defineMcpTool({
    name: 'get_organization',
    title: 'Organization',
    description: 'The school or company: name, login domain (accounts sign in as username@domain), country/state/school form (determine grade levels and curriculum recommendations), allowed storage for learning modules and the account limit of the license.',
    access: 'read',
    roles: ['teacher', 'admin'],
    input: { organizationId },
    handler: async (input, ctx) => {
      const id = orgOf(ctx, input.organizationId)
      const [org] = await withUserDb(ctx.user.id, tx => tx.select().from(schema.organizations).where(eq(schema.organizations.id, id)))
      if (!org) throw createError({ statusCode: 404, message: 'not_found' })
      const hosted = hasFeature(await getInstanceLicense(), 'hosted')
      return {
        id: org.id,
        name: org.name,
        type: org.type,
        domain: org.domain,
        country: org.country,
        state: org.state,
        schoolForm: org.schoolForm,
        gradeLevels: schoolLevels(org.schoolForm),
        learnStorage: org.learnStorage,
        accounts: await getUserUsage(hosted ? id : null),
        availableSchoolForms: org.state ? schoolForms(org.country, org.state) : undefined,
      }
    },
  }),

  defineMcpTool({
    name: 'update_organization',
    title: 'Change school settings',
    description: 'Admins: sets country (DE), German state (ISO code without "DE-", e.g. BY, NW, BW) and school form (e.g. gymnasium9, realschule, mittelschule, grundschule) – they define the grade levels and curriculum recommendations – and where learners may save learning modules.',
    access: 'write',
    roles: ['admin'],
    idempotent: true,
    input: {
      organizationId,
      country: z.enum(SCHOOL_COUNTRIES).nullable().optional(),
      state: z.string().refine(s => s in GERMAN_STATES, 'unknown state').nullable().optional(),
      schoolForm: z.string().refine(isSchoolForm, `unknown school form, one of: ${Object.keys(SCHOOL_FORMS).join(', ')}`).nullable().optional(),
      learnStorage: z.array(z.enum(['cloud', 'browser', 'folder'])).min(1).max(3).optional(),
    },
    handler: async ({ organizationId: requested, ...input }, ctx) => {
      const id = orgOf(ctx, requested)
      const rows = await withUserDb(ctx.user.id, tx => tx.update(schema.organizations).set(input).where(eq(schema.organizations.id, id)).returning({ id: schema.organizations.id }))
      if (!rows.length) throw createError({ statusCode: 403, message: 'forbidden' })
      return { ok: true }
    },
  }),

  defineMcpTool({
    name: 'list_users',
    title: 'Accounts',
    description: 'Accounts of the organization (teachers see all accounts of their school). Filter by role (member = learner/employee, teacher, admin), search text or group. Returns username (sign-in: username@domain), display name, role, status and groups.',
    access: 'read',
    roles: ['teacher', 'admin'],
    input: {
      organizationId,
      role: z.enum(['member', 'teacher', 'admin']).optional(),
      search: z.string().max(100).optional(),
      group: groupRef.optional(),
    },
    handler: async (input, ctx) => {
      const id = orgOf(ctx, input.organizationId)
      let accounts = await listUsers(ctx.user, id)
      if (input.role) accounts = accounts.filter(a => a.role === input.role)
      if (input.search) accounts = accounts.filter(a => normalize(a.displayName).includes(normalize(input.search!)) || a.username?.includes(normalize(input.search!)))
      const groups = await listGroups(ctx.user, id)
      const memberships = new Map<string, string[]>()
      for (const g of groups) {
        const { members } = await getGroup(ctx.user, g.id)
        for (const m of members) memberships.set(m.userId, [...(memberships.get(m.userId) ?? []), m.role === 'leader' ? `${g.name} (leader)` : g.name])
      }
      if (input.group) {
        const group = await resolveGroup(ctx.user, id, input.group)
        accounts = accounts.filter(a => memberships.get(a.id)?.some(n => n === group.name || n === `${group.name} (leader)`))
      }
      return accounts.map(a => ({
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        role: a.role,
        disabled: a.disabled,
        mustChangePassword: a.mustChangePassword,
        lastLoginAt: a.lastLoginAt,
        groups: memberships.get(a.id) ?? [],
      }))
    },
  }),

  defineMcpTool({
    name: 'list_groups',
    title: 'Classes and groups',
    description: 'Classes, courses and training groups of the organization with grade level, number of members and subgroups (teams) and whether you may manage them (leaders and admins).',
    access: 'read',
    roles: ['teacher', 'admin'],
    input: { organizationId, level: z.string().optional().describe('Only this grade level ("7", "courses")') },
    handler: async (input, ctx) => {
      const groups = await listGroups(ctx.user, orgOf(ctx, input.organizationId))
      return groups.filter(g => !input.level || g.level === input.level)
    },
  }),

  defineMcpTool({
    name: 'get_group',
    title: 'Group members',
    description: 'One class/group with its members (role leader = teacher leading the group, member = learner).',
    access: 'read',
    roles: ['teacher', 'admin'],
    input: { organizationId, group: groupRef },
    handler: async (input, ctx) => getGroup(ctx.user, (await resolveGroup(ctx.user, orgOf(ctx, input.organizationId), input.group)).id),
  }),

  defineMcpTool({
    name: 'create_group',
    title: 'Create class/group',
    description: 'Creates a class, course or group (with its shared cloud folder). Teachers creating a group become its leader. Learning modules and teams are then managed in the Klonk app MCP server.',
    access: 'write',
    roles: ['teacher', 'admin'],
    input: { organizationId, name: z.string().trim().min(1).max(100), level: groupLevel.optional() },
    handler: async (input, ctx) => {
      const orgId = orgOf(ctx, input.organizationId)
      const name = groupNameSchema.parse(input.name)
      // Ohne Angabe: Stufe aus dem Namen raten (7a ⇒ 7), wie in der Oberfläche
      let level = input.level
      if (level === undefined) {
        const [org] = await withUserDb(ctx.user.id, tx => tx.select({ schoolForm: schema.organizations.schoolForm }).from(schema.organizations).where(eq(schema.organizations.id, orgId)))
        level = levelFromGroupName(name, schoolLevels(org?.schoolForm))
      }
      const { id } = await createGroup(ctx.user, orgId, name, level)
      return { id, name, level }
    },
  }),

  defineMcpTool({
    name: 'update_group',
    title: 'Change class/group',
    description: 'Renames a class/group, sets its grade level or whether members may write in the shared folder (leaders and admins).',
    access: 'write',
    roles: ['teacher', 'admin'],
    idempotent: true,
    input: { organizationId, group: groupRef, name: z.string().trim().min(1).max(100).optional(), level: groupLevel.optional(), membersCanWrite: z.boolean().optional() },
    handler: async ({ organizationId: requested, group, ...input }, ctx) => {
      const found = await resolveGroup(ctx.user, orgOf(ctx, requested), group)
      return updateGroup(ctx.user, found.id, groupUpdateSchema.parse(input))
    },
  }),

  defineMcpTool({
    name: 'add_group_members',
    title: 'Add members',
    description: 'Adds accounts (by username, display name or id) to a class/group – as member (learner) or leader (teacher). Existing members get the given role.',
    access: 'write',
    roles: ['teacher', 'admin'],
    idempotent: true,
    input: { organizationId, group: groupRef, users: z.array(z.string().min(1)).min(1).max(500), role: z.enum(['member', 'leader']).default('member') },
    handler: async (input, ctx) => {
      const orgId = orgOf(ctx, input.organizationId)
      const group = await resolveGroup(ctx.user, orgId, input.group)
      const accounts = resolveAccounts(await listUsers(ctx.user, orgId), input.users)
      await addGroupMembers(ctx.user, group.id, accounts.map(a => a.id), input.role)
      return { group: group.name, role: input.role, added: accounts.map(a => a.displayName) }
    },
  }),

  defineMcpTool({
    name: 'remove_group_members',
    title: 'Remove members',
    description: 'Removes accounts from a class/group (they also leave its subgroups). Their own projects are kept.',
    access: 'full',
    roles: ['teacher', 'admin'],
    input: { organizationId, group: groupRef, users: z.array(z.string().min(1)).min(1).max(500) },
    handler: async (input, ctx) => {
      const orgId = orgOf(ctx, input.organizationId)
      const group = await resolveGroup(ctx.user, orgId, input.group)
      const members = (await getGroup(ctx.user, group.id)).members
      const accounts = resolveAccounts((await listUsers(ctx.user, orgId)).filter(a => members.some(m => m.userId === a.id)), input.users)
      for (const account of accounts) await removeGroupMember(ctx.user, group.id, account.id)
      return { group: group.name, removed: accounts.map(a => a.displayName) }
    },
  }),

  defineMcpTool({
    name: 'delete_group',
    title: 'Delete class/group',
    description: 'Deletes a class/group with its subgroups and shared folder. Members\' own projects and submissions are kept. Cannot be undone – confirm with the user first.',
    access: 'full',
    roles: ['teacher', 'admin'],
    input: { organizationId, group: groupRef },
    handler: async (input, ctx) => {
      const group = await resolveGroup(ctx.user, orgOf(ctx, input.organizationId), input.group)
      await deleteGroup(ctx.user, group.id)
      return { ok: true, deleted: group.name }
    },
  }),

  defineMcpTool({
    name: 'create_users',
    title: 'Create accounts',
    description: 'Admins: creates local accounts (sign-in username@domain) with a generated initial password that must be changed at first login. Returns the initial passwords – hand them over safely. Username defaults to "firstname.lastname". Schools with LDAP/OIDC usually do not need local accounts.',
    access: 'full',
    roles: ['admin'],
    input: {
      organizationId,
      users: z.array(z.object({
        displayName: z.string().trim().min(1).max(200),
        username: z.string().optional(),
        role: z.enum(['member', 'teacher', 'admin']).default('member'),
      })).min(1).max(100),
      group: groupRef.optional().describe('Also add the new accounts to this class/group (members as learners, teachers as leaders)'),
    },
    handler: async (input, ctx) => {
      const orgId = orgOf(ctx, input.organizationId)
      const group = input.group ? await resolveGroup(ctx.user, orgId, input.group) : null
      const [org] = await withUserDb(ctx.user.id, tx => tx.select({ domain: schema.organizations.domain }).from(schema.organizations).where(eq(schema.organizations.id, orgId)))
      const created: { displayName: string, login: string, role: string, initialPassword: string }[] = []
      const failed: { displayName: string, error: string }[] = []
      for (const entry of input.users) {
        const username = usernameSchema.safeParse(entry.username ?? usernameFrom(entry.displayName))
        if (!username.success) {
          failed.push({ displayName: entry.displayName, error: 'invalid username' })
          continue
        }
        const password = initialPassword()
        try {
          const { id } = await createUser(ctx.user, orgId, { username: username.data, displayName: entry.displayName, role: entry.role, password }, ctx.event)
          if (group) await addGroupMembers(ctx.user, group.id, [id], entry.role === 'member' ? 'member' : 'leader')
          created.push({ displayName: entry.displayName, login: `${username.data}@${org?.domain}`, role: entry.role, initialPassword: password })
        }
        catch (error) {
          failed.push({ displayName: entry.displayName, error: (error as Error).message })
        }
      }
      return { created, failed, note: 'Initial passwords must be changed at first login.' }
    },
  }),

  defineMcpTool({
    name: 'update_user',
    title: 'Change account',
    description: 'Admins: changes display name or role (member = learner/employee, teacher, admin) of an account.',
    access: 'write',
    roles: ['admin'],
    idempotent: true,
    input: { organizationId, user: z.string().min(1), displayName: z.string().trim().min(1).max(200).optional(), role: z.enum(['member', 'teacher', 'admin']).optional() },
    handler: async (input, ctx) => {
      const [account] = resolveAccounts(await listUsers(ctx.user, orgOf(ctx, input.organizationId)), [input.user])
      await updateUser(ctx.user, account!.id, { displayName: input.displayName, role: input.role })
      return { ok: true, user: input.displayName ?? account!.displayName }
    },
  }),

  defineMcpTool({
    name: 'set_user_disabled',
    title: 'Lock or unlock account',
    description: 'Admins: locks (signs out everywhere) or unlocks an account.',
    access: 'full',
    roles: ['admin'],
    idempotent: true,
    input: { organizationId, user: z.string().min(1), disabled: z.boolean() },
    handler: async (input, ctx) => {
      const [account] = resolveAccounts(await listUsers(ctx.user, orgOf(ctx, input.organizationId)), [input.user])
      await updateUser(ctx.user, account!.id, { disabled: input.disabled })
      return { ok: true, user: account!.displayName, disabled: input.disabled }
    },
  }),

  defineMcpTool({
    name: 'reset_password',
    title: 'Reset password',
    description: 'Sets a generated temporary password (teachers: only for learners; admins: all). The account must change it at next login and is signed out everywhere. Returns the temporary password.',
    access: 'full',
    roles: ['teacher', 'admin'],
    input: { organizationId, user: z.string().min(1) },
    handler: async (input, ctx) => {
      const [account] = resolveAccounts(await listUsers(ctx.user, orgOf(ctx, input.organizationId)), [input.user])
      const password = initialPassword()
      await resetUserPassword(ctx.user, account!.id, password)
      return { user: account!.displayName, username: account!.username, temporaryPassword: password }
    },
  }),
]

export const adminMcpServer: KlonkMcpServer = {
  name: 'klonk-admin',
  title: 'Klonk Verwaltung',
  instructions: `Administration of a Klonk school or company (Klonk = learning app for programming).
Accounts sign in as username@domain; roles: member (learner/employee), teacher (trainer), admin. Classes, courses and training groups are "groups"; their leaders are teachers.
Typical setup: get_organization (set state and school form with update_organization) → create_group per class (grade level is guessed from names like "7a") → create_users or list_users → add_group_members.
Learning modules, teams/subgroups and learning progress are handled by the Klonk app MCP server (app.*), not here.
Ask the user before deleting or locking anything and hand out generated passwords carefully. Answer in the user's language.`,
  tools: adminMcpTools,
  errors: en.errors,
}
