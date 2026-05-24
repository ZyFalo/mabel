# Entrenamiento del Modelo Mabel-Gemma4-E4B — Índice Navegable

> **Estado**: alineado al 2026-05-24 · este doc es un **índice** al repo público externo.
> **Fuente de verdad**: [`github.com/ZyFalo/Gemma4-Mabel`](https://github.com/ZyFalo/Gemma4-Mabel) (repo SEPARADO de este monorepo).
> **Por qué externo**: el fine-tuning, evaluación y hosting Modal son un proyecto técnicamente independiente del backend/frontend Mabel-IA — ese repo se mantiene por su cuenta y este doc evita duplicar contenido (sin riesgo de drift).

---

## Para qué sirve este archivo

Este doc **no duplica** la documentación del repo Gemma4-Mabel. Es un **mapa navegable** para que la IA externa (read-only sobre este repo) sepa qué archivo del otro repo leer cuando le pregunten sobre:

- Cómo se eligió el modelo base (E4B vs 26B MoE vs Gemma 3 27B vs DeepSeek R1).
- Qué dataset y parámetros se usaron para el fine-tuning.
- Cómo se evaluó (rúbrica + batería + análisis ético).
- Cómo se hospedó en Modal.com.
- Cómo otros consumidores deben integrarse vía OpenAI-compat.

Cada link es **directo al raw GitHub** para que la IA lectora (si tiene acceso web) pueda fetcharlo sin navegar la UI.

---

## Resumen ejecutivo del modelo

- **Modelo base**: Google Gemma 4 E4B (elegido sobre 26B MoE, Gemma 3 27B, DeepSeek R1 vía evaluación empírica de 5 baselines — `20-justificacion-seleccion-modelo.md`).
- **Técnica de fine-tuning**: QLoRA con Unsloth.
- **Cuantización final**: GGUF Q4_K_M (~3.5 GB).
- **Scorecard post-fine-tuning**: **4.37/5 global (87.5%) · Crisis 100%** (`22-resultados-post-finetuning.md`).
- **Hosting**: Modal.com (NVIDIA T4 16 GB, scale-to-zero 5 min idle, cold start 60-90s) — `29-hosting-modal.md`.
- **API**: endpoint OpenAI-compat consumido por Mabel-IA backend vía `LLM_BASE_URL` env var (ver `docs/TECH_STACK.md` §5 + `docs/DEPLOY_RUNBOOK.md` §4).
- **Estado**: cerrado v1 (2026-05-20) — modelo entrenado, evaluado, desplegado, API pública estable.

---

## Mapa por temas

### 🎯 Overview + contexto

| # | Archivo | Descripción | Cuándo leerlo |
|---|---------|-------------|---------------|
| 01 | [`01-alcance.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/01-alcance.md) | Alcance, objetivos, exclusiones y marco ético del modelo | Para entender qué hace Mabel-Gemma4 y qué deliberadamente no hace |
| 20b ⭐ | [`20b-resumen-ejecutivo-tesis.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/20b-resumen-ejecutivo-tesis.md) | Resumen académico autocontenido para la tesis | Para una visión ejecutiva en 10KB |
| 26 ⭐ | [`26-memoria-proyecto.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/26-memoria-proyecto.md) | Narrativa de 7 capítulos para defensa de tesis | Para construir presentaciones o explicar el proyecto a no-técnicos |

### 🛠 Hardware + instalación

| # | Archivo | Descripción |
|---|---------|-------------|
| 02 | [`02-hardware.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/02-hardware.md) | Análisis del hardware disponible y decisiones técnicas (por qué T4, por qué QLoRA, etc.) |
| 11 | [`11-instalacion.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/11-instalacion.md) | Guía reproducible de instalación + setup local del repo Gemma4-Mabel |

### 🧪 Evaluación pre-training (selección de modelo base)

| # | Archivo | Descripción |
|---|---------|-------------|
| 12 | [`12-baseline-modelo-base.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/12-baseline-modelo-base.md) | Baseline del modelo BASE sin fine-tuning (comportamiento referencial) |
| 14 | [`14-comparativa-e4b-vs-26b.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/14-comparativa-e4b-vs-26b.md) | Gemma E4B vs 26B MoE (4 prompts comparativos) |
| 15 | [`15-bateria-evaluacion.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/15-bateria-evaluacion.md) | Batería de evaluación: 12 turnos + rúbrica detallada |
| 16 | [`16-analisis-etico-comparativo.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/16-analisis-etico-comparativo.md) | Análisis ético comparativo E4B vs 26B MoE (50KB — el más exhaustivo) |
| 18 | [`18-comparativa-triple-modelos.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/18-comparativa-triple-modelos.md) | E4B vs 26B MoE vs Gemma 3 27B |
| 19 | [`19-comparativa-deepseek-r1-vs-e4b.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/19-comparativa-deepseek-r1-vs-e4b.md) | DeepSeek R1 vs E4B — fallos críticos descubiertos |
| 20 | [`20-justificacion-seleccion-modelo.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/20-justificacion-seleccion-modelo.md) | **Decisión final**: justificación empírica de selección de E4B sobre los 5 candidatos |

### 🔬 Fine-tuning + dataset

| # | Archivo | Descripción |
|---|---------|-------------|
| 21 | [`21-parametros-entrenamiento.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/21-parametros-entrenamiento.md) | **Los 11 parámetros de entrenamiento con justificación** (LoRA rank, alpha, target modules, learning rate, etc.) |
| 23 ⭐ | [`23-bitacora-generacion-sintetica.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/23-bitacora-generacion-sintetica.md) | **Bitácora viva** del dataset sintético: 33 rondas de generación, conteos, decisiones, qué se aceptó y qué se rechazó (83KB — el más extenso) |
| 27 ⭐ | [`27-bitacora-entrenamiento.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/27-bitacora-entrenamiento.md) | **Bitácora técnica de entrenamiento**: fallo en GPU local → migración a RunPod → export GGUF final |

### ✅ Validación post-training

| # | Archivo | Descripción |
|---|---------|-------------|
| 22 ⭐ | [`22-resultados-post-finetuning.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/22-resultados-post-finetuning.md) | **Scorecard pre/post**: 4.37/5 global (87.5%), Crisis 100%. Este es el resultado citable en la tesis |
| 24 | [`24-validacion-cualitativa-sintetico.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/24-validacion-cualitativa-sintetico.md) | Validación cualitativa de 27 conversaciones sintéticas |
| 25 | [`25-validacion-cualitativa-crisis.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/25-validacion-cualitativa-crisis.md) | Validación de crisis (4 tipos A/B/C/D — protocolo SOS) |

### 🚀 Hosting + integración

| # | Archivo | Descripción |
|---|---------|-------------|
| 28 ⭐ | [`28-model-card-hf.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/28-model-card-hf.md) | **Model card de HuggingFace** (fuente única de verdad sobre el modelo) |
| 29 ⭐ | [`29-hosting-modal.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/29-hosting-modal.md) | **Hosting en Modal.com**: 8 bugs resueltos durante la implementación, endpoint OpenAI-compat |
| 30 ⭐ | [`30-guia-integracion-api.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/30-guia-integracion-api.md) | **Guía de integración** para consumidores externos (Mabel-IA backend la sigue) |

### 📋 Decisiones arquitectónicas

| # | Archivo | Descripción |
|---|---------|-------------|
| 03 | [`03-decisiones.md`](https://raw.githubusercontent.com/ZyFalo/Gemma4-Mabel/main/docs/03-decisiones.md) | **Registro cronológico de 21 ADRs** (Architectural Decision Records) — el más grande junto con 16 y 23 |

---

## Empezar por (según rol)

| Rol | Orden sugerido de lectura |
|---|---|
| **Tribunal de tesis** | 20b → 26 → 22 → 28 → 03 |
| **Dev que va a re-entrenar el modelo** | 02 → 11 → 21 → 27 → 22 |
| **Dev que integra Mabel-Gemma4 desde otra app** | 30 → 29 → 28 |
| **DPIA / análisis ético** | 16 → 25 → 22 |
| **Selección de modelo (replicar metodología)** | 20 → 12 → 14 → 18 → 19 → 16 |
| **Curaduría de dataset sintético** | 23 → 24 → 21 |

---

## Vínculos con este repo (Mabel-IA)

Cómo se conecta el modelo entrenado al backend de Mabel-IA:

- `backend/app/services/llm/openai_adapter.py` consume el endpoint de Modal vía OpenAI-compat (ver `30-guia-integracion-api.md`).
- `backend/app/services/llm/prompts.py:46-62` contiene el `MABEL_GEMMA4_SYSTEM_PROMPT` — debe ser **el mismo string** con el que se hizo el fine-tune (`21-parametros-entrenamiento.md` lo describe). NUNCA editar a la ligera (degrada safety + estilo).
- `backend/app/services/chat_service.py` inyecta el check-in en el **user turn**, no en el system, cuando `LLM_FLAVOR=mabel_gemma4` — esto es porque el system prompt del modelo está fijo en el fine-tune.
- `backend/app/services/llm/openai_adapter.py` implementa el cold-start retry (8×10s para 503 "Loading model") y transient retry (3× exponencial backoff para 429/502/504) — ambos calibrados al comportamiento de Modal documentado en `29-hosting-modal.md`.
- `LLM_BASE_URL` en producción apunta al endpoint Modal del modelo entrenado. Cambiarlo a otro proveedor OpenAI-compat funciona sin tocar código (D-17 en `docs/DECISIONES.md`).

---

## Cómo iterar este índice cuando el modelo se re-entrene

Cuando el repo `Gemma4-Mabel` reciba una v2 (re-entrenamiento, dataset nuevo, modelo base distinto, etc.):

1. Re-fetchear el README de `docs/` del repo:
   ```bash
   curl -s https://api.github.com/repos/ZyFalo/Gemma4-Mabel/contents/docs | jq '.[].name'
   ```
2. Comparar contra la tabla de este doc. Si hay archivos nuevos o renombrados, actualizar este índice.
3. Si el `MABEL_GEMMA4_SYSTEM_PROMPT` cambia, sincronizar `backend/app/services/llm/prompts.py:46-62` en este repo (y vice versa).
4. Si el endpoint Modal cambia, actualizar `LLM_BASE_URL` en Railway (ver `docs/DEPLOY_RUNBOOK.md` §4).
5. Si el scorecard post-fine-tuning cambia significativamente, actualizar `docs/AUDITORIA_MANUALES_2026-05-24.md` y el resumen ejecutivo de este doc.

---

## Drift entre los 2 repos

Este doc es la **única fuente de cross-references** entre los repos. Para detectar drift:

- `python scripts/verify_docs.py` (de este repo) NO verifica URLs externas. Solo verifica refs locales.
- Manualmente: si las URLs raw devuelven 404 al fetchearse, este índice está desactualizado.
- Un futuro `scripts/verify_external_docs.py` podría hacer un HEAD request a cada URL listada acá y reportar 404s. Pendiente.

---

## Referencias en este repo

- `docs/TECH_STACK.md` §5 — adapter pattern + Mabel-Gemma4 hospedado en Modal
- `docs/DECISIONES.md` D-17 — swap del adaptador LLM
- `docs/DECISIONES.md` D-18 — Mabel-Gemma4 en Modal.com
- `docs/FASES_IMPLEMENTACION.md` — commit `768b17d` (integración 2026-05-23)
- `docs/DEPLOY_RUNBOOK.md` §4 — pasos UI para configurar Modal endpoint en Railway
- `backend/app/services/llm/` — código del adapter + system prompts
