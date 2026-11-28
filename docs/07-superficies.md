# 07 — Superficies: UI, CLI, MCP y REST

> **v1.0: UI web local, CLI y MCP local**, adaptadores finos sobre la misma capa de servicio (ADR-021). La API REST pública y la UI hosteada son v2 y se conservan como diseño.

---

## Capa de servicio (la única fuente de verdad)

```ts
interface MediaService {
  resolve(url: string, opts?): Promise<Result<Resource>>;
  search(q: Query, opts?): Promise<Result<Page<Track>>>;
  export(spec: ExportSpec): Promise<Result<DatasetRef>>;
  report(runId: RunId): Promise<Result<RunReport>>;
  providers(): ProviderInfo[]; // puro, sin red
}
```

Si un adaptador tiene lógica de negocio, está mal ubicado.

---

## CLI

```
scrapeer resolve <url>              # URL → track o colección; guarda en exports/ (--format json|csv, --out <dir>, --stdout)
scrapeer search <query> --provider  # búsqueda normalizada
scrapeer export --run <runId>       # dataset (jsonl + csv), ver 06-dataset.md
scrapeer providers                  # lista + capabilities
scrapeer report <runId>             # reporte del run
scrapeer doctor                     # diagnóstico: config, claves, red, ledger
scrapeer ui                         # UI web local en 127.0.0.1
```

Flags transversales: `--json`, `--dry-run`, `--verbose`, `--max-requests`, `--max-bytes`.

**`--dry-run`** valida la entrada y muestra el plan **sin tocar la red**. El quick start sin credenciales usa MusicBrainz.

`resolve` también registra un run, para poder exportarlo.

---

## API REST pública (v2)

