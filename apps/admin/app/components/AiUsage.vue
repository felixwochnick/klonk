<script setup lang="ts">
// Verbrauch des KI-Assistenten je Monat: Summen, Modelle, Konten (keine Chatinhalte)
const { t, n, d } = useI18n()

const month = ref(new Date().toISOString().slice(0, 7))
const months = computed(() => Array.from({ length: 12 }, (_, i) => {
  const date = new Date()
  date.setUTCDate(1)
  date.setUTCMonth(date.getUTCMonth() - i)
  return { value: date.toISOString().slice(0, 7), label: d(date, { month: 'long', year: 'numeric' }) }
}))

const { data } = useFetch('/api/admin/organization/ai-usage', { query: { month }, watch: [month] })
const number = (value: number) => n(value, { maximumFractionDigits: 2 })
</script>

<template>
  <UCard data-testid="ai-usage">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="font-medium">
            {{ t('admin.ai.usage.title') }}
          </p>
          <p class="text-sm text-(--ui-text-muted)">
            {{ t('admin.ai.usage.description') }}
          </p>
        </div>
        <USelect
          v-model="month"
          :items="months"
          :aria-label="t('admin.ai.usage.month')"
          class="w-48"
        />
      </div>
    </template>

    <div
      v-if="data"
      class="space-y-6 text-sm"
    >
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div
          v-for="key in (['requests', 'inputTokens', 'outputTokens', 'credits'] as const)"
          :key="key"
        >
          <p class="text-(--ui-text-muted)">
            {{ t(`admin.ai.usage.${key}`) }}
          </p>
          <p
            class="text-lg font-semibold"
            :data-testid="`ai-usage-${key}`"
          >
            {{ number(data.total?.[key] ?? 0) }}
          </p>
        </div>
      </div>

      <p
        v-if="!data.total?.requests"
        class="text-(--ui-text-muted)"
      >
        {{ t('admin.ai.usage.empty') }}
      </p>
      <template v-else>
        <table class="w-full">
          <thead class="text-(--ui-text-muted)">
            <tr>
              <th class="py-1 text-start font-normal">
                {{ t('admin.ai.model') }}
              </th>
              <th class="py-1 text-end font-normal">
                {{ t('admin.ai.usage.requests') }}
              </th>
              <th class="py-1 text-end font-normal">
                {{ t('admin.ai.usage.tokens') }}
              </th>
              <th class="py-1 text-end font-normal">
                {{ t('admin.ai.usage.credits') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.models"
              :key="`${row.source}-${row.model}`"
              class="border-t border-(--ui-border)"
            >
              <td class="py-1.5">
                {{ row.model }}
                <span class="text-(--ui-text-dimmed)">· {{ t(`admin.ai.usage.source.${row.source}`) }}</span>
              </td>
              <td class="py-1.5 text-end">
                {{ number(row.requests) }}
              </td>
              <td class="py-1.5 text-end">
                {{ number(row.inputTokens + row.outputTokens) }}
              </td>
              <td class="py-1.5 text-end">
                {{ number(row.credits) }}
              </td>
            </tr>
          </tbody>
        </table>

        <table
          class="w-full"
          data-testid="ai-usage-users"
        >
          <thead class="text-(--ui-text-muted)">
            <tr>
              <th class="py-1 text-start font-normal">
                {{ t('admin.ai.usage.account') }}
              </th>
              <th class="py-1 text-end font-normal">
                {{ t('admin.ai.usage.requests') }}
              </th>
              <th class="py-1 text-end font-normal">
                {{ t('admin.ai.usage.tokens') }}
              </th>
              <th class="py-1 text-end font-normal">
                {{ t('admin.ai.usage.credits') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in data.users"
              :key="row.userId"
              class="border-t border-(--ui-border)"
            >
              <td class="py-1.5">
                {{ row.displayName }}
                <span class="text-(--ui-text-dimmed)">· {{ row.username }}</span>
              </td>
              <td class="py-1.5 text-end">
                {{ number(row.requests) }}
              </td>
              <td class="py-1.5 text-end">
                {{ number(row.inputTokens + row.outputTokens) }}
              </td>
              <td class="py-1.5 text-end">
                {{ number(row.credits) }}
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>
  </UCard>
</template>
