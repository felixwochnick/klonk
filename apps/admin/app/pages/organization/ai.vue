<script setup lang="ts">
definePageMeta({ requiresAdmin: true })

const { t, n } = useI18n()
useSeoMeta({ title: () => t('admin.nav.ai') })

const toast = useToast()
const { can } = useLicense()
const apiError = useApiError()
const shopUrl = useRuntimeConfig().public.shopUrl

const { data, refresh } = await useFetch('/api/admin/organization/ai')

type Access = AiModelAccess | 'off'
type PresetId = typeof AI_PROVIDER_PRESETS[number]['id']

/** Vorlage passend zur gespeicherten Adresse (sonst „OpenAI-kompatibel“) */
function presetFor(provider: AiProvider, baseUrl: string | null): PresetId {
  return AI_PROVIDER_PRESETS.find(p => p.provider === provider && p.baseUrl && p.baseUrl === baseUrl)?.id
    ?? (provider === 'anthropic' ? 'anthropic' : 'custom')
}

const form = reactive({
  mode: (data.value?.mode ?? 'inherit') as AiSettingMode,
  preset: presetFor(data.value?.provider ?? 'openai', data.value?.baseUrl ?? null),
  provider: (data.value?.provider ?? 'openai') as AiProvider,
  baseUrl: data.value?.baseUrl ?? '',
  apiKey: '',
  models: (data.value?.mode === 'server' ? data.value.models : []).map(m => ({ ...m })),
  webllmModel: (data.value?.webllmModel ?? AI_DEFAULT_WEBLLM_MODEL) as typeof AI_WEBLLM_MODELS[number],
  tutor: data.value?.tutor ?? true,
  studentDailyRequests: data.value?.studentDailyRequests ?? null as number | null,
  studentDailyCredits: data.value?.studentDailyCredits ?? null as number | null,
})
if (!form.models.length) form.models.push({ id: '', access: 'all' })

// Klonk-KI: Freigabe je Modell (ohne gespeicherte Auswahl: teure nur für Lehrkräfte)
const platformModels = computed(() => data.value?.platform?.models ?? [])
const platformAccess = reactive<Record<string, Access>>({})
watchEffect(() => {
  const saved = data.value?.mode === 'platform' ? data.value.models : []
  for (const model of platformModels.value) {
    platformAccess[model.id] ??= saved.length
      ? saved.find(s => s.id === model.id)?.access ?? 'off'
      : model.premium ? 'teachers' : 'all'
  }
})

const hasApiKey = computed(() => data.value?.hasApiKey)
const instance = computed(() => data.value?.instance)
const quota = computed(() => data.value?.platform?.quota)

const modes = computed(() => AI_SETTING_MODES
  .filter(value => value !== 'platform' || data.value?.hosted)
  .map(value => ({
    value,
    label: t(`admin.ai.modes.${value}`),
    description: value === 'inherit'
      ? t('admin.ai.inheritDescription', { mode: t(`admin.ai.modes.${instance.value?.mode ?? 'off'}`), model: instance.value?.model ?? '–' })
      : t(`admin.ai.modeDescriptions.${value}`),
  })))
const presets = computed(() => AI_PROVIDER_PRESETS.map(p => ({ value: p.id, label: t(`admin.ai.presets.${p.id}`) })))
const accessItems = computed(() => (['all', 'teachers'] as const).map(value => ({ value, label: t(`admin.ai.access.${value}`) })))
const platformAccessItems = computed(() => (['all', 'teachers', 'off'] as const).map(value => ({ value, label: t(`admin.ai.access.${value}`) })))
const webllmModels = AI_WEBLLM_MODELS.map(value => ({ value, label: value.replace(/-q4f16_1-MLC$/, '') }))

// Vorlage wählen ⇒ Schnittstelle, Adresse und Beispielmodell übernehmen
watch(() => form.preset, (id) => {
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === id)!
  form.provider = preset.provider
  if (preset.baseUrl) form.baseUrl = preset.baseUrl
  if (preset.model && form.models.every(m => !m.id)) form.models = [{ id: preset.model, access: 'all' }]
})

