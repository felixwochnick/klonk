<script setup lang="ts">
definePageMeta({ requiresAdmin: true })

type Section = { license: LicenseInfo, hasToken: boolean, usage: { used: number, max: number | null } }
type Overview = {
  hosted: boolean
  instance: null | (Section & { source: 'env' | 'db' })
  organization: null | Section
}

const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.license') })

const toast = useToast()
const apiError = useApiError()
const { user } = useAuth()

const { data, refresh } = await useFetch<Overview>('/api/admin/license')

async function save(scope: 'instance' | 'organization', token: string | null) {
  try {
    await $fetch(`/api/admin/license/${scope}`, { method: 'PUT', body: { token } })
    toast.add({ title: token ? t('admin.license.activated') : t('admin.license.removed'), color: 'success' })
    await refresh()
    await refreshNuxtData('license')
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="license">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.license')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-3xl space-y-6">
        <p class="text-(--ui-text-muted)">
          {{ t('admin.license.description') }}
        </p>

        <LicenseCard
          v-if="data?.instance"
          :title="t('admin.license.instance')"
          :license="data.instance.license"
          :usage="data.instance.usage"
          :has-token="data.instance.hasToken"
          :editable="data.instance.source === 'db'"
          :locked-hint="t('admin.license.fromEnv')"
          @save="save('instance', $event)"
        />

        <LicenseCard
          v-if="data?.organization"
          :title="data.hosted ? t('admin.license.organization', { name: user?.organizationName }) : t('admin.license.instance')"
          :license="data.organization.license"
          :usage="data.organization.usage"
          :has-token="data.organization.hasToken"
          :editable="data.hosted"
          :locked-hint="t('admin.license.ownerOnly')"
          @save="save('organization', $event)"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
