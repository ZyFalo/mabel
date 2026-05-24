# Decisiones del Proyecto — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `4d124e2`
> **Fuente de verdad**: este archivo + `MEMORY.md` (auto-memoria del proyecto)
> **Reemplaza**: la sección "Parte G — Decisiones" de Notion "Interfaces MVP" (congelada en D-15) y el bloque de discrepancias del PO disperso en memorias.

Este documento consolida **todas las decisiones técnicas, de producto y de proceso** que rigen al proyecto Mabel IA. Está organizado en cuatro bloques cronológicos:

1. **Decisiones canónicas D-01 a D-15** — Decisiones de producto / legal / UX. Esta es la numeración **oficial actual**; no confundir con la "D-XX del snapshot Notion 2026-03" que aparece en `docs/AGENTES.md` §9.1 como **DT-XX** ("Decisiones Técnicas") y cubre infraestructura (stack, motor BD, constraints internos). Ambas listas son válidas y complementarias; el mapeo histórico está en `docs/AGENTES.md` §9.3.
2. **Decisiones del Product Owner 2026-02-23 (PO-1 a PO-25)** — Discrepancias resueltas en sesión PO entre mockups y especificación. Ejemplos como "SOS solo FAB" (PO-2) y "Sidebar 220px" (PO-6) son decisiones PO; en docs antiguos a veces aparecían numeradas como D-07 / D-09 — usar `PO-N` para evitar colisión.
3. **Decisiones post-MVP (D-16 a D-22)** — Decisiones tomadas durante la implementación (mayo 2026). Esta numeración es **canónica y formal**, no "propuesta".
4. **Workflow agreements** — Acuerdos de proceso que no son decisiones técnicas pero rigen cómo el equipo trabaja.

Cada decisión incluye: **fecha**, **propuestos por**, **decisión**, **motivación** y **impacto** (archivos / artefactos afectados).

---

## 1. Decisiones canónicas D-01 a D-15

### D-01 — Login unificado (estudiante + admin en mismo formulario)
- **Fecha**: 2026-02
- **Propuesto por**: Ag.02 (Software Architect), Ag.05 (Frontend), Ag.09 (UX/UI)
- **Decisión**: Una sola pantalla `/login`. El backend devuelve el `role` en el JWT; el frontend redirige post-login al área correspondiente (estudiante → `/home`, admin → `/admin`).
- **Motivación**: simplificar el surface área de autenticación; evitar mantener dos páginas casi idénticas; reducir superficie de ataque.
- **Impacto**: `frontend/src/pages/Login.tsx` único; `frontend/src/guards/RoleGuard.tsx` se encarga del routing post-login.
- **Estado**: ✅ implementado.

### D-02 — Panel SOS como componente flotante (no página separada)
- **Fecha**: 2026-02
- **Propuesto por**: Ag.08 (Safety), Ag.09 (UX/UI)
- **Decisión**: El panel SOS es un modal/overlay activable desde cualquier pantalla autenticada vía un FAB (Floating Action Button) en la esquina inferior derecha. NO es una ruta dedicada.
- **Motivación**: el SOS debe ser accesible en cualquier momento durante una conversación de crisis sin perder el contexto del chat. Una página separada interrumpiría el flujo.
- **Impacto**: `frontend/src/components/sos/SosPanel.tsx` + `SosFab`. Cero rutas SOS en `App.tsx`.
- **Estado**: ✅ implementado.

### D-03 — Recuperación de contraseña simplificada para MVP
- **Fecha**: 2026-02
- **Propuesto por**: Ag.04 (Backend), Ag.11 (DevOps)
- **Decisión**: Para el MVP, el endpoint `POST /api/v1/auth/forgot-password` registra la solicitud y genera el token, pero el envío automático por correo NO está habilitado. El estudiante debe contactar al admin manualmente para que le entregue el enlace.
- **Motivación**: integrar un servicio SMTP/SendGrid añade complejidad operativa y costo recurrente. Para 30 estudiantes piloto, el flujo manual es suficiente.
- **Impacto**: backend implementa el flujo completo; frontend muestra un mensaje "Función en habilitación — contacta al administrador". `password_reset_tokens` table opera normal.
- **Estado**: ✅ implementado parcial (token generado, email manual).