const usesServer = computed(() => form.mode === 'server' || form.mode === 'platform')

function body() {
  return {
    mode: form.mode,
    provider: form.provider,
    baseUrl: form.baseUrl.trim() || null,
    apiKey: form.apiKey || undefined,
    models: form.mode === 'platform'
      ? platformModels.value.filter(m => platformAccess[m.id] !== 'off').map(m => ({ id: m.id, access: platformAccess[m.id] as AiModelAccess }))
      : form.models.filter(m => m.id.trim()).map(m => ({ id: m.id.trim(), access: m.access })),
    webllmModel: form.webllmModel,
    tutor: form.tutor,
    studentDailyRequests: form.studentDailyRequests || null,
    studentDailyCredits: form.mode === 'platform' ? form.studentDailyCredits || null : null,
  }
}

async function save() {
  try {
    await $fetch('/api/admin/organization/ai', { method: 'PUT', body: body() })
    toast.add({ title: t('admin.saved'), color: 'success' })
    await refresh()
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

const credits = (value: number) => n(value, { maximumFractionDigits: 2 })
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
          v-if="form.mode === 'server' && !can('ai')"
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

        <!-- Eigener Anbieter (BYOK) -->
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
            <UFormField :label="t('admin.ai.provider')">
              <USelect
                v-model="form.preset"
                :items="presets"
                class="w-full"
                data-testid="ai-preset"
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
            <UFormField
              :label="t('admin.ai.baseUrl')"
              :help="form.provider === 'anthropic' ? t('admin.ai.baseUrlHelpAnthropic') : t('admin.ai.baseUrlHelp')"
              class="sm:col-span-2"
            >
              <UInput
                v-model="form.baseUrl"
                placeholder="https://api.openai.com/v1"
                class="w-full"
              />
            </UFormField>
            <div class="space-y-2 sm:col-span-2">
              <p class="text-sm font-medium">
                {{ t('admin.ai.models') }}
              </p>
              <p class="text-sm text-(--ui-text-muted)">
                {{ t('admin.ai.modelsHelp') }}
              </p>
              <div
                v-for="(model, i) in form.models"
                :key="i"
                class="flex gap-2"
              >
                <UInput
                  v-model="model.id"
                  :placeholder="t('admin.ai.modelPlaceholder')"
                  :aria-label="t('admin.ai.model')"
                  class="flex-1"
                />
                <USelect
                  v-model="model.access"
                  :items="accessItems"
                  :aria-label="t('admin.ai.accessLabel')"
                  class="w-48"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('admin.ai.removeModel')"
                  :disabled="form.models.length === 1"
                  @click="form.models.splice(i, 1)"
                />
              </div>
              <UButton
                icon="i-lucide-plus"
                variant="outline"
                size="sm"
                :label="t('admin.ai.addModel')"
                @click="form.models.push({ id: '', access: 'all' })"
              />
            </div>
          </div>
          <template #footer>
            <UButton
              variant="outline"
              icon="i-lucide-plug-zap"
              :label="t('admin.login.test')"
              :loading="testing"
              :disabled="!form.baseUrl || !form.models.some(m => m.id.trim())"
              data-testid="ai-test"
              @click="test"
            />
          </template>
        </UCard>

        <!-- Klonk-KI (gehostete Plattform, über Klonk abgerechnet) -->
        <UCard
          v-if="form.mode === 'platform'"
          data-testid="ai-platform"
        >
          <template #header>
            <p class="font-medium">
              {{ t('admin.ai.modes.platform') }}
            </p>
            <p class="text-sm text-(--ui-text-muted)">
              {{ t('admin.ai.platformHelp') }}
            </p>
          </template>
          <div class="space-y-4">
            <div
              v-if="quota"
              class="space-y-2"
              data-testid="ai-quota"
            >
              <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>{{ t('admin.ai.quotaMonthly', { used: credits(quota.monthlyUsed), total: credits(quota.monthly) }) }}</span>
                <span class="text-(--ui-text-muted)">{{ t('admin.ai.quotaExtra', { left: credits(quota.extraLeft) }) }}</span>
              </div>
              <UProgress
                :model-value="quota.monthly ? Math.min(100, Math.round(quota.monthlyUsed / quota.monthly * 100)) : 100"
                :color="quota.remaining > 0 ? 'primary' : 'error'"
              />
              <UAlert
                v-if="quota.remaining <= 0"
                color="warning"
                variant="subtle"
                icon="i-lucide-battery-low"
                :title="t('admin.ai.quotaEmpty')"
                data-testid="ai-quota-empty"
              />
              <UButton
                v-if="shopUrl"
                :to="shopUrl"
                target="_blank"
                variant="outline"
                size="sm"
                icon="i-lucide-shopping-cart"
                :label="t('admin.ai.buyCredits')"
              />
            </div>
            <p
              v-if="!platformModels.length"
              class="text-sm text-(--ui-text-muted)"
            >
              {{ t('admin.ai.noPlatformModels') }}
            </p>
            <table
              v-else
              class="w-full text-sm"
              data-testid="ai-platform-models"
            >
              <thead class="text-start text-(--ui-text-muted)">
                <tr>
                  <th class="py-1 text-start font-normal">
                    {{ t('admin.ai.model') }}
                  </th>
                  <th class="py-1 text-start font-normal">
                    {{ t('admin.ai.price') }}
                  </th>
                  <th class="py-1 text-start font-normal">
                    {{ t('admin.ai.accessLabel') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="model in platformModels"
                  :key="model.id"
                  class="border-t border-(--ui-border)"
                >
                  <td class="py-2">
                    {{ model.label }}
                    <UBadge
                      v-if="model.premium"
                      size="sm"
                      variant="subtle"
                      color="warning"
                      :label="t('admin.ai.premium')"
                      class="ms-1"
                    />
                  </td>
                  <td class="py-2 text-(--ui-text-muted)">
                    {{ t('admin.ai.priceValue', { input: credits(model.inputCredits), output: credits(model.outputCredits) }) }}
                  </td>
                  <td class="py-2">
                    <USelect
                      v-model="platformAccess[model.id]"
                      :items="platformAccessItems"
                      :aria-label="t('admin.ai.accessFor', { model: model.label })"
                      class="w-48"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>

        <UCard v-if="form.mode !== 'off' && form.mode !== 'inherit'">
          <template #header>
            <p class="font-medium">
              {{ t('admin.ai.modes.webllm') }}
            </p>
            <p class="text-sm text-(--ui-text-muted)">
              {{ form.mode === 'webllm' ? t('admin.ai.webllmHelp') : t('admin.ai.webllmFallback') }}
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

        <UCard v-if="form.mode !== 'off' && form.mode !== 'inherit'">
          <div class="space-y-4">
            <USwitch
              v-model="form.tutor"
              :label="t('admin.ai.tutor')"
              :description="t('admin.ai.tutorDescription')"
              data-testid="ai-tutor"
            />
            <div
              v-if="usesServer"
              class="grid gap-4 sm:grid-cols-2"
            >
              <UFormField
                :label="t('admin.ai.dailyRequests')"
                :help="t('admin.ai.dailyHelp')"
              >
                <UInputNumber
                  v-model="form.studentDailyRequests"
                  :min="1"
                  :placeholder="t('admin.ai.unlimited')"
                  class="w-full"
                  data-testid="ai-daily-requests"
                />
              </UFormField>
              <UFormField
                v-if="form.mode === 'platform'"
                :label="t('admin.ai.dailyCredits')"
                :help="t('admin.ai.dailyHelp')"
              >
                <UInputNumber
                  v-model="form.studentDailyCredits"
                  :min="1"
                  :placeholder="t('admin.ai.unlimited')"
                  class="w-full"
                  data-testid="ai-daily-credits"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <AiUsage v-if="usesServer || data?.mode === 'server' || data?.mode === 'platform'" />
      </div>
    </template>
  </UDashboardPanel>
</template>
