# 00 — Registro de decisiones (ADRs)

Decisiones tomadas durante el diseño. **Inmutables:** si algo cambia, se agrega un ADR nuevo que supersede al anterior.

Formato: `Estado · Contexto · Decisión · Consecuencias`.

| ID      | Decisión                                                    | Estado                                               |
| ------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| ADR-001 | Metadata + links primero; audio después y opt-in            | Aceptada (audio: v2, ver ADR-013)                    |
| ADR-002 | TypeScript estricto; reescribir, no migrar                  | Aceptada (build y herramientas: ver ADR-023)         |
| ADR-003 | Abstracción en dos ejes: `Provider × Transport`             | Aceptada (ampliada por ADR-015)                      |
| ADR-004 | Escalera de degradación; navegador como último recurso      | Aceptada (v1.0 solo usa el escalón API, ver ADR-013) |
| ADR-005 | `Result<T, E>` en las fronteras, no excepciones             | Aceptada                                             |
| ADR-006 | `zod` como fuente única de tipos en datos externos          | Aceptada                                             |
| ADR-007 | Un core, tres superficies: CLI / REST / MCP                 | Parcialmente superada por ADR-013 y ADR-018          |
| ADR-008 | Rate limiting y jitter como módulo de primera clase         | Aceptada (justificación: ADR-017; robots: ADR-024)   |
| ADR-009 | Repo standalone; schema compatible con Amplified            | Aceptada                                             |
| ADR-010 | LLM solo en los bordes; el agente va afuera                 | Aceptada                                             |
| ADR-011 | UI _form-first_; chat como azúcar opcional                  | Aceptada (UI local en v1.0, ver ADR-021; chat: v2)   |
| ADR-012 | Fixtures y tests son precondición del feature de LLM        | Aceptada (feature de LLM: v2)                        |
| ADR-013 | Recorte de v1.0: 3 providers por API, CLI + MCP, JSONL/CSV  | Superada parcialmente por ADR-021                    |
| ADR-014 | Licencia estructurada en lugar de un enum                   | Aceptada                                             |
| ADR-015 | `resolve` devuelve `Resource` (track o colección)           | Aceptada                                             |
| ADR-016 | Dos hashes en provenance: evidencia y contenido             | Aceptada                                             |
| ADR-017 | Identificarse ante el servidor; nada de evasión             | Aceptada                                             |
| ADR-018 | Allowlist de hosts en el transport; MCP local en v1.0       | Aceptada                                             |
| ADR-019 | Fase 1 es una rebanada vertical                             | Aceptada                                             |
| ADR-020 | Revisión de términos como requisito de cada provider        | Aceptada (ampliada por ADR-022 y ADR-024)            |
| ADR-021 | El producto: un link de cualquier plataforma → una tabla    | Aceptada (providers: ver ADR-024)                    |
| ADR-022 | Acceso solo por vías oficiales, con las claves del usuario  | Aceptada                                             |
| ADR-023 | Stack técnico de v1.0                                       | Aceptada                                             |
| ADR-024 | MusicBrainz y YouTube; `robots.txt` según el tipo de acceso | Aceptada                                             |
| ADR-025 | ListenBrainz en v1.0: playlists y escuchas                  | Aceptada                                             |

---

## ADR-001 — Metadata + links primero; audio después y opt-in

**Contexto.** El proyecto original promete datasets de audio para entrenar modelos, pero entrega un CSV de links. Descargar y normalizar audio multiplica el costo de ingeniería (10×) y reintroduce el problema legal (derechos sobre las obras y sobre las voces).

**Decisión.** La v1.0 produce **metadata validada + URL de origen**. El pipeline de audio (descarga, normalización, fingerprint) es una fase posterior, **opt-in, desactivada por defecto**, y aislada detrás de una capability.

**Consecuencias.**

- El proyecto es publicable y demostrable sin discusión legal de fondo.
- El 80% del valor (descubrimiento, curación, provenance) se entrega antes.
- La fase de audio no bloquea nada; se puede no hacer nunca y el producto sigue siendo coherente.