### D-04 — Recharts para gráficas del admin
- **Fecha**: 2026-02
- **Propuesto por**: Ag.05 (Frontend), Ag.13 (Research & Analytics)
- **Decisión**: Usar `recharts` como librería de gráficas en el panel admin. NO usar Chart.js, D3, Plotly u otras alternativas.
- **Motivación**: Recharts tiene buena integración con React (declarativo), bundle pequeño (~50KB), curva de aprendizaje baja, suficiente para las gráficas requeridas (línea, barra, dona). Las alternativas eran más pesadas o requerían más código boilerplate.
- **Impacto**: `frontend/package.json` incluye `recharts ^3.8.1`. Componentes en `frontend/src/components/admin/charts/`.
- **Estado**: ✅ implementado.

### D-05 — Derechos ARCO como sección en Preferencias
- **Fecha**: 2026-02
- **Propuesto por**: Ag.09 (UX/UI), Ag.12 (Ethics, Privacy & Compliance)
- **Decisión**: Los derechos ARCO (Acceso, Rectificación, Cancelación, Oposición) se acceden desde la sección "Preferencias" (Settings), NO desde una ruta separada `/derechos-arco` o un menú diferente.
- **Motivación**: el estudiante busca controles de privacidad junto a sus otras preferencias. Una página separada los esconde y baja la tasa de ejercicio efectivo del derecho.
- **Impacto**: pestaña "Mis datos (ARCO)" dentro del modal `Settings.tsx`. Refactor 2026-05-23 fusiona ARCO con la pestaña "Consentimiento" en una sola tab (commit `543f4b9`).
- **Estado**: ✅ implementado.

### D-06 — Logs de auditoría en tabla separada (`audit_logs`)
- **Fecha**: 2026-02
- **Propuesto por**: Ag.03 (Database), Ag.04 (Backend), Ag.12 (Ethics)
- **Decisión**: Las acciones administrativas y eventos relevantes para auditoría se registran en una tabla dedicada `audit_logs`, no en logs textuales del sistema ni mezclados en `messages`/`sessions`.
- **Motivación**: trazabilidad legal, búsqueda por usuario/acción/fecha, integridad referencial con `users`, posibilidad de exportar como evidencia para Defensoría del Pueblo o auditoría interna.
- **Impacto**: tabla `audit_logs` (Evo 004, extendida en Evo 008 con `actor_role`). Servicio `backend/app/services/audit_service.py`.
- **Estado**: ✅ implementado.

### D-07 — No se implementa chat en tiempo real multi-usuario
- **Fecha**: 2026-02
- **Propuesto por**: Ag.02 (Software Architect), Ag.04 (Backend)
- **Decisión**: El sistema NO incluye chat entre usuarios humanos (estudiante↔estudiante o estudiante↔profesional). Solo conversación 1:1 con Mabel.
- **Motivación**: el alcance del MVP es psicoeducación asistida por IA. Chat humano introduce complejidad de moderación, latencia real-time, presencia, y obligaciones legales (telesalud, supervisión profesional) que escapan al estudio cuasiexperimental.
- **Impacto**: no se implementan WebSockets para mensajes inter-usuario; SSE es solo para streaming de respuestas de Mabel.
- **Estado**: ✅ enforced.

### D-08 — Empty states con acción sugerida
- **Fecha**: 2026-02
- **Propuesto por**: Ag.09 (UX/UI), Ag.08 (Safety)
- **Decisión**: Cuando una vista no tiene datos (sin sesiones, sin reportes, sin safety_events, etc.), mostrar un estado vacío que incluya: ilustración o icono, explicación de por qué está vacío, y un botón de acción sugerida ("Iniciar primera conversación", "Configurar alertas", etc.).
- **Motivación**: empty states "frío" (solo "No hay datos") generan abandono. Una acción sugerida convierte el vacío en una invitación.
- **Impacto**: componente `frontend/src/components/ui/EmptyState.tsx` reutilizable. Aplicado en sidebar de sesiones, lista de reportes admin, etc.
- **Estado**: ✅ implementado.

