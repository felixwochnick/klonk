<script setup lang="ts">
definePageMeta({ public: true, layout: 'auth' })

const { t } = useI18n()
useSeoMeta({ title: () => t('auth.login.title') })

const route = useRoute()
const { loggedIn } = useUserSession()

const redirect = computed(() => {
  const target = route.query.redirect
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : '/'
})

if (loggedIn.value) await navigateTo(redirect.value)
</script>

<template>
  <AuthLoginForm @success="navigateTo(redirect)" />
</template>
