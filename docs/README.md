# Scrapeer — de cualquier link musical a una tabla

> **Nombre:** `scrapeer`. Binario y paquete de npm con el mismo nombre.

Este directorio contiene el **diseño completo** de una herramienta open source (MIT) de metadata musical multi-plataforma. Nace del tutorial de Decodo ([video](https://www.youtube.com/watch?v=BMgrLd-U4k0), [repo](https://github.com/Decodo/soundcloud-scraper)) que pasa una playlist de SoundCloud a CSV, y lo rehace bien y para varias plataformas.

**Qué es, en una frase:**

> Pegás un link de cualquier plataforma musical y obtenés una tabla limpia, con las mismas columnas siempre y la procedencia de cada dato, exportable a CSV.

**Qué NO es:** un producto de AI ni un servicio. Es una herramienta que corre en tu máquina, con tus claves, y **que la AI puede usar** vía MCP.

**Estado:** alcance v1.0 = MusicBrainz + YouTube, UI local + CLI + MCP (ADR-021, ADR-024), schema abierto hasta cerrar la Fase 3, implementación no iniciada. Este directorio es la fuente de verdad hasta que exista código.

---

## Camino rápido de lectura

Si tenés 10 minutos y querés entender el proyecto:

1. [`01-alcance.md`](01-alcance.md) — qué entra y qué no. **Empezá acá.**
2. [`05-providers.md`](05-providers.md) — qué plataformas, qué tan difícil es cada una y en qué orden.
3. [`02-arquitectura.md`](02-arquitectura.md) — la decisión central: `Provider × Transport`.
4. [`10-roadmap.md`](10-roadmap.md) — en qué orden se construye y qué se publica.

Si vas a implementar: leé en orden. Si vas a revisar: `00-decisiones.md` + `03-schema.md`.

---

## Índice

| #   | Documento                                    | Para qué sirve                                            |
| --- | -------------------------------------------- | --------------------------------------------------------- |
| 00  | [`00-decisiones.md`](00-decisiones.md)       | Registro de decisiones (ADRs). El _por qué_ de todo.      |
| 01  | [`01-alcance.md`](01-alcance.md)             | Definición cerrada de "todo" v1.0. In / out of scope.     |
| 02  | [`02-arquitectura.md`](02-arquitectura.md)   | Ejes Provider × Transport, interfaces, layout del repo.   |
| 03  | [`03-schema.md`](03-schema.md)               | `Track` canónico, `Result`, taxonomía de errores.         |
| 04  | [`04-pipeline.md`](04-pipeline.md)           | Rate limiting, jitter, backoff, robots, ledger resumable. |
| 05  | [`05-providers.md`](05-providers.md)         | Mapa de plataformas, orden, contrato y checklist.         |
| 06  | [`06-dataset.md`](06-dataset.md)             | Export, filtros por licencia, descartes.                  |
| 06b | [`06b-audio-v2.md`](06b-audio-v2.md)         | Audio y presets. **v2, congelado.**                       |
| 07  | [`07-superficies.md`](07-superficies.md)     | UI local, CLI y MCP (v1.0); REST pública (v2).            |
| 08  | [`08-llm.md`](08-llm.md)                     | LLM en los bordes. **v2.**                                |
| 09  | [`09-testing.md`](09-testing.md)             | Fixtures, contract tests, golden tests, CI canary.        |
| 10  | [`10-roadmap.md`](10-roadmap.md)             | 6 fases hasta v1.0.                                       |
| 11  | [`11-riesgos-legal.md`](11-riesgos-legal.md) | Legal, ética, riesgos técnicos y mitigaciones.            |
| 12  | [`12-portfolio.md`](12-portfolio.md)         | Cómo se presenta esto: relato, posts, demos, métricas.    |
| —   | [`glosario.md`](glosario.md)                 | Jitter, thundering herd, provenance, golden test, etc.    |

---

## Convenciones de estos documentos

- **Idioma:** español. El README público del repo final va en inglés.
- **Formato:** decisión primero, contexto después. Tablas sobre prosa.
- **Los ADRs son inmutables.** Si una decisión cambia, se agrega un ADR nuevo que supersede al anterior. No se reescribe la historia.
- **Los números son estimaciones**, marcadas como tal. No son compromisos.
- **Ningún documento asume código existente.** Todo se puede implementar desde cero con lo que está escrito acá.

---

## Próximos pasos

1. `git init` en la raíz del proyecto.
2. Crear un `README.md` de proyecto en inglés al llegar a la Fase 6.
3. Empezar por la **Fase 1** del [`10-roadmap.md`](10-roadmap.md) — rebanada vertical con MusicBrainz.

> Este directorio no modifica nada de `ampli-backend` / `ampli-web`. Es independiente a propósito: el proyecto es standalone, y el schema se diseña para poder integrarse a Amplified más adelante sin acoplamiento.
