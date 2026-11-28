# 03 — Schema canónico y errores

> Este es el documento más importante del proyecto. Si el schema está mal, cada provider nuevo obliga a reescribir la UI, el CSV y la API. **Se congela al cerrar la Fase 3**, cuando YouTube ya lo puso a prueba (ADR-019, ADR-021).

---

## `Track` canónico

> Implementación: [`src/core/schema/`](../src/core/schema/). Los tipos se derivan con `z.infer`; los objetos son estrictos: un campo que no está en esta tabla se rechaza.

Todos los providers normalizan a esta forma. Nada específico de un sitio sobrevive a la frontera.

| Campo           | Tipo                                                    | Obligatorio | Notas                                                                                                                                                                      |
| --------------- | ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `number`                                                | ✅          | Empezar en `1`. Solo sube con cambios incompatibles.                                                                                                                       |
| `provider`      | `ProviderId`                                            | ✅          | `"musicbrainz"`, `"youtube"`                                                                                                                                               |
| `id`            | `string`                                                | ✅          | ID **en el provider**, estable.                                                                                                                                            |
| `url`           | `string` (URL canónica)                                 | ✅          | Sin parámetros de tracking. Normalizada.                                                                                                                                   |
| `artist`        | `string \| null`                                        | —           | Como lo publica la fuente. `null` si no existe. En YouTube es el canal.                                                                                                    |
| `title`         | `string`                                                | ✅          | Ídem.                                                                                                                                                                      |
| `durationSec`   | `number \| null`                                        | —           | Entero. `null` si se desconoce (nunca `0`).                                                                                                                                |
| `plays`         | `number \| null`                                        | —           | Reproducciones o vistas contadas por la fuente (YouTube: `viewCount`). `null` si no lo expone (MusicBrainz, Spotify). ListenBrainz: escuchas de sus usuarios, no globales. |
| `popularity`    | `{ value: number; scale: string } \| null`              | —           | Índice propio de la plataforma (`spotify-popularity`, por ejemplo). **No es comparable entre plataformas** ni se convierte en `plays` (ADR-022).                           |
| `isrcs`         | `string[]`                                              | ✅          | Todos los ISRC que informa la fuente, sin repetir; `[]` si no informa ninguno. Una grabación puede tener varios (ADR-024). Permite cruzar el mismo tema entre plataformas. |
| `availability`  | `'available' \| 'geo_blocked' \| 'unavailable' \| null` | —           | Estado del track **dentro de una colección**: un track bloqueado no corta la playlist, queda marcado.                                                                      |
| `publishedAt`   | `string \| null`                                        | —           | ISO 8601 UTC (`2026-03-14T00:00:00Z`).                                                                                                                                     |
| `license`       | `License \| null`                                       | —           | Ver abajo. `null` = la fuente no la declara.                                                                                                                               |
| `collection`    | `{ id, position } \| null`                              | —           | Colección de origen y **posición en ella**, empezando en 1. El CSV se ordena por este campo.                                                                               |
| `tags`          | `string[]`                                              | ✅          | `[]` si no hay. Normalizados a minúsculas.                                                                                                                                 |
| `artworkUrl`    | `string \| null`                                        | —           |                                                                                                                                                                            |
| `downloadable`  | `boolean`                                               | ✅          | Default `false`. **Detectado, no descargado.**                                                                                                                             |
| `description`   | `string \| null`                                        | —           | Truncado a 2000 caracteres.                                                                                                                                                |
| `provenance`    | `Provenance`                                            | ✅          | Ver abajo.                                                                                                                                                                 |

### `License` (ADR-014)

| Campo          | Tipo                                                          | Ejemplo                        |
| -------------- | ------------------------------------------------------------- | ------------------------------ |
| `family`       | `'cc' \| 'public-domain' \| 'all-rights-reserved' \| 'other'` | `'cc'`                         |
| `code`         | `string \| null`                                              | `'by-nc-nd'`, `'cc0'`, `'pdm'` |
| `version`      | `string \| null`                                              | `'3.0'`                        |
| `jurisdiction` | `string \| null`                                              | `'de'`                         |
| `url`          | `string \| null`                                              | URL de la licencia             |
| `raw`          | `string`                                                      | Valor exacto de la fuente      |

**Permisos derivados**, no persistidos en `Track`:

| Licencia                               | Uso comercial | Derivados | Atribución | Compartir igual |
| -------------------------------------- | ------------- | --------- | ---------- | --------------- |
| `cc0`, `pdm`                           | ✅            | ✅        | —          | —               |
| `by`                                   | ✅            | ✅        | ✅         | —               |
| `by-sa`                                | ✅            | ✅        | ✅         | ✅              |
| `by-nc`                                | ❌            | ✅        | ✅         | —               |
| `by-nc-sa`                             | ❌            | ✅        | ✅         | ✅              |
| `by-nd`                                | ✅            | ❌        | ✅         | —               |
| `by-nc-nd`                             | ❌            | ❌        | ✅         | —               |
| `null`, `all-rights-reserved`, `other` | ❌            | ❌        | —          | —               |