### D-09 — Consentimiento con scroll obligatorio
- **Fecha**: 2026-02
- **Propuesto por**: Ag.12 (Ethics), Ag.09 (UX/UI)
- **Decisión**: La pantalla de consentimiento (`/consent`) deshabilita el botón "Acepto" hasta que el usuario haga scroll hasta el final del documento legal. Esto fuerza una lectura mínima.
- **Motivación**: cumplimiento de la Ley 1581/2012 (consentimiento informado **previo** y **explícito**). Un "Acepto" sin scroll es vulnerable a impugnación legal.
- **Impacto**: `frontend/src/pages/Consent.tsx` implementa el guard de scroll. Persiste el evento en `consents` con `accepted_at`.
- **Estado**: ✅ implementado.

### D-10 — Tabla `password_reset_tokens` separada de `users`
- **Fecha**: 2026-02
- **Propuesto por**: Ag.03 (Database), Ag.04 (Backend)
- **Decisión**: Los tokens de reset de contraseña viven en su propia tabla con FK a `users`, NO como columnas adicionales en `users` (`reset_token`, `reset_expires_at`).
- **Motivación**: un usuario puede tener múltiples solicitudes simultáneas (raro pero posible); separar permite invalidar batch (`DELETE WHERE user_id=X`); auditoría más limpia (cuántas veces pidió reset un usuario); evita inflar `users` con campos transitorios.
- **Impacto**: tabla `password_reset_tokens` (PK uuid, `user_id` FK CASCADE, `token` hash, `expires_at`, `used_at`).
- **Estado**: ✅ implementado.

### D-11 — Instrumentos SUS / Empatía administrados externamente
- **Fecha**: 2026-02
- **Propuesto por**: Ag.13 (Research), Ag.04 (Backend)
- **Decisión**: El SUS (System Usability Scale) y la rúbrica de empatía/alianza NO se administran dentro de la app Mabel. Se hacen con Google Forms / formulario externo y se importan los resultados via API admin (D-13).
- **Motivación**: poner un cuestionario clínico dentro del flujo de chat distorsiona el estudio (efecto observador). Externalizar separa "uso de Mabel" de "evaluación del uso".
- **Impacto**: tabla `survey_responses` recibe imports; tabla `empathy_ratings` recibe ratings inter-rater hechos por el equipo de investigación.
- **Estado**: ✅ implementado.

### D-12 — 3 interfaces adicionales (42 total)
- **Fecha**: 2026-02
- **Propuesto por**: Ag.12 (Ethics), Ag.08 (Safety), Ag.09 (UX/UI)
- **Decisión**: Añadir 3 interfaces al catálogo MVP que originalmente era 39: #40 (ARCO modal), #41 (Consentimiento rechazado), #42 (Cambio de contraseña modal). Total: 42.
- **Motivación**: la versión inicial olvidaba flujos legales completos.
- **Impacto**: catalog `docs/INTERFACES_MVP.md` ahora documenta 42 (44+ post-implementación con `#43 Voice` y `#44 Empathy Ratings`).
- **Estado**: ✅ implementado.

### D-13 — Importación de resultados de investigación vía API
- **Fecha**: 2026-02
- **Propuesto por**: Ag.04 (Backend), Ag.13 (Research)
- **Decisión**: Los resultados externos (SUS, empatía, encuestas pre/post) se importan al sistema vía endpoints admin (POST `/admin/survey-responses/import`, similar para empathy), NO por carga manual en BD.
- **Motivación**: trazabilidad (audit_log), validación de schema, idempotencia, evitar errores manuales en SQL.
- **Impacto**: rutas admin para import. Las tablas reciben datos solo vía API.
- **Estado**: ✅ implementado.

