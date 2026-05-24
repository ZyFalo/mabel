# Sistema de Agentes — Mabel IA

> **Estado**: alineado al 2026-05-24
> **Fuente de verdad**: este archivo
> **Routing técnico Claude Code**: `.claude/agents/AGENT_*.md` (stubs delgados que apuntan acá; mantener su YAML frontmatter sincronizado con la sección 2 de este doc)
> **Reemplaza**: Notion "Sistema de Agentes" (obsoleta desde 2026-03-01) y el cuerpo de `.claude/agents/AGENT_*.md` (~70% obsoleto, mantienen solo el frontmatter para routing)

---

## 1. Resumen ejecutivo

Mabel IA opera con un equipo de **15 agentes especializados**, todos **activos** al 2026-05-24. El Agente 06 (ML/LLM Engineer) — diferido en el plan original de MVP — fue **reactivado** el 2026-05-23 tras la integración del modelo fine-tuneado **Mabel-Gemma4** vía Modal.com (commit `768b17d`). El equipo cubre el ciclo completo del MVP psicoeducativo de salud mental UMB: gobernanza de proyecto, arquitectura, datos, backend, frontend, voz, avatar, ML/LLM, calidad, infraestructura, seguridad emocional, ética/privacidad, investigación y documentación.

**Cambios estructurales clave desde el snapshot Notion 2026-03-01**:

- **Arquitectura LLM híbrida** (ya no "100% local"): adapter OpenAI-compatible por defecto (`OpenAICompatAdapter`) apuntando a Mabel-Gemma4 hospedado en Modal.com; `GeminiAdapter` legacy preservado como fallback.
- **15 tablas** en PostgreSQL 16 (subió desde 13 con `empathy_ratings` y `session_ratings`; `survey_responses` también activa). Esquema vive en `db/schema_postgresql.sql` y `backend/alembic/versions/006..012`.
- **Despliegue Railway + Modal**: Dockerfile multi-stage (frontend Vite + backend FastAPI sirviendo la SPA), servicio cron separado (`railway.cron.toml`) para retention L2.
- **Voice mode 2D animada** shipped (`Voice.tsx`, commit `e1db168`); avatar 3D (Fase 9) queda pendiente.
- **Brand-skin completo** (student + admin) con paleta `#A51916` / `#0F303A`.
- **Admin panel** con ciclo de vida completo, multi-select bulk actions, auditoría y métricas reactivas a `system_config`.
- **Workflow nuevo**: code-review high-effort obligatorio pre-commit grande; documentación viva en `docs/*.md` reemplaza Notion como referencia técnica corriente.

## 2. Tabla resumen de agentes

| ID | Rol | Estado | Prioridad | Skills primarios | MCPs principales |
|----|-----|--------|-----------|-------------------|-------------------|
| Ag.01 | Project Manager / Scrum Master | Activo | Crítico | `code-review`, `openspec:*` | Context7, Notion (READ) |
| Ag.02 | Software Architect | Activo | Crítico | `database-schema-designer`, `code-review` | Context7 |
| Ag.03 | Database Engineer | Activo | Crítico | `database-schema-designer` | Context7 |
| Ag.04 | Backend Developer | Activo | Crítico | `code-review`, `claude-api` | Context7 |
| Ag.05 | Frontend Developer | Activo | Crítico | `frontend-design`, `code-review` | Context7 |
| Ag.06 | ML/LLM Engineer | **Activo** (reactivado 2026-05-23) | Alta | `claude-api`, `code-review` | Context7 |
| Ag.07 | Voice Processing | Activo | Alta | `code-review` | Context7 |
| Ag.08 | Safety & Guardrails | Activo | Crítico | `code-review` | Context7 |
| Ag.09 | UX/UI Designer | Activo | Alta | `frontend-design` | Pencil (`.pen`), Figma, Context7 |
| Ag.10 | QA & Testing | Activo | Alta | `code-review`, `verify`, `run` | Context7 |
| Ag.11 | DevOps & Infrastructure | Activo | Alta | `deployment`, `code-review` | Context7 |
| Ag.12 | Ethics, Privacy & Compliance | Activo | Alta | `security-review`, `code-review` | Context7 |
| Ag.13 | Research & Analytics | Activo | Media | `database-schema-designer`, `code-review` | Context7 |
| Ag.14 | Documentation & Knowledge | Activo | Media | `init`, `code-review` | Context7 (Notion solo READ histórico) |
| Ag.15 | 3D & Avatar Engineer | Activo (2D shipped; 3D pendiente Fase 9) | Alta | `frontend-design`, `code-review` | Context7 |

> Convención: todos los agentes corren bajo el modelo `opus` de Claude Code. El YAML frontmatter de `.claude/agents/AGENT_*.md` es lo que el harness consulta para enrutar; cualquier cambio en columnas "Rol", "Skills" o "MCPs" debe replicarse en ese frontmatter.

## 3. Cadenas de dependencia clave

Las cinco cadenas validadas en Notion (2026-03-01) siguen vigentes con un ajuste: Ag.06 entra ahora en la cadena de cambio de modelo.

1. **Cambio de schema BD**: Ag.02 (decisión arquitectónica) → Ag.03 (diseño + migración) → Ag.04 (modelos ORM + repos) → Ag.10 (tests) → Ag.14 (doc) → Ag.01 (sign-off).
2. **Nueva HU / feature**: Ag.01 (priorización) → Ag.09 (UX) → Ag.02 (contrato API) → Ag.04 + Ag.05 (paralelo) → Ag.10 → Ag.14.
3. **Cambio de modelo o adapter LLM**: Ag.02 (ADR) → Ag.06 (fine-tune / hosting) → Ag.04 (adapter + factory) → Ag.08 (re-validar guardrails con el nuevo modelo) → Ag.10 → Ag.14.
4. **Crisis safety / SOS**: Ag.08 (detección + reglas) → Ag.04 (middleware + persistencia `safety_events`) → Ag.05 (UI overlay + SOS FAB) → Ag.12 (revisión legal y consent) → Ag.10.
5. **Release / Deploy**: Ag.11 (Railway + Modal + cron) → Ag.10 (smoke) → Ag.12 (DPIA refresh) → Ag.14 (release notes) → Ag.01 (anuncio).

## 4. Fichas individuales

> **Nota de numeración D-XX (importante)**: las citas "D-XX" dentro de las fichas siguientes (`Participación en decisiones (D-XX)`) son una **numeración heredada del snapshot Notion** de marzo 2026. Esa numeración cubre principalmente decisiones técnicas de infraestructura y se encuentra catalogada en §9.1 como **DT-01 a DT-13** (T por "Técnicas"). Para decisiones de producto/legal/UX (login unificado, SOS FAB, ARCO en preferencias, etc.) la **fuente canónica** vigente es `docs/DECISIONES.md` con su propio set D-01 a D-22. Cuando una ficha diga "Ag.X arbitró D-07 (SOS FAB)", el lector debe entender: tema "SOS FAB", catalogado hoy como **D-02 en DECISIONES.md** y referenciado también como **PO-2** (decisión del Product Owner 2026-02-23). La reconciliación completa de equivalencias está en §9.3.

> **Nota de Evoluciones BD (importante)**: las fichas citan "Evo 002 / 003 / 004 / 005 / 005b / 005c" como migraciones — son **labels narrativos del snapshot Notion**, NO archivos Alembic. Las migraciones Alembic reales empiezan en `08b6189ffc35_initial_schema_13_tables` (que consolida todo lo que esos labels describían) seguido de `006_*` … `012_*`. Listado completo en §9.4. Cualquier mención a `005b_*.py` o `005c_*.py` en estas fichas es un alias histórico — el cambio real vive en el initial migration.

