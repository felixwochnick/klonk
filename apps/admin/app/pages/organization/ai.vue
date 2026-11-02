<script setup lang="ts">
definePageMeta({ requiresAdmin: true })

const { t } = useI18n()
useSeoMeta({ title: () => t('admin.nav.ai') })

const toast = useToast()
const { can } = useLicense()
const apiError = useApiError()

const { data } = await useFetch('/api/admin/organization/ai')

type Mode = 'inherit' | 'off' | 'server' | 'webllm'
const form = reactive({
  mode: (data.value?.mode ?? 'inherit') as Mode,
  baseUrl: data.value?.baseUrl ?? '',
  model: data.value?.model ?? '',
  apiKey: '',
  webllmModel: (data.value?.webllmModel ?? AI_DEFAULT_WEBLLM_MODEL) as typeof AI_WEBLLM_MODELS[number],
  tutor: data.value?.tutor ?? true,
})
const hasApiKey = computed(() => data.value?.hasApiKey)
const instance = computed(() => data.value?.instance)

const modes = computed(() => (['inherit', 'off', 'server', 'webllm'] as const).map(value => ({
  value,
  label: t(`admin.ai.modes.${value}`),
  description: value === 'inherit'
    ? t('admin.ai.inheritDescription', { mode: t(`admin.ai.modes.${instance.value?.mode ?? 'off'}`), model: instance.value?.model ?? '–' })
    : t(`admin.ai.modeDescriptions.${value}`),
})))
const webllmModels = AI_WEBLLM_MODELS.map(value => ({ value, label: value.replace(/-q4f16_1-MLC$/, '') }))

function body() {
  return {
    mode: form.mode,
    baseUrl: form.baseUrl.trim() || null,
    model: form.model.trim() || null,
    apiKey: form.apiKey || undefined,
    webllmModel: form.webllmModel,
    tutor: form.tutor,
  }
}

async function save() {
  try {
    await $fetch('/api/admin/organization/ai', { method: 'PUT', body: body() })
    toast.add({ title: t('admin.saved'), color: 'success' })
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
}

const testing = ref(false)
async function test() {
  testing.value = true
  try {
    const result = await $fetch<{ ok: boolean, message?: string }>('/api/admin/organization/test-ai', { method: 'POST', body: body() })
    toast.add(result.ok
      ? { title: t('admin.login.testOk'), description: result.message, color: 'success' }
      : { title: t('admin.login.testFailed'), description: result.message, color: 'error' })
  }
  catch (e) {
    toast.add({ title: apiError(e), color: 'error' })
  }
  finally {
    testing.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="ai-settings">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.ai')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            :label="t('admin.save')"
            icon="i-lucide-save"
            data-testid="ai-save"
            @click="save"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-3xl space-y-6">
        <p class="text-(--ui-text-muted)">
          {{ t('admin.ai.description') }}
        </p>
        <UAlert
          v-if="!can('ai')"
          color="warning"
          variant="subtle"
          icon="i-lucide-badge-check"
          :title="t('admin.ai.locked')"
          data-testid="ai-locked"
        />

        <UCard>
          <URadioGroup
            v-model="form.mode"
            :items="modes"
            :legend="t('admin.ai.mode')"
            data-testid="ai-mode"
          />
        </UCard>

        <UCard v-if="form.mode === 'server'">
          <template #header>
            <p class="font-medium">
              {{ t('admin.ai.modes.server') }}
            </p>
            <p class="text-sm text-(--ui-text-muted)">
              {{ t('admin.ai.serverHelp') }}
            </p>
          </template>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField
              :label="t('admin.ai.baseUrl')"
              :help="t('admin.ai.baseUrlHelp')"
              class="sm:col-span-2"
            >
              <UInput
                v-model="form.baseUrl"
                placeholder="https://api.openai.com/v1"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="t('admin.ai.model')">
              <UInput
                v-model="form.model"
                placeholder="gpt-4o-mini, qwen2.5-coder:7b …"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="t('admin.ai.apiKey')"
              :help="hasApiKey ? t('admin.login.secretKept') : t('admin.ai.apiKeyHelp')"
            >
              <UInput
                v-model="form.apiKey"
                type="password"
                autocomplete="off"
                class="w-full"
              />
            </UFormField>
          </div>
          <template #footer>
            <UButton
              variant="outline"
              icon="i-lucide-plug-zap"
              :label="t('admin.login.test')"
              :loading="testing"
              :disabled="!form.baseUrl || !form.model"
              data-testid="ai-test"
              @click="test"
            />
          </template>
        </UCard>

        <UCard v-if="form.mode === 'webllm'">
          <template #header>
            <p class="font-medium">
              {{ t('admin.ai.modes.webllm') }}
            </p>
            <p class="text-sm text-(--ui-text-muted)">
              {{ t('admin.ai.webllmHelp') }}
            </p>
          </template>
          <UFormField :label="t('admin.ai.model')">
            <USelect
              v-model="form.webllmModel"
              :items="webllmModels"
              class="w-full"
            />
          </UFormField>
        </UCard>

        <UCard v-if="form.mode === 'server' || form.mode === 'webllm'">
          <USwitch
            v-model="form.tutor"
            :label="t('admin.ai.tutor')"
            :description="t('admin.ai.tutorDescription')"
            data-testid="ai-tutor"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
