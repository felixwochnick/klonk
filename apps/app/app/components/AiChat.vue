<script setup lang="ts">
// KI-Assistent (Tab neben Welt | Doku): Chat mit Editor-Kontext, Codeblöcke übernehmen (nur bei voller Hilfe)
const props = defineProps<{
  /** Sprache, API-Referenz, Code, Fehler – wird bei jeder Frage neu gebaut */
  context: () => string
  /** Codeblöcke dürfen in den Editor (Code-Editor offen, nicht während eines Laufs) */
  canApply: boolean
}>()
const emit = defineEmits<{ insert: [code: string], replace: [code: string] }>()

const { t } = useI18n()
const toast = useToast()
const ai = useAi()

const input = ref('')
const list = ref<HTMLElement>()

function send(text = input.value) {
  if (!text.trim() || ai.busy.value) return
  input.value = ''
  void ai.ask(text, props.context())
}

function onKeydown(event: KeyboardEvent) {
  // Enter schickt ab, Umschalt+Enter macht eine neue Zeile
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}

// Beim Streamen mitscrollen
watch(() => ai.messages.value.at(-1)?.content, () => nextTick(() => {
  list.value?.scrollTo({ top: list.value.scrollHeight })
}))

const modelItems = computed(() => ai.config.value?.models.map(m => ({ value: m.id, label: m.label })) ?? [])
// Gewähltes Modell nicht mehr freigegeben ⇒ Standard
watch(modelItems, (items) => {
  if (ai.model.value && !items.some(i => i.value === ai.model.value)) ai.model.value = ''
})
const selectedModel = computed({
  get: () => ai.model.value || modelItems.value[0]?.value || '',
  set: (value: string) => {
    ai.model.value = value
  },
})

const suggestions = computed(() => [t('ai.suggestions.explain'), t('ai.suggestions.next'), t('ai.suggestions.loop')])

async function copy(code: string) {
  await navigator.clipboard.writeText(code).catch(() => {})
  toast.add({ title: t('ai.copied'), color: 'success' })
}
</script>

