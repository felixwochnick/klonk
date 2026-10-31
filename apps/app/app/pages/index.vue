<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({ title: () => t('home.title') })
</script>

<template>
  <UContainer class="py-16">
    <UPageHero
      :title="t('home.title')"
      :description="t('home.description')"
    />
  </UContainer>
</template>
