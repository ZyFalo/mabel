## Design Decisions

### D-01: `users.cohort` como TEXT NULL vs tabla `study_enrollments`

**Decision:** Agregar columna `cohort TEXT NULL` a `users` con indice parcial. NO crear tabla `study_enrollments` separada en esta fase.

**Rationale:** Solo necesitamos un marcador por usuario (1:1). Una tabla separada anadiria JOINs a cada metrica. Si en el futuro se requieren multiples cohortes por usuario o metadatos por inscripcion, se migra. Indice `WHERE cohort IS NOT NULL` mantiene queries baratos.

**Valores convencionales:** `piloto-fase1`, `piloto-fase2`, `control`, `dev`. Sin CHECK constraint — flexibilidad para el equipo de investigacion.

### D-02: `empathy_ratings` como tabla nueva (no JSONB en messages)

**Decision:** Tabla nueva `empathy_ratings(id, message_id FK CASCADE, rater_id FK SET NULL, score INT CHECK 1-5, criteria JSONB, created_at)`. Mensaje puede tener multiples ratings de raters distintos.

**Rationale:** Permite multiples evaluadores (inter-rater reliability). Permite filtrar por rater para auditar. JSONB `criteria` guarda checklist (`{empathic_tone: true, validation: true, hallucination: false, ...}`). FK CASCADE: si el mensaje se borra, su rating se va.

**UNIQUE** `(message_id, rater_id)` para evitar duplicados del mismo rater sobre el mismo mensaje.

### D-03: Latencia separada en `messages` — 3 columnas nuevas, NULL para back-compat

**Decision:** `asr_latency_ms INT NULL`, `llm_latency_ms INT NULL`, `tts_latency_ms INT NULL` en `messages`. La columna existente `latency_ms` se mantiene como total (suma). Mensajes pre-006 quedan con NULL en las 3 nuevas — los analitica los excluye o agrega al total.

**Rationale:** No-breaking. La columna `latency_ms` ya se usa en dashboards y graficas; mantenerla evita cascade de refactors. Las 3 nuevas se llenan en el chat pipeline (Fase 7 voice) cuando esten disponibles; Fase 3 chat text-only solo llenara `llm_latency_ms`.

### D-04: `study_lock_enabled` como key de `system_config`, no env var

**Decision:** Agregar key `study_lock_enabled` (boolean default false) al seed inicial de `system_config`. El backend lee este flag en PATCH `/admin/config/:key` y devuelve 423 Locked si el key esta en el set `{safety_keywords, sos_severity_threshold, guardrails_enabled}` y el lock esta activo.

**Rationale:** `system_config` es el lugar correcto (decision D-10 del proyecto: env vars son infraestructura, system_config es operacion). El lock mismo es operativo, lo edita un admin. Permite desbloquear-bloquear sin redeploy.

**Excepcion:** El admin puede pasar header `X-Study-Lock-Override: true` para acciones emergencia (crisis de prompt injection). Esa override SI se audita con un campo extra `details.override=true`.

### D-05: Eleccion de test estadistico via Shapiro-Wilk (scipy)

**Decision:** En `metrics_study`, para cada par pre/post:
1. Si `n_paired < 10`: devolver `null` para Cohen's d, p_value y test_used; campo `test_skipped_reason: "n_paired < 10"`
2. Si `n_paired >= 10`: correr `scipy.stats.shapiro(diffs)`. Si `p < 0.05` → usar Wilcoxon signed-rank (`scipy.stats.wilcoxon`). Si `p >= 0.05` → usar paired t-test (`scipy.stats.ttest_rel`)
3. Reportar siempre `n_paired`, `n_excluded`, `shapiro_p`, `test_used`

**Rationale:** Defensible academicamente. Shapiro-Wilk con n<10 es poco confiable; ya rechazamos antes. Wilcoxon es la alternativa no parametrica estandar. Sin n_excluded reportado, la tesis no es reproducible.

