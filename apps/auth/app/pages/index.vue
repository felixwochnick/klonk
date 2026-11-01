<script setup lang="ts">
// Startseite der zentralen Anmeldung: wer angemeldet ist und wohin es weitergeht
const { t } = useI18n()
useSeoMeta({ title: () => t('authApp.title') })

const { user, logout, isPlatformAdmin } = useAuth()
const { public: { appUrl, adminUrl } } = useRuntimeConfig()

const canAdmin = computed(() => isPlatformAdmin.value || user.value?.role === 'teacher' || user.value?.role === 'admin')
</script>

<template>
  <div
    v-if="user"
    class="space-y-4"
  >
    <div>
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('authApp.signedInAs') }}
      </p>
      <p
        class="text-lg font-bold"
        data-testid="auth-user"
      >
        {{ user.displayName }}
      </p>
      <p class="text-sm text-(--ui-text-muted)">
        {{ user.organizationName ?? user.email }}
      </p>
    </div>
    <div class="space-y-2">
      <UButton
        block
        :to="appUrl"
        external
        icon="i-lucide-blocks"
        :label="t('authApp.openApp')"
      />
      <UButton
        v-if="canAdmin"
        block
        variant="outline"
        :to="adminUrl"
        external
        icon="i-lucide-settings"
        :label="t('authApp.openAdmin')"
      />
      <UButton
        v-if="user.hasPassword"
        block
        variant="ghost"
        color="neutral"
        to="/change-password"
        icon="i-lucide-key-round"
        :label="t('auth.changePassword.title')"
      />
      <UButton
        block
        variant="ghost"
        color="neutral"
        icon="i-lucide-log-out"
        :label="t('auth.logout')"
        @click="logout"
      />
    </div>
  </div>
</template>
