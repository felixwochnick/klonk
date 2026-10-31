<script setup lang="ts">
const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.overview') })

const { user } = useAuth()
const roleLabel = useRoleLabel(() => user.value?.organizationType)
const { data: users } = await useFetch('/api/admin/users')

const counts = computed(() => {
  const result = { member: 0, teacher: 0, admin: 0 }
  for (const u of users.value ?? []) result[u.role]++
  return result
})
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.overview')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div>
          <h2 class="text-2xl font-bold">
            {{ user?.organizationName }}
          </h2>
          <p class="text-(--ui-text-muted)">
            {{ user?.domain }}
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <UCard
            v-for="role in (['member', 'teacher', 'admin'] as const)"
            :key="role"
          >
            <p class="text-sm text-(--ui-text-muted)">
              {{ roleLabel(role) }}
            </p>
            <p
              class="text-3xl font-bold"
              :data-testid="`count-${role}`"
            >
              {{ counts[role] }}
            </p>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