### Ag.01 — Project Manager / Scrum Master

**Propósito.** Coordinar el ciclo de vida del proyecto, planificación de sprints, backlog (HU-01 … HU-17), priorización y desbloqueo cross-agente. Es el "Agente Orquestador".

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Crítico | `code-review`, `openspec:*` | Context7, Notion (READ) |

**Responsabilidades actuales**:
- Mantener el backlog y la matriz de fases (1–10 del MVP).
- Aplicar y custodiar los **workflow agreements** recientes:
  - `code-review-workflow` (2026-05-22): invocar skill `code-review` high-effort sobre staged changes antes de commits grandes.
  - `dev-prod-status` (2026-05-22): aceptar force-update local para schema durante pre-prod; migraciones Alembic formales se exigen al cortar release.
  - `everything-still-adjustable`: ninguna decisión previa es inmutable.
  - `admin-panel-doc`: cada fix del panel admin se refleja en `docs/ADMIN_PANEL.md`.
- Coordinar sign-off final de cada cadena (sección 3).
- Mediar entre agentes en discrepancias (ejecuta los 4 flujos de la sección 6).

**Participación en decisiones (D-XX)**: aprobador final de D-01 … D-15, y arbitro propuesto de D-16+ (brand-skin, swap LLM, cron L2).

**Participación en evoluciones**: orquesta sign-off de las evoluciones 002 … 012.

**Permisos / restricciones**: puede invocar a cualquier agente. NO toca código directamente; delega.

**Herramientas**: `openspec:*` (propose / continue / archive), `code-review`, `verify`, `schedule`.

**Interacciones**: input/output con todos. Acoplamiento más fuerte: Ag.02 (arq), Ag.10 (QA), Ag.14 (doc).

---

### Ag.02 — Software Architect

**Propósito.** Diseñar y mantener la arquitectura del sistema (FastAPI + React + PostgreSQL + capa LLM + voz). Define contratos API, ADRs, abstracciones (`LLMProvider`).

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Crítico | `database-schema-designer`, `code-review` | Context7 |

**Responsabilidades actuales**:
- **Arquitectura híbrida** (ya no "100% local"): mantener el contrato `LLMProvider(Protocol)` en `backend/app/services/llm/provider.py` y los dos adapters (`OpenAICompatAdapter` default + `GeminiAdapter` legacy).
- Custodiar ADRs nuevos:
  - ADR LLM swap (commit `768b17d`): elección de Mabel-Gemma4 + Modal.com.
  - ADR cron L2 redaction (commit `8adbb54`): servicio cron separado en Railway.
  - ADR brand-skin (commits `ca845f4` / `543f4b9`): paleta + token system v2.
- Mantener contratos OpenAPI (28 rutas en `routers/*`).
- Definir patrones (SSE streaming, guardrails pipeline pre/post, two-layer config `.env` vs `system_config`).

**Participación en D-XX**: arbitró D-04 (eliminar `consents.version`), participó en D-01 … D-15. Propone D-16+.

**Participación en evoluciones**: lead en 002, 003, 004, 005, 005b, 005c, 006, 007, 008, 009, 010, 011, 012.

**Permisos / restricciones**: ADRs y especificaciones. NO implementa endpoints (delega a Ag.04). Puede vetar decisiones de Ag.03 si rompen contratos cross-layer.

**Herramientas**: `database-schema-designer`, `code-review`, Context7 (consulta obligatoria antes de proponer libs nuevas).

**Interacciones**: pareja con Ag.03 (BD) y Ag.04 (backend). Consulta a Ag.06 (LLM) para decisiones de modelo. Reporta a Ag.01.

---

### Ag.03 — Database Engineer

**Propósito.** Diseñar y mantener el schema PostgreSQL 16, migraciones Alembic, índices y patrones de acceso (repos).

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Crítico | `database-schema-designer` | Context7 |

**Responsabilidades actuales**:
- **15 tablas** en producción (no 13): `users`, `consent_versions`, `consents`, `preferences`, `sessions`, `messages`, `message_reports`, `attachments`, `safety_events`, `password_reset_tokens`, `audit_logs`, `survey_responses`, `system_config`, `empathy_ratings`, `session_ratings`. El DDL `db/schema_postgresql.sql` está parcialmente desfasado (incluye 14; falta `session_ratings`) — pendiente sincronizar.
- Mantener migraciones Alembic 001 … 012:
  - 006 — research instrumentation (`users.cohort`, latencia split, `empathy_ratings`, `study_lock_enabled`).
  - 007 — conversión TIMESTAMPTZ.
  - 008 — `audit_logs.actor_id`.
  - 009 — greeting unique + `empathy_updated`.
  - 010 — `safety_keywords` legacy → estructura `{keyword, critical}`.
  - 011 — `session_ratings` (1-5 corazones, upsert por (session_id, user_id)).
  - 012 — `sessions.hidden_at` + `hidden_reason` (soft-hide para usuario).
- **Co-responsable del cron L2 redaction** (con Ag.11): query indexada por `created_at` que purga `payload.message_id` en `safety_events` viejos.
- Mantener D-14: hard DELETE directo (sin `deleted_at`) y SET NULL en `safety_events.user_id` (Evo 005b).

**Participación en D-XX**: arbitró D-02 (Postgres único motor), D-04, D-08 (UNIQUE re-aceptación), D-14 (hard DELETE).

**Participación en evoluciones**: lead en 002 … 012.

**Permisos / restricciones**: puede modificar `db/schema_postgresql.sql`, `backend/alembic/versions/*` y `backend/app/models/*`. Cambios de schema requieren skill `database-schema-designer`.

**Herramientas**: `database-schema-designer`, Alembic CLI, psql, Context7.

**Interacciones**: pareja con Ag.04 (modelos ORM + repos). Reporta a Ag.02. Coordina con Ag.11 para el cron service y con Ag.12 para retention.

---

### Ag.04 — Backend Developer

**Propósito.** Implementar el backend FastAPI: routers, services, repositories, middleware (JWT + consent), adapters LLM, integración voz.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Crítico | `code-review`, `claude-api` | Context7 |

**Responsabilidades actuales**:
- **Capa LLM**: por defecto `OpenAICompatAdapter` (no `GeminiAdapter` directo). Factory `get_llm_provider()` en `backend/app/services/llm/__init__.py` lee `LLM_PROVIDER` env. Default apunta a **Mabel-Gemma4** vía Modal.com (`LLM_BASE_URL`, `LLM_MODEL=mabel-gemma4`).
- ~75 endpoints REST en `backend/app/routers/*` (12 routers estudiante/sistema + 7 admin), incluido el endpoint SSE de chat (`session_router.py:send_message` línea 182 → `StreamingResponse(sse_generator(), media_type="text/event-stream")` con generador async que formatea events SSE a mano; no se usa `sse-starlette`).
- **Script cron L2 redaction**: `backend/scripts/redact_old_message_ids.py`, invocado por `railway.cron.toml` con `python -m scripts.redact_old_message_ids` (módulo, no script directo).
- Admin panel backend (commit `ffe1211`): full lifecycle de sesiones (list / hide / delete bulk), audit log con `actor_id` (Evo 008), multi-select bulk actions, métricas reactivas (`empathy_service`, `metrics_service`).
- Pipeline guardrails pre/post sobre cualquier adapter LLM.
- Lazy-create de sesiones (`ca845f4`): no se crea registro `sessions` hasta el primer mensaje confirmado.

