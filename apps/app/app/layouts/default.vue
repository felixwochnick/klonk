<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <UHeader>
      <template #title>
        <KlonkLogo />
      </template>
      <UNavigationMenu
        :items="[
          { label: t('nav.code'), icon: 'i-lucide-code', to: '/', exact: true },
          { label: t('nav.world'), icon: 'i-lucide-boxes', to: '/world' },
        ]"
      />

      <template #right>
        <LocaleSwitch />
        <UColorModeButton />
        <UserMenu />
      </template>
    </UHeader>

    <UMain>
      <slot />
    </UMain>
  </div>
</template>
