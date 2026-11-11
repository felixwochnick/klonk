<script setup lang="ts">
import { readTable, TABLE_ACCEPT, TableError, type Table } from '~/utils/spreadsheet'

// Datei mit einer Liste wählen oder hineinziehen (CSV, Excel, OpenDocument) – gelesen wird im Browser
const emit = defineEmits<{ loaded: [table: Table, fileName: string] }>()
const { t } = useI18n()

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const error = ref('')
const fileName = ref('')

async function load(file: File | undefined) {
  if (!file) return
  error.value = ''
  try {
    const table = await readTable(file)
    if (!table.length) throw new TableError('empty')
    fileName.value = file.name
    emit('loaded', table, file.name)
  }
  catch (e) {
    const code = e instanceof TableError ? e.message : 'invalid'
    error.value = t(`admin.import.fileErrors.${code}`)
  }
  finally {
    if (input.value) input.value.value = ''
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  void load(event.dataTransfer?.files[0])
}
</script>

<template>
  <div class="space-y-2">
    <div
      class="flex flex-col items-center gap-2 rounded-(--ui-radius) border border-dashed p-6 text-center text-sm"
      :class="dragging ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border-accented)'"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <UIcon
        name="i-lucide-file-spreadsheet"
        class="size-8 text-(--ui-text-dimmed)"
      />
      <p v-if="fileName">
        {{ fileName }}
      </p>
      <p
        v-else
        class="text-(--ui-text-muted)"
      >
        {{ t('admin.import.dropHint') }}
      </p>
      <UButton
        variant="outline"
        icon="i-lucide-upload"
        :label="fileName ? t('admin.import.otherFile') : t('admin.import.chooseFile')"
        @click="input?.click()"
      />
      <input
        ref="input"
        type="file"
        class="hidden"
        :accept="TABLE_ACCEPT"
        data-testid="import-file"
        @change="load(($event.target as HTMLInputElement).files?.[0])"
      >
    </div>
    <p class="text-xs text-(--ui-text-dimmed)">
      {{ t('admin.import.formats') }}
    </p>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="error"
    />
  </div>
</template>
