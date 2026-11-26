# 09 — Testing y CI

> El repo original tiene `"test": "exit 1"` y un badge de "build passing" sin CI. Esa es la razón por la que en 3 meses va a estar roto y nadie lo va a saber.
> **Los tests no son un extra: son lo que impide que el proyecto se pudra.**

---

## Regla de oro

**Los tests nunca tocan la red.** Corren contra **fixtures grabados** en el repo.

- Cero flakiness.
- Cero bloqueos en CI.
- Corren en < 5 s.
- Funcionan sin credenciales ni proxy.

---

## Fixtures

```
fixtures/
├─ deezer/            # track, playlist ordenada, track no disponible, búsqueda
├─ youtube/           # video, playlist paginada, video privado, cuota agotada, clave inválida
├─ licenses.csv       # valor crudo → License esperada
└─ urls.csv           # tabla de URLs para match()
```

Antes de versionarse, se eliminan credenciales, firmas y datos personales (por ejemplo, la `key` de YouTube en las URLs grabadas).

Cada fixture se graba **una vez** con un script (`pnpm fixtures:grab <url>`), se versiona, y se usa en todos los tests.

---

## Los cuatro tipos de test

| Tipo            | Qué verifica                       | Ejemplo                                                   |
| --------------- | ---------------------------------- | --------------------------------------------------------- |
| **Unit**        | Lógica pura                        | rate limiter con reloj falso; `match()` con tabla de URLs |
| **Contract**    | Provider: fixture → `Track` exacto | `deezer/playlist.json` → colección y sus tracks en orden  |
| **Golden**      | JSON normalizado no cambió         | snapshot del `Track` completo                             |
| **Integration** | Core + provider + ledger, sin red  | run completo sobre fixtures                               |

**El contract test es el más importante.** Es lo que convierte "agregar un provider" en un proceso mecánico y seguro: si el fixture produce el `Track` esperado, el provider funciona.

---

## Contract test — forma

```ts
it("resolves a Deezer playlist as an ordered collection", async () => {
  const body = readFixture("deezer/playlist-two-tracks.json");
  const result = await provider.resolve(url, ctxWith(body));

  expect(result.ok).toBe(true);
  if (!result.ok || result.value.kind !== "collection") {
    throw new Error("expected a collection");
  }

  const { collection, page } = result.value;
  expect(collection.type).toBe("playlist");
  expect(page.items).toHaveLength(2);
  expect(page.items.map((t) => t.collection?.position)).toEqual([1, 2]);
  expect(page.items[0]?.plays).toBeNull(); // Deezer does not expose plays
});
```

**Nunca** `toMatchSnapshot()` del HTML crudo: se rompe con cualquier cambio cosmético. Snapshot del **output normalizado**, no del input.

---

## Tests de error (los que casi nadie escribe)

Tan importantes como el happy path:

- [ ] `geo_blocked` → `Result` con `kind: 'geo_blocked'`
- [ ] Respuesta truncada → `parse_failed` (no excepción, no `"Unknown"`)
- [ ] Campo obligatorio faltante → `validation_failed`
- [ ] `429` → `rate_limited` con `retryAfter`
- [ ] Timeout → `timeout` tras los reintentos
- [ ] `robots.txt` disallow → `robots_disallowed`
- [ ] Redirect a un host o IP no permitidos → `host_not_allowed`
- [ ] Circuito abierto → `upstream_down`
- [ ] Fuente con `export: false` → `unsupported`

**Un parser que devuelve datos basura en silencio es peor que uno que falla.** Los tests de error son la garantía de que falla ruidosamente.

---

## CI

| Job      | Cuándo             | Qué hace                                                 |
| -------- | ------------------ | -------------------------------------------------------- |
| `test`   | cada push/PR       | unit + contract + golden, sin red                        |
| `lint`   | cada push/PR       | `oxlint --type-aware` + `oxfmt --check` + `tsc --noEmit` |
| `canary` | **semanal (cron)** | corre contra sitios reales, 1 request por provider       |
| `eval`   | al tocar `llm/`    | corre el harness de healing (v2)                         |

### El canary es el detalle que casi nadie tiene

Cada semana, un job golpea los sitios reales con **una** request por provider. Si un fixture ya no matchea → **abre un issue automático** con:

- provider afectado
- campo que falló
- `rawHash` de la respuesta nueva
- link al fixture viejo

Eso es _scraper maintenance_ de verdad. Un scraper sin canary es un scraper que ya está roto y no lo sabe.

---

## Cobertura

No perseguir un número global. Perseguir **cobertura de comportamiento**:

| Área                             | Objetivo                     |
| -------------------------------- | ---------------------------- |
| Core (rate limit, retry, ledger) | 90%+                         |
| Licencias y parsers de providers | 100% de los caminos de error |
| Adaptadores (CLI/MCP)            | smoke test por endpoint/tool |

---

## Checklist

- [ ] Todos los tests corren sin red
- [ ] Un fixture por provider, como mínimo
- [ ] Contract test por provider
- [ ] Golden del output normalizado (no del input)
- [ ] Tests de los errores tipados listados arriba
- [ ] `tsc --noEmit` en CI
- [ ] Canary semanal con issue automático
- [ ] `pnpm test` en < 5 s
