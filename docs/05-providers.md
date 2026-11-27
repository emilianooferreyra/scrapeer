# 05 — Providers

> **v1.0 son tres: MusicBrainz, ListenBrainz y YouTube (ADR-024, ADR-025).** Cada provider usa la vía oficial de su plataforma (ADR-022) y entra cuando pasa la puerta de términos **y** el checklist.

| #   | Provider         | Qué prueba                                                | Credencial          | Export                       |
| --- | ---------------- | --------------------------------------------------------- | ------------------- | ---------------------------- |
| 1   | **MusicBrainz**  | Camino completo sin clave, álbumes ordenados, varios ISRC | No                  | ✅ Datos principales (CC0)   |
| 2   | **ListenBrainz** | Playlists ordenadas con escuchas, sin clave               | No                  | ✅ Sin cobrar por los datos  |
| 3   | **YouTube**      | Clave del usuario, cuota diaria, paginación, licencia CC  | API key del usuario | ✅ Con vencimiento a 30 días |

---

## Mapa de plataformas

Estado del acceso verificado el 2026-11-26. Cambia seguido: cada provider lo reconfirma en su puerta.

| Plataforma   | Dificultad | Vía oficial                                                     | Qué exige al usuario                                                                   | Plan             |
| ------------ | ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------- |
| MusicBrainz  | 🟢 Fácil   | API `/ws/2`: 1 request/s, User-Agent con contacto               | Nada                                                                                   | v1.0             |
| ListenBrainz | 🟢 Fácil   | API `/1/`: 1 request/s, User-Agent con contacto                 | Nada                                                                                   | v1.0             |
| Audius       | 🔴 Fuera   | API pública                                                     | Sus términos prohíben extraer datos y guardarlos más allá de la sesión                 | Fuera (ADR-025)  |
| Deezer       | 🔴 Fuera   | API pública de lectura                                          | Sus términos prohíben exportar a una base de datos y el uso para IA                    | Fuera (ADR-024)  |
| YouTube      | 🟢 Fácil   | Data API v3: 10.000 unidades/día; `playlistItems.list` cuesta 1 | API key de Google Cloud                                                                | v1.0             |
| SoundCloud   | 🟡 Media   | API oficial con claves self-serve desde 2026-05                 | Cuenta **Artist Pro**; sus términos prohíben guardar en forma persistente              | Fuera (ADR-024)  |
| Tidal        | 🔴 Fuera   | API JSON:API con credenciales de cliente                        | Sus términos prohíben bases de datos, pasar datos a otro servicio y el uso con IA      | Fuera (ADR-026)  |
| TheAudioDB   | 🟢 Fácil   | API JSON: clave pública de prueba, 30 requests/min              | Clave propia para uso real                                                             | Después de v1.0  |
| Discogs      | 🟢 Fácil   | API `/database`: 25 requests/min sin clave                      | Nada; atribución "Data provided by Discogs."                                           | Después de v1.0  |
| iTunes       | 🟢 Fácil   | Search/Lookup API: ~20 requests/min                             | Nada; portadas y previews solo como URL                                                | Después de v1.0  |
| Beatport     | 🔴 Fuera   | API v4 solo para socios aprobados                               | Sus términos prohíben distribuir los datos                                             | Fuera (ADR-026)  |
| Spotify      | 🟠 Molesta | Web API; el modo desarrollo exige Premium y limita usuarios     | App propia + Premium; sus términos prohíben bases de datos y la metadata como producto | Fuera (ADR-024)  |
| Instagram    | 🔴 Fuera   | Solo cuentas profesionales, con revisión de Meta                | Cuenta de empresa + App Review                                                         | Fuera de alcance |
| TikTok       | 🔴 Fuera   | API de investigación solo para académicos sin fines de lucro    | No aplica                                                                              | Fuera de alcance |

## Puerta de términos (ADR-020)

Antes de **escribir** un provider, su página de docs registra (ADR-024):

- [ ] Enlace y fecha de los términos leídos en la **fuente primaria**
- [ ] Resultado de `robots.txt` para los hosts y rutas usados, y qué hosts son API oficial documentada (ADR-024)
- [ ] Uso permitido: personal, no comercial, comercial
- [ ] Caching y redistribución de metadata: ¿se permite el export?
- [ ] Atribución requerida y límites de uso
- [ ] Decisión: `export: true | false`

Un provider con `export: false` permite `resolve` y `search`, no guarda tracks en el ledger y el export lo rechaza con `unsupported`.