---

## ADR-002 — TypeScript estricto; reescribir, no migrar

**Contexto.** El original son tres scripts JS casi idénticos. Traducirlos a `.ts` daría los mismos tres scripts con tipos.

**Decisión.** **Reescritura** como librería + CLI. `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` desde el día uno. ESM. `tsx` para dev, `tsup` para build.

**Consecuencias.**

- Más trabajo inicial que una migración mecánica.
- A cambio: un core reutilizable por tres superficies, y tests posibles.
- Activar el modo estricto después es un infierno; hacerlo al inicio es gratis.

---

## ADR-003 — Abstracción en dos ejes: `Provider × Transport`

**Contexto.** La tentación es un `BaseScraper` con `scrape()` y una subclase por sitio. Eso colapsa cuando un sitio usa scroll infinito, otro tiene JSON embebido y otro tiene API REST.

**Decisión.** Dos interfaces ortogonales: **`Provider`** (qué sitio) y **`Transport`** (cómo se obtienen los bytes). Un provider _compone_ transports. Sin herencia entre providers: composición + registro.

**Consecuencias.**

- Agregar un sitio es trabajo mecánico (mapeo, no arquitectura).
- Un transport nuevo (ej. GraphQL) beneficia a todos los providers a la vez.
- Requiere disciplina: nada específico de un sitio puede filtrarse al core.

---

## ADR-004 — Escalera de degradación; navegador como último recurso

**Contexto.** El original usa Puppeteer para todo. Un navegador para leer un `<h1>` es 50–100× más lento, 10× más frágil y mucho más sospechoso.

**Decisión.** Orden fijo de intentos: **API oficial → API no documentada → oEmbed → HTML estático → navegador headless**. Solo se baja un escalón si el anterior falla. Si se usa navegador: **Playwright**, no Puppeteer, y se instrumenta qué porcentaje de requests cae ahí.

**Consecuencias.**

- Velocidad y estabilidad mucho mayores; menor huella.
- Métrica de portfolio: "% de requests resueltos sin navegador".
- Los `locator` con auto-waiting eliminan estructuralmente el antipatrón `await delay(3000)`.

---

## ADR-005 — `Result<T, E>` en las fronteras, no excepciones

**Contexto.** "El track está geo-bloqueado" no es un bug: es un resultado esperado. Con `throw`, el llamador no está obligado a manejarlo.

**Decisión.** Las operaciones de provider devuelven `Result<T, ScrapeError>`. Las excepciones quedan reservadas para **bugs** (invariantes violadas), no para fallas esperadas. `switch` exhaustivo con `never` para forzar cobertura.

**Consecuencias.**

- Errores visibles en el tipo; imposible olvidarse un caso.
- Un poco más de ceremonia en el código de llamada.
- Se puede cambiar a `neverthrow` si aporta; el tipo propio es suficiente para empezar.

---

## ADR-006 — `zod` como fuente única de tipos en datos externos

**Contexto.** Todo lo que viene de afuera (HTML, JSON de APIs, config, args de CLI) es **no confiable**. Un `as Track` es una mentira que explota en producción.

**Decisión.** Validar en cada frontera con `zod`. Los tipos se **derivan** del schema (`z.infer`), nunca se declaran en paralelo. Los datos scrapeados se validan igual que input de usuario.

**Consecuencias.**

- Cuando un sitio cambia el markup, falla **ruidosamente** en vez de devolver `"Unknown Title"` en silencio (que es lo que hace el original).
- Costo: unos ms por parseo y un poco de código de schema. Se amortiza en el primer bug evitado.

---

## ADR-007 — Un core, tres superficies: CLI / REST / MCP

**Contexto.** El instinto es construir la UI primero, o el MCP primero. Ambos son adaptadores de la misma capa de servicio.

**Decisión.** El core no sabe de HTTP, ni de argv, ni de MCP. Expone una capa de servicio (`resolve`, `search`, `export`, `report`). **CLI, REST y MCP son adaptadores finos** sobre esa capa. El MCP **no es un feature**: es un adaptador, y va después de REST.

