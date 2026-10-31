export default defineAppConfig({
  ui: {
    colors: {
      primary: 'amber',
      neutral: 'zinc',
    },
  },
  header: {
    title: 'Klonk Docs',
  },
  seo: {
    title: 'Klonk Docs',
    description: 'Dokumentation zu Klonk – Programmieren lernen mit Klemmbaustein-Figuren.',
  },
  github: {
    url: 'https://github.com/felixwochnick/klonk',
    branch: 'main',
    rootDir: 'apps/docs',
  },
})
