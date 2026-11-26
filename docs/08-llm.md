# 08 — LLM en los bordes (v2)

> **Fuera de v1.0 (ADR-013).** Los providers de v1.0 son APIs: no hay selectores que reparar. Se conserva como diseño.

> **Regla: core determinista, bordes probabilísticos.**
> LLM donde el problema es **ambiguo**. Nunca donde es **determinista**.

Y la distinción que ordena todo:

|                      | Qué es                                                  | Veredicto            |
| -------------------- | ------------------------------------------------------- | -------------------- |
| **Agente afuera**    | Un agente (Claude, Cursor) usa el proyecto vía MCP      | ✅ Ya existe, gratis |
| **Agente adentro**   | El proyecto corre un loop autónomo que decide qué hacer | ❌ No construir      |
| **LLM como función** | Una llamada, un trabajo, salida verificable             | ✅ Sí                |

Construir un agente propio es reimplementar Claude, peor y con menos tools. Lo que aportás es **acceso a data real**, no razonamiento.

---

## Dónde sí tiene sentido

| Uso                                | Por qué es genuino                                                 | Riesgo                  |
| ---------------------------------- | ------------------------------------------------------------------ | ----------------------- |
| **Selector healing**               | El problema #1 del scraping: el DOM cambia y los selectores mueren | Medio                   |
| **Mapping de sitios desconocidos** | URL nueva → propuesta de mapeo al schema `Track`                   | Alto (sin verificación) |
| **Dedupe entre providers**         | "¿Este de Audius es el mismo que este de Bandcamp?"                | Bajo                    |
| **Etiquetado / curación**          | Género, idioma, music vs. podcast, riesgo de contenido             | Bajo                    |

---

## El patrón: **el LLM propone, el código verifica**

Nunca al revés. Ejemplo con el más valioso — **selector healing**:

```
1. Un fixture empieza a fallar (parse_failed)
2. El LLM ve: HTML nuevo + selector viejo + schema esperado + ejemplo de salida
3. Propone un selector nuevo (y el razonamiento)
4. VALIDACIÓN DETERMINISTA:
     - ¿extrae ≥ N items?
     - ¿campos obligatorios no vacíos?
     - ¿pasa el golden test?
5. Pasa  → diff + fixture nuevo, marcado para revisión humana
   Falla → se reporta como "requiere humano", sin tocar nada
```

**Nunca auto-commit. Nunca auto-merge.** El LLM abre una propuesta; un humano o un test la acepta.

---

## Dónde NO

| Anti-patrón                               | Por qué                                        |
| ----------------------------------------- | ---------------------------------------------- |
| LLM en el hot path de cada request        | Nondeterminístico, caro, lento, inauditable    |
| LLM para parsear JSON que ya es limpio    | Pagás tokens para degradar algo que funcionaba |
| LLM para decidir rate limits o reintentos | Eso es determinista y crítico                  |
| Agente autónomo sin gates                 | Costo descontrolado y abuso                    |
| LLM para "clasificar si el sitio cambió"  | Un `parse_failed` ya te lo dice                |

---

## Costo: cómo mantenerlo barato

| Estrategia                | Detalle                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| **Solo en la cola**       | El 95% es determinista. El LLM toca el 5% ambiguo.                  |
| **Tiering de modelos**    | Modelo barato por defecto; modelo caro solo en reintento de healing |
| **Local para desarrollo** | Ollama + modelo chico: el feature se puede demoear **sin costo**    |
| **Caché por hash**        | Mismo input (`rawHash` + selector) → misma respuesta, 0 tokens      |
| **Budget duro**           | `--max-llm-calls` por run. Al excederse: `budget_exceeded`          |
| **Batching**              | Etiquetar 50 tracks en una llamada, no 50 llamadas                  |

> El costo real de este feature es bajo **por diseño**: si necesitás un LLM por track, el diseño está mal.

---

## Eval (lo que hace que esto sea ingeniería y no una demo)

Sin medición, "el LLM arregló el selector" no significa nada.

**Harness:**

1. Tomar 20 fixtures que funcionan.
2. **Romperlos a propósito** (renombrar clases, envolver en `<div>`, cambiar atributos).
3. Correr el healing sobre cada uno.
4. Medir:

| Métrica              | Definición                                                          |
| -------------------- | ------------------------------------------------------------------- |
| **Fix rate**         | % de fixtures reparados y validados                                 |
| **False fix**        | % que "pasa" pero produce datos incorrectos ← **la más importante** |
| **Human escalation** | % correctamente marcado para revisión                               |
| **Costo**            | tokens y USD por fixture                                            |
| **Latencia**         | ms por intento                                                      |

**La métrica que importa es `false fix`.** Un healing que rompe datos en silencio es peor que no tener healing. Si `false fix > 0`, el feature no sale.

---

## Dónde va en el roadmap

**v2. Después de tener parsers HTML, fixtures y tests.**

Porque el test harness no es un extra: es la **precondición** del feature. Sin golden tests, no podés verificar el healing, y sin verificación el LLM es un generador de bugs plausibles.

Ese es el orden correcto y es, en sí mismo, la lección de ingeniería del proyecto.

---

## El argumento de portfolio

> _"Rompí 20 fixtures a propósito. El healing reparó X, marcó Y para revisión humana, 0 false fixes, USD Z por fixture."_ (completar solo con mediciones reales)

Ese número vale más que todo el resto del proyecto junto. Demuestra que sabés **poner un LLM en un sistema y medirlo** — que es exactamente lo que separa a alguien que integra APIs de alguien que hace ingeniería con modelos.

---

## Checklist

- [ ] LLM solo invocado desde un módulo `llm/` aislado (no desde providers)
- [ ] Toda salida del LLM validada por código antes de usarse
- [ ] Nunca auto-commit; siempre propuesta + diff
- [ ] Budget por run
- [ ] Caché por hash
- [ ] Eval con 20 fixtures rotos
- [ ] `false fix` medido y en 0