**Consecuencias.**

- MCP cuesta ~1 día si la capa de servicio está bien.
- Un core, tres superficies es un argumento fuerte de portfolio.
- Riesgo: sobre-ingeniería temprana. Mitigación: la capa de servicio se escribe cuando existe el segundo adaptador, no antes.

---

## ADR-008 — Rate limiting y jitter como módulo de primera clase

**Contexto.** El original usa `await delay(3000)` fijo. Un delay constante no es solo lento: es una **firma de bot**.

**Decisión.** Módulo dedicado: token bucket **por host**, jitter en el pacing, backoff exponencial con _full jitter_, respeto de `Retry-After`, circuit breaker por dominio, `robots.txt` cacheado y respetado por defecto.

**Consecuencias.**

- El scraper aguanta volumen real en vez de "funciona en mi máquina".
- Es el mejor argumento de ética del proyecto y desactiva la mayoría de las críticas de ToS.
- Costo: un módulo de ~300 líneas y tests con reloj falso.

---

## ADR-009 — Repo standalone; schema compatible con Amplified

**Contexto.** Existe la tentación de meterlo dentro de Amplified. Eso diluye el posicionamiento de Amplified y acopla un proyecto grande a otro.

**Decisión.** Repo **separado**. El schema canónico se diseña para ser consumible por Amplified más adelante (campos estables, `schemaVersion`, export JSONL), sin dependencia de código.

**Consecuencias.**

- Un post y un repo propios: señal más limpia de "esta persona shippea".
- Integración futura = importar un paquete, no refactorizar.

---

## ADR-010 — LLM solo en los bordes; el agente va afuera

**Contexto.** "Meter un agente" es ambiguo: puede ser _el proyecto usa un LLM_ o _un agente usa el proyecto_.

**Decisión.** **Regla: core determinista, bordes probabilísticos.** LLM solo donde el problema es ambiguo (selector healing, mapeo de sitios desconocidos, dedupe difuso, etiquetado). **Nunca** en el hot path ni para parsear estructura limpia. El **agente vive afuera** (vía MCP); adentro, un LLM es una **función angosta y verificable**, no un loop autónomo.

**Consecuencias.**

- Nada de costo ni latencia por request.
- El feature de AI es medible (ver ADR-012).
- No se reimplementa Claude con peores herramientas.

---

## ADR-011 — UI _form-first_; chat como azúcar opcional

**Contexto.** "¿Hago un chat?" Un chat para un scraper demuestra el modelo, no el producto, y esconde la estructura de los datos.

**Decisión.** La UI es **un input + filtros + tabla + export**. Un campo opcional "describí lo que buscás" traduce lenguaje natural a los mismos parámetros del formulario, pero **el resultado siempre es la tabla**, nunca una respuesta en prosa.

**Consecuencias.**

- El demo se entiende en 10 segundos y se graba en 15.
- El chat no es la interfaz: es un atajo de entrada.
- Se puede construir después sin tocar el core (consume MCP/REST).

---

## ADR-012 — Fixtures y tests son precondición del feature de LLM

**Contexto.** "Self-healing selectors" sin un banco de pruebas es una demo que no se puede demostrar. ¿Cómo probás que el LLM arregló algo si no hay nada que verifique?

**Decisión.** El harness de fixtures, los contract tests y los golden tests se construyen **antes** que cualquier feature de LLM. El healing se evalúa sobre un set de fixtures roto a propósito, con métricas.

**Consecuencias.**

- El feature de AI se puede medir ("rompí 20 fixtures, arregló 17, marcó 3").
- Los tests protegen el core mientras se experimenta con LLM.
- Ordena el roadmap: el test harness no es un extra, es infraestructura.

---

## ADR-013 — Recorte de v1.0

**Fecha.** 2026-11-24. **Supera parcialmente a** ADR-007.

