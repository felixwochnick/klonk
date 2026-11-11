import { detectColumns, looksLikeHeader, type ColumnRole } from '~/utils/import-columns'
import type { Table } from '~/utils/spreadsheet'

/** Keine Spalte gewählt (Reka-Select erlaubt keinen leeren Wert) */
export const NO_COLUMN = -1

/**
 * Gemeinsamer Zustand der Listen-Importe: geladene Tabelle, Überschriftenzeile und Zuordnung Spalte ⇒ Bedeutung
 * (beim Laden aus den Überschriften geraten, danach frei änderbar).
 */
export function useImportTable(roles: ColumnRole[]) {
  const { t } = useI18n()
  const table = ref<Table | null>(null)
  const hasHeader = ref(true)
  const columns = reactive(Object.fromEntries(roles.map(r => [r, NO_COLUMN])) as Record<ColumnRole, number>)

  function load(data: Table) {
    table.value = data
    hasHeader.value = looksLikeHeader(data[0])
    const found = hasHeader.value ? detectColumns(data[0]!) : {}
    for (const role of roles) columns[role] = found[role] ?? NO_COLUMN
  }

  const width = computed(() => Math.max(0, ...(table.value ?? []).map(r => r.length)))
  const rows = computed(() => (table.value ?? []).slice(hasHeader.value ? 1 : 0))
  const columnItems = computed(() => [
    { value: NO_COLUMN, label: t('admin.import.noColumn') },
    ...Array.from({ length: width.value }, (_, i) => {
      const title = hasHeader.value ? table.value?.[0]?.[i] : ''
      const sample = rows.value.find(r => r[i])?.[i] ?? ''
      return { value: i, label: title || t('admin.import.column', { n: i + 1 }), description: sample }
    }),
  ])
  /** Zelle einer Zeile für eine Bedeutung ('' ohne Zuordnung) */
  const cell = (row: string[], role: ColumnRole) => (columns[role] === NO_COLUMN ? '' : row[columns[role]] ?? '')
  const has = (role: ColumnRole) => columns[role] !== NO_COLUMN

  return { table, hasHeader, columns, rows, columnItems, load, cell, has }
}