- El código se normaliza: `by-nd-nc` (CC 1.0) → `by-nc-nd`.
- Texto o URL sin reconocer → `family: 'other'`, con `raw` intacto.
- Es una lectura de lo declarado por la fuente, **no asesoramiento legal**.

### `Resource` y `Collection` (ADR-015)

```ts
type Resource =
  | { kind: "track"; track: Track }
  | { kind: "collection"; collection: Collection; page: Page<Track> };
```

| `Collection`                                      | Tipo                    | Notas                                                             |
| ------------------------------------------------- | ----------------------- | ----------------------------------------------------------------- |
| `schemaVersion`, `provider`, `id`, `url`, `title` | —                       | Igual que en `Track`                                              |
| `type`                                            | `'album' \| 'playlist'` | Internet Archive sumará `item` cuando entre (ADR-021)             |
| `artist`                                          | `string \| null`        |                                                                   |
| `license`                                         | `License \| null`       | Un track la hereda solo si la fuente la declara para todo el item |
| `trackCount`                                      | `number \| null`        |                                                                   |
| `provenance`                                      | `Provenance`            |                                                                   |

Una colección sin audio es válida: `page.items = []`.

### `Provenance` (obligatorio en track y colección)

| Campo             | Tipo                                                 | Notas                                                                                                                                           |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceUrl`       | `string`                                             | La URL que pidió el usuario.                                                                                                                    |
| `requestUrl`      | `string`                                             | La URL consultada, **sin credenciales** (YouTube lleva `key` en la query).                                                                      |
| `fetchedAt`       | `string`                                             | ISO 8601 UTC.                                                                                                                                   |
| `transport`       | `'api' \| 'json' \| 'oembed' \| 'html' \| 'browser'` | v1.0 solo emite `api`.                                                                                                                          |
| `rawHash`         | `string`                                             | `sha256` de los bytes recibidos. Evidencia; **no** detecta cambios.                                                                             |
| `contentHash`     | `string`                                             | `sha256` del objeto normalizado con claves ordenadas, sin `provenance`, `plays`, `popularity`, `availability` ni `artworkUrl`. Detecta cambios. |
| `providerVersion` | `string`                                             | Versión del adapter.                                                                                                                            |

La respuesta cruda se conserva solo con `--keep-raw` (ADR-016).

### Tipos branded

```ts
const ProviderId = z.string().min(1).brand<"ProviderId">();
type ProviderId = z.infer<typeof ProviderId>;
// idem TrackId y RunId
```

Se derivan de zod (ADR-006): no se declaran en paralelo ni se fuerzan con `as`.

Evitan pasar un `ProviderId` donde va un `TrackId`. Suena académico hasta el primer bug de join que te ahorra.

### Ejemplo

Un track de un álbum de MusicBrainz. Los valores son ilustrativos.

```json
{
  "schemaVersion": 1,
  "provider": "musicbrainz",
  "id": "b1e9a1c4-0000-4000-8000-000000000001",
  "url": "https://musicbrainz.org/recording/b1e9a1c4-0000-4000-8000-000000000001",
  "artist": "Artist Name",
  "title": "Track Title",
  "durationSec": 68,
  "plays": null,
  "popularity": null,
  "isrcs": ["GBN9Y1100088", "GBAYE0601690"],
  "availability": "available",
  "publishedAt": "1973-03-24T00:00:00Z",
  "license": null,
  "collection": { "id": "f5093c06-0000-4000-8000-000000000002", "position": 1 },
  "tags": [],
  "artworkUrl": null,
  "downloadable": false,
  "description": null,
  "provenance": {
    "sourceUrl": "https://musicbrainz.org/release/f5093c06-0000-4000-8000-000000000002",
    "requestUrl": "https://musicbrainz.org/ws/2/release/f5093c06-0000-4000-8000-000000000002?inc=recordings+isrcs+artist-credits&fmt=json",
    "fetchedAt": "2026-11-26T18:02:11Z",
    "transport": "api",
    "rawHash": "sha256:9f2c…",
    "contentHash": "sha256:41ab…",
    "providerVersion": "0.1.0"
  }
}
```

---

## Reglas de normalización

Aplican a **todos** los providers, sin excepción:

| Regla                                      | Ejemplo                           |
| ------------------------------------------ | --------------------------------- |
| Fechas siempre ISO 8601 UTC                | `2026-03-14T00:00:00Z`            |
| Duración en **segundos enteros**           | `214`, no `3:34`, no `214000`     |
| URLs sin tracking                          | quitar `utm_*`, `ref`, `si`       |
| Strings con `trim()` y espacios colapsados | `"  A   B "` → `"A B"`            |
| `null` para desconocido, nunca `""` ni `0` | `plays: null`                     |
| Tags en minúsculas, deduplicados           | `["House","house"]` → `["house"]` |
| Números como números                       | `plays: 12840`, no `"12.8K"`      |

**Si el dato no se puede normalizar, es `null`.** Nunca inventar un default silencioso (`"Unknown Artist"` es un bug, no un fallback).

---

## `Result` y taxonomía de errores

```ts
type Result<T, E = ScrapeError> = { ok: true; value: T } | { ok: false; error: E };
```

`switch` exhaustivo con `never` para que el compilador exija cubrir todos los casos.

### Taxonomía (`ScrapeError`)

| `kind`              | Significado                              | ¿Reintentar?        | Acción                         |
| ------------------- | ---------------------------------------- | ------------------- | ------------------------------ |
| `not_found`         | El recurso no existe                     | ❌                  | Devolver al usuario            |
| `geo_blocked`       | Bloqueado por región                     | ❌                  | Reportar como no disponible    |
| `auth_required`     | Requiere login                           | ❌                  | Reportar                       |
| `rate_limited`      | `429` / límite alcanzado                 | ✅ con `retryAfter` | Backoff + jitter               |
| `upstream_error`    | `5xx` del sitio                          | ✅                  | Backoff + jitter               |
| `timeout`           | Sin respuesta a tiempo                   | ✅ (1–2)            | Reintentar, luego escalar      |
| `parse_failed`      | El markup cambió                         | ❌                  | **Abrir issue + fixture**      |
| `validation_failed` | Pasó el parseo, falló zod                | ❌                  | Bug del adapter                |
| `unsupported`       | Provider no soporta la operación         | ❌                  | Fallar rápido y claro          |
| `budget_exceeded`   | Se agotó el presupuesto del run          | ❌                  | Cortar limpio                  |
| `invalid_input`     | URL o parámetros inválidos               | ❌                  | Explicar qué corregir          |
| `host_not_allowed`  | Host, esquema o IP fuera de la allowlist | ❌                  | Bloquear, también en redirects |
| `robots_disallowed` | `robots.txt` no permite la ruta          | ❌                  | Reportar, sin bypass           |
| `network_error`     | DNS, TLS o conexión                      | ✅ (1–2)            | Reintentar                     |
| `upstream_down`     | Circuito abierto                         | ❌                  | Esperar el cooldown            |

**Regla:** `parse_failed` y `validation_failed` **nunca** se silencian. Son la señal de que un sitio cambió, y serán el input del healing en v2 ([`08-llm.md`](08-llm.md)).

---

## Manifest del dataset

Un archivo por export, junto a los datos:

```json
{
  "schemaVersion": 1,
  "datasetId": "ds_20261124_a1b2",
  "createdAt": "2026-11-24T18:10:00Z",
  "runId": "run_7f3c",
  "filters": { "allowCommercial": true, "allowDerivatives": true, "minDurationSec": 60 },
  "count": 312,
  "rejected": { "too_short": 12, "duplicate": 4 },
  "providers": { "musicbrainz": 200, "youtube": 112 },
  "licenses": { "null": 290, "by": 22 },
  "outputs": { "jsonl": "tracks.jsonl", "csv": "tracks.csv" },
  "toolVersion": "0.1.0"
}
```

Los números son ilustrativos.

---

## Versionado del schema

| Cambio                            | `schemaVersion` |
| --------------------------------- | --------------- |
| Agregar campo opcional            | **no sube**     |
| Agregar campo obligatorio         | sube            |
| Renombrar / quitar / cambiar tipo | sube            |
| Cambiar semántica de un campo     | sube            |

**Regla:** el consumidor (UI, CSV, API, Amplified) nunca rompe sin aviso. Si sube la versión, hay nota de migración en el release.

---

## Paridad de formatos

Las columnas del CSV son los campos del JSON **aplanados con punto**, en orden fijo: `license.code`, `provenance.fetchedAt`.

| Caso                                               | CSV                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| Objeto anidado                                     | Una columna por campo hoja                                         |
| Array (`tags`)                                     | JSON en la celda                                                   |
| `null`                                             | Celda vacía                                                        |
| String vacío                                       | No existe: se normaliza a `null`                                   |
| Celda que empieza con `=`, `+`, `-`, `@`, tab o CR | Prefijo `'` para evitar inyección de fórmulas en planillas (OWASP) |

Las celdas siguen RFC 4180 (comillas dobles cuando hay `,`, `"` o saltos de línea) y cada línea termina en CRLF. Un álbum sale en el orden de `collection.position`.

JSONL es la referencia; el CSV es una vista para personas.

Motivo: cuando el output tiene una forma estable y predecible, "convertirlo en API" deja de ser un proyecto y pasa a ser un endpoint.
