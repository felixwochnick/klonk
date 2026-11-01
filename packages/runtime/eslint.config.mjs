import { createConfigForNuxt } from '@nuxt/eslint-config/flat'

export default createConfigForNuxt({
  features: {
    stylistic: true,
  },
}).prepend({
  // Mitgelieferter Java-Compiler (teavm-javac, nicht selbst geschrieben)
  ignores: ['teavm/**'],
})