**Contexto.** El alcance prometía 8 providers y el roadmap planificaba 3. La Fase 5 dependía de audio que ADR-001 dejaba para el final. Un proyecto personal con 8 fases tiene como mayor riesgo no publicarse.

**Decisión.** v1.0 = **Audius + Internet Archive + Jamendo**, **CLI + MCP**, **JSONL + CSV**. Pasan a v2: REST, UI, Parquet, HTML, navegador, presets de entrenamiento, todo lo que toque audio y LLM.

**Consecuencias.**

- Los tres providers usan API: no hace falta `cheerio` ni `playwright`.
- v1.0 **no** demuestra la escalera de degradación. Se pierde ese argumento de portfolio hasta v2.
- El diferencial de v1.0 pasa a ser **licencia y procedencia correctas**, no la técnica de scraping.

---

## ADR-014 — Licencia estructurada en lugar de un enum

**Fecha.** 2026-11-24.

**Contexto.** El enum original (`cc-by`, `cc-by-sa`, `cc0`, …) no representa NC ni ND. Muestras tomadas el 2026-11-24: en 200 items de `netlabels` en Internet Archive, la licencia más frecuente fue `by-nc-nd`, con versiones y jurisdicciones distintas (`3.0/de`, `2.5/it`). En 100 tracks de Audius, 88 no declaraban licencia y el resto la expresaba como texto libre.

**Decisión.** `License` es un objeto con código, versión, jurisdicción, URL y valor original. `null` significa "la fuente no la declara"; se elimina `"unknown"`. Los permisos se **derivan** con una función pura. Ver [`03-schema.md`](03-schema.md).

**Consecuencias.**

- Los filtros preguntan por permisos y no por "es CC".
- Sin licencia declarada, un permiso es `false`: nunca se asume.

---

## ADR-015 — `resolve` devuelve `Resource`

**Fecha.** 2026-11-24. **Amplía** ADR-003.

**Contexto.** `resolve(url)` devolvía un `Track`, pero una URL de Audius puede ser un álbum y un item de Internet Archive puede tener muchos archivos, o ninguno de audio.

**Decisión.** `resolve` devuelve una unión discriminada: `{ kind: 'track' }` o `{ kind: 'collection' }` con su primera página de tracks.

**Consecuencias.**

- CLI, export y MCP tratan ambos casos de forma explícita.
- Una colección vacía es un resultado válido, no un error.

---

## ADR-016 — Dos hashes en provenance

**Fecha.** 2026-11-24.

**Contexto.** `rawHash` debía detectar cambios. Dos lecturas del mismo track de Audius, separadas por 2,5 s, difirieron en `artwork`, `stream` y `user` (la URL de stream lleva firma y timestamp). Ese hash cambia siempre.

**Decisión.** `rawHash` = evidencia de los bytes recibidos. `contentHash` = hash del `Track` normalizado, sin provenance ni campos volátiles. **Los cambios se detectan con `contentHash`.**

**Consecuencias.** `rawHash` por sí solo no permite auditar: hace falta conservar la respuesta (`--keep-raw`).

---

## ADR-017 — Identificarse ante el servidor

**Fecha.** 2026-11-24. **Supera** la justificación de ADR-008.

**Contexto.** Se justificaba el jitter por la "firma de bot" y se pedía un fingerprint de navegador verosímil. Eso es evasión y contradice la sección de ética.

**Decisión.** User-Agent propio, con nombre, versión y URL del proyecto. El jitter existe para **repartir carga y desincronizar reintentos**. Sin rotación de proxies ni fingerprints simulados para eludir un bloqueo.

**Consecuencias.** Si una fuente bloquea el cliente, se respeta y se reporta.

---

## ADR-018 — Allowlist en el transport; MCP local

**Fecha.** 2026-11-24. **Supera parcialmente a** ADR-007.

**Contexto.** La protección SSRF solo figuraba en el MCP, aunque cualquier superficie acepta URLs. Audius `/v1/resolve` responde con un 302, así que los redirects son parte del camino normal. Además, SQLite y un rate limiter en memoria no funcionan en funciones serverless.

