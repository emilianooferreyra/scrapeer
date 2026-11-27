# 11 — Riesgos, legal y ética

> Esta sección no es un disclaimer: es **diseño**. Un proyecto que sabe qué no hace es más creíble que uno que promete todo.

---

## El contexto legal, sin dramatismo

| Hecho                                                           | Implicancia                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Los ToS de la mayoría de las plataformas prohíben el scraping   | No es un delito per se en la mayoría de las jurisdicciones, pero sí un incumplimiento contractual |
| La metadata pública (título, artista, duración) es dato factual | Es la parte menos problemática                                                                    |
| El audio es una **obra protegida**                              | Descargarlo y redistribuirlo es donde el riesgo sube mucho                                        |
| Creative Commons no es un permiso universal                     | El CC de un track cubre la obra, no necesariamente samples ni la voz                              |
| `robots.txt` no es ley, pero es el estándar de la industria     | Ignorarlo es el argumento #1 en tu contra                                                         |

**Conclusión de diseño:** la v1.0 se queda en metadata + links. Eso **reduce** el riesgo, no lo elimina: los términos de cada API aplican también a la metadata (ADR-020). Nada de esto es asesoramiento legal.

---

## Decisiones que reducen el riesgo (ya tomadas)

| Decisión                                              | Efecto                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------- |
| Metadata + links por defecto                          | Sin redistribución de obras                                    |
| Audio fuera de v1.0                                   | No se descarga ni redistribuye                                 |
| `robots.txt` respetado en toda página web (ADR-024)   | Cumple el estándar; en APIs oficiales mandan sus términos      |
| Puerta de términos por provider                       | Export cerrado hasta revisarla                                 |
| User-Agent identificable, sin evasión                 | Coherente con lo que se declara                                |
| Rate limit + circuit breaker                          | No es abusivo por diseño                                       |
| Sin login / sin paywall                               | Solo data pública                                              |
| Provenance con licencia por track                     | Permite filtrar por uso permitido                              |
| Solo APIs oficiales, con claves del usuario (ADR-022) | Sin evasión; cada persona acepta los términos de su plataforma |
| Voice training **fuera** de alcance                   | Evita el riesgo más alto                                       |

---

## Fuera de alcance por riesgo (no por pereza)

| Caso                                   | Por qué                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| **Voice cloning de terceros**          | Consentimiento, derechos de imagen/voz, regulación creciente (EU AI Act y similares) |
| **Descargar audio o video de YouTube** | Prohibido por sus términos; YouTube entra solo como metadata por Data API            |
| **TikTok e Instagram**                 | Sin vía oficial abierta; solo se podrían scrapear evadiendo protecciones (ADR-022)   |
| **Contenido detrás de login**          | Rompe el modelo de "data pública" y agrava todo                                      |
| **Redistribuir catálogos completos**   | Convierte "scraping" en "espejo", que es el peor escenario                           |
| **Bypass de paywalls / DRM**           | Ilegal en muchas jurisdicciones                                                      |

---

## La sección de ética del README (copiar tal cual)

```markdown
## Responsible use

- Uses each platform's official API, with your own keys.
- Respects robots.txt for every web page; official APIs are used under their own documented terms and rate limits. Always identifies itself.
- Per-host rate limiting with jitter; no hammering.
- Metadata only; does not download audio.
- Does not sell data. MetaBrainz data (MusicBrainz, ListenBrainz) must not be resold.
- Export is disabled for sources whose terms do not clearly allow it.
- Does not bypass logins, paywalls, or DRM.
- Stores the declared license + provenance per track. A missing license is
  never treated as permission.
- No voice cloning; out of scope by design.

You are responsible for complying with each source's terms of service
and with the law in your jurisdiction. This tool is for research and
personal data work.
```

Esto, lejos de ser un disclaimer, es un **feature** y desactiva la mayoría de las críticas antes de que aparezcan.

---

## Riesgos abiertos

| Riesgo                                                         | Estado                                                           |
| -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Deezer, Spotify y SoundCloud prohíben exportar metadata        | Fuera de alcance mientras no cambien (ADR-024)                   |
| YouTube: datos guardados vencen a los 30 días                  | El manifest lleva la fecha de vencimiento                        |
| Proveedores posteriores (SoundCloud, Tidal, Spotify, Jamendo…) | Puerta antes de cada uno                                         |
| La licencia declarada puede ser incorrecta                     | Se conserva `raw` y se aclara que no es verificación de derechos |

---

## Riesgos técnicos y mitigaciones

| Riesgo                                                | Probabilidad | Impacto  | Mitigación                                                                      |
| ----------------------------------------------------- | ------------ | -------- | ------------------------------------------------------------------------------- |
| Un sitio cambia el markup y el parser devuelve basura | **Alta**     | Alto     | Validación zod + `parse_failed` ruidoso + canary semanal                        |
| Selectores frágiles (el pecado del repo original)     | Alta         | Alto     | Escalera de degradación; `match()` puro; tests de error                         |
| Bloqueo por IP                                        | Alta         | Medio    | Rate limit; si bloquea, se respeta                                              |
| Volumen de requests descontrolado                     | Media        | Alto     | Budget por run con cierre limpio                                                |
| El ledger se corrompe a mitad de run                  | Baja         | Medio    | Transacciones + reanudación idempotente                                         |
| **Prompt injection** vía contenido scrapeado          | Media        | **Alto** | Datos ≠ instrucciones; no re-emitir texto como instrucción; confirmación humana |
| **SSRF** en cualquier superficie                      | Media        | **Alto** | Validación en el transport, en cada salto                                       |
| Sobre-ingeniería temprana                             | **Alta**     | Medio    | Fase 1 acotada; no construir la capa de servicio hasta el 2.º adaptador         |
| Nunca publicar (scope creep)                          | **Alta**     | **Alto** | Regla: cada fase es publicable; ideas nuevas a `ideas.md`                       |

---

## Riesgos de proyecto (los que no son código)

| Riesgo                         | Mitigación                                              |
| ------------------------------ | ------------------------------------------------------- |
| "Todo" se vuelve infinito      | Alcance v1.0 cerrado ([`01-alcance.md`](01-alcance.md)) |
| Se pierde el foco en providers | Los providers son el eje barato; el core es el caro     |
| Se abandona a mitad            | Cada fase produce un post: hay retorno antes del final  |
| Expectativa de viralidad       | El ROI es el artefacto + el hábito, no los likes        |

---

## Si alguien pregunta por los ToS

Respuesta corta y honesta, en este orden:

1. **Qué hace:** metadata pública por APIs oficiales, no audio, respeta robots en páginas web, rate-limited.
2. **Qué no hace:** no bypassa logins, no redistribuye obras, no clona voces.
3. **Qué deja al usuario:** la responsabilidad de cumplir los términos de cada fuente.
4. **Qué es:** una herramienta de investigación y trabajo con datos propios.

No defenderse con "todo el mundo lo hace". Ese argumento pierde siempre.

---

## Checklist

- [ ] `robots.txt` respetado en páginas web; API oficial declarada con enlace a su documentación
- [ ] Sin descarga de audio
- [ ] Sin bypass de login/paywall/DRM
- [ ] Licencia + provenance por track
- [ ] Sección de ética en el README
- [ ] Allowlist en el transport
- [ ] Puerta de términos por provider
- [ ] Budget por run
- [ ] Voice training explícitamente fuera de alcance
