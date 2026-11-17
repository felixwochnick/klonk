<script setup lang="ts">
import { CUSTOM_LIMITS, LEARN_TRACKS, type CustomModuleData } from '@klonk/learn'

// Allgemeine Angaben eines eigenen Lernmoduls: Titel, Kürzel, Reihe, Sprache der Texte, Einführung, Lernziele,
// Hinweise für Lehrkräfte und die Jahrgangsstufen, zu denen es passt
defineProps<{ readOnly?: boolean }>()
const data = defineModel<CustomModuleData>('data', { required: true })

const { t } = useI18n()
const teaching = useTeaching()

const trackItems = computed(() => LEARN_TRACKS.map(value => ({ value, label: t(`learn.tracks.${value}.title`), description: t(`teaching.custom.trackHint.${value}`) })))
const langItems = computed(() => (['de', 'en'] as const).map(value => ({ value, label: t(`teaching.custom.langs.${value}`) })))
// Stufen der Schulform (sonst 1–13) und Zusatzkurse
const levelItems = computed(() => {
  const levels = teaching.levels.value.length ? teaching.levels.value : Array.from({ length: 13 }, (_, i) => String(i + 1))
  return [...levels.map(value => ({ value, label: teaching.levelTitle(value) })), { value: COURSES_LEVEL, label: teaching.levelTitle(COURSES_LEVEL) }]
})

const addObjective = () => data.value.objectives.push('')
const removeObjective = (i: number) => data.value.objectives.splice(i, 1)
</script>

<template>
  <div
    class="space-y-5"
    data-testid="custom-module-settings"
  >
    <h2 class="text-lg font-semibold">
      {{ t('teaching.custom.general') }}
    </h2>
    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
      <UFormField
        :label="t('teaching.custom.moduleTitle')"
        required
      >
        <UInput
          v-model="data.title"
          :disabled="readOnly"
          maxlength="120"
          class="w-full"
          data-testid="custom-module-title"
        />
      </UFormField>
      <UFormField
        :label="t('teaching.custom.code')"
        :hint="t('teaching.custom.optional')"
      >
        <UInput
          v-model="data.code"
          :disabled="readOnly"
          maxlength="8"
          :placeholder="t('teaching.custom.codePlaceholder')"
          class="w-full"
          data-testid="custom-module-code"
        />
      </UFormField>
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField
        :label="t('teaching.custom.track')"
        :help="t('teaching.custom.trackChange')"
      >
        <USelect
          v-model="data.track"
          :items="trackItems"
          :disabled="readOnly"
          class="w-full"
          data-testid="custom-module-track"
        />
      </UFormField>
      <UFormField
        :label="t('teaching.custom.lang')"
        :help="t('teaching.custom.langHint')"
      >
        <USelect
          v-model="data.lang"
          :items="langItems"
          :disabled="readOnly"
          class="w-full"
        />
      </UFormField>
    </div>
    <UFormField
      :label="t('teaching.custom.summary')"
      :help="t('teaching.custom.summaryHint')"
    >
      <UTextarea
        v-model="data.summary"
        :disabled="readOnly"
        :rows="2"
        autoresize
        maxlength="500"
        class="w-full"
        data-testid="custom-module-summary"
      />
    </UFormField>
    <div class="space-y-2">
      <p class="text-sm font-medium">
        {{ t('learn.objectives') }}
      </p>
      <div
        v-for="(_, i) in data.objectives"
        :key="i"
        class="flex items-center gap-2"
      >
        <UInput
          v-model="data.objectives[i]"
          :disabled="readOnly"
          class="flex-1"
          maxlength="500"
        />
        <UButton
          v-if="!readOnly"
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          :aria-label="t('teaching.custom.removeObjective')"
          @click="removeObjective(i)"
        />
      </div>
      <UButton
        v-if="!readOnly && data.objectives.length < CUSTOM_LIMITS.objectives"
        icon="i-lucide-plus"
        size="sm"
        variant="outline"
        color="neutral"
        :label="t('teaching.custom.addObjective')"
        @click="addObjective"
      />
    </div>
    <UFormField
      :label="t('learn.introduction')"
      :help="t('teaching.custom.introHint')"
    >
      <UTextarea
        v-model="data.intro"
        :disabled="readOnly"
        :rows="6"
        autoresize
        class="w-full"
        data-testid="custom-module-intro"
      />
    </UFormField>
    <UFormField
      :label="t('learn.teacherNotes')"
      :help="t('teaching.custom.teacherHint')"
    >
      <UTextarea
        v-model="data.teacher"
        :disabled="readOnly"
        :rows="3"
        autoresize
        class="w-full"
      />
    </UFormField>
    <UFormField
      :label="t('teaching.custom.levels')"
      :help="t('teaching.custom.levelsHint')"
    >
      <UCheckboxGroup
        v-model="data.levels"
        :items="levelItems"
        :disabled="readOnly"
        orientation="horizontal"
        :ui="{ fieldset: 'flex-wrap gap-x-4 gap-y-2' }"
        data-testid="custom-module-levels"
      />
    </UFormField>
  </div>
</template>
