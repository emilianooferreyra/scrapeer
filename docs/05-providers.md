# 05 — Providers

> **v1.0 son dos: Deezer y YouTube.** Cada provider usa la vía oficial de su plataforma (ADR-022) y entra cuando pasa la puerta de términos **y** el checklist.

| #   | Provider    | Qué prueba                                               | Credencial          | Export              |
| --- | ----------- | -------------------------------------------------------- | ------------------- | ------------------- |
| 1   | **Deezer**  | Camino completo sin clave, playlists ordenadas, ISRC     | No para lecturas    | ⏳ Puerta pendiente |
| 2   | **YouTube** | Clave del usuario, cuota diaria, paginación, licencia CC | API key del usuario | ⏳ Puerta pendiente |

---

## Mapa de plataformas

Estado del acceso verificado el 2026-11-26. Cambia seguido: cada provider lo reconfirma en su puerta.

| Plataforma | Dificultad | Vía oficial                                                     | Qué exige al usuario                            | Plan             |
| ---------- | ---------- | --------------------------------------------------------------- | ----------------------------------------------- | ---------------- |
| Deezer     | 🟢 Fácil   | API pública de lectura                                          | Nada; uso comercial requiere acuerdo con Deezer | v1.0             |
| YouTube    | 🟢 Fácil   | Data API v3: 10.000 unidades/día; `playlistItems.list` cuesta 1 | API key de Google Cloud                         | v1.0             |
| SoundCloud | 🟡 Media   | API oficial con claves self-serve desde 2026-05                 | Cuenta **Artist Pro**                           | Después de v1.0  |
| Tidal      | 🟡 Media   | API JSON:API con credenciales de cliente                        | App en el portal de desarrolladores             | Después de v1.0  |
| Spotify    | 🟠 Molesta | Web API; el modo desarrollo exige Premium y limita usuarios     | App propia + Premium; **no expone plays**       | Después de v1.0  |
| Instagram  | 🔴 Fuera   | Solo cuentas profesionales, con revisión de Meta                | Cuenta de empresa + App Review                  | Fuera de alcance |
| TikTok     | 🔴 Fuera   | API de investigación solo para académicos sin fines de lucro    | No aplica                                       | Fuera de alcance |

## Puerta de términos (ADR-020)

Antes de **publicar** un provider, su página de docs registra:

- [ ] Enlace y fecha de los términos leídos en la **fuente primaria**
- [ ] Resultado de `robots.txt` para los hosts y rutas usados
- [ ] Uso permitido: personal, no comercial, comercial
- [ ] Caching y redistribución de metadata: ¿se permite el export?
- [ ] Atribución requerida y límites de uso
- [ ] Decisión: `export: true | false`

Un provider con `export: false` permite `resolve` y `search`, no guarda tracks en el ledger y el export lo rechaza con `unsupported`.

### Estado al 2026-11-26

| Fuente  | Verificado                                                                                                          | Falta                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Deezer  | La API pública permite lecturas sin clave; la FAQ para desarrolladores pide un acuerdo comercial para uso comercial | Términos de la API sobre export de metadata                     |
| YouTube | Cuota por defecto y costo por método en la documentación oficial                                                    | Términos de los servicios de API sobre guardar y exportar datos |

---

## Notas por provider

### Deezer

- Una playlist o un álbum resuelve a **colección**; el orden se conserva en `collection.position`.
- No expone plays: `plays` es `null`. El `rank` de Deezer va a `popularity`, nunca a `plays`.
- Expone `isrc`: es la clave para cruzar el mismo tema entre plataformas más adelante.
- No declara licencia por track: `license` es `null`.
- Tracks no disponibles en la región del usuario → `availability: 'geo_blocked'`.

### YouTube

- La clave viaja en la query (`key=`): se redacta en logs, provenance y fixtures.
- Una playlist pagina con `pageToken`; cada página consume cuota y se cuenta en el budget del run.
- `viewCount` va a `plays`. Videos privados o eliminados dentro de una playlist → `availability: 'unavailable'`.
- `status.license` = `creativeCommon` → `License` CC; `youtube` → `all-rights-reserved`. Confirmar el mapeo en la puerta.
- **Solo metadata.** Nunca se descarga audio ni video.

---

## Contrato

```ts
export const provider: Provider = {
  id: ProviderId.parse("deezer"),
  hosts: ["deezer.com", "www.deezer.com", "api.deezer.com", "link.deezer.com"],
  capabilities: new Set(["track", "collection", "search"]),
  policy: { export: false, reviewedAt: null, termsUrl: null },
  match(url) {
    /* puro, sin red */
  },
  async resolve(url, ctx) {
    /* → Result<Resource> */
  },
  async search(q, ctx) {
    /* → Result<Page<Track>> */
  },
};
```

| Requisito                    | Detalle                                   |
| ---------------------------- | ----------------------------------------- |
| `match` puro                 | Sin red. Se prueba con una tabla de URLs. |
| Sin red propia               | Usa un `Transport`, nunca `fetch`.        |
| `hosts` exactos              | Alimentan la allowlist del transport.     |
| `policy` cerrada por defecto | `export: false` hasta pasar la puerta.    |
| Salida validada              | zod antes de devolver.                    |

> Durante el desarrollo, el autor puede exportar localmente una fuente pendiente con `--allow-unreviewed`; queda registrado en el manifest. No aplica a una fuente ya revisada con `export: false`.

## Checklist: provider "done"

- [ ] Puerta de términos completa
- [ ] `match()` con URLs válidas, inválidas y de otros sitios
- [ ] `resolve()` de track y colección con fixture, sin red
- [ ] `search()` con paginación probada, si lo declara
- [ ] Contract test y golden test
- [ ] Errores mapeados a `ScrapeError`
- [ ] Rate limit del host configurado
- [ ] Fixtures sin credenciales ni datos personales
- [ ] Página de docs: soporta, no soporta, licencia, límites

---

## Providers posteriores

| Fuente                       | Qué agregaría                                  | Obstáculo conocido                                  |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| SoundCloud                   | El caso del tutorial original, por API oficial | Artist Pro; términos por revisar                    |
| Tidal                        | Catálogo con ISRC                              | Términos por revisar                                |
| Spotify                      | La plataforma más pedida                       | Modo desarrollo restringido; sin plays              |
| Audius                       | Licencia como texto libre, redirects           | Términos de la API por revisar                      |
| Internet Archive             | Licencias CC variadas, items de N archivos     | Términos y límites por revisar                      |
| Jamendo                      | Licencia por track                             | Términos: uso libre solo no comercial y sin caching |
| Bandcamp                     | HTML estático                                  | `robots.txt` bloquea `/search` y casi todo `/api/`  |
| Mixcloud, Discogs, Freesound | Contenido largo, releases, sonidos CC          | Términos por revisar                                |
