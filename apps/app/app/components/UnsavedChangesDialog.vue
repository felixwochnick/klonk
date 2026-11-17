<script setup lang="ts">
// Rückfrage vor dem Schließen von Dateien bzw. des Projekts mit ungespeicherten Änderungen (wie in VS Code)
const props = defineProps<{ files: string[] }>()
const emit = defineEmits<{ close: [choice: 'save' | 'discard' | 'cancel'] }>()
const { t } = useI18n()
const name = computed(() => props.files[0]?.slice(props.files[0].lastIndexOf('/') + 1) ?? '')
</script>

<template>
  <UModal
    :title="t('project.unsaved.title')"
    :description="files.length === 1 ? t('project.unsaved.one', { name }) : t('project.unsaved.many', { count: files.length })"
    :close="false"
    data-testid="unsaved-dialog"
    @update:open="v => !v && emit('close', 'cancel')"
  >
    <template
      v-if="files.length > 1"
      #body
    >
      <ul class="list-inside list-disc text-sm text-(--ui-text-muted)">
        <li
          v-for="file in files"
          :key="file"
        >
          {{ file }}
        </li>
      </ul>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('project.unsaved.cancel')"
          data-testid="unsaved-cancel"
          @click="emit('close', 'cancel')"
        />
        <UButton
          color="neutral"
          variant="outline"
          :label="t('project.unsaved.discard')"
          data-testid="unsaved-discard"
          @click="emit('close', 'discard')"
        />
        <UButton
          :label="t('project.unsaved.save')"
          autofocus
          data-testid="unsaved-save"
          @click="emit('close', 'save')"
        />
      </div>
    </template>
  </UModal>
</template>