**Participación en D-XX**: implementador de D-03 (masking PII en admin), D-05 (consent gating), D-10 (env vs `system_config`), D-11 (stateless con excepción attachments), D-13 (factory LLM).

**Participación en evoluciones**: implementador 002 … 012 (adapter repos, services, routers).

**Permisos / restricciones**: dueño de `backend/app/{routers,services,repositories,schemas,middleware}/*`. NO toca DDL ni modelos sin coordinar con Ag.03.

**Herramientas**: `code-review` high-effort sobre cualquier feature multi-archivo, `claude-api` para adapter LLM, Context7 obligatorio antes de tocar SDKs (openai, anthropic, pydantic v2, sqlalchemy 2.0, axios shapes).

**Interacciones**: pareja con Ag.05 (contratos API), Ag.03 (modelos), Ag.06 (model swap), Ag.08 (guardrails middleware).

---

### Ag.05 — Frontend Developer

**Propósito.** Construir la SPA React + Vite + TailwindCSS v4 (Zustand + React Router v6 + Axios). Páginas, layouts, stores, guards.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Crítico | `frontend-design`, `code-review` | Context7 |

**Responsabilidades actuales**:
- Brand-skin completo aplicado (commits `ca845f4`, `78952dd`, `01f5377`): student + admin con paleta `#A51916` / `#0F303A`.
- **3 capas UX wait** (commits `ee2d3ca` + `fd089b3`): comunicación progresiva del tiempo de espera del LLM (typing indicator → mensaje "tomando más de lo normal" → fallback con motivo y CTA).
- **Voice mode 2D** (`e1db168`): página `Voice.tsx` con avatar 2D Mabel animada + ASR/TTS integrados.
- Settings unificadas en modal (`543f4b9`): ARCO + Consentimiento en una sola tab.
- Lazy-create session desde frontend, sidebar collapse-toggle, banners danger en recovery UI.
- Stores: `authStore`, `chatStore`, `preferencesStore`, `toastStore`. Guards: `ProtectedRoute`, `ConsentGuard`, `OnboardingGuard`, `RoleGuard`.

**Participación en D-XX**: implementador de D-07 (SOS solo FAB), D-09 (sidebar 220px), D-15 (PWA estructura), D-12 (compliance UI persistence).

**Participación en evoluciones**: consumidor de cambios API en 006 … 012 (latency split visible en admin, hearts rating, soft-hide en sidebar).

**Permisos / restricciones**: dueño de `frontend/src/*`. Cualquier nueva pantalla pasa por skill `frontend-design`. Cambios de paleta o tokens requieren coordinación con Ag.09.

**Herramientas**: `frontend-design`, `code-review`, `verify`, `run`, Context7 (React Router internals, Zustand persist, axios interceptors).

**Interacciones**: pareja con Ag.04 (contratos API), Ag.09 (mockups y tokens), Ag.15 (Voice + futuro avatar 3D).

---

### Ag.06 — ML/LLM Engineer

**Propósito.** Mantener el modelo fine-tuneado **Mabel-Gemma4** (basado en Gemma) y su despliegue en **Modal.com**. Monitorear cold starts, throughput y calidad.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| **Activo** (reactivado 2026-05-23) | Alta | `claude-api`, `code-review` | Context7 |

**Cambio de estado**: en el plan original (Notion 2026-03-01) figuraba como "DIFERIDO Post-MVP". El 2026-05-23 (commit `768b17d`) el usuario integró Mabel-Gemma4 ya fine-tuneado y lo desplegó en Modal.com como endpoint OpenAI-compatible. **El modelo SÍ existe**; lo que sigue diferido es el ciclo de fine-tuning continuo (re-training periódico con datos pilotables).

**Responsabilidades actuales**:
- Mantener el modelo fine-tuneado y su versión (`LLM_MODEL=mabel-gemma4`).
- Hospedaje en **Modal.com**: gestionar el deployment, configurar warm pools, monitorear cold starts (mitigados con check-in en user turn, commit `768b17d`).
- Validar la calidad del modelo en términos de empatía (rúbrica 1-5) y safety (guardrails post-filter no flaggea outputs propios).
- Coordinar con Ag.04 cualquier breaking change en el contrato (modificaciones de `LLM_MODEL` o headers del endpoint).
- Mantener compatibilidad con el fallback `gemini_native` (`GeminiAdapter`) por si Modal cae.

**Participación en D-XX**: arbitró D-13 (factory pattern + dos adapters). Propone D-16 swap LLM como decisión formal.

**Participación en evoluciones**: no toca BD. Owner técnico del cambio LLM 2026-05-23.

**Permisos / restricciones**: NO toca código backend (delega a Ag.04). Owner del modelo y del endpoint Modal. Puede vetar deploys del backend si rompen contrato OpenAI-compat.

**Herramientas**: Modal CLI, `claude-api`, Context7 (OpenAI SDK shapes, reasoning tokens).

**Interacciones**: input de Ag.02 (ADR), output a Ag.04 (adapter). Coordinación con Ag.08 (re-validar guardrails con el nuevo modelo) y Ag.11 (DevOps del cron y health-checks).

---

### Ag.07 — Voice Processing

**Propósito.** Pipeline de voz completo: ASR (faster-whisper), TTS (Piper) y SER futuro (speechbrain).

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Alta | `code-review` | Context7 |

**Responsabilidades actuales**:
- ASR endpoint (`POST /asr/transcribe`) usando faster-whisper `base` (config `WHISPER_MODEL`).
- TTS endpoint (`GET /tts/synthesize`) con Piper, voz por defecto `es_ES-mls_9972-low`. Descarga del modelo Piper integrada al Dockerfile (commit `f68d88f`) + soft-lock en `Voice.tsx`.
- Soporte a UX: subtítulos auto-play + mute global; mic pulsante rojo en recording.
- Latencia split (`asr_latency_ms`, `tts_latency_ms`) registrada en `messages` (Evo 006) — colabora con Ag.13 para análisis.

**Participación en D-XX**: implementador del D-07/D-09 UX para voz.

**Participación en evoluciones**: consumidor de 006 (latency split).

**Permisos / restricciones**: dueño de `backend/app/services/{asr,tts}_service.py` y `frontend/src/hooks/{useAudioRecorder,useTts,useSubtitles}.ts`.

**Herramientas**: faster-whisper, Piper CLI, `scripts/setup-piper.sh`, Context7.

**Interacciones**: pareja con Ag.15 (Voice mode 2D y avatar futuro), Ag.05 (hooks), Ag.04 (endpoints REST).

---

### Ag.08 — Safety & Guardrails

**Propósito.** Diseñar e implementar todos los mecanismos de seguridad emocional: detección de riesgo, filtros de contenido, protocolo SOS, política de protección.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Crítico | `code-review` | Context7 |

**Responsabilidades actuales**:
- Pipeline pre-filter (input) → LLM → post-filter (output) sobre cualquier adapter (`OpenAICompatAdapter` o `GeminiAdapter`).
- Reglas y umbrales en `system_config` (`safety_keywords`, `sos_severity_threshold`, `guardrails_enabled`, `sos_hotline_numbers`).
- **Estructura nueva de `safety_keywords`** (Evo 010): `[{keyword, critical}]` con auto-SOS forzado en `critical=true`. Compat layer para DBs viejas mantenida en repo.
- Persistencia en `safety_events` (con `user_id` SET NULL post-hard DELETE, Evo 005b).
- Re-validación obligatoria cuando cambia el modelo LLM (coordina con Ag.06).

**Participación en D-XX**: arbitró D-06 (severity ladder), D-11 (hard DELETE no borra eventos), D-14 (SET NULL).

