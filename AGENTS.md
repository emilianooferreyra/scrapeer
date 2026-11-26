# AGENTS.md — Sonda

> `sonda` es un nombre provisional. El nombre definitivo está pendiente (ver `STATUS.md`).

## Qué es esto

Una herramienta open source (MIT): pegás un link de **cualquier plataforma musical** y obtenés una tabla limpia, con **las mismas columnas siempre** y la **procedencia** de cada dato, exportable a CSV. Corre en la máquina del usuario, con sus claves, solo por APIs oficiales.

**v1.0 (ADR-021):** Deezer + YouTube · UI web local + CLI + MCP local · CSV + JSONL. REST pública, UI hosteada, HTML, navegador, audio y LLM son **v2**: no construirlos. TikTok e Instagram están fuera de alcance (ADR-022).

> No es un producto de AI. Es un producto **que la AI puede usar**.

## Estado

**Leé `STATUS.md` antes de empezar cualquier tarea.** Ahí están la fase actual, lo hecho y lo próximo.

## Documentación de diseño (fuente de verdad)

Todo está en `docs/`. **Leé solo lo que la tarea necesita**, no todos los archivos por defecto.

| Tarea                   | Leer                                             |
| ----------------------- | ------------------------------------------------ |
| Orientarse              | `docs/01-alcance.md` → `docs/02-arquitectura.md` |
| Tipos / schema          | `docs/03-schema.md`                              |
| Red, rate limit, ledger | `docs/04-pipeline.md`                            |
| Provider nuevo          | `docs/05-providers.md`                           |
| Export / filtros        | `docs/06-dataset.md`                             |
| UI / CLI / MCP          | `docs/07-superficies.md`                         |
| Tests                   | `docs/09-testing.md`                             |
| Qué construir ahora     | `docs/10-roadmap.md`                             |

`docs/00-decisiones.md` es el registro de ADRs. Si una decisión no está ahí, consultá antes de inventarla.

## Stack (ADR-023)

Node 26 LTS (mínimo 24.15) · TypeScript estricto, ESM · zod · `fetch` nativo · Hono (UI local) · `node:sqlite` · pino · commander · tsdown · Vitest · Oxlint + Oxfmt · pnpm, **un solo paquete**.

- Sin dependencias nativas: `npx sonda` no puede compilar nada.
- La UI (Fase 2) y el SDK de MCP (Fase 5) se deciden en su fase.

## Reglas innegociables

- TypeScript `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- **Sin `any`.** Sin `as` sobre datos externos: se valida con **zod**.
- Los tipos se **derivan** del schema (`z.infer`), nunca se declaran en paralelo.
- **Sin herencia entre providers.** Composición + registro.
- Nada específico de un sitio en `src/core/`. Si aparece un `if (provider === ...)`, es un bug de diseño.
- Capas: `core` no importa de `providers` ni de `adapters`; `providers` solo importa de `core`; los adaptadores solo usan la capa de servicio.
- Errores esperados → `Result<T, ScrapeError>`. Excepciones solo para bugs.
- Toda frontera valida: input de usuario, respuesta de red, config, argv.
- **API oficial primero; navegador = último recurso.** API → API interna → oEmbed → HTML → Playwright. Nunca evasión (ADR-017, ADR-022).
- **Nunca `delay()` fijo** para esperar. Esperas por condición.
- Rate limit por host + jitter **antes** de cualquier request.
- **Dato ausente = `null`**, nunca un default. Licencia ausente = sin permiso.
- Métricas sin mezclar: `plays` es un conteo; `popularity` es un índice propio de cada plataforma.
- Allowlist de hosts e IP en el transport, **en cada redirect** (ADR-018).
- User-Agent identificable; nada de evasión (ADR-017).
- La UI escucha solo en `127.0.0.1`; las claves nunca llegan al navegador.
- Ningún provider se publica sin la puerta de términos; `export: false` por defecto (ADR-020).
- Claves del usuario solo por env. Fixtures sin credenciales ni datos personales.
- Sin `console.log` como salida: `pino` + JSONL/CSV.

## Antipatrones prohibidos

Vienen del tutorial original que este proyecto reemplaza:

- `document.querySelector('ul')` como fallback de contenedor.
- `"Unknown Artist"` / `0` como default silencioso → usar `null` y `parse_failed`.
- Silenciar `page.on('console')` o `pageerror`.
- Un script copiado por provider.
- `delay(3000)` como estrategia de espera.
- Credenciales hardcodeadas.
- Proxies residenciales o User-Agent falso para "camuflarse".

## Definition of done

Un ítem está terminado cuando cumple los cuatro:

1. Test con **fixture** (no toca la red).
2. Error tipado + mensaje accionable.
3. Documentado (una sección, no un párrafo).
4. Demostrable en 60 s por alguien que no escribió el código.

Un provider, además, cumple el checklist de `docs/05-providers.md`.

## Cómo trabajar

- **Una fase del roadmap a la vez.** No adelantar fases.
- Antes de escribir código: leer la sección de `docs/` que corresponde.
- Después de cambiar código: `pnpm typecheck && pnpm lint && pnpm test`.
- Commits con Conventional Commits.
- Al cerrar un bloque de trabajo: **actualizar `STATUS.md`**.
