<script setup lang="ts">
// Kurzreferenz der aktuellen Sprache (Tab neben der 3D-Ansicht), Daten aus `languageReference()`
const props = defineProps<{ language: ProgramLanguage }>()

const { t, locale } = useI18n()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
const { public: { docsUrl } } = useRuntimeConfig()

const reference = computed(() => languageReference(props.language, lang.value))
const style = computed(() => reference.value.style)
const isScript = computed(() => reference.value.isScript)
const commands = computed(() => reference.value.commands)
const colors = computed(() => reference.value.colors)
const keywords = computed(() => reference.value.keywords)

/** Datenbanken in den Objekt-Sprachen (kurzes Beispiel, Platzhalter für SQLite) */
const DATABASE_EXAMPLES: Partial<Record<ProgramLanguage, string>> = {
  javascript: `import { Database } from 'klonk'\nconst db = Database.open('schule')\nfor (const s of db.query('SELECT * FROM schueler WHERE klasse_id = ?', [1]))\n  console.log(s.vorname)\ndb.execute('DELETE FROM schueler WHERE id = ?', [3])`,
  python: `from klonk import Database\ndb = Database.open("schule")\nfor s in db.query("SELECT * FROM schueler WHERE klasse_id = ?", (1,)):\n    print(s["vorname"])\ndb.execute("DELETE FROM schueler WHERE id = ?", (3,))`,
  java: `import klonk.Database; import klonk.Row;\nDatabase db = Database.open("schule");\nfor (Row s : db.query("SELECT * FROM schueler WHERE klasse_id = ?", 1))\n    System.out.println(s.getString("vorname"));\ndb.execute("DELETE FROM schueler WHERE id = ?", 3);`,
  csharp: `using klonk;\nvar db = Database.Open("schule");\nforeach (var s in db.Query("SELECT * FROM schueler WHERE klasse_id = ?", 1))\n    Console.WriteLine(s.GetString("vorname"));\ndb.Execute("DELETE FROM schueler WHERE id = ?", 3);`,
}
DATABASE_EXAMPLES.typescript = DATABASE_EXAMPLES.javascript
const databaseExample = computed(() => DATABASE_EXAMPLES[props.language])

const PAGES: Record<ProgramLanguage, string> = { klonk: 'introduction', blocks: 'blocks', javascript: 'javascript', typescript: 'javascript', python: 'python', java: 'java', csharp: 'csharp' }
const docsLink = computed(() => `${docsUrl}${lang.value === 'en' ? '/en' : ''}/klonk-script/${PAGES[props.language]}`)
</script>

<template>
  <div
    class="h-full overflow-y-auto p-4 text-sm"
    data-testid="language-docs"
  >
    <div class="mb-3 flex items-center gap-2">
      <h2 class="text-base font-semibold">
        {{ t(`editor.languages.${language}`) }} – {{ t('langDocs.title') }}
      </h2>
      <UButton
        :to="docsLink"
        target="_blank"
        size="xs"
        variant="ghost"
        trailing-icon="i-lucide-external-link"
        :label="t('langDocs.full')"
        class="ms-auto"
      />
    </div>

    <template v-if="style">
      <p class="mb-1 font-medium">
        {{ t('langDocs.import') }}
      </p>
      <pre class="mb-4 rounded-md bg-(--ui-bg-muted) p-2 font-mono text-xs">{{ style.imports }}</pre>

      <p class="mb-1 font-medium">
        {{ t('langDocs.characters') }}
      </p>
      <ul class="mb-4 space-y-1">
        <li><code>{{ style.newKlonk.replace('"Klara"', '') }}</code> – {{ t('langDocs.first') }}</li>
        <li><code>{{ style.newKlonk }}</code> – {{ t('langDocs.byName') }}</li>
        <li><code>{{ style.all }}</code> – {{ t('langDocs.all') }}</li>
        <li><code>{{ style.create }}</code> – {{ t('langDocs.create') }}</li>
        <li><code>{{ style.name }}</code> – {{ t('langDocs.name') }}</li>
      </ul>
    </template>
    <p
      v-else
      class="mb-3 text-(--ui-text-muted)"
    >
      {{ t('langDocs.scriptIntro') }} <code>{{ keywords.join(' · ') }}</code>
    </p>

    <p class="mb-1 font-medium">
      {{ isScript ? t('langDocs.commands') : t('langDocs.methods') }}
    </p>
    <table class="mb-4 w-full">
      <tbody>
        <tr
          v-for="c in commands"
          :key="c.name"
          class="border-b border-(--ui-border) align-top"
        >
          <td class="py-1 pe-3 font-mono text-xs whitespace-nowrap">
            {{ c.call }}
          </td>
          <td class="py-1 text-(--ui-text-muted)">
            {{ c.doc }}
          </td>
        </tr>
      </tbody>
    </table>

    <p class="mb-1 font-medium">
      {{ t('langDocs.colors') }}
    </p>
    <p class="mb-4 font-mono text-xs">
      {{ colors.join(', ') }}
    </p>

    <template v-if="style">
      <p class="mb-1 font-medium">
        {{ t('langDocs.more') }}
      </p>
      <ul class="space-y-1">
        <li><code>{{ style.wait }}</code> – {{ t('langDocs.wait') }}</li>
        <li><code>{{ style.output }}</code> – {{ t('langDocs.output') }}</li>
      </ul>
    </template>

    <template v-if="databaseExample">
      <p class="mb-1 mt-4 font-medium">
        {{ t('langDocs.databases') }}
      </p>
      <p class="mb-1 text-(--ui-text-muted)">
        {{ t('langDocs.databasesHelp') }}
      </p>
      <pre
        class="overflow-x-auto rounded-md bg-(--ui-bg-muted) p-2 font-mono text-xs"
        data-testid="docs-database"
      >{{ databaseExample }}</pre>
    </template>
  </div>
</template>
