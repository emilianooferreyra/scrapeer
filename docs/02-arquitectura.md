# 02 — Arquitectura

> **v1.0 (ADR-021):** transport `http`, providers por API oficial (MusicBrainz, YouTube; ADR-024), UI local, CLI y MCP local. REST pública, HTML y navegador son v2; aparecen acá porque el diseño los admite.

## La decisión central

**Dos ejes ortogonales.** No hay herencia por sitio.

- **`Provider`** = _qué_ plataforma (MusicBrainz, YouTube, SoundCloud…)
- **`Transport`** = _cómo_ se obtienen los bytes (HTTP, JSON API, browser)

Un provider **compone** transports. Así MusicBrainz = `provider` + `HttpTransport` + schema de su API. En v2, una fuente HTML agregaría un parser y otra podría sumar un fallback, sin tocar el core.

Agregar un sitio no toca el core. Agregar un transport beneficia a todos los providers.

---

## Flujo de una request

```
        ┌──────────── adaptadores (finos) ────────────┐
        │   CLI        MCP        (v2: REST · UI)     │
        └───────────────────┬────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Service layer │   resolve · search · export · report
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │    Registry    │   URL → Provider (match)
                    └───────┬────────┘
                            │
        ┌───────────────────▼────────────────────┐
        │              Provider                  │
        │  capabilities · resolve · search       │
        └───────────────────┬────────────────────┘
                            │  (v1.0: solo escalón API)
        ┌───────────────────▼────────────────────┐
        │      Transport: api → oembed → html    │
        │                 → browser              │
        └───────────────────┬────────────────────┘
                            │
        ┌───────────────────▼────────────────────┐
        │  Rate limiter · Retry · Circuit breaker│
        └───────────────────┬────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Red / disco   │
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ zod validate   │──► Result<Track> | ScrapeError
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │ Ledger (SQLite)│  idempotencia / resumibilidad
                    └────────────────┘
```

**Regla de acoplamiento:** el core no importa nada de `providers/`. Los providers no importan nada de `cli/`, `api/` ni `mcp/`. Si aparece un import que cruza, la abstracción está mal.

---

## Interfaces

```ts
// ---------- capacidades ----------
type Capability = "track" | "collection" | "search";

// ---------- provider ----------
interface Provider {
  readonly id: ProviderId;
  /** Hosts exactos que el transport puede contactar (ADR-018). */
  readonly hosts: readonly string[];
  /** Resultado de la puerta de términos (ADR-020). */
  readonly policy: ProviderPolicy;
  readonly capabilities: ReadonlySet<Capability>;

  /** ¿Esta URL me corresponde? Puro, sin red. */
  match(url: URL): boolean;

  /** URL → track o colección. Obligatorio. */
  resolve(url: URL, ctx: Ctx): Promise<Result<Resource, ScrapeError>>;

  /** Búsqueda. Solo si capabilities tiene 'search'. */
  search?(q: Query, ctx: Ctx): Promise<Result<Page<Track>, ScrapeError>>;
}

// ---------- transport ----------
interface Transport {
  readonly id: "http"; // v2: 'browser'
  get(req: TransportRequest, ctx: Ctx): Promise<Result<TransportResponse, ScrapeError>>;
}

// ---------- página (paginación uniforme) ----------
interface Page<T> {
  items: T[];
  nextCursor: string | null;
  totalEstimate?: number;
}

// ---------- capa de servicio (lo único que ven los adaptadores) ----------
interface MediaService {
  resolve(url: string, opts?: ResolveOptions): Promise<Result<Resource, ScrapeError>>;
  search(q: Query, opts?: SearchOptions): Promise<Result<Page<Track>, ScrapeError>>;
  export(spec: ExportSpec): Promise<Result<DatasetRef, ScrapeError>>;
  report(runId: RunId): Promise<Result<RunReport, ScrapeError>>;
  providers(): readonly ProviderInfo[]; // puro, sin red
}
```

`Ctx` transporta lo transversal: `signal` (cancelación), `logger`, `rateLimiter`, `cache`, `budget`, `runId`.

