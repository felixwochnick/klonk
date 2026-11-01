/** Wirksame Lizenz des angemeldeten Kontos (Funktionen, Grenzen) */
export function useLicense() {
  const { data, refresh } = useFetch<LicenseInfo>('/api/license', {
    key: 'license',
    default: () => FREE_LICENSE,
  })

  const can = (feature: LicenseFeature) => hasFeature(data.value, feature)
  const maxCharacters = computed(() => (can('characters') ? Infinity : FREE_MAX_CHARACTERS))

  return { license: data, refresh, can, maxCharacters }
}
