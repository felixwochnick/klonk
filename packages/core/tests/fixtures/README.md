`dev-license-key.pem` ist der **Testschlüssel** (`kid: klonk-dev`). Die App akzeptiert damit signierte Tokens nur in der
Entwicklung (`import.meta.dev`), nie in Produktions-Builds. Er darf deshalb im Repo liegen.
