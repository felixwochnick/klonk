<script setup lang="ts">
import { formatModuleNumbers } from '@klonk/learn'

// Unterricht: Jahrgangsstufen der Schulform mit den eigenen Klassen und den laut Lehrplan passenden Lernmodulen.
// Ohne Schulform (oder in Unternehmen) stehen alle geleiteten Gruppen direkt auf der Seite.
const { t } = useI18n()
const config = useRuntimeConfig()
const teaching = useTeaching()
const title = teaching.title
useSeoMeta({ title })

const cards = computed(() => [
  ...teaching.levels.value,
  COURSES_LEVEL,
  ...(teaching.groupsIn('none').length ? ['none'] : []),
].map(level => ({ level, title: teaching.levelTitle(level), groups: teaching.groupsIn(level), recommended: teaching.recommended(level) })))
const adminLink = computed(() => `${config.public.adminUrl}/organization`)
const missingSchoolForm = computed(() => !!teaching.school.value && !teaching.structured.value)
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 max-w-3xl">
      <h1 class="text-2xl font-bold">
        {{ title }}
      </h1>
      <p
        v-if="teaching.schoolLabel.value"
        class="mt-1 text-sm text-(--ui-text-muted)"
        data-testid="teaching-school"
      >
        {{ teaching.schoolLabel.value }}
      </p>
      <p class="mt-2 text-(--ui-text-muted)">
        {{ t('teaching.intro') }}
      </p>
    </div>

    <div
      v-if="teaching.loading.value"
      class="py-12 text-center text-(--ui-text-muted)"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-6 animate-spin"
      />
    </div>

    <template v-else>
      <UAlert
        v-if="missingSchoolForm"
        color="info"
        variant="subtle"
        icon="i-lucide-school"
        :title="t('teaching.noSchoolForm')"
        :description="teaching.data.value?.admin ? t('teaching.noSchoolFormAdmin') : t('teaching.noSchoolFormTeacher')"
        :actions="teaching.data.value?.admin ? [{ label: t('teaching.toAdmin'), to: adminLink, target: '_blank', trailingIcon: 'i-lucide-external-link', variant: 'outline' }] : undefined"
        class="mb-6"
        data-testid="teaching-no-school-form"
      />
      <UAlert
        v-if="!teaching.groups.value.length"
        color="neutral"
        variant="subtle"
        icon="i-lucide-users"
        :title="t('teaching.noGroups')"
        :description="t('teaching.noGroupsHint')"
        class="mb-6"
        data-testid="teaching-no-groups"
      />

      <!-- Jahrgangsstufen -->
      <div
        v-if="teaching.structured.value"
        class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="teaching-levels"
      >
        <NuxtLink
          v-for="card in cards"
          :key="card.level"
          :to="`/teaching/${card.level}`"
          class="group rounded-lg border border-(--ui-border) bg-(--ui-bg) p-4 transition hover:border-(--ui-primary) focus-visible:outline-2 focus-visible:outline-(--ui-primary)"
          :class="card.groups.length ? '' : 'opacity-70'"
          :data-testid="`teaching-level-${card.level}`"
        >
          <div class="flex items-start justify-between gap-2">
            <h2 class="font-semibold">
              {{ card.title }}
            </h2>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 shrink-0 text-(--ui-text-dimmed) transition group-hover:text-(--ui-primary)"
            />
          </div>
          <div class="mt-2 flex min-h-6 flex-wrap gap-1">
            <UBadge
              v-for="group in card.groups"
              :key="group.id"
              :label="group.name"
              variant="subtle"
              color="neutral"
            />
            <span
              v-if="!card.groups.length"
              class="text-sm text-(--ui-text-dimmed)"
            >{{ t('teaching.noClasses') }}</span>
          </div>
          <p
            v-if="/^\d+$/.test(card.level)"
            class="mt-3 text-xs text-(--ui-text-muted)"
          >
            <UIcon
              name="i-lucide-book-open"
              class="me-1 size-3.5 align-[-2px]"
            />
            {{ card.recommended.length ? t('teaching.recommended', { modules: formatModuleNumbers(card.recommended) }) : t('teaching.noRecommendation') }}
          </p>
        </NuxtLink>
      </div>

      <!-- Ohne Schulform: alle Gruppen direkt -->
      <TeachingLevel
        v-else-if="teaching.groups.value.length"
        level="all"
        :groups="teaching.groupsIn('all')"
      />
    </template>
  </UContainer>
</template>