### Estado al 2026-11-26

| Fuente                      | Verificado                                                                                                                                                | Falta                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| MusicBrainz                 | Datos principales CC0; 1 request/s por IP; User-Agent `App/versión ( contacto )`; `robots.txt` bloquea `/ws`, pero la API está documentada para programas | Nada para la Fase 1                             |
| ListenBrainz                | Términos = contrato social y privacidad de MetaBrainz; factual en dominio público; prohibido cobrar por los datos; 1 request/s                            | Registro en el nivel sin costo para open source |
| YouTube                     | Uso comercial permitido; los datos guardados se borran o se refrescan a los 30 días; las credenciales no van en el código                                 | Atribución exigida por la plataforma            |
| Deezer, Spotify, SoundCloud | Sus términos prohíben exportar metadata                                                                                                                   | Fuera mientras no cambien                       |

---

## Notas por provider

### MusicBrainz

- Un `release` (álbum) resuelve a **colección** de tipo `album`; el orden se conserva en `collection.position`. Un `recording` resuelve a **track**. No hay playlists.
- **1 request/s por host** como máximo; arriba de eso responde 503 → `rate_limited`.
- El User-Agent lleva un contacto: `scrapeer/<versión> ( <url del repo> )`.
- La duración viene en milisegundos: `durationSec` se redondea al segundo; sin duración → `null`.
- Devuelve **varios ISRC** por grabación: van todos a `isrcs`.
- No expone plays ni popularidad: `plays` y `popularity` son `null`.
- La fecha del release puede ser parcial (`1973`, `1973-03`): solo una fecha completa llena `publishedAt`; si no, `null`.
- `license` es `null`: el CC0 cubre la metadata, no la obra.
- Tags y ratings son datos suplementarios CC BY-NC-SA: `tags` queda en `[]` en v1.0.

### ListenBrainz

- Un link de playlist resuelve a **colección** de tipo `playlist`, en orden (`GET /1/playlist/{mbid}`, formato JSPF).
- `plays` = `total_listen_count` de `POST /1/popularity/recording`, en lote por MBID: escuchas de usuarios de ListenBrainz, no globales.
- El `id` es el MBID de la grabación: cruza directo con MusicBrainz.
- Mismo límite y User-Agent que MusicBrainz: 1 request/s, contacto en el User-Agent; 429 → `rate_limited`.
- Un track sin MBID no tiene conteo: `plays` es `null`.

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
  id: ProviderId.parse("musicbrainz"),
  hosts: ["musicbrainz.org"],
  officialApi: [
    {
      host: "musicbrainz.org",
      pathPrefix: "/ws/2/",
      docsUrl: "https://musicbrainz.org/doc/MusicBrainz_API",
    },
  ],
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

| Requisito                    | Detalle                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `match` puro                 | Sin red. Se prueba con una tabla de URLs.                                                    |
| Sin red propia               | Usa un `Transport`, nunca `fetch`.                                                           |
| `hosts` exactos              | Alimentan la allowlist del transport.                                                        |
| `officialApi` con enlace     | Hosts y rutas de la API documentada: ahí el `robots.txt` se registra y no bloquea (ADR-024). |
| `policy` cerrada por defecto | `export: false` hasta pasar la puerta.                                                       |
| Salida validada              | zod antes de devolver.                                                                       |

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

| Fuente                       | Qué agregaría                                  | Condición (ADR-026)                                             |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| TheAudioDB                   | Biografías, portadas, datos de artista y álbum | Endpoints oficiales; citar la fuente de las portadas            |
| Discogs                      | Créditos, lanzamientos en físico, sellos       | Solo campos CC0; imágenes como URL; atribución en cada export   |
| iTunes                       | ISRC, fechas y portadas del catálogo de Apple  | Solo `/lookup`; portadas y previews como URL, nunca descargadas |
| Last.fm, Jamendo, Setlist.fm | Tags, música CC, setlists                      | Solo no comercial: falta un ADR para marcar esas filas          |
| Mixcloud                     | Sets y contenido largo                         | Solo no comercial; prohíbe el uso con IA                        |
| Internet Archive, Freesound  | Licencias CC variadas, sonidos CC              | Términos por revisar                                            |

**Fuera (ADR-024, ADR-025, ADR-026):** Deezer, Spotify, SoundCloud, Audius, Tidal, Beatport, Apple Music API, Genius, Qobuz, Bandcamp y 1001Tracklists.
