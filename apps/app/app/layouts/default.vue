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
          { label: t('nav.projects'), icon: 'i-lucide-folder-tree', to: '/projects' },
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