**Add scipy** a requirements.txt. Tamano ~30MB instalado, aceptable.

### D-06: Reemplazo de empathy_distribution en /admin/metrics/study

**Decision:** `empathy_distribution` y `pct_empathy_4_or_above` se computan AHORA desde `empathy_ratings` (no de `survey_responses.instrument='empathy_rubric'`). El campo `survey_responses` queda para survey pre/post auto-reportado por el estudiante (otro instrumento).

**Rationale:** El criterio ">= 4/5 en >= 80%" es de un evaluador entrenado (rater), no del estudiante. `empathy_ratings` con `rater_id` y posibilidad de mas de 1 rater por mensaje es el data source correcto.

**Backwards compat:** El frontend tab E muestra empathy desde el nuevo endpoint. Si `empathy_ratings` esta vacio, devuelve `{n: 0, mean: null, ...}` (la Tab E ya renderiza "Sin datos suficientes").

### D-07: Empathy ratings queue — sampling estrategy

**Decision:** `GET /admin/empathy-ratings/queue?n=20&cohort=piloto-fase1`:
- Devuelve hasta `n` mensajes `role='assistant'` aleatorios que NO tienen rating del current admin (rater_id = current_user.id)
- Filtra por cohorte del autor de la sesion
- Excluye mensajes ya marcados como `system` o que no son del asistente
- Random sampling (`ORDER BY random() LIMIT n`)

**Rationale:** Random sampling para evitar sesgo de seleccion. Filtro por cohorte para que Tab E del piloto solo cuente ratings del piloto.

### D-08: Cohort filter es opcional (no breaking)

**Decision:** Todos los endpoints de metrics y users aceptan `cohort` como query param opcional. Si ausente, NO se filtra (comportamiento actual). Si presente, filtra `WHERE users.cohort = :cohort` en el JOIN correspondiente.

**Tab E default:** El frontend envia `?cohort=piloto-fase1` por defecto en Tab E (estudio). Otros tabs no envian default — el admin elige.

**Rationale:** No rompe nada. El default en Tab E refleja la decision PO de que el "estudio" se refiere al piloto principal.

### D-09: Login audit — payload del audit log

**Decision:** En `auth_router.login` exitoso, llamar `audit_log_action(action="login", target_type="user", target_id=user.id, details={"role": user.role, "remember_me": body.remember_me}, ip=...)`. Falla de login NO se audita (puede ser bot/typo; iria a `audit_logs` en `disabled_user` cuando aplique). Logout TAMPOCO se audita (JWT stateless).

**Rationale:** Ley 1581 requiere trazar acceso a datos personales. El login del admin abre el acceso. Loguear el rol facilita auditar quien y cuando entro al panel admin vs estudiante.

### D-10: Migration es additive-only

**Decision:** Migration 006 SOLO anade columnas y tablas. No renombra, no borra, no cambia tipos. Downgrade restaura esquema previo.

**Rationale:** Es la primera migracion que toca columnas en uso por el panel admin. Mantener additive-only minimiza riesgo de regresion en Fase 8.

### D-11: Archivos backend nuevos

- `backend/alembic/versions/006_research_instrumentation.py`
- `backend/app/models/empathy_rating.py`
- `backend/app/repositories/empathy_rating_repository.py`
- `backend/app/services/admin/empathy_service.py`
- `backend/app/routers/admin/empathy_ratings_router.py`

### D-12: Archivos frontend nuevos

- `frontend/src/pages/admin/EmpathyRatings.tsx`
- (modificaciones a Users.tsx, UserDetail.tsx, Metrics.tsx, Config.tsx, AdminSidebar.tsx, App.tsx)

### D-13: HU mapping de Fase 8.1

Fase 8.1 es una **extension de la Fase 8** para fortalecer evidencia del estudio. No mapea a HUs nuevas — soporta operacionalmente HU-15 (gestion usuarios), HU-16 (reportes/empatia), HU-17 (metricas/config). Se documenta como evolucion `006`.
