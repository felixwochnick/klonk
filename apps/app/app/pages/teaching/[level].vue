<script setup lang="ts">
import { formatModuleNumbers, hasCurriculum } from '@klonk/learn'

// Eine Jahrgangsstufe: Lehrplan (passende Lernmodule, Link zur Klassenseite der Doku) und die eigenen Klassen
definePageMeta({ key: route => route.fullPath })
const { t, locale } = useI18n()
const route = useRoute()
const config = useRuntimeConfig()
const teaching = useTeaching()
const level = String(route.params.level)
useSeoMeta({ title: () => teaching.levelTitle(level) })

const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
const entries = computed(() => teaching.curriculum(level))
const numeric = /^\d+$/.test(level)
const mapped = computed(() => hasCurriculum(teaching.school.value?.state, teaching.school.value?.schoolForm))
const grades = (range: readonly [number, number]) => (range[0] === range[1] ? String(range[0]) : `${range[0]}–${range[1]}`)
const docsLink = (path: string) => `${config.public.docsUrl}/${lang.value}/${path}`
</script>

<template>
  <UContainer class="py-8">
    <UButton
      to="/teaching"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="teaching.title.value"
      class="mb-4"
    />

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
      <div class="mb-6">
        <h1 class="text-2xl font-bold">
          {{ teaching.levelTitle(level) }}
        </h1>
        <p
          v-if="teaching.schoolLabel.value"
          class="mt-1 text-sm text-(--ui-text-muted)"
        >
          {{ teaching.schoolLabel.value }}
        </p>
      </div>

      <!-- Lehrplan der Stufe -->
      <UCard
        v-if="numeric && teaching.structured.value"
        class="mb-8"
        data-testid="teaching-curriculum"
      >
        <template #header>
          <h2 class="font-semibold">
            {{ t('teaching.curriculum') }}
          </h2>
        </template>
        <p
          v-if="!mapped"
          class="text-sm text-(--ui-text-muted)"
        >
          {{ t('teaching.noCurriculum', { school: teaching.schoolLabel.value }) }}
        </p>
        <ul
          v-else-if="entries.length"
          class="space-y-3"
        >
          <li
            v-for="entry in entries"
            :key="entry.docs"
            class="flex flex-wrap items-center justify-between gap-2"
          >
            <div>
              <p class="font-medium">
                {{ t('teaching.grades', { range: grades(entry.grades) }) }}<template v-if="entry.note">
                  · {{ entry.note[lang] }}
                </template>
              </p>
              <p class="text-sm text-(--ui-text-muted)">
                {{ entry.modules.length ? t('teaching.recommended', { modules: formatModuleNumbers(entry.modules) }) : t('teaching.noRecommendation') }}
              </p>
            </div>
            <UButton
              :to="docsLink(entry.docs)"
              target="_blank"
              variant="ghost"
              size="sm"
              trailing-icon="i-lucide-external-link"
              :label="t('teaching.docs')"
            />
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-(--ui-text-muted)"
        >
          {{ t('teaching.noRecommendation') }}
        </p>
      </UCard>

      <TeachingLevel
        :level="level"
        :groups="teaching.groupsIn(level)"
      />
    </template>
  </UContainer>
</template>
