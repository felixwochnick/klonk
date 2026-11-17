<script setup lang="ts">
// Einstellungen → KI-Assistenten (MCP): Adressen der MCP-Server, verbundene Programme, persönliche Tokens
const { t, d, locale } = useI18n()
const toast = useToast()
const apiError = useApiError()
const { docsUrl } = useRuntimeConfig().public

// Lokaler Testmodus braucht den Hostnamen des Browsers (clientHostHeaders)
const { data: info } = useFetch<McpInfo>('/api/mcp/info', { server: false, headers: clientHostHeaders() })
const { data: tokens, refresh } = useFetch<McpTokenInfo[]>('/api/mcp/tokens', { server: false, headers: clientHostHeaders(), default: () => [] })

const enabled = computed(() => !!info.value && info.value.access !== 'none')
const grants = computed(() => mcpGrantsUpTo(info.value?.access ?? 'none'))
const docsLink = computed(() => docsUrl && `${docsUrl.replace(/\/+$/, '')}/${locale.value === 'en' ? 'en' : 'de'}/administration/mcp`)

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: t('mcp.copied'), color: 'success', icon: 'i-lucide-copy-check' })
}

// Neues Token: Klartext nur direkt nach dem Anlegen
const form = ref<{ name: string, access: McpGrant, days: number } | null>(null)
const created = ref<{ token: string, name: string } | null>(null)
const saving = ref(false)
const accessItems = computed(() => grants.value.map(value => ({ value, label: t(`mcp.access.${value}`) })))
const dayItems = MCP_TOKEN_DAYS.map(value => ({ value: value as number, label: t('mcp.days', { n: value }) }))

function openCreate() {
  created.value = null
  form.value = { name: '', access: grants.value[0] ?? 'read', days: 90 }
}

