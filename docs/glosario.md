# Glosario

Términos que aparecen en estos documentos, en lenguaje llano.

---

## Scraping y resiliencia

**Jitter**
Aleatoriedad agregada a un delay. En vez de esperar exactamente 3 s, esperás `3 s + random(0, 2 s)`. Sirve para repartir la carga y desincronizar reintentos.

**Full jitter**
Variante de backoff: `sleep = random(0, min(cap, base * 2^n))`. Reparte mejor la carga y genera menos trabajo total que el backoff sin jitter. Es el default recomendado (AWS).

**Thundering herd**
Efecto por el cual N clientes que fallan al mismo tiempo reintentan al mismo tiempo, produciendo una nueva estampida más grande. El backoff **sin** jitter no lo evita: lo sincroniza.

**Token bucket**
Algoritmo de rate limiting: un balde con N tokens que se rellena a cierto ritmo. Cada request consume uno. Permite ráfagas cortas pero limita el promedio.

**Circuit breaker**
Interruptor por dominio. Tras N fallas consecutivas "abre" y falla rápido sin tocar la red, en vez de insistir contra un servicio caído. Estados: `closed` → `open` → `half_open`.

**Escalera de degradación**
Orden fijo de intentos para obtener un dato: API oficial → API no documentada → oEmbed → HTML estático → navegador. Solo se baja un escalón si el anterior falla.

**oEmbed**
Estándar simple por el cual un sitio devuelve metadata de una URL en JSON (título, autor, thumbnail). Es el escalón más barato después de las APIs.

---

## Datos

**Schema canónico**
La forma única a la que todos los providers normalizan sus datos. En este proyecto: `Track`.

**Provenance**
El registro de _de dónde salió_ cada dato: URL de origen, fecha, transporte, hash de la respuesta, hash del contenido y versión del adapter. Sin provenance no hay dataset auditable.

**Manifest**
Archivo que describe un dataset: filtros, conteos, licencias, descartes y rutas de salida.

**Resource**
Lo que devuelve `resolve`: un track o una colección.

**Permiso derivado**
Lo que una licencia declarada permite (uso comercial, derivados). Se calcula; no se guarda. Sin licencia no hay permiso.

**Puerta de términos**
Revisión fechada de términos y `robots.txt` de una fuente. Decide si su metadata se exporta.

**Dedupe acústico**
Detectar que dos archivos son el mismo audio aunque tengan distinto bitrate o formato, comparando una **huella** (fingerprint, ej. Chromaprint) en vez del hash del archivo.

**Idempotencia**
Propiedad por la cual re-ejecutar una operación no cambia el resultado. Acá: `(provider, trackId)` es único, así que re-correr un run no duplica.

**Ledger**
Registro persistente del estado de los runs, para poder matar el proceso y retomarlo.

---

## Tipos y código

**Branded type**
Un tipo que se distingue de su base por una marca en tiempo de compilación: `type TrackId = string & { __brand: 'TrackId' }`. Evita pasar un ID donde va otro.

**`Result<T, E>`**
Tipo que representa éxito o error explícitamente, en vez de lanzar excepciones. Fuerza al llamador a manejar el caso de error.

**Discriminated union**
Unión de tipos distinguida por un campo literal (`kind`). Permite `switch` exhaustivo y que el compilador exija cubrir todos los casos.

**Zod**
Librería de validación de esquemas en TypeScript. Los tipos se **derivan** del schema (`z.infer`), así no hay dos fuentes de verdad.

**Fixture**
Una respuesta real (HTML/JSON) grabada y guardada en el repo, para que los tests corran sin red.

**Contract test**
Test que verifica que un provider, dado un fixture, produce exactamente el `Track` esperado.

**Golden test**
Test que compara el output completo contra una versión aprobada ("golden"). Detecta cambios no intencionales.

**Canary**
Job periódico que corre contra los sitios reales para detectar que un sitio cambió antes que los usuarios.

---

## AI

**MCP (Model Context Protocol)**
Protocolo abierto que permite a clientes de LLM (Claude Desktop, Cursor) llamar herramientas externas de forma estandarizada. Un _MCP server_ expone tools/resources.

**Agente (vs. función)**
Un **agente** es un loop que decide qué hacer a continuación. Una **función** hace una cosa y devuelve un resultado verificable. En este proyecto: el agente va afuera (vía MCP); adentro solo hay funciones.

**Prompt injection**
Ataque en el que contenido no confiable (ej. texto de una página scrapeada) contiene instrucciones que el modelo interpreta como órdenes. Mitigación: tratar el contenido como **dato**, nunca como instrucción.

**SSRF**
_Server-Side Request Forgery_: hacer que el servidor pida URLs arbitrarias (incluidas internas). Se mitiga validando host e IP en el transport, en cada redirect.

**False fix**
En el contexto del healing: un cambio propuesto que "pasa" la validación pero produce datos incorrectos. Es la métrica que más importa: si es > 0, el feature no sale.

---

## Proyecto

**ADR**
_Architecture Decision Record_: un documento corto que registra una decisión, su contexto y sus consecuencias. Es el artefacto que más impresiona en una review y el que casi nadie escribe.

**Build in public**
Publicar el progreso a medida que avanza, en vez de un reveal único. Protege del riesgo de no publicar nunca.

**Eje caro / eje barato**
En este proyecto: providers = eje barato e infinito; arquitectura = eje caro y finito. La energía va al caro.
