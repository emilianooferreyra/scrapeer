# 04 — Pipeline: politeness, resiliencia y estado

> El módulo que separa "funciona en mi máquina" de "aguanta 10.000 requests".

---

## Rate limiting

**Token bucket por host** (no global, no por provider: por _dominio_).

| Parámetro       | Default | Nota                          |
| --------------- | ------- | ----------------------------- |
| `capacity`      | 5       | Ráfaga permitida              |
| `refillPerSec`  | 1       | Ritmo sostenido               |
| `maxConcurrent` | 2       | Requests simultáneos por host |
| `jitterMs`      | 0–2000  | Ver abajo                     |

Un límite global es un error: si un host permite 10/s y otro 1/s, el global te frena en el rápido y te bloquea en el lento.

---

## Jitter: por qué y cómo

El jitter **reparte la carga** y evita que varios clientes se sincronicen. No se usa para parecer humano (ADR-017).

**Pacing normal:**

```ts
const wait = baseDelayMs + Math.random() * jitterMs;
```

**Backoff en reintentos** — `base` inicial, `n` intento:

```ts
// ❌ sin jitter: sincroniza los reintentos (thundering herd)
sleep = Math.min(cap, base * 2 ** n);

// ✅ full jitter (recomendado, AWS)
sleep = Math.random() * Math.min(cap, base * 2 ** n);

// equal jitter (compromiso)
const t = Math.min(cap, base * 2 ** n);
sleep = t / 2 + (Math.random() * t) / 2;

// decorrelated jitter (series largas)
sleep = Math.min(cap, base + Math.random() * (prevSleep * 3 - base));
```

**Full jitter** reparte mejor la carga y genera menos trabajo total. Es el default.

> El problema que resuelve se llama _thundering herd_: N clientes reciben `429`, reintentan todos en el mismo instante, y producen una nueva estampida más grande. El backoff sin jitter no lo evita, lo **sincroniza**.

**Respetar `Retry-After`** siempre, por encima del cálculo propio. Si el servidor dice 12 s, son 12 s (+ jitter). Si supera el presupuesto de tiempo del run, se corta limpio.

---

## Circuit breaker

Por dominio. Si N fallas consecutivas → abrir el circuito por un cooldown.

| Estado      | Comportamiento                                  |
| ----------- | ----------------------------------------------- |
| `closed`    | Normal                                          |
| `open`      | Falla rápido sin tocar la red (`upstream_down`) |
| `half_open` | Deja pasar 1 request de prueba                  |

**Default:** 5 fallas consecutivas → `open` 60 s → `half_open`.

Motivo: insistir contra un sitio caído es abuso, no persistencia. Y en un run largo, te ahorra minutos.

---

## `robots.txt`

Lo que manda depende del tipo de acceso ([ADR-024](00-decisiones.md#adr-024--musicbrainz-y-youtube-en-v10-robotstxt-según-el-tipo-de-acceso)):

| Acceso                                | Regla                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| API oficial documentada (escalón 1)   | Mandan los términos y límites de la API. El `robots.txt` se registra, no bloquea  |
| Páginas web (oEmbed, HTML, navegador) | Se respeta siempre: si `Disallow` cubre la ruta → `robots_disallowed`, sin bypass |

- Se consulta **una vez por host**, **antes del primer request**, y se cachea en el ledger.
- Un host es API oficial solo si el provider lo declara, con su prefijo de ruta y el enlace a la documentación de la plataforma. La puerta de términos lo verifica.
- En v1.0 no hay flag para desactivarlo.
- Ausente (4xx) → permitido. Error del servidor (5xx) o red → no se continúa con ese host.

Esto no es solo ética: es la primera línea de defensa en cualquier discusión pública sobre el proyecto.

---

## Identificación

`User-Agent: <nombre>/<versión> (+<URL del repo>)` en toda request. Si una fuente bloquea el cliente, se reporta y se detiene.

---

## Navegador (v2, último recurso)

Si y solo si los escalones 1–4 fallaron.

| Regla     | Detalle                                                             |
| --------- | ------------------------------------------------------------------- |
| Motor     | Playwright                                                          |
| Instancia | **Una** compartida; un `context` por job                            |
| Esperas   | `locator` con auto-waiting. **Nunca** `delay()` fijo                |
| Recursos  | Bloquear `image`, `media`, `font` con `route.abort()` y `try/catch` |
| Identidad | User-Agent propio; sin fingerprint simulado (ADR-017)               |
| Sandbox   | Siempre activo: **nunca** pasar `--no-sandbox`                      |
| Métrica   | Contar cuántas veces se llega acá (va al manifest)                  |

---

## Estado y resumibilidad

**Ledger SQLite** (`node:sqlite`, ADR-023). Es lo que permite matar el proceso y retomar.

| Tabla        | Contenido                                                         |
| ------------ | ----------------------------------------------------------------- |
| `runs`       | `id`, `startedAt`, `finishedAt`, `spec`, `status`                 |
| `run_tracks` | `runId`, `provider`, `trackId`: qué devolvió cada run             |
| `items`      | `runId`, `provider`, `trackId`, `status`, `errorKind`, `attempts` |
| `tracks`     | El `Track` normalizado (o referencia al archivo)                  |
| `robots`     | `host`, `rules`, `fetchedAt`                                      |
| `cursors`    | `runId`, `provider`, `cursor` — para reanudar paginación          |

**Idempotencia:** `(provider, trackId)` es único. Re-ejecutar un run no duplica ni re-descarga lo ya completo, salvo `--refresh`.

**Budget:** cada run tiene un tope (`--max-requests`, `--max-bytes`). Al excederse → `budget_exceeded` y cierre limpio con reporte. Sin esto, un loop roto te cuesta dinero real.

---

## Configuración

- Archivo `scrapeer.config.ts` (o `.json`) validado con **zod** al arrancar. Config inválida = falla al inicio, no a mitad del run.
- Claves del usuario **solo por env** (`SCRAPEER_YOUTUBE_API_KEY`), redactadas en logs, provenance y fixtures.
- `.env.example` completo, `.env` en `.gitignore`.
- **Nunca** credenciales en el repo (el original las pide hardcodeadas en cada script: error a no repetir).

---

## Observabilidad

| Señal            | Implementación                                              |
| ---------------- | ----------------------------------------------------------- |
| Logs             | `pino` estructurado, con `runId` y `provider` en cada línea |
| Métricas del run | items/min, éxito por provider, reintentos, `429`s           |
| Reporte          | JSON en v1.0 (`report <runId>`); HTML en v2                 |
| Trazas           | `trace` de Playwright en fallas (adjunto al reporte)        |

---

## Checklist del módulo

- [ ] Token bucket por host con tests de reloj falso
- [ ] Full jitter implementado y testeado (distribución, no valor exacto)
- [ ] `Retry-After` respetado
- [ ] Circuit breaker con los 3 estados
- [ ] `robots.txt` cacheado y respetado por defecto
- [ ] Ledger resumible (matar y retomar el proceso)
- [ ] Budget por run con cierre limpio
- [ ] Run report JSON
- [ ] Allowlist e IP validadas en cada redirect
- [ ] User-Agent identificable