**Participación en evoluciones**: lead en 010 (keywords estructuradas).

**Permisos / restricciones**: dueño de `backend/app/services/guardrails_service.py` y reglas en `system_config`. Puede vetar cualquier deploy si el modelo nuevo no pasa la batería de prompts críticos.

**Herramientas**: `code-review`, Context7.

**Interacciones**: pareja con Ag.04 (middleware), Ag.06 (re-validación post-swap), Ag.12 (legal SOS), Ag.05 (UI overlay).

---

### Ag.09 — UX/UI Designer

**Propósito.** Interfaces empáticas y accesibles. Mockups (`Mockups/mockups.pen`), guías de interacción, sistema de tokens, accesibilidad (WCAG).

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Alta | `frontend-design` | Pencil (`.pen`), Figma, Context7 |

**Responsabilidades actuales**:
- **Brand-skin v2** aplicado: paleta `#A51916` (primary UMB), `#0F303A` (accent teal), `#DC2626` (danger), `#16A34A` (success), `#F59E0B` (warning).
- SOS FAB: 56px círculo blanco, borde `#DC2626` 2px, bottom-right (solo FAB, NO header — decisión PO).
- Sidebar 220px para ambos roles, 4 grupos temporales, variante "desactivado".
- TTS chat: auto-play + mute global; TTS avatar: solo mute. Subtítulos resaltados + mic pulsante rojo.
- Onboarding 3 pasos con mockup cada uno.
- Diseño del modo Voice 2D (input para Ag.15 / Ag.05).
- Filtros admin #28: buscador + estado + consentimiento + rango registro.

**Participación en D-XX**: arbitró D-07 (SOS FAB only), D-09 (sidebar 220px), D-12 (UI persist).

**Participación en evoluciones**: input visual para 006 (vistas admin de research), 011 (hearts rating), 012 (sidebar soft-hide).

**Permisos / restricciones**: dueño de `Mockups/mockups.pen`, tokens de TailwindCSS v4 (`frontend/src/index.css`) y guidelines de paleta. Cualquier UI nueva en frontend requiere skill `frontend-design` y consulta con Ag.09.

**Herramientas**: Pencil MCP (NO `Read`/`Grep` sobre `.pen`), Figma MCP, `frontend-design`, Context7.

**Interacciones**: input para Ag.05 (frontend), Ag.15 (avatar). Coordina con Ag.01 las discrepancias mockup-vs-Notion (25 resueltas).

---

### Ag.10 — QA & Testing

**Propósito.** Diseñar y ejecutar testing en todos los niveles: unit, integration, E2E, performance, security, accesibilidad. Owner de la suite Step 0 automatizada.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Alta | `code-review`, `verify`, `run` | Context7 |

**Responsabilidades actuales**:
- Validar cada feature contra criterios de éxito (SUS ≥ 70, empatía ≥ 4/5 en ≥ 80% casos, latencia mediana ≤ 20s, 0 violaciones críticas de guardrails).
- Smoke scripts en `backend/scripts/smoke_*.py` (admin bulk action, admin delete user, tokens capture).
- Verificación manual con skill `verify` y `run` sobre PRs de pre-deploy.
- Co-responsable con Ag.11 de validar Railway + Modal en entornos staging.

**Participación en D-XX**: validador de D-03, D-05, D-06, D-12 (todas las decisiones con criterio observable).

**Participación en evoluciones**: validador 006 … 012, especialmente migraciones idempotentes (010 con compat layer, 012 con índice parcial).

**Permisos / restricciones**: puede bloquear release si la suite falla. NO escribe código de producción.

**Herramientas**: pytest, Playwright (planeado), `verify`, `run`, `code-review`, Context7.

**Interacciones**: input de todos los agentes que producen código. Output a Ag.01 (sign-off).

---

### Ag.11 — DevOps & Infrastructure

**Propósito.** Containerización Docker, despliegue **Railway + Modal**, CI/CD (planeado), monitoreo, env management. **Ya no es "100% local"**.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Alta | `deployment`, `code-review` | Context7 |