<template>
  <div
    class="flex h-full min-h-0 flex-col"
    data-testid="ai-chat"
  >
    <div class="flex items-center gap-2 border-b border-(--ui-border) px-3 py-1.5">
      <UBadge
        :color="ai.config.value?.tutor ? 'info' : 'neutral'"
        variant="subtle"
        size="sm"
        :icon="ai.config.value?.tutor ? 'i-lucide-lightbulb' : 'i-lucide-sparkles'"
        :label="ai.config.value?.tutor ? t('ai.tutor') : t('ai.full')"
        data-testid="ai-mode"
      />
      <span
        v-if="ai.config.value?.mode === 'webllm'"
        class="text-xs text-(--ui-text-muted)"
      >{{ t('ai.onDevice') }}</span>
      <USelect
        v-else-if="modelItems.length > 1"
        v-model="selectedModel"
        :items="modelItems"
        size="xs"
        variant="ghost"
        :aria-label="t('ai.model')"
        class="min-w-0 max-w-48"
        data-testid="ai-model"
      />
      <UButton
        class="ms-auto"
        size="xs"
        variant="ghost"
        icon="i-lucide-message-square-plus"
        :label="t('ai.newChat')"
        :disabled="!ai.messages.value.length"
        data-testid="ai-clear"
        @click="ai.clear()"
      />
    </div>

    <div
      ref="list"
      class="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm"
      aria-live="polite"
    >
      <UAlert
        v-if="ai.config.value?.notice"
        color="info"
        variant="subtle"
        icon="i-lucide-cpu"
        :description="t(`ai.notice.${ai.config.value.notice}`)"
        data-testid="ai-notice"
      />
      <div
        v-if="!ai.messages.value.length"
        class="space-y-3 text-(--ui-text-muted)"
      >
        <p>{{ ai.config.value?.tutor ? t('ai.introTutor') : t('ai.intro') }}</p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="s in suggestions"
            :key="s"
            size="xs"
            variant="outline"
            color="neutral"
            :label="s"
            @click="send(s)"
          />
        </div>
      </div>

      <div
        v-for="(message, i) in ai.messages.value"
        :key="i"
        :class="message.role === 'user' ? 'ms-8 rounded-lg bg-(--ui-bg-elevated) px-3 py-2' : 'me-2'"
        :data-testid="`ai-message-${message.role}`"
      >
        <p
          v-if="message.role === 'user'"
          class="whitespace-pre-wrap"
        >
          {{ message.content }}
        </p>
        <UAlert
          v-else-if="message.error"
          color="error"
          variant="subtle"
          icon="i-lucide-octagon-alert"
          :description="message.content"
        />
        <template v-else>
          <template
            v-for="(block, b) in parseAiMarkdown(message.content)"
            :key="b"
          >
            <div
              v-if="block.type === 'code'"
              class="my-2 overflow-hidden rounded-md border border-(--ui-border)"
              data-testid="ai-code"
            >
              <pre class="overflow-x-auto bg-(--ui-bg-muted) p-2 font-mono text-xs">{{ block.code }}</pre>
              <div
                v-if="block.complete"
                class="flex gap-1 border-t border-(--ui-border) px-1 py-1"
              >
                <UButton
                  size="xs"
                  variant="ghost"
                  icon="i-lucide-copy"
                  :label="t('ai.copy')"
                  @click="copy(block.code)"
                />
                <template v-if="canApply && !ai.config.value?.tutor">
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-text-cursor-input"
                    :label="t('ai.insert')"
                    data-testid="ai-insert"
                    @click="emit('insert', block.code)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-replace"
                    :label="t('ai.replace')"
                    data-testid="ai-replace"
                    @click="emit('replace', block.code)"
                  />
                </template>
              </div>
            </div>
            <p
              v-else
              class="my-1"
            >
              <template
                v-for="(line, l) in block.lines"
                :key="l"
              >
                <br v-if="l">
                <template
                  v-for="(part, p) in line"
                  :key="p"
                >
                  <code
                    v-if="part.kind === 'code'"
                    class="rounded bg-(--ui-bg-muted) px-1 font-mono text-xs"
                  >{{ part.value }}</code>
                  <strong v-else-if="part.kind === 'bold'">{{ part.value }}</strong>
                  <template v-else>
                    {{ part.value }}
                  </template>
                </template>
              </template>
            </p>
          </template>
          <span
            v-if="ai.busy.value && i === ai.messages.value.length - 1 && !message.content"
            class="text-(--ui-text-muted)"
          >{{ t('ai.thinking') }}</span>
        </template>
      </div>

      <div
        v-if="ai.loading.value"
        class="space-y-1"
        data-testid="ai-loading"
      >
        <p class="text-xs text-(--ui-text-muted)">
          {{ t('ai.loadingModel') }}
        </p>
        <UProgress :model-value="Math.round(ai.loading.value.progress * 100)" />
        <p class="truncate text-xs text-(--ui-text-dimmed)">
          {{ ai.loading.value.text }}
        </p>
      </div>
    </div>

    <div class="border-t border-(--ui-border) p-2">
      <div class="flex items-end gap-2">
        <UTextarea
          v-model="input"
          :placeholder="t('ai.placeholder')"
          :rows="1"
          autoresize
          :maxrows="6"
          class="flex-1"
          :aria-label="t('ai.placeholder')"
          data-testid="ai-input"
          @keydown="onKeydown"
        />
        <UButton
          v-if="ai.busy.value"
          icon="i-lucide-square"
          color="neutral"
          :aria-label="t('ai.stop')"
          data-testid="ai-stop"
          @click="ai.stop()"
        />
        <UButton
          v-else
          icon="i-lucide-send-horizontal"
          :aria-label="t('ai.send')"
          :disabled="!input.trim()"
          data-testid="ai-send"
          @click="send()"
        />
      </div>
      <p class="mt-1 text-[11px] text-(--ui-text-dimmed)">
        {{ t('ai.disclaimer') }}
      </p>
    </div>
  </div>
</template>
