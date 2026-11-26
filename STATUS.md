# STATUS

**Última actualización:** 2026-11-26
**Fase actual:** 1 — rebanada vertical con Deezer (paso 0 hecho)
**Nombre:** provisional; los docs usan `sonda`

---

## v1.0 en una línea

Link de playlist, álbum o track de **Deezer** o **YouTube** → tabla con las mismas columnas → CSV + JSONL, desde **UI local**, **CLI** y **MCP** (ADR-021). Open source, MIT.

## Hecho

- [x] Análisis del repo, la descripción y la transcripción del tutorial de Decodo
- [x] Diseño: ADR-001 a ADR-020
- [x] Producto redefinido: ADR-021 (link → tabla, Deezer + YouTube, UI local) y ADR-022 (solo vías oficiales, claves del usuario, sin TikTok ni Instagram)
- [x] Stack técnico: ADR-023
- [x] Acceso de cada plataforma verificado el 2026-11-26 ([`docs/05-providers.md`](docs/05-providers.md#mapa-de-plataformas))
- [x] `git init -b main`
- [x] Esqueleto: Node 26, TypeScript 7.0.2, Oxlint 1.95 con reglas de tipos, Oxfmt, Vitest 5, tsdown; reglas de capas verificadas con archivos de prueba

## Próximo

**Fase 1 — rebanada vertical con Deezer** ([`docs/10-roadmap.md`](docs/10-roadmap.md)):

0. ~~Esqueleto: `package.json`, `tsconfig` estricto, Oxlint, Oxfmt, Vitest, tsdown, `.gitignore`~~ ✅
1. `Track`, `Collection`, `License`, `Result` y `ScrapeError` con zod
2. Transport HTTP mínimo: allowlist por salto, timeout, rate limit y jitter
3. Deezer `resolve` de track y playlist, con fixtures
4. CLI `resolve <url>` → JSON y CSV ordenado
5. `pnpm check` en verde

**Criterio de éxito:** un CSV ordenado generado desde el link real de una playlist de Deezer.

## Pendientes que no son código

| Pendiente                                                | Necesario para           |
| -------------------------------------------------------- | ------------------------ |
| Leer términos de la API de Deezer                        | Cerrar Fase 3            |
| Leer términos de los servicios de API de YouTube         | Cerrar Fase 3            |
| Crear una API key de YouTube para probar                 | Fase 3                   |
| **Nombre definitivo** (reemplaza el placeholder `sonda`) | Antes de publicar en npm |

## Bloqueos

Ninguno para la Fase 1.

## Notas para la próxima sesión

- El schema **no** está congelado: se congela al cerrar la Fase 3, con YouTube.
- Cambiar arquitectura exige un ADR nuevo.
- No construir nada marcado v2.