> En v1.0 solo existe el adaptador HTTP **local** que usa la UI (ver [UI](#ui)).
> Requiere un ADR de hosting, estado compartido y auth. Debe correr en un proceso persistente: SQLite y el rate limiter en memoria no sirven en serverless. Un endpoint público sin auth no es aceptable como default.

| Método | Ruta              | Nota                                             |
| ------ | ----------------- | ------------------------------------------------ |
| `GET`  | `/providers`      | Lista + capabilities                             |
| `POST` | `/resolve`        | `{ url }` → `Resource`                           |
| `POST` | `/search`         | `{ query, provider?, filters? }` → `Page<Track>` |
| `POST` | `/export`         | Crea dataset; devuelve `datasetId` + estado      |
| `GET`  | `/datasets/:id`   | Manifest + links de descarga                     |
| `GET`  | `/reports/:runId` | Run report                                       |

- **OpenAPI generado desde zod** (`zod-to-openapi` o similar): el spec no puede desincronizarse del código.
- Paginación por cursor, nunca por offset.
- Rate limit propio por IP/clave, además del de salida.
- Auth desde el primer deploy.

---

## MCP

**No es un feature: es un adaptador.** Corre **local por stdio**. Llega en la Fase 5, cuando la capa de servicio ya existe porque la extrajo la UI.

### Superficie: 5 tools, no 30

| Tool             | Entrada                          | Salida                                         |
| ---------------- | -------------------------------- | ---------------------------------------------- |
| `list_providers` | —                                | providers + capabilities                       |
| `search_tracks`  | `query`, `provider?`, `filters?` | **20 items** + `nextCursor` + `runId`          |
| `resolve_url`    | `url`                            | `Resource`                                     |
| `export_dataset` | `runId`, `filters`               | `datasetId`, conteos, descartes, rutas locales |
| `get_run_report` | `runId`                          | métricas + errores agrupados                   |

### Reglas de diseño

1. **Pocos tools, componibles.** 30 tools solapados es el error #1.
2. **Resúmenes + cursor, nunca el dump.** Devolver 500 tracks a un modelo es tirar tokens. Devolvés 20 + `nextCursor` + un handle para pedir el resto.
3. **Los errores son la UI.** El cliente es un LLM: `"rate_limited: provider=soundcloud retryAfter=12s"` es mejor que un stack trace.
4. **Descripciones de tool de calidad.** Son lo que el modelo lee para decidir. Se escriben para un lector que no vio el código.
5. **Capabilities declaradas.** Si un provider no soporta `search`, el tool lo dice en vez de fallar raro.

### Seguridad

| Riesgo                                     | Mitigación                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SSRF** (el modelo pasa URLs arbitrarias) | Validación en el transport, en cada salto (ADR-018); `match()` solo enruta                                                                                      |
| **Abuso de recursos**                      | Budget por sesión (`--max-requests`, `--max-bytes`)                                                                                                             |
| **Prompt injection**                       | El contenido scrapeado es **dato**, nunca instrucción. No se re-emite texto de la página como instrucción. Acciones destructivas requieren confirmación humana. |
| **Escritura en disco**                     | Solo dentro del directorio de salida configurado; el modelo no elige rutas                                                                                      |

### El demo (esto es lo que se comparte)

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "scrapeer": {
      "command": "npx",
      "args": ["-y", "@scrapeer/mcp"],
    },
  },
}
```

> _"Pasá esta playlist de YouTube a CSV, ordenada, y decime qué tracks no estaban disponibles."_

Ese es el post. No "mirá mi scraper": **"tu agente lee cualquier playlist y te dice de dónde salió cada dato"**.

---

## UI

> **v1.0, local.** `scrapeer ui` levanta un servidor en `127.0.0.1` y abre el navegador. Es el demo principal del proyecto (ADR-021).

### Decisión: _form-first_, no chat

Un chat para un scraper demuestra el modelo, no el producto, y esconde la estructura de los datos.

**La UI es:**

```
┌──────────────────────────────────────────────────┐
│  [ pegá un link de playlist, álbum o track ]     │
│  Filtros: duración · disponibilidad · orden ▾    │
├──────────────────────────────────────────────────┤
│  #   Artista      Título       Dur.  Plays  Fuente│
│  ─────────────────────────────────────────────    │
│  …                                                │
├──────────────────────────────────────────────────┤
│  50 tracks · 2 no disponibles   [ CSV ]  [ JSON ]│
└──────────────────────────────────────────────────┘
```

**Cuatro cosas y nada más.** Eso es el demo: se entiende en 10 segundos y se graba en 15.

### El chat, si se agrega, es azúcar

Un campo opcional _"describí lo que buscás"_ que traduce lenguaje natural a **los mismos parámetros del formulario**. El resultado **siempre es la tabla**, nunca una respuesta en prosa.

> Regla: el chat es un atajo de **entrada**, no una interfaz de salida.

### Stack

Vite + React compilado a estáticos y servido por la CLI. Consume el adaptador HTTP local. Sin estado propio más allá de la query.

| Regla                                          | Motivo                                              |
| ---------------------------------------------- | --------------------------------------------------- |
| Escucha solo en `127.0.0.1`                    | Sin auth porque no sale de la máquina (ADR-018)     |
| Las claves viven en env, nunca en el navegador | La UI no puede filtrarlas                           |
| La UI no conoce providers: solo el schema      | Un provider nuevo aparece sin tocar la UI           |
| Mismos errores que la CLI                      | Una sola taxonomía ([`03-schema.md`](03-schema.md)) |

Una UI hosteada (Vercel u otro) es v2: necesita el ADR de hosting y auth.

---

## Orden de construcción

| Orden | Superficie                 | Por qué ahí                                                          |
| ----- | -------------------------- | -------------------------------------------------------------------- |
| 1     | CLI                        | Es el core con una cáscara.                                          |
| 2     | UI local                   | Segundo adaptador; obliga a extraer la capa de servicio. Es el demo. |
| 3     | MCP                        | Tercer adaptador sobre una capa ya probada.                          |
| v2    | REST pública + UI hosteada | Necesitan decisiones de hosting y auth.                              |

---

## Checklist

- [ ] Capa de servicio sin dependencias de HTTP/argv/MCP
- [ ] CLI con `--dry-run` y `--json`
- [ ] UI local que escucha solo en `127.0.0.1`
- [ ] 5 tools MCP con descripciones de calidad
- [ ] MCP limitado a su directorio de salida
- [ ] Budget por sesión
