<script setup lang="ts">
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
useSeoMeta({ title: () => t('auth.changePassword.title') })

const route = useRoute()
const { allowedOrigins } = useAuthUrls()
const redirect = computed(() => safeRedirectTarget(route.query.redirect, allowedOrigins))
</script>

<template>
  <AuthChangePasswordForm @success="navigateTo(redirect, { external: !redirect.startsWith('/') })" />
</template>