**Decisión.** El transport valida esquema, host e IP en **cada salto**. En v1.0 el MCP es local por stdio: no hay servidor público ni deploy.

**Consecuencias.** Una API pública en v2 exige un ADR propio sobre hosting, estado compartido y autenticación.

---

## ADR-019 — Fase 1 es una rebanada vertical

**Fecha.** 2026-11-24.

**Contexto.** `STATUS.md` pedía una rebanada vertical y el roadmap pedía fundaciones sin providers.

**Decisión.** Fase 1 = URL de Audius → CSV, atravesando todas las capas con lo mínimo. El ledger y el circuit breaker llegan en Fase 2. El schema se congela **después** del segundo provider, que es el primero que lo pone a prueba.

**Consecuencias.** Hay demo desde la primera fase; el schema puede cambiar hasta cerrar la Fase 3.

---

## ADR-020 — Revisión de términos por provider

**Fecha.** 2026-11-24.

**Contexto.** "API pública" no implica "uso libre". `bandcamp.com/robots.txt` bloquea `/search`, que el diseño declaraba como capability. Los términos de la API de Jamendo limitan el uso libre a fines no comerciales y restringen el caching.

**Decisión.** Ningún provider entra al registro sin una revisión fechada de términos y `robots.txt` con enlace a la fuente primaria. Cada provider declara si su metadata se puede **exportar**.

**Consecuencias.** Una fuente puede servir para consulta y no para export.

---

## ADR-021 — El producto: un link de cualquier plataforma → una tabla

**Fecha.** 2026-11-26. **Supera parcialmente a** ADR-013 (providers y superficies) y **reactiva** ADR-011 para v1.0.

**Contexto.** El alcance de ADR-013 se armó para resolver contradicciones entre documentos y terminó describiendo otro producto: un catálogo de licencias sobre fuentes de nicho, sin UI. El origen del proyecto es un tutorial de Decodo cuyo flujo es _link de playlist → tabla ordenada → CSV_, para datasets de IA, análisis de tendencias e investigación de mercado. El usuario lo confirmó como objetivo: una herramienta open source (MIT) que cualquiera puede usar, sobre las plataformas que la gente usa de verdad.

**Decisión.**

- El producto es **"pegás un link de cualquier plataforma y obtenés las mismas columnas, con procedencia"**.
- v1.0 = **Deezer + YouTube**, **UI web local + CLI + MCP local**, **CSV + JSONL**.
- Deezer va primero porque su API pública no exige clave: es el quick start y la Fase 1.
- La UI corre en la máquina del usuario (`scrapeer ui`, solo `127.0.0.1`). No hay hosting, cuentas ni auth: ADR-018 sigue vigente.
- Audius, Internet Archive y Jamendo dejan de ser v1.0 y pasan a la lista de providers posteriores.

**Consecuencias.**

- El demo vuelve a ser la UI: se entiende en 10 segundos.
- El diferencial deja de ser la licencia y pasa a ser el formato único; la licencia sigue en el schema (ADR-014) y se llena cuando la fuente la declara.
- El schema se pone a prueba con YouTube, no con Internet Archive. Se congela al cerrar la Fase 3.
- La mayoría de las plataformas no declara licencia por track: el filtro por licencia pierde peso en v1.0.

---

## ADR-022 — Acceso solo por vías oficiales, con las claves del usuario

**Fecha.** 2026-11-26. **Amplía** ADR-017 y ADR-020.

**Contexto.** Las plataformas pedidas tienen accesos muy distintos (verificado el 2026-11-26 en las fuentes de cada plataforma): YouTube y Deezer tienen APIs abiertas; SoundCloud entrega claves automáticas pero solo a cuentas Artist Pro; Tidal tiene API oficial con credenciales; Spotify restringe el modo desarrollo (Premium, pocos usuarios) y no expone plays; Instagram solo da datos de cuentas profesionales con revisión de Meta; la API de investigación de TikTok es solo para académicos sin fines de lucro. Una herramienta pública que evade protecciones es lo que esas plataformas persiguen, y además se rompe con cada cambio.

