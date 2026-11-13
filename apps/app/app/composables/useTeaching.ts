import { curriculumFor, recommendedModules, type LearnLanguageChoice, type TeachingGroup, type TeachingOverview } from '@klonk/learn'

/**
 * Unterricht: geleitete Gruppen nach Jahrgangsstufen der Schulform, dazu die Lernmodule, die laut Lehrplan
 * (Bundesland + Schulform, `@klonk/learn` `CURRICULUM`) zur Stufe passen. Freigaben laufen über `/api/learn/groups/:id/modules`.
 */
export function useTeaching() {
  const { t } = useI18n()
  const { user } = useAuth()
  /** „Unterricht“, in Unternehmen „Ausbildung“ */
  const title = computed(() => (user.value?.organizationType === 'company' ? t('teaching.titleCompany') : t('teaching.title')))
  const { data, refresh, status } = useFetch<TeachingOverview | null>('/api/teaching', {
    key: 'teaching',
    server: false,
    headers: clientHostHeaders(),
    default: () => null,
  })
  const loading = computed(() => status.value === 'pending' || status.value === 'idle')
  const school = computed(() => (data.value?.school?.type === 'school' ? data.value.school : null))
  const groups = computed(() => data.value?.groups ?? [])

  // Stufen der Schulform, ergänzt um Stufen, die Gruppen noch haben (z. B. nach einem Wechsel der Schulform)
  const levels = computed(() => [...new Set([
    ...schoolLevels(school.value?.schoolForm),
    ...groups.value.map(g => g.level).filter((l): l is string => !!l && l !== COURSES_LEVEL),
  ])].sort((a, b) => Number(a) - Number(b)))
  const structured = computed(() => !!school.value && schoolLevels(school.value.schoolForm).length > 0)

  /** Gruppen einer Stufe; `'none'` = nicht zugeordnet, `'all'` = alle (ohne Schulform) */
  const groupsIn = (level: string) => groups.value.filter(g => level === 'all' || (level === 'none' ? !g.level : g.level === level))
  const curriculum = (level: string) => curriculumFor(school.value?.state, school.value?.schoolForm, level)
  const recommended = (level: string) => recommendedModules(school.value?.state, school.value?.schoolForm, level)

  function levelTitle(level: string) {
    if (level === COURSES_LEVEL) return t('teaching.courses')
    if (level === 'none') return t('teaching.unassigned')
    if (level === 'all') return t('teaching.myGroups')
    return t('teaching.level', { n: level })
  }
  /** „Bayern · Gymnasium (G9)“ */
  const schoolLabel = computed(() => (school.value?.state && school.value.schoolForm
    ? `${t(`school.states.${school.value.state}`)} · ${t(`school.forms.${school.value.schoolForm}`)}`
    : ''))

  /** Freigegebene Module einer Gruppe setzen; Sprachvorgaben bleiben, neue Module erlauben beide Sprachen */
  async function setModules(group: TeachingGroup, moduleIds: string[]) {
    const modules = moduleIds.map(id => ({ id, languages: group.languages[id] ?? ('both' as LearnLanguageChoice) }))
    await $fetch(`/api/learn/groups/${group.id}/modules` as string, { method: 'PUT', headers: clientHostHeaders(), body: { modules } })
  }

  return { title, data, refresh, loading, school, groups, levels, structured, groupsIn, curriculum, recommended, levelTitle, schoolLabel, setModules }
}
