<script setup lang="ts">
// Hinweis, wenn die Kontenzahl die Grenze der Lizenz erreicht (Warnung ab 90 %, Puffer, Sperre)
const props = defineProps<{ usage: UserUsage }>()

const { t } = useI18n()
const { public: { shopUrl } } = useRuntimeConfig()

const alert = computed(() => {
  const { used, max, hardMax, status } = props.usage
  if (status === 'ok' || max === null) return null
  if (status === 'warning') return { color: 'warning' as const, title: t('admin.license.limit.warning', { used, max }) }
  if (status === 'over') return { color: 'warning' as const, title: t('admin.license.limit.over', { max, left: (hardMax ?? max) - used }) }
  return { color: 'error' as const, title: t('admin.license.limit.blocked', { max }) }
})
</script>

<template>
  <UAlert
    v-if="alert"
    :color="alert.color"
    variant="subtle"
    icon="i-lucide-users"
    :title="alert.title"
    :actions="shopUrl ? [{ label: t('admin.license.upgrade'), to: shopUrl, target: '_blank', variant: 'outline' }] : undefined"
    :data-testid="`user-limit-${usage.status}`"
  />
</template>
