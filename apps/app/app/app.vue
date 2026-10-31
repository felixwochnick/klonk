<script setup lang="ts">
const { locale } = useI18n()

useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title} · Klonk` : 'Klonk'),
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
