<script setup lang="ts">
// Namensdialog für neues Projekt, neue Datei und Umbenennen
withDefaults(defineProps<{ open: boolean, title: string, withLanguage?: boolean, withName?: boolean }>(), { withName: true })
const name = defineModel<string>('name', { required: true })
/** Sprache eines neuen Projekts (nur mit `withLanguage`) */
const language = defineModel<ProgramLanguage>('language', { default: 'blocks' })
const emit = defineEmits<{ close: [], submit: [] }>()
const { t } = useI18n()
const languageItems = computed(() => PROGRAM_LANGUAGES.map(l => ({ label: t(`editor.languages.${l}`), value: l })))
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
        >
          <UInput
            v-model="name"
            class="w-full"
            autofocus
            data-testid="project-dialog-name"
          />
        </UFormField>
        <UFormField
          v-if="withLanguage"
          :label="t('project.language')"
          :help="t('project.languageHelp')"
          :class="withName ? 'mt-4' : ''"
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