### D-14 — Hard DELETE de usuarios + `safety_events.user_id` SET NULL
- **Fecha**: 2026-02-26 (decisión); consolidado en el initial migration Alembic (no existe migración `005c` como archivo; las "Evo 002…005c" eran labels narrativos de marzo 2026, ver `docs/AGENTES.md` §9.4)
- **Propuesto por**: Ag.02, Ag.03, Ag.04, Ag.12 (unánime)
- **Decisión**: Cuando un estudiante elimina su cuenta (`DELETE /users/me`), se hace **hard DELETE** inmediato + CASCADE sobre todas sus tablas relacionadas, EXCEPTO `safety_events.user_id` que cambia a `ON DELETE SET NULL` para preservar el evento como anónimo (cuenta para métricas de safety, NO se borra el evento como tal).
- **Motivación**: Ley 1581/2012 derecho de supresión (Art. 8 lit. e). Hard DELETE evita riesgos de "datos remanentes" que el titular cree haber borrado. La excepción de safety_events.user_id preserva la línea base epidemiológica (Defensoría del Pueblo puede solicitar agregados históricos sin reconstruir identidades).
- **Impacto**: `safety_events.user_id` NULLABLE con `ON DELETE SET NULL` (vigente desde el initial migration `08b6189ffc35` — el SET NULL ya estaba allí). `account_service.delete_account()` ejecuta CASCADE limpio + emite `audit_log` con `actor_id=NULL` y `details={email_snapshot}` antes del DELETE. Efecto colateral en `safety_events.session_id`: también queda NULL (CASCADE indirecto vía borrado de `sessions`).
- **Estado**: ✅ implementado.

### D-15 — Mabel IA se distribuye como PWA
- **Fecha**: 2026-03-01
- **Propuesto por**: Ag.02 (Architect), Ag.05 (Frontend), Ag.09 (UX/UI)
- **Decisión**: La SPA React se empaqueta como Progressive Web App (PWA) usando `vite-plugin-pwa`. Instalable desde el navegador, cache-first para assets, network-first para API, modo standalone.
- **Motivación**: estudiantes acceden mayoritariamente desde móvil. PWA elimina la necesidad de publicar en App Store / Play Store (caro y burocrático), pero permite "instalar" como app desde Chrome/Safari móvil.
- **Impacto**: documentado en Notion. **Estado real al 2026-05-24**: `vite-plugin-pwa` NO está instalado en `frontend/package.json`. Decisión registrada pero implementación pendiente.
- **Estado**: 🟠 decidido, **NO implementado** (pendiente Fase 10).

---

## 2. Decisiones del Product Owner — 2026-02-23

Sesión de PO que resolvió **25 discrepancias** entre mockups y especificación de interfaces. Detalle completo en `MEMORY.md` (sección "Decisiones PO — Discrepancias Mockups vs Notion"). Resumen ejecutivo:

