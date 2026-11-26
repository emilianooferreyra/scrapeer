# 12 — Portfolio y relato público

> El titular no es "un scraper de música". Es **"pegás un link de cualquier plataforma y obtenés la misma tabla, con la procedencia de cada dato"**.

---

## El relato

**Versión de una línea:**

> Cualquier link musical → la misma tabla, con procedencia. Para personas y agentes.

**Versión de un párrafo (para el README):**

> Scrapeer turns a playlist, album, or track link from any supported music platform into one clean table with the same columns everywhere. Every row carries its source, when it was fetched, and its declared license, if any. It runs on your machine with your own API keys, through official APIs only. The same core powers a local web UI, a CLI, and a local MCP server.

**Lo que NO es el relato:**

- ❌ "Un scraper de SoundCloud"
- ❌ "Un scraper con AI"
- ❌ "Mi proyecto con GPT"

---

## Los posts de v1.0

| Fase | Hook                                                                         |
| ---- | ---------------------------------------------------------------------------- |
| 1    | "De un link de playlist a un CSV, sin navegador ni proxies"                  |
| 2    | "Pegás un link y ves la tabla" (GIF)                                         |
| 3    | "MusicBrainz y YouTube con las mismas columnas: lo que no se puede comparar" |
| 4    | "Maté el proceso a mitad del run y no perdí nada"                            |
| 5    | "Mi agente pasa cualquier playlist a CSV"                                    |
| 6    | "v1.0, y por qué no hay TikTok ni Instagram"                                 |

**El orden importa:** cada post se apoya en el anterior. No hay reveal único; hay progreso visible.

---

## Los artefactos que hacen que te crean

| Artefacto                    | Por qué impresiona                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| **ADRs**                     | El 99% de los repos no documenta el _por qué_. Es lo que más se lee en una review seria. |
| **Diagrama de arquitectura** | Explica el sistema sin leer código                                                       |
| **`rejected.jsonl`**         | Muestra el criterio, no solo el resultado                                                |
| **GIF de 15 s del CLI**      | El demo humano                                                                           |
| **Snippet de MCP**           | El demo agente                                                                           |
| **Números**                  | Ver abajo                                                                                |
| **Sección de ética**         | Paradójicamente, te hace ver _más_ serio                                                 |

---

## Los números que hay que publicar

Un proyecto sin métricas es una anécdota. Estas son las que importan:

| Métrica                                          | Dónde             |
| ------------------------------------------------ | ----------------- |
| % de tracks con licencia declarada, por provider | Manifest + README |
| Items/min por provider                           | Run report        |
| Tasa de éxito por provider                       | Run report        |
| Descartes por motivo                             | Manifest          |
| Requests por 1k items                            | Run report        |
| Tiempo de un run de 500 items                    | README            |

Todo número publicado sale de un run real.

---

## Estructura del README del repo

```markdown
# Scrapeer

<una línea>

<GIF de 15 segundos>

## Quick start

1. npx ...
2. scrapeer resolve <url>
3. scrapeer export --run <runId> --allow-derivatives

## What it does / doesn't

(tabla: hace / no hace)

## Architecture

(diagrama + link a docs/adr)

## Providers

(tabla con capabilities y estado legal)

## MCP

(snippet de 6 líneas)

## Numbers

(las métricas de arriba)

## Responsible use

(la sección de ética)

## Docs

(link a docs/)
```

**El "Quick start" sin credenciales** es crítico: cualquiera debe poder verlo funcionar en 60 segundos con MusicBrainz.

---

## Qué mira un reviewer (y cómo satisfacerlo)

| Mira                        | Cómo se satisface                  |
| --------------------------- | ---------------------------------- |
| ¿Entiende qué hace en 10 s? | GIF + una línea                    |
| ¿Está bien abstraído?       | Diagrama + ADRs                    |
| ¿Está testeado?             | Fixtures + CI verde + canary       |
| ¿Piensa en el borde?        | Sección de ética + errores tipados |
| ¿Sabe medir?                | Números publicados                 |
| ¿Sabe priorizar?            | El roadmap por fases               |
| ¿Es AI-cargo-cult?          | ADR-010: el agente va afuera       |

---

## Los errores que arruinan un proyecto así

| Error                                   | Por qué mata                               |
| --------------------------------------- | ------------------------------------------ |
| "Scraper con AI" sin AI real            | Se huele. Resta credibilidad.              |
| 30 providers a medias                   | Demuestra lo contrario de lo que querés    |
| Sin tests                               | El repo muere en 3 meses                   |
| Sin demo                                | Nadie clona un repo para entenderlo        |
| Sin ADRs                                | Parece hecho a los apurones                |
| Prometer descarga de audio y no hacerla | Es exactamente el pecado del repo original |
| Optimizar para viralidad                | El ROI es el artefacto y el hábito         |

---

## Checklist de publicación

- [ ] README con GIF y quick start sin credenciales
- [ ] `docs/00-decisiones.md` con los ADRs
- [ ] Diagrama de arquitectura
- [ ] Tabla de providers con estado legal
- [ ] Sección de ética
- [ ] Números reales (no inventados)
- [ ] CI verde y badge que dice la verdad
- [ ] Licencia (MIT)
- [ ] `CONTRIBUTING.md` con el checklist de provider
