## Why

La verificacion del Panel Admin (Fase 8) revelo 3 riesgos criticos para la evidencia del estudio cuasiexperimental con 30 estudiantes UMB:

1. **Sin cohorte**: ninguna metrica puede filtrar los 30 participantes del piloto. Cada agregacion mezcla admins, cuentas de prueba, dev users.
2. **Sin instrumento de empatia**: el criterio "empatia >= 4/5 en >= 80%" no tiene UI ni tabla. Solo reportes user-initiated, que no equivalen a una rubrica.
3. **Sin freeze de configuracion**: un admin puede cambiar `safety_keywords` o `sos_severity_threshold` durante el piloto e invalidar el criterio "0 violaciones criticas". Audit logs prueban el cambio pero no lo impiden.

Plus 3 gaps menores:
4. Cohen's d se calcula incluso con n_paired = 1 (inferencia inestable; sin transparencia de n).
5. Latencia agregada no distingue ASR / LLM / TTS — no se puede atribuir un breach > 20s.
6. Login admin no se audita (Ley 1581 lo exige).

## What Changes

Agregar la "instrumentacion de investigacion" minima al panel admin para que el piloto produzca evidencia defendible para la tesis:

- **Cohorte por usuario**: columna `users.cohort` + filtro en Users + Metrics tabs (default Tab E a `piloto-fase1`)
- **Tabla `empathy_ratings`** + queue de calificacion + UI admin (Tab E lee de aqui, no de surveys)
- **Study lock**: clave `study_lock_enabled` en system_config; cuando true, PATCH a guardrails devuelve 423
- **Rigor estadistico en Tab E**: `n_paired`, `n_excluded`, eleccion de test (paired_t vs Wilcoxon segun Shapiro-Wilk), Cohen's d solo si n_paired >= 10
- **Latencia separada**: `messages.asr_latency_ms / llm_latency_ms / tts_latency_ms`
- **Login auditado**: `audit_log_action(action="login", ...)` en auth_router

## Capabilities

### New Capabilities

- `research-schema-006` — Alembic migration 006: users.cohort, messages latency split, tabla empathy_ratings, seed study_lock_enabled, SQLAlchemy models, DDL update
- `research-ops-backend` — cohort filter en /admin/users + PATCH /admin/users/:id/cohort; cohort filter en /admin/metrics/*; study_lock middleware en PATCH /admin/config/:key; login audit
- `research-analytics-backend` — EmpathyRatingRepository + AdminEmpathyService + router `/admin/empathy-ratings/{queue,stats}`; metrics_study rigorizado (n_paired, n_excluded, test selection via scipy, conditional Cohen's d)
- `research-frontend` — UI: cohort filter/selector, study lock toggle, /admin/empathy-ratings page, Tab E enhancements

## Impact

- **Backend**: 1 migration, 3 modelos modificados (User, Message), 1 modelo nuevo (EmpathyRating), 1 repo nuevo, 1 service nuevo, 1 router nuevo, 4 services modificados (users, metrics, config), 2 routers modificados, +1 dependencia (scipy)
- **Frontend**: 2 paginas modificadas (Users, UserDetail, Metrics, Config), 1 pagina nueva (EmpathyRatings), 1 link en AdminSidebar
- **BD**: migracion 006 — +1 columna users, +3 columnas messages, +1 tabla empathy_ratings, +1 seed system_config
- **DDL source of truth**: `db/schema_postgresql.sql` actualizado
- **Compliance**: cierra el loop legal de Ley 1581 (login auditado)
- **Tesis**: convierte 3 criterios de exito de "no medibles" a "medibles" (cohorte filtrable, empatia con rubrica, latencia atribuible)