async function create() {
  if (!form.value?.name.trim()) return
  saving.value = true
  try {
    const result = await $fetch<{ token: string, info: McpTokenInfo }>('/api/mcp/tokens', { method: 'POST', body: form.value })
    created.value = { token: result.token, name: result.info.name }
    form.value = null
    await refresh()
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function revoke(token: McpTokenInfo) {
  if (!confirm(t('mcp.confirmRevoke', { name: token.name }))) return
  try {
    await $fetch(`/api/mcp/tokens/${token.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: apiError(error), color: 'error' })
  }
}

const cliCommand = (url: string, token: string) => `claude mcp add --transport http klonk ${url} --header "Authorization: Bearer ${token}"`
</script>

<template>
  <section
    id="mcp"
    class="space-y-4"
    data-testid="mcp-settings"
  >
    <div class="space-y-1">
      <h2 class="text-lg font-semibold">
        {{ t('mcp.title') }}
      </h2>
      <p class="text-sm text-(--ui-text-muted)">
        {{ t('mcp.intro') }}
        <ULink
          v-if="docsLink"
          :to="docsLink"
          target="_blank"
          class="text-(--ui-primary)"
        >
          {{ t('mcp.docs') }}
        </ULink>
      </p>
    </div>

    <UAlert
      v-if="info && !enabled"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock"
      :title="t('mcp.notEnabled')"
      data-testid="mcp-disabled"
    />

    <template v-else-if="info">
      <p class="text-sm">
        {{ t('mcp.yourAccess') }} <UBadge
          :label="t(`mcp.access.${info.access}`)"
          variant="subtle"
          data-testid="mcp-access"
        />
      </p>
      <UAlert
        v-if="!info.licensed"
        color="warning"
        variant="subtle"
        icon="i-lucide-badge-alert"
        :title="t('mcp.unlicensed')"
        data-testid="mcp-unlicensed"
      />

      <!-- Adressen zum Eintragen im KI-Assistenten (Anmeldung dann per OAuth) -->
      <div class="space-y-2">
        <p class="text-sm text-(--ui-text-muted)">
          {{ t('mcp.connectHint') }}
        </p>
        <div
          v-for="server in info.servers"
          :key="server.id"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="w-28 text-sm font-medium">{{ t(`mcp.servers.${server.id}`) }}</span>
          <code
            class="rounded bg-(--ui-bg-elevated) px-2 py-1 text-sm"
            :data-testid="`mcp-url-${server.id}`"
          >{{ server.url }}</code>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-copy"
            :aria-label="t('mcp.copy')"
            @click="copy(server.url)"
          />
        </div>
      </div>

      <!-- Verbundene Programme und persönliche Tokens -->
      <div class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-medium">
            {{ t('mcp.connections') }}
          </h3>
          <UButton
            size="sm"
            icon="i-lucide-key-round"
            :label="t('mcp.newToken')"
            :disabled="!info.licensed"
            data-testid="mcp-new-token"
            @click="openCreate"
          />
        </div>
        <p
          v-if="!tokens.length"
          class="text-sm text-(--ui-text-muted)"
        >
          {{ t('mcp.noConnections') }}
        </p>
        <ul
          v-else
          class="divide-y divide-(--ui-border) rounded-md border border-(--ui-border)"
        >
          <li
            v-for="token in tokens"
            :key="token.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
            data-testid="mcp-token"
          >
            <UIcon
              :name="token.kind === 'oauth' ? 'i-lucide-plug' : 'i-lucide-key-round'"
              class="text-(--ui-text-muted)"
            />
            <span class="font-medium">{{ token.name }}</span>
            <UBadge
              :label="t(`mcp.access.${token.access}`)"
              variant="subtle"
              size="sm"
            />
            <span class="text-xs text-(--ui-text-muted)">
              {{ token.lastUsedAt ? t('mcp.lastUsed', { date: d(new Date(token.lastUsedAt), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('mcp.neverUsed') }}
              · {{ t('mcp.expires', { date: d(new Date(token.expiresAt), { dateStyle: 'medium' }) }) }}
            </span>
            <UButton
              class="ms-auto"
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              :label="t('mcp.revoke')"
              @click="revoke(token)"
            />
          </li>
        </ul>
      </div>

      <!-- Gerade angelegtes Token: nur jetzt sichtbar -->
      <UAlert
        v-if="created"
        color="success"
        variant="subtle"
        icon="i-lucide-key-round"
        :title="t('mcp.createdTitle', { name: created.name })"
        data-testid="mcp-created"
      >
        <template #description>
          <div class="space-y-2">
            <p>{{ t('mcp.createdHint') }}</p>
            <div class="flex items-center gap-2">
              <code
                class="break-all rounded bg-(--ui-bg) px-2 py-1"
                data-testid="mcp-token-value"
              >{{ created.token }}</code>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-copy"
                :aria-label="t('mcp.copy')"
                @click="copy(created.token)"
              />
            </div>
            <p>{{ t('mcp.cliHint') }}</p>
            <div
              v-for="server in info.servers"
              :key="server.id"
              class="flex items-center gap-2"
            >
              <code class="break-all rounded bg-(--ui-bg) px-2 py-1 text-xs">{{ cliCommand(server.url, created.token) }}</code>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-copy"
                :aria-label="t('mcp.copy')"
                @click="copy(cliCommand(server.url, created.token))"
              />
            </div>
          </div>
        </template>
      </UAlert>
    </template>

    <UModal
      :open="!!form"
      :title="t('mcp.newToken')"
      @update:open="!$event && (form = null)"
    >
      <template #body>
        <form
          v-if="form"
          id="mcp-token-form"
          class="space-y-4"
          @submit.prevent="create"
        >
          <UFormField
            :label="t('mcp.tokenName')"
            required
          >
            <UInput
              v-model="form.name"
              :placeholder="t('mcp.tokenNamePlaceholder')"
              class="w-full"
              autofocus
              data-testid="mcp-token-name"
            />
          </UFormField>
          <UFormField :label="t('mcp.tokenAccess')">
            <USelect
              v-model="form.access"
              :items="accessItems"
              class="w-full"
              data-testid="mcp-token-access"
            />
          </UFormField>
          <UFormField :label="t('mcp.tokenDays')">
            <USelect
              v-model="form.days"
              :items="dayItems"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('mcp.cancel')"
            @click="form = null"
          />
          <UButton
            type="submit"
            form="mcp-token-form"
            :label="t('mcp.create')"
            :loading="saving"
            data-testid="mcp-token-create"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
