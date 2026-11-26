# 01 — Alcance

> **v1.0:** pegás el link de una playlist, un álbum o un track de **Deezer** o **YouTube** y obtenés una tabla con la metadata, exportable a CSV y JSONL, desde una **UI web local**, la **CLI** o **MCP**.

Decisiones: [ADR-021](00-decisiones.md#adr-021--el-producto-un-link-de-cualquier-plataforma--una-tabla) y [ADR-022](00-decisiones.md#adr-022--acceso-solo-por-vías-oficiales-con-las-claves-del-usuario).

## La frase del proyecto

> Pegás un link de **cualquier plataforma musical** y obtenés una tabla limpia, con **las mismas columnas siempre** y la **procedencia** de cada dato, exportable a CSV.

Si una tarea no acerca a esa frase, no entra.

## Qué es

Una **herramienta open source (MIT)** que cualquiera puede correr en su máquina. No es un servicio: no guarda datos de nadie ni vende acceso. Cada persona usa sus propias claves de API cuando una plataforma las exige.

Nace de un tutorial de Decodo ([video](https://www.youtube.com/watch?v=BMgrLd-U4k0), [repo](https://github.com/Decodo/soundcloud-scraper)): un script que recorre una playlist de SoundCloud con un navegador y proxies residenciales, y guarda posición, artista, título, URL y plays en un CSV. La idea es buena; la ejecución no (un solo sitio, selectores frágiles, evasión de bloqueos). **Este proyecto hace lo que ese tutorial promete, bien hecho y para varias plataformas.**

## Para quién y para qué

| Usuario                     | Pregunta que resuelve                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Data y marketing            | ¿Qué hay en esta playlist, en qué orden y con cuánta tracción?                                             |
| Quien arma datasets para IA | ¿Qué tracks son, de dónde salieron y con qué licencia, para después conseguir el audio por vías oficiales? |
| Un agente con MCP           | ¿Puedo resolver un link y exportar sin inventar datos?                                                     |
| Cualquier persona           | ¿Cómo paso esta playlist a una planilla?                                                                   |

**No es un producto de AI:** es un producto que la AI puede usar.

**El diferencial es el formato único.** Cada plataforma expone sus datos distinto; acá todas terminan en las mismas columnas, con procedencia. La licencia se conserva cuando la fuente la declara.

---

## Qué entra en v1.0

### Core

- [ ] Schema `Track`, `Collection` y `License` + `schemaVersion`
- [ ] `Result<T, ScrapeError>` + taxonomía de errores
- [ ] Transport HTTP con allowlist, timeout y límite de tamaño
- [ ] Rate limit por host, jitter, backoff y `Retry-After`
- [ ] User-Agent identificable
- [ ] Config validada con zod; claves del usuario por env
- [ ] Ledger SQLite reanudable y budget por run (incluida la cuota diaria de YouTube)

### Providers

- [ ] **Deezer** — API pública sin clave: el quick start
- [ ] **YouTube** — Data API v3 con la clave del usuario: pone a prueba el schema

### Salidas

- [ ] CSV y JSONL con los mismos campos
- [ ] Orden de la playlist preservado (`collection.position`)
- [ ] `manifest.json` y `rejected.jsonl`
- [ ] Filtros por licencia y duración
- [ ] Deduplicación por identidad `(provider, id)`

### Superficies

- [ ] **UI web local**: input, tabla, export ([`07-superficies.md`](07-superficies.md#ui))
- [ ] CLI
- [ ] MCP local por stdio

### Calidad

- [ ] Fixtures, contract tests y golden tests
- [ ] CI y canary semanal
- [ ] README en inglés con GIF y quick start sin credenciales

---

## Después de v1.0

Cada plataforma nueva es un provider más, sin tocar el core. Entran de a una, en este orden, cuando pasan la puerta de [`05-providers.md`](05-providers.md).

| Orden | Plataforma                                  | Requisito del usuario                                      |
| ----- | ------------------------------------------- | ---------------------------------------------------------- |
| 1     | SoundCloud                                  | Clave propia; la API exige cuenta Artist Pro               |
| 2     | Tidal                                       | Credenciales del portal de desarrolladores                 |
| 3     | Spotify                                     | App propia; el modo desarrollo exige Premium y no da plays |
| 4     | Audius, Internet Archive, Jamendo, Bandcamp | Según su puerta de términos                                |

## Qué pasa a v2

| Pieza                                     | Qué la habilita                         |
| ----------------------------------------- | --------------------------------------- |
| API REST pública y UI hosteada            | ADR de hosting, estado y auth (ADR-018) |
| HTML, oEmbed y navegador                  | Un provider aprobado que lo necesite    |
| Parquet y presets                         | Un consumidor real que lo pida          |
| Audio: descarga, huella, pares degradados | ADR de derechos y almacenamiento        |
| LLM: healing, dedupe difuso, etiquetado   | Parsers HTML con fixtures (ADR-012)     |

**Regla:** nada de v2 entra en v1.0 sin sacar otra cosa y sin un ADR.

## Fuera de alcance

| No se hace                               | Por qué                                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| TikTok e Instagram                       | Sin vía oficial abierta: solo se podrían scrapear evadiendo protecciones (ADR-022) |
| Eludir bloqueos, proxies rotativos o DRM | ADR-017                                                                            |
| Contenido detrás de login o paywall      | No es metadata pública                                                             |
| Descargar audio de YouTube               | Prohibido por sus términos; solo metadata por API                                  |
| Clonado de voces                         | Consentimiento y regulación                                                        |
| Agente autónomo propio                   | El agente va afuera (ADR-010)                                                      |

---

## Criterio de "terminado"

1. Test con **fixture**, sin red.
2. **Error tipado** con mensaje accionable.
3. **Documentado** en una sección.
4. **Demostrable en 60 segundos** por otra persona.

Un provider cumple además el checklist de [`05-providers.md`](05-providers.md).

## v1.0 está lista cuando

Alguien ajeno al proyecto clona el repo, corre `scrapeer ui`, pega el link de una playlist de Deezer **sin credenciales** y descarga un CSV con los tracks en orden. Con su propia clave, hace lo mismo con una playlist de YouTube y obtiene **las mismas columnas**.
