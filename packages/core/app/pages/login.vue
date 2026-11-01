<script setup lang="ts">
definePageMeta({ public: true, layout: 'auth' })

const { t } = useI18n()
useSeoMeta({ title: () => t('auth.login.title') })

const route = useRoute()
const { loggedIn } = useUserSession()
const { allowedOrigins } = useAuthUrls()

// Ziel nach dem Login: eigener Pfad oder (auf auth.klonk.*) eine erlaubte App-URL
const redirect = computed(() => safeRedirectTarget(route.query.redirect, allowedOrigins))
const external = computed(() => !redirect.value.startsWith('/'))

if (loggedIn.value) await navigateTo(redirect.value, { external: external.value })
</script>

<template>
  <AuthLoginForm
    :redirect="redirect"
    @success="navigateTo(redirect, { external })"
  />
</template>
