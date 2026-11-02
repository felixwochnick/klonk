<script setup lang="ts">
import { BUILTINS, KEYWORDS, spell, type Builtin, type BuiltinName, type Keyword } from '@klonk/klonk-script'

// Kurzreferenz der aktuellen Sprache (Tab neben der 3D-Ansicht): Import, Figuren, Befehle, Farben, Ausgabe.
// Erzeugt aus denselben Tabellen wie Klonk-Script und die Vorschläge im Editor.
const props = defineProps<{ language: ProgramLanguage }>()

const { t, locale } = useI18n()
const lang = computed(() => (locale.value === 'en' ? 'en' : 'de'))
const { public: { docsUrl } } = useRuntimeConfig()

type Style = { method: (name: string) => string, color: (name: string) => string, wait: string, create: string, all: string, newKlonk: string, imports: string, output: string, name: string }
const camel = (name: string) => name
const STYLES: Partial<Record<ProgramLanguage, Style>> = {
  javascript: { method: camel, color: camel, wait: 'wait(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'new Klonk("Klara")', imports: 'import { Klonk, red, wait } from \'klonk\'', output: 'console.log(…)', name: 'klonk.name' },
  typescript: { method: camel, color: camel, wait: 'wait(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'new Klonk("Klara")', imports: 'import { Klonk, red, type KlonkColor } from \'klonk\'', output: 'console.log(…)', name: 'klonk.name' },
  python: { method: pythonName, color: camel, wait: 'wait(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'Klonk("Klara")', imports: 'from klonk import Klonk, red, wait', output: 'print(…)', name: 'klonk.name' },
  java: { method: camel, color: n => n.toUpperCase(), wait: 'sleep(seconds)', create: 'Klonk.create("Kim", "female", x, y)', all: 'Klonk.all()', newKlonk: 'new Klonk("Klara")', imports: 'import klonk.Klonk;\nimport static klonk.Klonk.*;', output: 'System.out.println(…)', name: 'klonk.name' },
  csharp: { method: csharpName, color: csharpName, wait: 'Wait(seconds)', create: 'Klonk.Create("Kim", "female", x, y)', all: 'Klonk.All()', newKlonk: 'new Klonk("Klara")', imports: 'using klonk;\nusing static klonk.Klonk;', output: 'Console.WriteLine(…)', name: 'klonk.Name' },
}
const style = computed(() => STYLES[props.language])
const isScript = computed(() => props.language === 'klonk' || props.language === 'blocks')

/** Befehle und Sensoren mit Parametern in der Schreibweise der Sprache */
const commands = computed(() => (Object.entries(BUILTINS) as [BuiltinName, Builtin][])
  .filter(([, b]) => b.kind === 'command' || b.kind === 'sensor' || (isScript.value && b.kind === 'function'))
  .filter(([name]) => isScript.value || (name !== 'selectCharacter' && name !== 'createCharacter'))
  .map(([name, b]) => {
    const params = (b.params ?? []).map(p => `${isScript.value ? p.name[lang.value][0] : style.value!.method(p.name.en[0]!)}${p.optional ? '?' : ''}`)
    const label = isScript.value ? spell(name, lang.value) : style.value!.method(spell(name, 'en'))
    const call = isScript.value && !params.length ? label : `${label}(${params.join(', ')})`
    return { name, call: isScript.value ? call : `klonk.${call}`, doc: b.doc[lang.value], kind: b.kind }
  }))
const colors = computed(() => (Object.entries(BUILTINS) as [BuiltinName, Builtin][])
  .filter(([, b]) => b.kind === 'constant')
  .map(([name]) => (isScript.value ? spell(name, lang.value) : style.value!.color(spell(name, 'en')))))
const keywords = computed(() => (['repeat', 'times', 'while', 'until', 'if', 'then', 'else', 'end', 'procedure', 'function', 'return', 'var', 'import'] as Keyword[])
  .map(k => KEYWORDS[k][lang.value][0]))

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
  </div>
</template>
