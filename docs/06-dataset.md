# 06 — Export de datasets

> Un export responde tres preguntas: **qué entró, qué quedó afuera y por qué.** El diseño de audio y presets vive en [`06b-audio-v2.md`](06b-audio-v2.md).

## Uso

```bash
scrapeer resolve https://musicbrainz.org/release/f5093c06-0000-4000-8000-000000000002   # crea un run
scrapeer export --run <runId> --min-duration 60 --out ./ds
```

`export` **no recolecta**: filtra y proyecta lo que un run ya guardó.

## Salidas

| Archivo          | Para qué                                                          |
| ---------------- | ----------------------------------------------------------------- |
| `tracks.jsonl`   | Referencia. Una línea = un `Track`                                |
| `tracks.csv`     | Vista para personas ([paridad](03-schema.md#paridad-de-formatos)) |
| `rejected.jsonl` | Cada descarte con su motivo                                       |
| `manifest.json`  | Filtros, conteos, licencias y versión                             |

## Filtros

| Flag                                | Conserva                                      |
| ----------------------------------- | --------------------------------------------- |
| `--allow-commercial`                | Licencias que permiten uso comercial          |
| `--allow-derivatives`               | Licencias que permiten derivados              |
| `--license by,by-sa`                | Códigos exactos                               |
| `--min-duration` / `--max-duration` | Rango en segundos; duración `null` se rechaza |
| `--provider`                        | Fuentes indicadas                             |
| `--available-only`                  | Tracks con `availability: 'available'`        |

Sin filtros de licencia se exporta todo, incluida la no declarada, y el manifest lo muestra. Con un filtro de licencia, lo no declarado se rechaza.

## Motivos de rechazo

`license_not_declared` · `not_available` · `license_not_allowed` · `commercial_not_allowed` · `derivatives_not_allowed` · `too_short` · `too_long` · `duration_unknown` · `duplicate` · `provider_not_selected` · `provider_export_disabled`

## Dedupe

v1.0 deduplica por identidad `(provider, id)`. **No** afirma que dos tracks de fuentes distintas sean el mismo: eso exige audio o matching difuso, ambos v2.

## Columnas derivadas

Se calculan al exportar y van al final, en ambos formatos:

| Columna                                                                              | Origen                                                                             |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `allowsCommercial`, `allowsDerivatives`, `requiresAttribution`, `requiresShareAlike` | Permisos de `License`                                                              |
| `playsPerDay`                                                                        | `plays` / días desde `publishedAt`, medido en `fetchedAt`; `null` si falta un dato |

## Idempotencia

Mismo run y mismos filtros → mismo contenido, con otro `datasetId` y `createdAt`. Un dataset nunca se sobrescribe.

## Checklist

- [ ] Paridad JSONL ↔ CSV por test
- [ ] Tabla completa de permisos por test
- [ ] Todo descarte figura en `rejected.jsonl`
- [ ] Ninguna fuente con `export: false` llega a la salida
- [ ] Protección contra inyección de fórmulas en CSV
