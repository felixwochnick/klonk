<script setup lang="ts">
import { findModule, LEARN_MODULES } from '@klonk/learn'

const { t, locale } = useI18n()
const route = useRoute()
const learn = useLearn()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))

const module = computed(() => findModule(String(route.params.module)))
const index = computed(() => LEARN_MODULES.findIndex(m => m.id === module.value?.id))
// Lernende einer Organisation: nur freigegebene Module (ohne Cloud keine)
const locked = computed(() => !!module.value && !!learn.status.value && !learn.canStart(module.value.id))
useSeoMeta({ title: () => module.value?.title[lang.value] ?? t('learn.title') })

// Hinweise für Lehrkräfte nur in der App (nicht in der öffentlichen Doku) und nur für Lehrkräfte, Admins, Betreiber
const { user } = useAuth()
const isTeacher = computed(() => !!user.value && (user.value.role !== 'member' || user.value.platformRole !== 'user'))
</script>

<template>
  <UContainer class="py-8">
    <UButton
      to="/learn"
      icon="i-lucide-arrow-left"
      variant="ghost"
      color="neutral"
      :label="t('learn.allModules')"
      class="mb-4"
    />

    <UAlert
      v-if="!module"
      color="warning"
      variant="subtle"
      icon="i-lucide-search-x"
      :title="t('learn.notFound')"
    />

    <div
      v-else
      class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]"
    >
      <article class="max-w-3xl">
        <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
          {{ t('learn.moduleNumber', { n: index + 1 }) }}
        </p>
        <h1 class="mt-1 text-2xl font-bold">
          {{ module.title[lang] }}
        </h1>

        <h2 class="mb-2 mt-6 font-semibold">
          {{ t('learn.objectives') }}
        </h2>
        <ul class="list-disc space-y-1 ps-5 text-sm">
          <li
            v-for="(objective, i) in module.objectives"
            :key="i"
          >
            <LearnText :text="objective[lang]" />
          </li>
        </ul>

        <h2 class="mb-2 mt-6 font-semibold">
          {{ t('learn.introduction') }}
        </h2>
        <LearnText :text="module.intro[lang]" />

        <UCard
          v-if="isTeacher"
          class="mt-8"
          data-testid="learn-teacher"
        >
          <template #header>
            <h2 class="flex items-center gap-2 font-semibold">
              <UIcon name="i-lucide-presentation" />
              {{ t('learn.teacherNotes') }}
            </h2>
          </template>
          <LearnText :text="module.teacher[lang]" />
        </UCard>
      </article>

      <aside>
        <UAlert
          v-if="locked"
          class="mb-4"
          color="warning"
          variant="subtle"
          icon="i-lucide-lock"
          :description="learn.status.value?.cloud ? t('learn.notEnabled') : t('learn.cloudRequired')"
          data-testid="learn-locked"
        />
        <h2 class="mb-3 font-semibold">
          {{ t('learn.tasks') }}
        </h2>
        <ol
          class="space-y-2"
          data-testid="learn-tasks"
        >
          <li
            v-for="(task, i) in module.tasks"
            :key="task.id"
          >
            <UButton
              :to="locked ? undefined : `/learn/${module.id}/${task.id}`"
              :disabled="locked"
              variant="outline"
              color="neutral"
              block
              class="justify-start"
              :data-testid="`learn-task-${task.id}`"
            >
              <UIcon
                :name="learn.isSolved(module.id, task.id) ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                :class="learn.isSolved(module.id, task.id) ? 'text-(--ui-success)' : 'text-(--ui-text-dimmed)'"
                class="size-5 shrink-0"
              />
              <span class="truncate">{{ i + 1 }}. {{ task.title[lang] }}</span>
            </UButton>
          </li>
        </ol>
        <UButton
          :to="locked ? undefined : `/learn/${module.id}/${learn.nextTaskId(module)}`"
          :label="learn.progress(module.id) ? t('learn.continue') : t('learn.start')"
          :disabled="locked || !learn.status.value"
          trailing-icon="i-lucide-arrow-right"
          class="mt-4"
          block
          data-testid="learn-start"
        />
      </aside>
    </div>
  </UContainer>
</template>
