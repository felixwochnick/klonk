<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const { t } = useI18n()
const { user, isPlatformAdmin } = useAuth()

const hasOrganization = computed(() => !!user.value?.organizationId)
const isAdmin = computed(() => hasOrganization.value && (user.value?.role === 'admin' || isPlatformAdmin.value))

const items = computed<NavigationMenuItem[][]>(() => [
  [
    ...(hasOrganization.value
      ? [
          { label: t('admin.nav.overview'), icon: 'i-lucide-house', to: '/', exact: true },
          { label: t('admin.nav.users'), icon: 'i-lucide-users', to: '/users' },
        ]
      : []),
    ...(isAdmin.value
      ? [
          { label: t('admin.nav.organization'), icon: 'i-lucide-building-2', to: '/organization', exact: true },
          { label: t('admin.nav.login'), icon: 'i-lucide-key-round', to: '/organization/login' },
          { label: t('admin.nav.ai'), icon: 'i-lucide-sparkles', to: '/organization/ai' },
        ]
      : []),
  ],
  [
    ...(isPlatformAdmin.value ? [{ label: t('admin.nav.organizations'), icon: 'i-lucide-globe', to: '/organizations' }] : []),
    ...(isAdmin.value || isPlatformAdmin.value ? [{ label: t('admin.nav.license'), icon: 'i-lucide-badge-check', to: '/license' }] : []),
  ],
])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      :ui="{ footer: 'border-t border-(--ui-border)' }"
    >
      <template #header="{ collapsed }">
        <KlonkLogo :class="collapsed ? 'mx-auto' : ''">
          <template v-if="!collapsed">
            Klonk <UBadge
              :label="t('admin.badge')"
              variant="subtle"
              size="sm"
            />
          </template>
          <template v-else>
            <span class="sr-only">Klonk Admin</span>
          </template>
        </KlonkLogo>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          v-for="(group, i) in items"
          :key="i"
          :items="group"
          :collapsed="collapsed"
          orientation="vertical"
        />
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-between gap-1">
          <UserMenu />
          <div
            v-if="!user"
            class="flex"
          >
            <LocaleSwitch />
            <UColorModeButton />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
