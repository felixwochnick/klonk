<script setup lang="ts">
// Namensdialog für neues Projekt, neue Datei und Umbenennen
type LocationItem = { value: string, label: string, description: string, disabled?: boolean }
withDefaults(defineProps<{
  open: boolean
  title: string
  withLanguage?: boolean
  withName?: boolean
  /** Hinweis unter dem Namen (z. B. Packages) */
  hint?: string
  /** Speicherorte eines neuen Projekts (Cloud, Browser, Ordner) – leer = keine Auswahl */
  locations?: LocationItem[]
}>(), { withName: true, hint: undefined, locations: () => [] })
const name = defineModel<string>('name', { required: true })
/** Sprache eines neuen Projekts (nur mit `withLanguage`) */
const language = defineModel<ProgramLanguage>('language', { default: 'blocks' })
/** Speicherort eines neuen Projekts (nur mit `locations`) */
const location = defineModel<string>('location', { default: '' })
const emit = defineEmits<{ close: [], submit: [] }>()
const { t } = useI18n()
const languageItems = computed(() => PROJECT_LANGUAGES.map(l => ({ label: projectLanguageLabel(t, l), value: l })))
</script>

<template>
  <UModal
    :open="open"
    :title="title"
    @update:open="v => !v && emit('close')"
  >
    <template #body>
      <form
        id="project-dialog"
        @submit.prevent="emit('submit')"
      >
        <UFormField
          v-if="withName"
          :label="t('project.name')"
          :help="hint"
        >
          <UInput
            v-model="name"
            class="w-full"
            autofocus
            data-testid="project-dialog-name"
          />
        </UFormField>
        <UFormField
          v-if="locations.length"
          :label="t('project.location')"
          :class="withName ? 'mt-4' : ''"
        >
          <URadioGroup
            v-model="location"
            :items="locations"
            variant="card"
            class="w-full"
            :ui="{ fieldset: 'gap-2' }"
            data-testid="project-dialog-location"
          >
            <template #label="{ item }">
              <span :data-testid="`project-dialog-location-${(item as LocationItem).value}`">{{ (item as LocationItem).label }}</span>
            </template>
          </URadioGroup>
        </UFormField>
        <UFormField
          v-if="withLanguage"
          :label="t('project.language')"
          :help="t('project.languageHelp')"
          :class="withName || locations.length ? 'mt-4' : ''"
        >
          <USelect
            v-model="language"
            :items="languageItems"
            class="w-full"
            data-testid="project-dialog-language"
          />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <UButton
        type="submit"
        form="project-dialog"
        :label="t('project.ok')"
        data-testid="project-dialog-submit"
      />
    </template>
  </UModal>
</template>
