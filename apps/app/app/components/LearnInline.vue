<script setup lang="ts">
import type { AiInline } from '~/utils/ai-markdown'

defineProps<{ parts: AiInline[] }>()
</script>

<template>
  <template
    v-for="(part, p) in parts"
    :key="p"
  >
    <code
      v-if="part.kind === 'code'"
      class="rounded bg-(--ui-bg-muted) px-1 font-mono text-xs"
    >{{ part.value }}</code>
    <strong v-else-if="part.kind === 'bold'">{{ part.value }}</strong>
    <template v-else>
      {{ part.value }}
    </template>
  </template>
</template>