**Decisión.**

- Cada provider usa la **vía oficial** de su plataforma. La escalera de ADR-004 sigue vigente, pero ningún escalón incluye evasión (ADR-017).
- Las claves son **del usuario**, por env. El proyecto no distribuye ni comparte claves.
- **TikTok e Instagram quedan fuera de alcance** mientras no exista una vía oficial abierta.
- Lo que una plataforma no expone queda en `null`. Por ejemplo, Spotify no da plays: no se estiman.

**Consecuencias.**

- Algunas plataformas exigen trámites o cuentas pagas del usuario; la docs de cada provider lo dice primero.
- Las métricas no son comparables entre plataformas (vistas de YouTube, `rank` de Deezer, popularidad de Spotify): el schema las separa ([`03-schema.md`](03-schema.md)).
- El riesgo legal recae en el uso de cada persona, no en un servicio central; la puerta de términos (ADR-020) sigue siendo obligatoria.

---

## ADR-023 — Stack técnico de v1.0

**Fecha.** 2026-11-26. **Precisa** ADR-002 y **supera** la tabla de dependencias anterior de [`02-arquitectura.md`](02-arquitectura.md).

**Contexto.** La tabla de dependencias dejaba elecciones abiertas (CLI, linter) y tenía dos problemas verificados el 2026-11-26: `tsup` ya no se mantiene activamente y su README recomienda `tsdown`; `better-sqlite3` es un módulo nativo que puede no instalarse con `npx` cuando falta el binario precompilado, y el quick start y el MCP dependen de `npx`.

**Decisión.**

| Capa            | Elección                       | Motivo                                                                                                                                                     |
| --------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | **Node 26 LTS** (mínimo 24.15) | LTS activa desde 2026-10; trae `fetch`, `node:sqlite` y `--env-file`                                                                                       |
| Lenguaje        | TypeScript estricto, ESM       | ADR-002                                                                                                                                                    |
| Validación      | **zod**                        | Tipos derivados del schema (ADR-006)                                                                                                                       |
| HTTP saliente   | `fetch` nativo / undici        | Control de redirects para la allowlist (ADR-018)                                                                                                           |
| HTTP local (UI) | **Hono**                       | Chico, tipado, valida con zod; sirve también para la REST de v2                                                                                            |
| Persistencia    | **`node:sqlite`**              | Incluido en Node (release candidate desde 24.15): sin dependencias nativas                                                                                 |
| Logs            | **pino**                       | Estructurado y barato                                                                                                                                      |
| CLI             | **commander**                  | La más conocida: no frena a quien contribuya                                                                                                               |
| Build           | **tsdown**                     | Sucesor recomendado de tsup                                                                                                                                |
| Tests           | **Vitest**                     | Rápido, compatible con fixtures                                                                                                                            |
| Lint y formato  | **Oxlint + Oxfmt**             | Oxlint tiene reglas con información de tipos estables, basadas en el compilador de TypeScript: hacen cumplir "sin `any`" y "sin `as` sobre datos externos" |
| Paquetes        | **pnpm**, **un solo paquete**  | Un binario `scrapeer` con subcomandos (`ui`, `mcp`); las capas se separan por carpetas y reglas de importación                                             |

**Descartados.**

| Opción                      | Por qué no                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Nest.js                     | Framework para backends grandes; el servidor de v1.0 es un adaptador local de pocos endpoints y el core no puede depender de HTTP (ADR-007) |
| Monorepo de varios paquetes | Cinco `package.json` y cinco publicaciones sin un consumidor que lo pida; se separa cuando alguien quiera usar el core solo                 |
| Biome                       | Su inferencia de tipos propia cubre menos reglas que Oxlint con el compilador de TypeScript                                                 |
| Vite+                       | Coherente con Vite y Vitest, pero recién llegó a 1.0; se reevalúa después de v1.0                                                           |
| Eve (Vercel)                | Es para construir un agente propio; acá el agente va afuera y usa la herramienta por MCP (ADR-010)                                          |
| Chat SDK (Vercel)           | Es para bots de Slack, Discord y similares, no para una UI web; candidato de v2                                                             |