| # | Decisión | Resultado |
|---|---|---|
| PO-1 | Layout — todas las páginas autenticadas tienen sidebar (incluida #15 Settings) | Sidebar 220px ambos roles |
| PO-2 | SOS — solo FAB flotante, NO en header | Confirmado D-02 |
| PO-3 | TTS Chat — auto-play + mute global (sin controles por burbuja) | `useTts` hook implementado |
| PO-4 | TTS Avatar — solo mute (consistente con chat) | Confirmado |
| PO-5 | Subtítulos — resaltado en burbuja + mic pulsante rojo | `useSubtitles` + bg `primary/20` |
| PO-6 | Sidebar — 220px ambos roles, 4 grupos temporales, variante "desactivado" | `StudentLayout` / `AdminLayout` |
| PO-7 | Onboarding — 3 pasos con mockup cada uno | Implementación parcial (paso 2 fusionado con paso 3) |
| PO-8 | Métricas — crear tabs B-E completos | `frontend/src/pages/admin/Metrics.tsx` con 5 tabs |
| PO-9 | Filtros #28 — combinar: buscador + estado + consentimiento + rango registro | Admin Users con filtros |
| PO-10 | #32 — sin header (como #20/#22) | `AccessDenied.tsx` |
| PO-11 | Empty states — sin mockup, implementar desde Notion | D-08 |
| PO-12 | Componentes transversales (#36/#37/#38) — sin mockup, implementar desde Notion | Toast, ConfirmModal, Skeleton |

Páginas nuevas a crear (decisión PO): #41 Rechazo Consentimiento, #42 Modal Cambio Contraseña, #07B Onboarding Accesibilidad, #07C Onboarding Voz, #27B-E Métricas tabs.

**Estado**: 16 cambios a mockups + 3 a Notion + 6 sin cambios. Mayormente implementado.

---

## 3. Decisiones post-MVP (D-16 en adelante — no canónicas aún)

Estas decisiones se tomaron durante implementación (2026-05) pero la página Notion "Sistema de Agentes" / "Interfaces MVP" no se ha actualizado para incluirlas en su numeración formal. **Esta sección las propone como D-16 a D-22**; cuando se sincronice con Notion (si se sincroniza), se asignan números canónicos.

### D-16 (propuesta) — Brand-skin aplicado a UI student + admin
- **Fecha**: 2026-05-20 (student) + 2026-05-22 (admin)
- **Commits**: `ca845f4` (student redesign) + `543f4b9` (admin brand-skin)
- **Propuesto por**: Ag.09 (UX/UI), Ag.05 (Frontend)
- **Decisión**: Aplicar la paleta UMB (`primary: #A51916`, `accent: #0F303A`, etc.) a TODAS las pantallas. Antes Notion declaraba explícitamente "el catálogo NO define estilo visual"; esa cláusula queda revocada.
- **Motivación**: identidad visual consistente con la marca UMB. Empatía visual para el contexto de salud mental (rojos cálidos + teal calmante).
- **Impacto**: ~16 archivos de componentes y páginas modificados sin cambio funcional. Spec en `openspec/specs/admin-ui/spec.md`.
- **Estado**: ✅ implementado.

### D-17 (propuesta) — Swap del adaptador LLM a OpenAI-compat
- **Fecha**: 2026-05-21
- **Commits**: `768b17d` (Mabel-Gemma4) + memoria `llm-openai-compat-migration.md`
- **Propuesto por**: Ag.02 (Architect), Ag.04 (Backend), Ag.06 (ML/LLM, reactivado)
- **Decisión**: El `LLMProvider(Protocol)` ahora tiene dos adaptadores: `OpenAICompatAdapter` (default) y `GeminiAdapter` (fallback legacy). La env var `LLM_PROVIDER` decide cuál. Por defecto `openai_compat`, lo que permite apuntar a Modal-hosted Mabel-Gemma4, Gemini OpenAI-compat, vLLM, Ollama o cualquier `/v1/chat/completions`.
- **Motivación**: portabilidad. Cuando se entrene Mabel-Gemma4-E4B y se despliegue en Modal, el cambio es solo de env vars (no requiere redeploy de código).
- **Impacto**: `backend/app/services/llm/openai_adapter.py` (nuevo), `factory.py` (selector), `prompts.py` (sistema prompt fijo `MABEL_GEMMA4_SYSTEM_PROMPT` para flavor `mabel_gemma4`).
- **Estado**: ✅ implementado.

### D-18 (propuesta) — Mabel-Gemma4 hospedada en Modal.com
- **Fecha**: 2026-05-23
- **Commit**: `768b17d`
- **Propuesto por**: Ag.06 (ML/LLM), Ag.11 (DevOps), Ag.04 (Backend)
- **Decisión**: El modelo fine-tuneado Mabel-Gemma4-E4B (Q4_K_M GGUF ~3.5GB) se hospeda en Modal.com como endpoint serverless (NVIDIA T4 16GB) con scale-to-zero tras 5min de inactividad. El backend de Mabel-IA en Railway consume vía OpenAI-compat (HTTPS).
- **Motivación**: Modal ofrece GPU bajo demanda sin costo fijo. El proyecto no puede mantener una GPU 24/7. Scale-to-zero introduce cold start de 60-90s que se cubre con UX wait layers (D-20).
- **Impacto**: env var `LLM_BASE_URL` en producción apunta a Modal. Repo separado [`github.com/ZyFalo/Gemma4-Mabel`](https://github.com/ZyFalo/Gemma4-Mabel) para el modelo (ver `docs/MODEL_TRAINING.md` para índice de sus 23 docs). Check-in inyectado en user-turn (no system) cuando `LLM_FLAVOR=mabel_gemma4` porque el system prompt está fijo en el fine-tune.
- **Estado**: ✅ implementado.

### D-19 (propuesta) — Lazy session create
- **Fecha**: 2026-05-20
- **Commit**: `ca845f4`
- **Propuesto por**: Ag.05 (Frontend), Ag.04 (Backend)
- **Decisión**: La sesión de chat NO se crea cuando el estudiante navega a `/checkin/new` o a `/chat`. Se crea recién cuando se envía el **primer mensaje** (POST a `/sessions/{tempId}/messages` con `tempId='new'`). Esto elimina sesiones huérfanas creadas por curiosidad o por error.
- **Motivación**: limpieza de datos (no inflar `sessions` con filas sin mensajes); permite navegar el catálogo de check-in sin compromiso; evita el UNIQUE constraint `uq_sessions_user_active` colisionando innecesariamente.
- **Impacto**: backend `chat_service.send_message` crea sesión si `session_id='new'`. Frontend `Chat.tsx` maneja ID temporal.
- **Estado**: ✅ implementado.

### D-20 (propuesta) — 3 capas UX para LLM cold start
- **Fecha**: 2026-05-24
- **Commits**: `ee2d3ca` + `fd089b3` (10 hallazgos de review aplicados)
- **Propuesto por**: Ag.05 (Frontend), Ag.09 (UX/UI)
- **Decisión**: Implementar 3 capas de comunicación visual del estado del LLM durante cold start:
  - **Capa 1**: texto progresivo en burbuja (5 thresholds: 0/3/10/25/60s) → `streamingStatusText.ts`
  - **Capa 2**: toast cold start cuando `health === 'cold' || 'unknown'` en el primer envío
  - **Capa 3**: `LlmStatusChip` (píldora ARIA-accessible con popover) en header del chat, 4 estados (warm/cold/down/unknown), polling con Page Visibility guard
- **Motivación**: sin esto, el usuario percibe a Mabel como "rota" durante los 60-90s de cold start. Las 3 capas reducen percepción de latencia y dan agency al usuario para entender por qué espera.
- **Impacto**: nuevos hooks (`useLlmPrewarm`, `useElapsedSeconds`), util (`streamingStatusText`), componentes (`LlmStatusChip`, `StreamingIndicator`). Endpoint `GET /api/v1/llm/health`. Page Visibility guard preserva billing de Modal scale-to-zero.
- **Estado**: ✅ implementado.

### D-21 (propuesta) — Cron L2 de redacción de message_id
- **Fecha**: 2026-05-24
- **Commit**: `8adbb54`
- **Propuesto por**: Ag.03 (Database), Ag.11 (DevOps), Ag.12 (Ethics)
- **Decisión**: Implementar un servicio cron separado en Railway que ejecuta `UPDATE safety_events SET payload = payload - 'message_id' WHERE created_at < NOW() - INTERVAL '30 days' AND payload ? 'message_id'` diariamente a las 03:00 UTC.
- **Motivación**: Ley 1581/2012 Art. 4 (minimización). Después de 30 días, la correlación entre safety_event y mensaje específico deja de tener utilidad operativa. El evento se conserva (para métricas), pero el `message_id` se redacta. Antes esto era "post-MVP" en docs.
- **Impacto**: `backend/scripts/redact_old_message_ids.py` (script async idempotente), `railway.cron.toml` (config de servicio Railway separado), `docs/DATA_RETENTION_POLICY.md` §10 (documentación), `backend/scripts/__init__.py` (marca paquete), `config.py` (`JWT_SECRET` con default vacío para que cron pueda importar Settings sin crashear).
- **Estado**: ✅ implementado. Pasos UI Railway pendientes (crear segundo servicio apuntando a `railway.cron.toml`).

### D-22 (propuesta) — Documentación viva en repo, Notion como vitrina histórica
- **Fecha**: 2026-05-24
- **Commit**: en progreso (esta migración)
- **Propuesto por**: Ag.14 (Documentation), Ag.01 (PM)
- **Decisión**: A partir de 2026-05-24, la documentación técnica vive en `docs/*.md` del repositorio. Notion queda como snapshot histórico (no se elimina, no se actualiza). Cualquier PR que afecte arquitectura, schema, deploy o flujo de usuario DEBE incluir el update del `.md` correspondiente, verificado pre-commit por el code-review skill.
- **Motivación**: drift comprobado de 11 semanas en Notion vs código. La fricción de actualizar Notion (browser, navegación, IDs) hizo que dejara de actualizarse. Markdown en repo evoluciona junto al código en el mismo PR, sin fricción.
- **Impacto**: nuevos docs en `docs/` (este archivo entre ellos). Deprecación de `TECHSTACK.md`, `DB_SCHEMA_REVIEW.md`, `DB_SCHEMA_EVOLUTION_002/004.md`, `INTERFACES_MVP_CATALOGO.md`, `REPORTE_VALIDACION_BD_INTERFACES.md`, `FASE2_*.md`, `FASE3_*.md`. `.claude/agents/AGENT_*.md` trimmed a stubs.
- **Estado**: ✅ implementado (commit `4546308`, 2026-05-24).

---

## 4. Workflow agreements

Acuerdos de proceso del equipo. No son decisiones técnicas pero rigen cómo se trabaja. Detalle completo en `MEMORY.md`.

| Acuerdo | Fecha | Resumen |
|---|---|---|
| **Code-review pre-commit obligatorio** | 2026-05-22 | Antes de cualquier commit grande, ejecutar el skill `code-review` (high-effort, 3 ángulos + verifiers, ≤10 hallazgos). Resolver todos los hallazgos. Luego commit. |
| **Dev/prod status** | 2026-05 | Mabel IA está en pre-producción. Cambios de schema se aplican vía force-update local en lugar de migración Alembic formal hasta deploy productivo. |
| **Everything still adjustable** | 2026 | Ninguna decisión previa es inmutable. Si una necesidad lo justifica, proponer cambio. |
| **Admin panel doc viva** | 2026-05 | `docs/ADMIN_PANEL.md` se actualiza en cada fix del panel admin. Retirar este acuerdo cuando se cierre la revisión. |
| **Docs en repo, no en Notion** | 2026-05-24 | Ver D-22. |

---

## Cómo añadir una decisión nueva

1. Verifica que no esté ya documentada (busca palabras clave en este archivo).
2. Asigna el siguiente número D-XX (al 2026-05-24: D-23 es el siguiente disponible).
3. Crea la entrada con el formato: **Fecha**, **Commit/PR**, **Propuesto por**, **Decisión**, **Motivación**, **Impacto** (archivos), **Estado**.
4. Si la decisión deroga o modifica una previa, marca la previa como "🟠 superseded by D-XX".
5. Actualiza `MEMORY.md` si la decisión cambia un workflow.

## Referencias

- `MEMORY.md` — auto-memoria con D-XX, evos, workflows acumulados
- `docs/TECH_STACK.md` — ADRs técnicos vivos (paralelos a las D-XX)
- `docs/DB_SCHEMA.md` — evoluciones del esquema (refleja D-14 / DT-11+DT-12; las antiguas labels "Evo 005b/005c" no existen como archivos Alembic, ver `docs/AGENTES.md` §9.4)
- `docs/FASES_IMPLEMENTACION.md` — qué fase implementó cada decisión
- `docs/INTERFACES_MVP.md` — qué interfaces materializan cada decisión
- `docs/AGENTES.md` — quién propuso/votó cada decisión
