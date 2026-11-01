<script setup lang="ts">
// Namensdialog für neues Projekt, neue Datei und Umbenennen
defineProps<{ open: boolean, title: string }>()
const name = defineModel<string>('name', { required: true })
const emit = defineEmits<{ close: [], submit: [] }>()
const { t } = useI18n()
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
        <UFormField :label="t('project.name')">
          <UInput
            v-model="name"
            class="w-full"
            autofocus
            data-testid="project-dialog-name"
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
