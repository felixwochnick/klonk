import type { FetchError } from 'ofetch'

/** Übersetzt Fehlercodes der API (`createError({ message: 'code' })`) über `errors.<code>` */
export function useApiError() {
  const { t, te } = useI18n()

  return (error: unknown) => {
    const code = (error as FetchError)?.data?.message as string | undefined
    if (code && te(`errors.${code}`)) return t(`errors.${code}`)
    return t('errors.unknown')
  }
}