---

## Frontera de red (ADR-018)

El transport valida **antes de cada request y en cada redirect**:

1. Esquema `https` y host exacto dentro de `provider.hosts`.
2. La IP resuelta no es privada, loopback ni link-local.
3. Timeout, tamaño máximo de respuesta y máximo de redirects.

Los redirects se siguen a mano. Ninguna superficie puede saltarse esta validación.

---

## La escalera de degradación

> v1.0 usa solo el escalón 1. El resto se construye cuando un provider aprobado lo necesite.

Orden **fijo**. Solo se baja un escalón si el anterior falla, y cada caída se **instrumenta**.

| #   | Escalón                           | Costo | Fragilidad | Cuándo                          |
| --- | --------------------------------- | ----- | ---------- | ------------------------------- |
| 1   | API oficial                       | bajo  | baja       | si existe y cubre el dato       |
| 2   | API no documentada (JSON interno) | bajo  | media      | si el sitio la usa internamente |
| 3   | `oEmbed` / metadatos embebidos    | bajo  | baja       | si expone lo mínimo             |
| 4   | HTML estático (`cheerio`)         | medio | media      | si el dato está en el markup    |
| 5   | Navegador (`playwright`)          | alto  | alta       | último recurso                  |

**Métrica de salud (v2):** `% de requests resueltos sin navegador`. En v1.0 es siempre 100 % y no se publica. Si baja, algo se rompió arriba en la escalera.

**Anti-patrón explícito:** `await delay(3000)` como estrategia de espera. Con Playwright se usan `locator` con auto-waiting; con HTTP se espera por condición, no por reloj.

---

## Layout del repo

```
scrapeer/
├─ src/
│  ├─ core/        # schema, Result, errores, rate limit, ledger, transport, servicio
│  ├─ providers/   # musicbrainz · youtube
│  └─ adapters/
│     ├─ cli/      # commander
│     ├─ ui/       # Hono local + estáticos (Fase 2)
│     └─ mcp/      # stdio (Fase 5)
├─ fixtures/       # respuestas grabadas, por provider
├─ docs/
└─ package.json    # un solo paquete, binario `scrapeer`
```

**Reglas de importación:** `core` no importa de `providers` ni de `adapters`; `providers` solo importa de `core`; los adaptadores solo usan la capa de servicio. Oxlint lo verifica.

---

## Dependencias (y por qué)

El stack completo, con motivos y descartes, está en [ADR-023](00-decisiones.md#adr-023--stack-técnico-de-v10). Resumen:

| Necesidad       | Elección                                           |
| --------------- | -------------------------------------------------- |
| Runtime         | Node 26 LTS (mínimo 24.15)                         |
| HTTP saliente   | `fetch` nativo / undici                            |
| HTTP local (UI) | Hono                                               |
| Validación      | `zod`                                              |
| Persistencia    | `node:sqlite`                                      |
| Logs            | `pino`                                             |
| CLI             | `commander`                                        |
| Build           | `tsdown`                                           |
| Tests           | `vitest`                                           |
| Lint y formato  | Oxlint + Oxfmt                                     |
| UI (Fase 2)     | React + TanStack Table + Tailwind, o Vercel UI SDK |
| MCP (Fase 5)    | `@modelcontextprotocol/sdk`                        |
| HTML (v2)       | `cheerio`                                          |
| Navegador (v2)  | `playwright`                                       |
| Audio (v2)      | `ffmpeg` + `fpcalc` (binarios del sistema)         |

---

## Reglas que sostienen la arquitectura

1. **Sin herencia entre providers.** Composición + registro.
2. **Nada específico de un sitio en el core.** Si aparece un `if (provider === ...)`, es un bug de diseño.
3. **Los adaptadores no tienen lógica.** Traducen entrada/salida. Si un adaptador crece, la lógica va al service.
4. **Toda frontera valida.** Input de usuario, respuesta de red, config, args de CLI.
5. **Todo error esperado es un `Result`.** Las excepciones son bugs.
6. **El navegador es el último recurso, y se mide.**
