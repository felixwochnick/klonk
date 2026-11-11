<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// Eintrag einer Projektliste (Seitenleiste, Explorer): lange Namen gekürzt, Aktionen per Rechtsklick und „…“
defineOptions({ inheritAttrs: false })
const props = defineProps<{ label: string, icon: string, active?: boolean, items: DropdownMenuItem[][] }>()
const emit = defineEmits<{ open: [] }>()
const { t } = useI18n()
</script>

<template>
  <UContextMenu :items="props.items">
    <div class="group flex min-w-0 items-center">
      <UButton
        :variant="active ? 'soft' : 'ghost'"
        :color="active ? 'primary' : 'neutral'"
        :icon="icon"
        :title="label"
        class="min-w-0 flex-1 justify-start"
        :ui="{ label: 'truncate' }"
        v-bind="$attrs"
        @click="emit('open')"
      >
        {{ label }}
      </UButton>
      <UDropdownMenu :items="props.items">
        <UButton
          variant="ghost"
          color="neutral"
          size="xs"
          icon="i-lucide-ellipsis"
          class="shrink-0 opacity-60 group-hover:opacity-100"
          :aria-label="t('project.actions', { name: label })"
        />
      </UDropdownMenu>
    </div>
  </UContextMenu>
</template>
