<script setup lang="ts">
// Ergebnis einer Abfrage als Tabelle (SQL-Konsole, Lernansicht) – NULL kursiv, lange Werte gekürzt
defineProps<{
  columns: string[]
  rows: unknown[][]
}>()

const display = (value: unknown) => (value === null ? null : typeof value === 'object' ? JSON.stringify(value) : String(value))
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-(--ui-border)">
    <table class="w-full font-mono text-xs">
      <thead class="bg-(--ui-bg-elevated)">
        <tr>
          <th
            v-for="(column, c) in columns"
            :key="c"
            class="whitespace-nowrap px-2 py-1 text-start font-semibold"
          >
            {{ column }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(row, r) in rows"
          :key="r"
          class="border-t border-(--ui-border)"
        >
          <td
            v-for="(value, c) in row"
            :key="c"
            class="max-w-80 truncate whitespace-nowrap px-2 py-0.5"
            :title="display(value) ?? 'NULL'"
          >
            <span
              v-if="value === null"
              class="text-(--ui-text-dimmed) italic"
            >NULL</span>
            <template v-else>
              {{ display(value) }}
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
