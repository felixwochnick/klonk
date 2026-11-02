# Zusätzliche Proxy-Seiten

Alle `*.caddy`-Dateien in diesem Ordner bindet der Klonk-Proxy ein (`/etc/caddy/sites.d`). Sie werden nicht eingecheckt.
Verfügbar sind die Snippets `common` (TLS nach `KLONK_TLS`, Kompression, Sicherheits-Header) und die Variablen
`{$KLONK_SCHEME}` / `{$KLONK_DOMAIN}`, z. B.:

```caddy
{$KLONK_SCHEME}://status.{$KLONK_DOMAIN} {
	import common
	reverse_proxy status:3001
}
```

Die Website auf der Hauptdomain wird nicht hier, sondern über `KLONK_WEBSITE_UPSTREAM` (z. B. `web:3000`) eingebunden.
