<script setup lang="ts">
// Zustimmung für KI-Assistenten (OAuth für MCP): welches Programm, welche Stufe – höchstens die des Kontos
definePageMeta({ layout: 'auth' })

const { t } = useI18n()
useSeoMeta({ title: () => t('oauth.title') })

const route = useRoute()
const { user } = useUserSession()
const apiError = useApiError()

type AuthorizeInfo = { client: { name: string, redirect: string }, requested: McpGrant | null, resource: string | null, max: McpAccess }
const query = computed(() => Object.fromEntries(Object.entries(route.query).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))))
const { data, error } = await useFetch<AuthorizeInfo>('/api/oauth/authorize', { query })

const grants = computed(() => mcpGrantsUpTo(data.value?.max ?? 'none'))
const access = ref<McpGrant>('read')
watch(data, (info) => {
  if (!info) return
  const wanted = info.requested && mcpAllows(info.max, info.requested) ? info.requested : grants.value.at(-1)
  if (wanted) access.value = wanted
}, { immediate: true })

const items = computed(() => grants.value.map(value => ({ value, label: t(`mcp.access.${value}`), description: t(`mcp.accessHint.${value}`) })))

const busy = ref(false)
const failure = ref('')
async function decide(approve: boolean) {
  busy.value = true
  failure.value = ''
  try {
    const { redirect } = await $fetch<{ redirect: string }>('/api/oauth/authorize', { method: 'POST', body: { query: query.value, approve, access: approve ? access.value : undefined } })
    // Rücksprung auch zu Programmen mit eigenem Schema (z. B. cursor://) – daher nicht über den Router
    window.location.assign(redirect)
  }
  catch (e) {
    failure.value = apiError(e)
    busy.value = false
  }
}
</script>

<template>
  <div
    class="space-y-5"
    data-testid="oauth-consent"
  >
    <div class="space-y-1">
      <h1 class="text-lg font-semibold">
        {{ t('oauth.title') }}
      </h1>
      <p
        v-if="data"
        class="text-sm text-(--ui-text-muted)"
      >
        <i18n-t
          keypath="oauth.request"
          tag="span"
          scope="global"
        >
          <template #client>
            <strong class="text-(--ui-text)">{{ data.client.name }}</strong>
          </template>
          <template #user>
            <strong class="text-(--ui-text)">{{ user?.displayName }}</strong>
          </template>
        </i18n-t>
      </p>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="apiError(error)"
    />

    <template v-else-if="data">
      <UAlert
        v-if="data.max === 'none'"
        color="warning"
        variant="subtle"
        icon="i-lucide-lock"
        :title="t('oauth.noAccess')"
        :description="t('mcp.notEnabled')"
      />
      <URadioGroup
        v-else
        v-model="access"
        :items="items"
        :legend="t('oauth.chooseAccess')"
        variant="card"
        data-testid="oauth-access"
      />

      <p class="text-xs text-(--ui-text-muted)">
        {{ t('oauth.redirectTo', { target: data.client.redirect }) }}
        {{ t('oauth.revokeHint') }}
      </p>

      <UAlert
        v-if="failure"
        color="error"
        variant="subtle"
        :title="failure"
      />

      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('oauth.deny')"
          :disabled="busy"
          @click="decide(false)"
        />
        <UButton
          v-if="data.max !== 'none'"
          icon="i-lucide-check"
          :label="t('oauth.allow')"
          :loading="busy"
          @click="decide(true)"
        />
      </div>
    </template>
  </div>
</template>
