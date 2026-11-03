<script setup lang="ts">
import type { FileKind } from '~/utils/project-fs'

// Farbiges Symbol je Dateiart (Explorer, Datei-Menüs)
const props = withDefaults(defineProps<{ kind: FileKind, size?: 'sm' | 'md' | 'lg' }>(), { size: 'sm' })

const ICONS: Record<Exclude<FileKind, 'klonk'>, { icon: string, color: string }> = {
  blocks: { icon: 'i-lucide-puzzle', color: 'text-amber-500' },
  javascript: { icon: 'i-simple-icons-javascript', color: 'text-yellow-400' },
  typescript: { icon: 'i-simple-icons-typescript', color: 'text-blue-500' },
  python: { icon: 'i-simple-icons-python', color: 'text-sky-600 dark:text-sky-400' },
  java: { icon: 'i-simple-icons-openjdk', color: 'text-orange-600 dark:text-orange-400' },
  csharp: { icon: 'i-simple-icons-dotnet', color: 'text-violet-600 dark:text-violet-400' },
  world: { icon: 'i-lucide-boxes', color: 'text-green-600 dark:text-green-500' },
  design: { icon: 'i-lucide-palette', color: 'text-pink-600 dark:text-pink-400' },
  database: { icon: 'i-lucide-database', color: 'text-teal-600 dark:text-teal-400' },
  sql: { icon: 'i-lucide-file-search', color: 'text-teal-600 dark:text-teal-400' },
  other: { icon: 'i-lucide-file', color: 'text-(--ui-text-dimmed)' },
}

const SIZE = { sm: 'size-4', md: 'size-6', lg: 'size-12' }
const entry = computed(() => (props.kind === 'klonk' ? null : ICONS[props.kind]))
</script>

<template>
  <!-- Klonk-Script: kleiner roter Klemmbaustein mit vier Noppen -->
  <svg
    v-if="!entry"
    viewBox="0 0 16 16"
    :class="[SIZE[size], 'shrink-0']"
    aria-hidden="true"
  >
    <rect
      x="1.5"
      y="2"
      width="2.5"
      height="2"
      rx="0.5"
      fill="#e5484d"
    />
    <rect
      x="5"
      y="2"
      width="2.5"
      height="2"
      rx="0.5"
      fill="#e5484d"
    />
    <rect
      x="8.5"
      y="2"
      width="2.5"
      height="2"
      rx="0.5"
      fill="#e5484d"
    />
    <rect
      x="12"
      y="2"
      width="2.5"
      height="2"
      rx="0.5"
      fill="#e5484d"
    />
    <rect
      x="0.5"
      y="4"
      width="15"
      height="10"
      rx="1.5"
      fill="#e5484d"
    />
    <path
      d="M4.5 7.5 3 9l1.5 1.5M11.5 7.5 13 9l-1.5 1.5M9 7l-2 4"
      fill="none"
      stroke="#fff"
      stroke-width="1.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <UIcon
    v-else
    :name="entry.icon"
    :class="[SIZE[size], entry.color, 'shrink-0']"
  />
</template>
