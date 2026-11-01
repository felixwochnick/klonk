<script setup lang="ts">
const { t } = useI18n()
useSeoMeta({ title: () => t('settings.title') })
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar :title="t('settings.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <SettingsForm />
    </template>
  </UDashboardPanel>
</template>
