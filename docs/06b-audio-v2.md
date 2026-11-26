# 06b — Dataset de audio (v2, congelado)

> **Fuera de v1.0 (ADR-013).** Se conserva como diseño. Reabrirlo exige un ADR sobre derechos y almacenamiento.
> Los comandos y presets de este documento **no existen** en v1.0.

---

## Presets

Los tres "casos de uso" del repo original dejan de ser scripts y pasan a ser **presets de salida**. Misma recolección, distinta curación.

| Preset        | Filtros                                                     | Columnas extra     | Uso                           |
| ------------- | ----------------------------------------------------------- | ------------------ | ----------------------------- |
| `music-gen`   | `durationSec ≥ 30`, `allowDerivatives`, excluye spoken-word | `playsPerDay`      | Patrones musicales por género |
| `enhancement` | `durationSec ≥ 10`, cualquier licencia permitida            | `pair` (ver abajo) | Pares limpio/degradado        |
| `speech`      | `durationSec ≥ 300`, excluye música                         | `language?`        | Voz larga, podcasts, charlas  |

```bash
sonda export --preset music-gen --provider internet-archive --out ./ds
```

**Regla:** un preset **filtra y proyecta**, nunca recolecta distinto. Así el core sigue siendo uno.

---

## Pares limpio/degradado (el diferenciador real)

Para entrenar _audio enhancement_ necesitás pares `clean → degraded`. Nadie te los vende: **los generás vos**.

**Ojo con los derechos:** degradar localmente **no** da derechos sobre el audio de origen. Solo se puede partir de material propio, de dominio público o cuya licencia permita derivados (y uso comercial, si corresponde).

Receta con `ffmpeg` — aplicar 1–3 degradaciones por muestra:

| Degradación            | Filtro / comando                                  |
| ---------------------- | ------------------------------------------------- |
| Ruido blanco / rosa    | `anoisesrc` mezclado a −20 dB                     |
| Reverb                 | `aecho=0.8:0.9:1000:0.3`                          |
| Recorte de banda       | `highpass=f=200,lowpass=f=3400` (simula teléfono) |
| Compresión destructiva | `-b:a 64k` (mp3/aac) + re-decode                  |
| Clipping               | `volume=6dB,alimiter`                             |
| Dropouts               | `aselect` con cortes aleatorios                   |

Salida:

```
ds/
├─ clean/001.wav
├─ degraded/001_phone.mp3
├─ pairs.jsonl        # {clean, degraded, degradations: ["bandlimit","noise"], seed}
└─ manifest.json
```

**Reproducibilidad:** cada par guarda `seed`. Sin seed, el dataset no se puede regenerar y no sirve para research.

---

## Dedupe

Dos niveles, en este orden:

1. **Hash de contenido** (`sha256` de los bytes) → duplicados exactos.
2. **Huella acústica** (`fpcalc` / Chromaprint) → el mismo track en 320 kbps y 128 kbps tiene hashes distintos y huella **igual**.

El nivel 2 es lo que separa un dataset de un dump de carpetas. Comparación por distancia de Hamming con umbral configurable.

```
tracks.csv → [hash exacto] → [fingerprint] → dataset final
```

**Reportar siempre** cuántos duplicados se removieron y por qué nivel. Ese número va al manifest.