**Abierto hasta su fase.**

- **UI (Fase 2):** React + TanStack Table + Tailwind, o Vercel UI SDK (Web Components, beta desde 2026-11, con WebMCP). Se decide con una prueba de medio día: la misma tabla en las dos opciones.
- **MCP (Fase 5):** `@modelcontextprotocol/sdk`, salvo que haya una razón nueva para cambiarlo.
- **`p-queue` (Fase 4):** se incorpora solo si el rate limiter propio no alcanza.

**Consecuencias.**

- `npx scrapeer` no compila nada: cero dependencias nativas.
- Requiere Node ≥ 24.15 (versión mínima con `node:sqlite` en _release candidate_); se desarrolla y se prueba en CI con Node 26. La CLI verifica la versión al arrancar y la informa en `doctor`.
- `node:sqlite` todavía no es _stable_: si cambia su API, el impacto queda acotado al módulo del ledger.

---

## ADR-024 — MusicBrainz y YouTube en v1.0; `robots.txt` según el tipo de acceso

**Fecha.** 2026-11-26. **Supera** la elección de providers de ADR-021, **precisa** la regla de `robots.txt` de ADR-008 y **amplía** la puerta de términos de ADR-020.

**Contexto.** Antes de escribir el provider de Deezer se revisaron `robots.txt` y términos de las plataformas pedidas (2026-11-26, fuentes primarias):

| Plataforma  | `robots.txt` del host de la API | Términos                                                                                                                                    |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Deezer      | `Disallow: /*`                  | Solo uso no comercial; prohíbe extraer contenido a una base de datos "o permitir a sus usuarios hacerlo" (§III.4) y el uso para IA (§III.8) |
| Spotify     | `Disallow: /`                   | Prohíbe bases de datos más allá de lo estrictamente necesario (§IV.3.1.1), la metadata como producto aparte y el uso para ML                |
| SoundCloud  | Sin dato (respondió 429)        | Prohíbe guardar en forma persistente (§05) y entrenar IA (§03)                                                                              |
| Tidal       | 404                             | Sin leer: la página solo carga con JavaScript                                                                                               |
| YouTube     | 404                             | Permite uso comercial; los datos guardados se borran o se refrescan a los 30 días; las credenciales no van en código abierto                |
| MusicBrainz | `Disallow: /ws`                 | API documentada para programas: 1 request/s por IP, User-Agent con contacto; datos principales **CC0**                                      |

Deezer, Spotify y SoundCloud prohíben justo lo que hace la herramienta: exportar metadata a una tabla. MusicBrainz muestra además que el `robots.txt` de un host de API apunta a los buscadores: bloquea `/ws`, la misma ruta que documenta como su API pública.

**Decisión.**

1. **Providers de v1.0: MusicBrainz y YouTube.**
   - **MusicBrainz** es la Fase 1 y el quick start sin credenciales: `release` (álbum, tracks en orden) y `recording` (track). No tiene playlists.
   - **YouTube** es la Fase 3, con la clave del usuario, y congela el schema.
   - **Deezer sale de v1.0** por sus términos. Spotify y SoundCloud quedan fuera mientras sus términos prohíban exportar.
2. **`robots.txt` según el tipo de acceso:**

   | Acceso                                    | Lo que manda                                                                                             |
   | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
   | **API oficial documentada** (escalón 1)   | Los términos y límites de la API: cuota, rate limit, User-Agent. El `robots.txt` se registra, no bloquea |
   | **Páginas web** (oEmbed, HTML, navegador) | El `robots.txt`, siempre: `Disallow` → `robots_disallowed`, sin bypass                                   |

   Un host cuenta como API oficial solo si el provider declara, para ese host y prefijo de ruta, el enlace a la documentación de la plataforma que lo publica para programas. Lo verifica la puerta de términos.

