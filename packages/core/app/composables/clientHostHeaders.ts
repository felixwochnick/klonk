/** Header mit dem Hostnamen des Browsers (lokaler Testmodus) – für useFetch, das das $fetch-Plugin nicht nutzt */
export function clientHostHeaders(): Record<string, string> {
  return import.meta.client ? { 'x-klonk-host': location.hostname } : {}
}