**Responsabilidades actuales**:
- **Dockerfile multi-stage** (commit `7142445` + `f68d88f`): Stage 1 `node:20-alpine` build Vite con `VITE_API_URL=/api/v1`; Stage 2 `python:3.11-slim` runtime sirviendo API y SPA. Descarga del modelo Piper integrada.
- **Railway web service**: Dockerfile por defecto (no `railway.toml`), uvicorn como entrypoint.
- **Railway cron service** (`railway.cron.toml`, commit `8adbb54`): servicio separado, `cronSchedule = "0 3 * * *"` (22:00 Bogotá), `restartPolicyType = "NEVER"`, ejecuta `alembic upgrade head && python -m scripts.redact_old_message_ids`.
- **Modal.com**: hospeda Mabel-Gemma4 (coordinado con Ag.06).
- Gestión de env: `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `DATABASE_URL`, `JWT_SECRET`, etc.
- Soft-lock de Piper en `Voice.tsx` para evitar crash si el modelo no descargó.

**Participación en D-XX**: implementador de D-13 (env vs `system_config`), D-15 (PWA — pendiente). Propone D-17 cron L2 + D-18 Modal hosting como decisiones formales.

**Participación en evoluciones**: coordinador con Ag.03 para asegurar idempotencia de migraciones en producción.

**Permisos / restricciones**: dueño de `Dockerfile`, `docker-compose.yml`, `railway.cron.toml`, `.env.example`. NO modifica código de aplicación.

**Herramientas**: skill `deployment` (Railway), Docker CLI, Modal CLI, Context7.

**Interacciones**: pareja con Ag.06 (Modal), Ag.03 (cron L2), Ag.10 (smoke en staging), Ag.12 (DPIA al exponer endpoints).

---

### Ag.12 — Ethics, Privacy & Compliance

**Propósito.** Compliance con leyes colombianas (Ley 1581/2012 datos, Ley 1616/2013 salud mental, Resolución 8430/1993 investigación, Ley 1419/2010 telesalud) y estándares de ética en IA.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Alta | `security-review`, `code-review` | Context7 |

**Responsabilidades actuales**:
- Mantener `docs/DATA_RETENTION_POLICY.md` y la DPIA del proyecto.
- **D-14 hard DELETE directo** (Opción A) + **Evo 005b** (`safety_events.user_id` SET NULL para preservar eventos anónimos post-eliminación). **D-15** PWA.
- **Cron L2 redaction implementado** (NO más "post-MVP", commit `8adbb54`): purga `payload.message_id` en `safety_events` viejos. DPIA debe reflejar este L2 como control activo.
- Versionado de `consent_versions` (Evo 004) y re-aceptación via UPDATE sobre constraint `uq_consents_user_version` (D-08).
- Revisar masking PII en admin (D-03), consent gating (D-05), audit trail (`audit_logs.actor_id`, Evo 008).
- Validar identidad de marca: **nunca exponer "Gemini" ni "Gemma" al usuario**; Mabel IA es la única identidad.

**Participación en D-XX**: arbitró D-03, D-05, D-11, D-14, D-15.

**Participación en evoluciones**: lead narrativo en las decisiones que el snapshot Notion etiquetó como "Evo 004 / 005 / 005b / 005c" — todas consolidadas en el initial migration Alembic `08b6189ffc35` (ver §9.4 — esas labels nunca existieron como archivos `.py`). Validador del cron L2 de retención (D-21) implementado como script standalone (`backend/scripts/redact_old_message_ids.py` + `railway.cron.toml`), NO una migración Alembic.

**Permisos / restricciones**: puede bloquear release si DPIA detecta riesgo no mitigado. Dueño de los documentos legales.

**Herramientas**: `security-review`, `code-review`, Context7 (regulación).

**Interacciones**: pareja con Ag.03 (retention), Ag.04 (masking + audit), Ag.08 (SOS legal), Ag.11 (cron).

---

### Ag.13 — Research & Analytics

**Propósito.** Diseñar y ejecutar el estudio cuasi-experimental (pretest-posttest, 30 estudiantes). Métricas SUS, rúbrica de empatía, tamaño del efecto, reportes.

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Media | `database-schema-designer`, `code-review` | Context7 |

**Responsabilidades actuales**:
- Tablas owned: `survey_responses`, `empathy_ratings`, `session_ratings`, columnas `users.cohort` y `messages.{asr,llm,tts}_latency_ms` (Evo 006).
- `system_config.study_lock_enabled` para congelar cohorts durante el piloto.
- **Admin panel research views** (commit `ffe1211`): métricas reactivas, IC95 (t-Student) explícito, t-test vs Wilcoxon documentado, criterios inclusión/exclusión.
- Reportes desde la BD; coordinación con Ag.04 para queries agregadas.
- Mantener vivo el manual técnico y el capítulo de tesis con la doc admin (con Ag.14).

**Participación en D-XX**: input metodológico en D-06 (rúbrica empatía), D-12 (validez UI).

**Participación en evoluciones**: lead en 006 (research instrumentation), 011 (session ratings).

**Permisos / restricciones**: NO modifica modelos sin Ag.03. Owner del diseño experimental.

**Herramientas**: `database-schema-designer` para vistas/materialized, Python (pandas/scipy) para análisis, Context7.

**Interacciones**: pareja con Ag.03 (schema), Ag.04 (queries), Ag.09 (visualización admin), Ag.14 (reportes).

---

### Ag.14 — Documentation & Knowledge

**Propósito.** Mantener la documentación técnica, funcional y académica. **Workflow nuevo: docs vivos en repo, Notion solo para histórico.**

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo | Media | `init`, `code-review` | Context7 (Notion solo READ histórico) |

**Responsabilidades actuales**:
- **Repo como fuente de verdad** (cambio de política 2026-05-22 / 2026-05-24): `docs/*.md` reemplaza a Notion como referencia técnica corriente. Documentos vivos al 2026-05-24: `README.md`, `TECH_STACK.md`, `DB_SCHEMA.md`, `INTERFACES_MVP.md`, `AGENTES.md` (este), `DECISIONES.md`, `FASES_IMPLEMENTACION.md`, `ADMIN_PANEL.md`, `DATA_RETENTION_POLICY.md`, `AVATAR_3D_DECISION_TECNICA.md`, `AUDITORIA_MANUALES_2026-05-24.md`.
- **Regla post-2026-05-24**: cualquier PR de código debe incluir actualización de doc en el mismo PR (sección 6.5 del presente).
- Mantener `docs/ADMIN_PANEL.md` actualizado a cada fix del panel admin (memoria `admin-panel-doc`).
- Mantener `CLAUDE.md` y `docs/TECH_STACK.md` al día.
- Generar release notes y actualizar capítulo de tesis.

**Participación en D-XX**: cronista de todas. Propone D-19 "docs en repo" como decisión formal.

**Participación en evoluciones**: documenta 002 … 012 en repo. Notion queda como snapshot histórico solamente.

**Permisos / restricciones**: NO escribe en Notion (modo READ histórico). Puede modificar cualquier `.md` del repo.

**Herramientas**: `init` (CLAUDE.md), Context7, OpenSpec workflow (`openspec:*`).

**Interacciones**: consumidor de cambios de todos. Output a Ag.01, Ag.13 (tesis).

---

### Ag.15 — 3D & Avatar Engineer

**Propósito.** Avatar de Mabel: pipeline visual completo. **Estado actual: 2D shipped, 3D pendiente Fase 9.**

| Estado | Prioridad | Skills | MCPs |
|--------|-----------|--------|------|
| Activo (2D shipped; 3D pendiente Fase 9) | Alta | `frontend-design`, `code-review` | Context7 |

**Responsabilidades actuales**:
- **Modo voz 2D Mabel** shipped (commit `e1db168`): página `Voice.tsx` con avatar 2D animada sincronizada con TTS.
- Diseño y plan técnico del avatar 3D (Fase 9, documentado en `docs/AVATAR_3D_DECISION_TECNICA.md`): React Three Fiber + three-vrm (o alternativa), GLB/GLTF, blend shapes para visemes, lip sync con Piper TTS.
- Optimización de performance (FPS, cold-start del modelo 3D).
- Hand-off con Ag.07 (TTS / visemes) y Ag.05 (integración React).

**Participación en D-XX**: propone D-20 "avatar 3D Fase 9 vs Avatar 2D" como decisión formal (ya documentada en `AVATAR_3D_DECISION_TECNICA.md`).

**Participación en evoluciones**: ninguna BD por ahora (la 2D no requirió schema).

**Permisos / restricciones**: dueño de `frontend/src/pages/Voice.tsx` y de los assets de avatar.

**Herramientas**: `frontend-design`, Context7 (React Three Fiber, three-vrm).

**Interacciones**: pareja con Ag.05 (integración) y Ag.07 (lip sync con Piper).

## 5. Matriz de permisos

| Recurso | Read | Write | Delete | Aprobador |
|---------|------|-------|--------|-----------|
| `db/schema_postgresql.sql` | Todos | Ag.03 | Ag.03 + Ag.02 | Ag.02 |
| `backend/alembic/versions/*` | Todos | Ag.03, Ag.13 | Ag.03 + Ag.02 | Ag.02 |
| `backend/app/models/*` | Todos | Ag.03 + Ag.04 | Ag.03 + Ag.02 | Ag.02 |
| `backend/app/routers/*`, `services/*`, `repositories/*` | Todos | Ag.04 | Ag.04 + Ag.02 | Ag.02 |
| `backend/app/services/llm/*` | Todos | Ag.04 (adapters) + Ag.02 (Protocol) | Ag.02 | Ag.02 + Ag.06 |
| `backend/app/services/guardrails_service.py` | Todos | Ag.08 + Ag.04 | Ag.08 + Ag.02 | Ag.08 |
| `backend/app/services/{asr,tts}_service.py` | Todos | Ag.07 | Ag.07 + Ag.02 | Ag.07 |
| `frontend/src/*` | Todos | Ag.05 + Ag.15 (Voice) | Ag.05 + Ag.02 | Ag.05 + Ag.09 (UI) |
| `frontend/src/index.css` (tokens) | Todos | Ag.09 + Ag.05 | Ag.09 | Ag.09 |
| `Mockups/mockups.pen` | Todos | Ag.09 | Ag.09 + Ag.01 | Ag.09 |
| `Dockerfile`, `railway.cron.toml`, `docker-compose.yml` | Todos | Ag.11 | Ag.11 + Ag.02 | Ag.11 + Ag.02 |
| `backend/scripts/redact_old_message_ids.py` | Todos | Ag.04 + Ag.03 + Ag.12 | Ag.12 | Ag.12 |
| `docs/*.md` (excepto `ADMIN_PANEL.md`) | Todos | Ag.14 + autor del feature | Ag.14 | Ag.14 |
| `docs/ADMIN_PANEL.md` | Todos | Ag.04 + Ag.13 + Ag.14 | Ag.14 | Ag.01 |
| `docs/DATA_RETENTION_POLICY.md` | Todos | Ag.12 | Ag.12 | Ag.12 |
| `docs/AGENTES.md` (este archivo) | Todos | Ag.01 + Ag.14 | Ag.01 | Ag.01 |
| `.claude/agents/AGENT_*.md` (stubs + YAML) | Todos | Ag.01 + Ag.14 | Ag.01 | Ag.01 |
| Notion "Sistema de Agentes" | Todos | **Nadie** (snapshot histórico) | — | — |
| `.env` raíz | Ag.11 + Ag.02 | Ag.11 | Ag.11 | Ag.11 + Ag.02 |
| `system_config` (BD, runtime) | Todos vía admin panel | Ag.08 + Ag.13 + Ag.04 | Ag.04 + Ag.02 | Ag.02 |

> **Importante**: Ag.14 ya no escribe en Notion (deprecada). Cualquier mención al "Notion knowledge base" en stubs `.claude/agents/AGENT_14_*.md` debe leerse como obsoleta hasta la migración pendiente de stubs.

## 6. Flujos de colaboración

Los cuatro flujos originales del Notion siguen vigentes; se añade el **4.5** como regla post-2026-05-24.

### 6.1 Auditoría de consistencia

Disparador: hallazgo de discrepancia mockup / Notion / código.

Pasos:
1. **Ag.01** abre auditoría con el listado de hallazgos.
2. **Ag.02** (arquitectura), **Ag.03** (BD), **Ag.04** (backend) revisan cada uno desde su ángulo.
3. **Ag.09** y **Ag.13** validan UX y metodología si aplica.
4. **Ag.01** consolida en decisión EJECUTAR / PREGUNTAR PO.
5. **Ag.14** documenta el resultado en repo.

Histórico aplicable: 50 hallazgos (H-01 … H-50) en 9 auditorías acumuladas; 50 resueltos al 2026-03-01.

### 6.2 Evolución del esquema BD

Disparador: necesidad de añadir/modificar columna o tabla.

Pasos:
1. **Ag.02** evalúa impacto arquitectónico y abre ADR si es estructural.
2. **Ag.03** diseña migración Alembic + actualiza `db/schema_postgresql.sql` + modelos ORM.
3. **Ag.04** ajusta repos, schemas Pydantic, services.
4. **Ag.05** consume el cambio si afecta UI.
5. **Ag.10** corre suite de regresión.
6. **Ag.12** revisa si toca PII o consent.
7. **Ag.14** documenta `DB_SCHEMA_EVOLUTION_NNN.md`.

Histórico aplicable: evoluciones 002 … 012. La 005b/c son auditorías post-004; 010-012 son las más recientes (keywords estructuradas, session ratings, sessions.hidden_at).

### 6.3 Decisión técnica (D-XX)

Disparador: ambigüedad o trade-off que afecta más de un agente.

Pasos:
1. **Cualquier agente** propone la decisión con contexto.
2. **Ag.02** arbitra técnicamente; consulta a los agentes afectados.
3. **Ag.12** revisa si toca legal/ético; **Ag.01** prioriza si afecta cronograma.
4. **Decisión consensuada** o sube a PO si requiere alineación de producto.
5. **Ag.14** documenta como D-XX en este archivo (sección 9) y en `docs/` del feature.

Histórico aplicable: **D-01 … D-22 canonical** en `docs/DECISIONES.md` (D-01..D-15 base + D-16 brand-skin + D-17 swap LLM + D-18 Modal + D-19 lazy session + D-20 cold-start UX + D-21 cron L2 + D-22 docs viva en repo). Decisiones técnicas internas (stack, motor BD, factory LLM, etc.) catalogadas como **DT-01 … DT-13** en §9.1 de este doc.

### 6.4 Implementación (Sprint)

Disparador: HU priorizada por Ag.01.

Pasos:
1. **Ag.01** define alcance y criterios de aceptación.
2. **Ag.09** entrega mockup si es nueva pantalla (skill `frontend-design`).
3. **Ag.02** define contrato API si es nuevo endpoint.
4. **Ag.04 + Ag.05** implementan en paralelo respetando contratos.
5. **Pre-commit grande**: skill `code-review` high-effort (3 ángulos × 6 candidatos + verifiers con Context7 cuando aplique).
6. **Ag.10** valida; **Ag.14** documenta.

### 6.5 Documentación y código en el mismo PR (regla post-2026-05-24)

Disparador: cualquier PR que toque comportamiento observable.

Regla: **el PR debe incluir actualización de doc en el mismo commit/PR**. No se permite "lo documento después".

- Si el cambio afecta el admin panel → `docs/ADMIN_PANEL.md` se actualiza en el mismo PR (sección + fila "Historial de fixes").
- Si afecta retention / PII → `docs/DATA_RETENTION_POLICY.md`.
- Si afecta arquitectura o adapters → ADR en `docs/` y, si toca contratos LLM, también este `AGENTES.md` y los stubs `.claude/agents/AGENT_*.md`.
- Si afecta UI / paleta → tokens en `frontend/src/index.css` + nota en `docs/` del componente.
- Si afecta schema → `DB_SCHEMA_EVOLUTION_NNN.md` + `db/schema_postgresql.sql`.

**Aprobador**: Ag.14 valida; Ag.01 hace sign-off del PR.

## 7. Herramientas compartidas

### 7.1 MCPs

| MCP | Uso | Política |
|-----|-----|---------|
| **Context7** | Documentación viva de libs (React, FastAPI, SQLAlchemy 2.0, OpenAI SDK, Pydantic v2, axios, three-vrm…) | **Obligatorio** antes de escribir código que use cualquier lib. Reforzado por la convención de `CLAUDE.md`. |
| **Pencil** | Lectura/edición de `.pen` (Mockups) | Uso obligatorio para Ag.09. NUNCA usar `Read`/`Grep` sobre `.pen`. |
| **Figma** | Diseños complementarios | Opcional, Ag.09. |
| **Notion** | Sólo lectura histórica | **READ-only**. Cualquier escritura nueva va a `docs/` en el repo. Notion "Sistema de Agentes" queda como snapshot histórico — etiquetar como tal. |

### 7.2 Skills

| Skill | Cuándo | Por qué |
|-------|--------|---------|
| **`code-review`** (high-effort, 3 ángulos + verifiers) | **OBLIGATORIO** pre-commit grande (>3 archivos o feature multi-archivo) | Captura 9/10 bugs reales según telemetría 2026-05-22 (1 crítico prod, 3 UX confirmados, 5 plausibles relevantes). Cuando los verifiers validan librerías, deben consultar Context7. |
| **`database-schema-designer`** | Antes de modificar schema | Política de `CLAUDE.md`. |
| **`frontend-design`** | Antes de crear/modificar UI | Política de `CLAUDE.md`. |
| **`security-review`** | Pre-release, Ag.12 | DPIA y compliance. |
| **`verify`** + **`run`** | Validar fix en app real | Ag.10 y autor del fix. |
| **`init`** | Inicializar `CLAUDE.md` | Ag.14. |
| **`openspec:*`** (`new`, `apply`, `continue`, `archive`, `verify`, `sync`, `ff`, `propose`) | Workflow OpenSpec para changes formales | Ag.01 + Ag.14. |
| **`deployment`** | Railway lifecycle | Ag.11. |

## 8. Convenciones compartidas

- **Idioma**: contenido al usuario en español (Colombia). Identificadores y comentarios técnicos en inglés.
- **Auth**: PyJWT + bcrypt, JWT stateless. NO usar `python-jose`.
- **LLM — capa de abstracción**:
  - Contrato: `LLMProvider(Protocol)` en `backend/app/services/llm/provider.py`.
  - Default: `OpenAICompatAdapter` (`LLM_PROVIDER=openai_compat`) apuntando a **Mabel-Gemma4** en Modal.
  - Legacy fallback: `GeminiAdapter` (`LLM_PROVIDER=gemini_native`) con SDK nativo de Google.
  - Factory: `get_llm_provider()` en `backend/app/services/llm/__init__.py`.
  - Swap a otro modelo: editar `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` en `.env` y reiniciar backend. **Cero código tocado**.
- **Identidad Mabel IA**: NUNCA exponer "Google", "Gemini", "Gemma" ni cualquier modelo subyacente al usuario. La regla vive en `prompts.py:build_system_prompt`, upstream del adapter.
- **Documentación**: **regla "código + doc en el mismo PR"** (sección 6.5).
- **Code-review**: high-effort obligatorio en commits grandes; ver memoria `code-review-workflow`.
- **Schema en pre-prod**: force-update local válido; las migraciones formales son obligatorias al cortar release real (memoria `dev-prod-status`).
- **Adjustability**: ninguna decisión previa es inmutable (memoria `everything-still-adjustable`).
- **Datos sensibles**: hard DELETE directo (D-14); `safety_events.user_id` SET NULL para preservar agregados anónimos (Evo 005b).
- **Stateless**: backend stateless, excepción `attachments` (filesystem).

## 9. Historial de participación

### 9.1 Decisiones técnicas de infraestructura (DT-01 … DT-13)

> Estas decisiones fueron registradas en el snapshot Notion de marzo 2026 con la numeración heredada D-01 … D-15. Para evitar colisión con `docs/DECISIONES.md` (numeración canónica de producto/legal/UX), se renombran en este doc a **DT-XX** ("Decisiones Técnicas"). El mapeo histórico Notion-vs-actual está en §9.3. Estas decisiones cubren stack, persistencia, contratos internos y constraints — separadas de las decisiones de producto.

| DT | Tema | Estado | Owner | Equivalencia DECISIONES.md |
|----|------|--------|-------|---------------------------|
| DT-01 | Stack monorepo (FastAPI + React + Postgres) | Aprobada | Ag.02 | — (infraestructura base, no en lista product) |
| DT-02 | PostgreSQL único motor (dev y prod, sin SQLite) | Aprobada | Ag.03 | — |
| DT-03 | Masking PII en admin panel | Aprobada | Ag.12 | — (control transversal admin) |
| DT-04 | Eliminación `consents.version` (redundante con `consent_version_id`) | Aprobada | Ag.02 | — (refactor BD interno) |
| DT-05 | Consent gating en routers protegidos | Aprobada | Ag.12 | Relacionada con D-09 (consent scroll) |
| DT-06 | Severity ladder safety_events (1-5) + rúbrica empatía 1-5 | Aprobada | Ag.08 + Ag.13 | Relacionada con D-11 (instrumentos) |
| DT-07 | UNIQUE `uq_consents_user_version` para re-aceptación via UPDATE | Aprobada | Ag.03 | Relacionada con D-09 |
| DT-08 | Env vars vs `system_config` (two-layer config) | Aprobada | Ag.02 | — |
| DT-09 | UI persistence Compliance (Settings consent fetch) | Aprobada | Ag.05 + Ag.12 | Relacionada con D-05 (ARCO) |
| DT-10 | Factory pattern para LLM (dos adapters: OpenAICompat + Gemini fallback) | Aprobada | Ag.02 | Ver D-17 (swap default) |
| DT-11 | Hard DELETE directo MVP (Opción A) — sin grace period | Aprobada | Ag.12 + Ag.02 | **= D-14 en DECISIONES.md** |
| DT-12 | `safety_events.user_id` SET NULL para preservar eventos anónimos post-eliminación | Aprobada | Ag.12 + Ag.03 | **Parte de D-14** |
| DT-13 | PWA con `vite-plugin-pwa` (decisión registrada; implementación pendiente Fase 10) | 🟠 Decidida, no implementada | Ag.02 + Ag.05 | **= D-15 en DECISIONES.md** |

### 9.2 Decisiones de producto / legal / UX

La fuente canónica es **`docs/DECISIONES.md`** (D-01 a D-22). Esta tabla es solo un índice rápido:

| ID | Tema | Estado |
|----|------|--------|
| D-01 | Login unificado (estudiante + admin) | ✅ |
| D-02 | Panel SOS como FAB flotante (no ruta) | ✅ |
| D-03 | Recuperación de contraseña simplificada (manual en MVP) | 🟡 Parcial |
| D-04 | Recharts para gráficas admin | ✅ |
| D-05 | Derechos ARCO en Settings (no ruta) | ✅ |
| D-06 | Logs de auditoría en tabla separada | ✅ |
| D-07 | No chat tiempo real multi-usuario | ✅ (enforced) |
| D-08 | Empty states con acción sugerida | ✅ |
| D-09 | Consentimiento con scroll obligatorio | ✅ |
| D-10 | Tabla `password_reset_tokens` separada | ✅ |
| D-11 | Instrumentos SUS/Empatía administrados externamente | ✅ |
| D-12 | 3 interfaces adicionales (42 total) | ✅ |
| D-13 | Importación de resultados vía API | ✅ |
| D-14 | Hard DELETE de usuarios + safety_events SET NULL | ✅ (= DT-11 + DT-12) |
| D-15 | Mabel IA como PWA | 🟠 Decidida, no implementada (= DT-13) |
| D-16 | Brand-skin v2 aplicado a UI student + admin | ✅ |
| D-17 | Swap del adaptador LLM a OpenAI-compat (default) | ✅ |
| D-18 | Mabel-Gemma4 hospedada en Modal.com | ✅ |
| D-19 | Lazy session create (primer mensaje) | ✅ |
| D-20 | 3 capas UX para LLM cold start | ✅ |
| D-21 | Cron L2 de redacción de `message_id` | ✅ |
| D-22 | Documentación viva en repo, Notion como vitrina | ✅ |

Detalle completo (fecha, propuesto-por, motivación, impacto): `docs/DECISIONES.md`.

### 9.3 Mapeo histórico Notion → AGENTES.md actual

Para reconciliar referencias en docs antiguos / Notion snapshot:

| Notion (snapshot 2026-03-01) | AGENTES.md actual | DECISIONES.md actual |
|-----------------------------|-------------------|---------------------|
| D-01 Stack monorepo | DT-01 | — |
| D-02 PostgreSQL único motor | DT-02 | — |
| D-03 Masking PII | DT-03 | — |
| D-04 Eliminación consents.version | DT-04 | — |
| D-05 Consent gating | DT-05 | Relacionada D-09 |
| D-06 Severity ladder | DT-06 | Relacionada D-11 |
| D-07 SOS FAB (Notion) | — | D-02 (canonical) / PO-2 (PO list) |
| D-08 UNIQUE re-aceptación | DT-07 | — |
| D-09 Sidebar 220px (Notion) | — | PO-6 (PO list) |
| D-10 Env vs system_config | DT-08 | — |
| D-11 Hard DELETE no borra eventos | DT-12 | Parte de D-14 |
| D-12 UI persistence | DT-09 | — |
| D-13 Factory LLM | DT-10 | Relacionada D-17 |
| D-14 Hard DELETE directo | DT-11 | **D-14 (idéntica)** |
| D-15 PWA | DT-13 | **D-15 (idéntica)** |

Decisiones nuevas post-snapshot (no estaban en Notion 2026-03-01): D-16..D-22 son la extensión canónica registrada en `docs/DECISIONES.md`.

### 9.4 Evoluciones de schema (Alembic real)

> **Aclaración de numeración**: hay **dos sistemas en uso**: (a) el **filename Alembic** (ej. `007_timestamptz_conversion.py`), y (b) el **`[Evolucion N]` en docstring** dentro de cada migración (ej. `007_*` dice `[Evolucion 006]`). Difieren por +1 porque las evoluciones 002-005 históricas se consolidaron en el initial migration. Esta tabla usa el **filename** como fuente única.

| Archivo Alembic | Fecha | Tema | Owner |
|-----------------|-------|------|-------|
| `08b6189ffc35_initial_schema_13_tables.py` | 2026-03-07 | Initial schema consolidado (incluye lo que docs de marzo llamaban Evo 002-005c) | Ag.03 |
| `3c6f5125803d_seed_consent_version_active.py` | 2026-03-07 | Seed `consent_versions.active` v1.0 | Ag.03 + Ag.12 |
| `a1b2c3d4e5f6_seed_system_config_operational_keys.py` | 2026-03-07 | Seed 4 keys: `sos_hotline_numbers`, `safety_keywords`, `sos_severity_threshold`, `guardrails_enabled` | Ag.03 + Ag.08 |
| `006_research_instrumentation.py` | 2026-05-20 | `users.cohort`, latency split en messages, `empathy_ratings`, `study_lock_enabled` | Ag.13 + Ag.03 |
| `007_timestamptz_conversion.py` | 2026-05-22 | TIMESTAMPTZ universal (24 cols) — fix asyncpg offset-aware/naive | Ag.03 |
| `008_audit_logs_actor.py` | 2026-05-22 | `audit_logs.admin_id` → `actor_id` + `actor_role` (admin\|student\|system) | Ag.03 + Ag.04 |
| `009_greeting_unique_empathy_updated.py` | 2026-05-22 | `uq_messages_session_greeting` UNIQUE parcial + `empathy_ratings.updated_at` | Ag.03 + Ag.04 |
| `010_safety_keywords_structured.py` | 2026-05-23 | `safety_keywords` shape: `string[]` → `[{keyword, critical}]` (idempotente) | Ag.08 + Ag.03 |
| `011_session_ratings.py` | 2026-05-23 | Tabla nueva `session_ratings` (1-5 corazones, upsert idempotente) | Ag.13 + Ag.03 |
| `012_sessions_hidden.py` | 2026-05-23 | `sessions.hidden_at` + `hidden_reason` + índice parcial `idx_sessions_user_visible` | Ag.03 + Ag.12 |

**Total**: 10 archivos en `backend/alembic/versions/` al 2026-05-24 (1 initial + 2 seeds + 7 evolutivas 006-012).

> **Drift detectado** (registrado en DR-03 de §10): `db/schema_postgresql.sql` declara 14 `CREATE TABLE` y omite `session_ratings` (Evo 011) y las columnas `sessions.hidden_at` / `hidden_reason` (Evo 012). El DDL declarativo debe regenerarse vía `pg_dump --schema-only` post `alembic upgrade head` para volver a ser fuente humana confiable.

**Sobre las "Evo 002…005c" antiguas**: aparecían en el snapshot Notion como migraciones separadas pero NUNCA fueron archivos Alembic — son labels narrativos que describen pasos del diseño consolidados en el initial migration. Las menciones residuales en docs (`DECISIONES.md` D-14 "Evo 005c", memorias antiguas) deben leerse como "consolidado en el initial migration".

## 10. Drift residual / pendientes

### Cerrados en migración Notion → docs/ (2026-05-24, commit `4546308`)

| ID | Pendiente original | Resolución |
|----|--------------------|-----------|
| DR-01 | Recortar stubs `.claude/agents/AGENT_*.md` a 1-liner | ✅ 15/15 stubs trimmed, YAML frontmatter preservado para routing |
| DR-02 | Etiquetar Notion como snapshot histórico | ✅ Política D-22 formalizada en `DECISIONES.md`; Notion explícitamente deprecada como referencia técnica viva |
| DR-04 | Stubs AGENT_03 dicen "8-table schema" / "Gemini directo" | ✅ Descriptions del YAML corregidas al estado real ("15-table schema", "OpenAI-compatible adapter") |
| DR-05 | Stubs AGENT_06/11 dicen "100% local" / "DIFERIDO" | ✅ AGENT_06 reactivado en YAML ("Owns Mabel-Gemma4 fine-tune..."), AGENT_11 actualizado ("Railway production deploy + Modal LLM") |
| DR-06 | Stubs AGENT_14 dicen "Notion knowledge base" | ✅ Actualizado a "docs/*.md (canonical source) + Notion (snapshots históricos)" |
| DR-07 | Formalizar D-16..D-20 como decisiones canónicas | ✅ Formalizadas como D-16..D-22 en `DECISIONES.md` §3; equivalencias en §9.3 de este doc |

### Pendientes abiertos (al 2026-05-24)

| ID | Pendiente | Owner | Prioridad |
|----|-----------|-------|-----------|
| DR-03 | `db/schema_postgresql.sql` declara 14 tablas; falta `session_ratings` (Evo 011) y columnas `sessions.hidden_at/hidden_reason` (Evo 012). Regenerar vía `pg_dump --schema-only` post `alembic upgrade head`. | Ag.03 | Media |
| DR-08 | Re-verificar idempotencia de toda la cadena Alembic (initial → 012) sobre BD limpia antes de cortar release a producción real. La memoria `dev-prod-status` aceptó force-update durante pre-prod, pero el deploy real requiere validación. | Ag.03 + Ag.10 | Alta antes del piloto |
| DR-09 | DPIA debe actualizarse incorporando el cron L2 redaction (D-21) como control activo. Hoy el DPIA pre-existente no lo refleja. | Ag.12 | Alta |
| DR-10 | Avatar 3D (Fase 9) sigue pendiente. `docs/AVATAR_3D_DECISION_TECNICA.md` se preserva como spec vivo para cuando se ejecute. MVP usa sustituto 2D en `Voice.tsx` + `MabelAvatar.tsx`. | Ag.15 | Media |
| DR-11 | Constraint duplicada potencial: el modelo SQLAlchemy declara `audit_logs_actor_role_check` mientras la migración 008 crea `chk_audit_logs_actor_role`. Verificar con `\d audit_logs` post-deploy; alinear naming. | Ag.03 | Media |
| DR-12 | PWA (D-15 = DT-13): decisión registrada pero `vite-plugin-pwa` NO instalado en `frontend/package.json`. Implementar en Fase 10. | Ag.05 + Ag.02 | Media (Fase 10) |
| DR-13 | numpy es importado por `backend/app/services/admin/metrics_service.py` pero NO declarado en `backend/requirements.txt` — viene transitivo vía scipy. Riesgo si scipy cambia su dep tree. Añadir numpy explícito. | Ag.04 + Ag.11 | Baja |
| DR-14 | `empathy_rating.py:34` (modelo SQLAlchemy) tiene un comentario "[Evolución 008]" cuando el cambio realmente vive en migración `009_greeting_unique_empathy_updated`. Bug menor de doc-en-código. | Ag.03 | Baja |
| DR-15 | Hallazgos pendientes del audit de manuales `.docx` (`docs/AUDITORIA_MANUALES_2026-05-24.md` §Pendientes): 8 items que requieren decisión del PO o intervención manual (no auto-aplicables). | Ag.14 + PO | Media (post-tribunal) |

---

**Última actualización**: 2026-05-24
**Mantenedores**: Ag.01 (PM) + Ag.14 (Doc). Cambios estructurales requieren sign-off de Ag.01.