3. **La puerta de términos (ADR-020) se lee antes de escribir el provider**, no antes de publicarlo: si los términos prohíben exportar, el provider no se construye.
4. **`isrc` pasa a `isrcs: string[]`**: MusicBrainz devuelve varios ISRC por grabación (seis en el primer track de _The Dark Side of the Moon_). Elegir uno sería inventar.

**Consecuencias.**

- El quick start usa un link de álbum de MusicBrainz en lugar de una playlist de Deezer.
- MusicBrainz exige 1 request/s y un contacto en el User-Agent: el rate limiter por host y el User-Agent de ADR-017 se prueban desde la Fase 1.
- Solo se exportan los datos principales de MusicBrainz (CC0). Los datos suplementarios, como tags y ratings, son CC BY-NC-SA: quedan afuera en v1.0.
- Los exports de YouTube llevan fecha de vencimiento a 30 días en el manifest.
- El transport sabe qué hosts son API oficial; la consulta de `robots.txt` antes del primer request sigue en el transport para todos los hosts.
- ADR-021 sigue vigente en todo lo demás: producto, superficies y formatos.

---

## ADR-025 — ListenBrainz en v1.0: playlists y escuchas

**Fecha.** 2026-11-26. **Amplía** ADR-024.

**Contexto.** MusicBrainz no tiene playlists ni conteos de reproducción, y el caso de origen es _link de playlist → tabla con plays_. ListenBrainz, de la misma fundación (MetaBrainz), tiene las dos cosas y usa los mismos IDs de grabación. Revisión del 2026-11-26 en fuentes primarias:

| Tema         | Lo que dice la fuente                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Términos     | [listenbrainz.org/terms-of-service](https://listenbrainz.org/terms-of-service/): "defined by the social contract and privacy policies of the Foundation"                       |
| Uso          | [Contrato social](https://metabrainz.org/social-contract): "companies can use the work of our volunteers without any charge, but charging for the content itself is forbidden" |
| Licencia     | Contenido factual en dominio público; volcados en CC0. Uso comercial "Allowed, but financial support strongly urged"                                                           |
| IA, export   | Ninguna cláusula los prohíbe                                                                                                                                                   |
| API          | 1 request/s por aplicación, User-Agent con contacto, 429 al pasarse; `GET /1/playlist/{mbid}` y `POST /1/popularity/recording` documentados                                    |
| `robots.txt` | `api.listenbrainz.org` responde 410; `listenbrainz.org` bloquea páginas web como `/recording/`, que no se usan                                                                 |

Audius se revisó en la misma fecha y queda **afuera**: sus términos de la API prohíben "scraping, data harvesting… or other data extraction methods to extract data from the API" (§4(a)(v)) y solo permiten guardar datos durante la sesión.

**Decisión.**

- **ListenBrainz entra en v1.0** como provider, en la Fase 3 junto a YouTube.
- Resuelve links de playlist (`listenbrainz.org/playlist/{mbid}`) a una **colección ordenada**.
- Llena `plays` con `total_listen_count`: las escuchas que registraron los usuarios de ListenBrainz. No son reproducciones globales; la documentación del campo lo aclara.
- Las filas de MusicBrainz siguen con `plays: null`. Sumarles las escuchas de ListenBrainz mezclaría dos fuentes en una fila con una sola procedencia; se decide al congelar el schema, en la Fase 3.

**Consecuencias.**

- Vuelve el caso del tutorial: un link de playlist da una tabla ordenada con escuchas, sin credenciales.
- El ID del track es el MBID de la grabación, igual que en MusicBrainz: las dos tablas se cruzan sin adivinar.
- La herramienta no cobra por los datos ni ofrece hacerlo: cumple el contrato social. El README lo dice para quien la use.
- Queda pendiente registrar el proyecto en el nivel sin costo que MetaBrainz pide a proyectos open source.
