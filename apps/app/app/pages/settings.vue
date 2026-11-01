<script setup lang="ts">
const { t } = useI18n()
useSeoMeta({ title: () => t('settings.title') })
</script>

<template>
  <UContainer class="py-8">
    <h1 class="mb-6 text-2xl font-bold">
      {{ t('settings.title') }}
    </h1>
    <SettingsForm />
  </UContainer>
</template>
