# 10 — Roadmap

> **Seis fases hasta v1.0. En serie, una por vez.** Cada fase termina en algo que se puede mostrar. El demo con UI existe desde la Fase 2.

Una sesión ≈ 3–5 h. Los rangos son estimaciones, no compromisos.

| Fase      | Resultado visible                                      | Sesiones  |
| --------- | ------------------------------------------------------ | --------- |
| 1         | Link de álbum de MusicBrainz → CSV, por CLI            | 2–3       |
| 2         | La UI local: pegás el link, ves la tabla, exportás     | 2–3       |
| 3         | YouTube con la clave del usuario; el schema se congela | 3–4       |
| 4         | Runs que se cortan y se retoman; export con filtros    | 3–5       |
| 5         | Un agente resuelve y exporta por MCP                   | 2–3       |
| 6         | Release v1.0                                           | 2–3       |
| **Total** |                                                        | **14–21** |

---

## Fase 1 — Rebanada vertical con MusicBrainz

**Objetivo:** atravesar todas las capas con lo mínimo y sin credenciales.

- [x] `Track`, `Collection`, `License`, `Result` y `ScrapeError`
- [x] Transport HTTP: allowlist por salto, timeout, rate limit y jitter, `robots.txt` antes del primer request según el tipo de acceso (ADR-024)
- [x] MusicBrainz `resolve` de recording y release, con fixtures
- [x] CLI `resolve <url>` → JSON (`pnpm scrapeer resolve <url>`)
- [ ] `resolve --format csv` con el orden del álbum (el `export` con filtros llega en Fase 4)

**Done:** el link real de un álbum de MusicBrainz produce un CSV ordenado; `pnpm typecheck && pnpm test` en verde.
**No incluye:** UI, ledger, búsqueda ni otro provider.

## Fase 2 — UI local

- [ ] Capa de servicio extraída (segundo adaptador, ADR-007)
- [ ] Adaptador HTTP local, solo `127.0.0.1`
- [ ] `scrapeer ui`: input, tabla, export CSV y JSON ([`07-superficies.md`](07-superficies.md#ui))
- [ ] Errores visibles en la UI con el mismo texto que la CLI

**Done:** alguien ajeno pega un link de MusicBrainz y descarga el CSV en menos de 60 s. Se graba el GIF.

## Fase 3 — YouTube, ListenBrainz y congelamiento

- [ ] Clave del usuario por env (`SCRAPEER_YOUTUBE_API_KEY`), redactada en logs, provenance y fixtures
- [ ] `resolve` de video y playlist, con paginación por cursor
- [ ] ListenBrainz: `resolve` de playlist con `plays` de escuchas (ADR-025)
- [ ] Decidir si las filas de MusicBrainz suman escuchas de ListenBrainz y cómo queda su procedencia
- [ ] Budget de cuota diaria: el run se corta limpio con `budget_exceeded`
- [ ] Métricas separadas: vistas en `plays`, nunca en `popularity`
- [ ] Vencimiento a 30 días de los datos de YouTube en el manifest ([`05-providers.md`](05-providers.md))
- [ ] `schemaVersion: 1` congelado

**Done:** agregar YouTube no requirió ningún caso especial en `core/` ni en la UI.

## Fase 4 — Runs reanudables y export

- [ ] Backoff, `Retry-After` y circuit breaker
- [ ] Ledger, cursores y budget
- [ ] `search` en los providers que lo soporten
- [ ] `export` desde un run, con filtros; `manifest.json` y `rejected.jsonl`
- [ ] Paridad JSONL ↔ CSV verificada por test
- [ ] `doctor` y `providers`

**Done:** matar un run de una playlist larga y retomarlo no duplica ni pierde tracks.

## Fase 5 — MCP local

- [ ] 5 tools por stdio, con budget
- [ ] Snippet de configuración

**Done:** un cliente MCP resuelve una playlist, la exporta y explica qué quedó afuera.

## Fase 6 — Release v1.0

- [ ] README en inglés con GIF, quick start y sección de ética
- [ ] CI, canary semanal y release en npm
- [ ] Licencia MIT

**Done:** se cumple "v1.0 está lista cuando" de [`01-alcance.md`](01-alcance.md).

---

## Después de v1.0

Un provider por versión menor, en el orden de [`01-alcance.md`](01-alcance.md#después-de-v10): SoundCloud, Tidal, Spotify y luego el resto. Cada uno cumple el checklist de [`05-providers.md`](05-providers.md) antes de publicarse.

---

## Reglas

1. Nada de la fase N+1 sin cerrar la N.
2. Si una fase crece, se corta.
3. Las ideas nuevas van a `ideas.md`.
4. v2 se planifica después de publicar v1.0.
