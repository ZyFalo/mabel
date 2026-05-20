## Tasks

### Capability 1 — research-schema-006

- [x] 1. Create `backend/alembic/versions/006_research_instrumentation.py` with the additive changes (ALTER TABLE users add cohort + index; ALTER TABLE messages add 3 latency cols; CREATE TABLE empathy_ratings with UNIQUE(message_id, rater_id); seed system_config study_lock_enabled=false). Downgrade reverses each step.
- [x] 2. Update `backend/app/models/user.py`: add `cohort: Mapped[str | None]` column.
- [x] 3. Update `backend/app/models/message.py`: add `asr_latency_ms`, `llm_latency_ms`, `tts_latency_ms` as `Mapped[int | None]`.
- [x] 4. Create `backend/app/models/empathy_rating.py` with `EmpathyRating` SQLAlchemy model matching the table.
- [x] 5. Update `backend/app/models/__init__.py` to import and export `EmpathyRating`.
- [x] 6. Update DDL source of truth `db/schema_postgresql.sql` with the same additive changes.
- [x] 7. Run `alembic upgrade head` against local DB to verify migration applies cleanly. Verify with a quick SQL check (column + table exist).

### Capability 2 — research-ops-backend

- [x] 8. Add `cohort: str | None` field to `UserAdminListItem` and `UserAdminDetail` in `backend/app/schemas/admin.py`.
- [x] 9. Add `cohort` filter to `AdminUsersService.list_users(...)` and `get_user_detail(...)`. Update SQL queries to include `cohort` column.
- [x] 10. Add `cohort` query param to GET `/admin/users` in `backend/app/routers/admin/users_router.py`.
- [x] 11. Add `async def set_cohort(user_id, cohort, admin_id)` to `AdminUsersService`. Writes audit_logs (`action="change_config"`, `target_type="user_cohort"`).
- [x] 12. Add `PATCH /admin/users/{user_id}/cohort` endpoint (body `{cohort: str | null}`) in users_router. Use require_admin.
- [x] 13. Add `cohort` query param to all metrics endpoints (`/admin/dashboard`, `/admin/metrics/usage`, `wellbeing`, `technical`, `safety`, `study`, `metrics/export.csv`). Propagate to `AdminMetricsService` methods.
- [x] 14. Update all aggregation queries in `metrics_service.py` to JOIN `sessions` → `users` (or `messages` → `sessions` → `users` for message-level) and add `WHERE users.cohort = :cohort` when cohort is provided.
- [x] 15. Modify PATCH `/admin/config/{key}` in `backend/app/routers/admin/config_router.py`: before performing the update, if key is in `{"safety_keywords", "sos_severity_threshold", "guardrails_enabled"}` AND `system_config.study_lock_enabled.value == true`, AND header `X-Study-Lock-Override` is NOT `"true"`, return 423 Locked with `{"detail":"STUDY_LOCK_ENABLED","key":key}`.
- [x] 16. When override header is present, include `details.override = true` in the audit_log entry.
- [x] 17. In `backend/app/routers/auth_router.py` login endpoint, on successful response call `audit_log_action(db, admin_id=user.id, action="login", target_type="user", target_id=user.id, details={"role": user.role, "remember_me": body.remember_me}, ip=request.client.host)` then commit.
- [x] 18. Update `ALLOWED_ACTIONS` in `audit_service.py` to include `"login"` and `"empathy_rate"` (the latter used by Cap 3).

### Capability 3 — research-analytics-backend

- [x] 19. Add `scipy>=1.13,<2` to `backend/requirements.txt` and install with `pip install -r requirements.txt`.
- [x] 20. Create `backend/app/repositories/empathy_rating_repository.py` with `create()`, `list_unrated_messages()`, `list_by_filters()`, `stats()` methods.
- [x] 21. Create `backend/app/services/admin/empathy_service.py` with `AdminEmpathyService(db)`: `get_queue(rater_id, cohort, limit)`, `create_rating(rater_id, message_id, score, criteria)`, `get_stats(cohort)`.
- [x] 22. Create `backend/app/routers/admin/empathy_ratings_router.py` with GET `/admin/empathy-ratings/queue`, POST `/admin/empathy-ratings/`, GET `/admin/empathy-ratings/stats`. All `Depends(require_admin)`. POST commits + writes audit_logs `action="empathy_rate"`.
- [x] 23. Register `empathy_ratings_router` in `backend/app/main.py`.
- [x] 24. Update `AdminMetricsService.metrics_study()` to source `empathy_distribution` and `pct_empathy_4_or_above` from `EmpathyRatingRepository.stats(cohort)`, NOT from `survey_responses`. Add `pct_empathy_4_or_above: float | null` field to the response.
- [x] 25. Update `metrics_study()` statistical block per spec D-05: compute `n_paired`, `n_excluded`, choose test via `scipy.stats.shapiro` + `scipy.stats.wilcoxon | ttest_rel`, return `test_used`, `shapiro_p`, `test_skipped_reason`. Cohen's d only if `n_paired >= 10`.
- [x] 26. Verify backend imports cleanly: `python -c "from app.main import app; print('OK')"`.

### Capability 4 — research-frontend

- [x] 27. Update `frontend/src/pages/admin/Users.tsx`: add "Cohorte" column to DataTable and "Cohorte" filter input to FilterBar (passes `cohort` query param).
- [x] 28. Update `frontend/src/pages/admin/UserDetail.tsx`: add a "Cohorte" control to "Informacion general" card (text input + save button + clear button); calls `PATCH /admin/users/:id/cohort`.
- [x] 29. Update `frontend/src/pages/admin/Metrics.tsx`:
  - Add "Cohorte" filter to top toolbar (text input or select)
  - Persist in URL via `useSearchParams` (param `cohort`)
  - Tab E: if URL has no `cohort` param, default to `?cohort=piloto-fase1` (via `useEffect` redirect on mount)
  - All tab fetches pass `cohort` query param
- [x] 30. Update `Metrics.tsx` Tab E ("Estudio") rendering:
  - Display `n_paired` and `n_excluded` per comparison
  - Display `test_used` label ("Paired t-test" / "Wilcoxon signed-rank")
  - Display `shapiro_p` value with hint
  - Cohen's d card: if `null` show "No calculable (n_paired < 10)"; else show value + size badge (chico/mediano/grande)
  - Use `pct_empathy_4_or_above` for the empathy criterion display
- [x] 31. Create `frontend/src/pages/admin/EmpathyRatings.tsx`:
  - Top stats panel (n, mean, pct>=4, distribution bar)
  - Cohort filter (default `piloto-fase1`)
  - Queue (up to 20 cards) each with: message content, session timestamp, scoring widget (1-5 + criteria checkboxes), "Calificar" button
  - After successful POST: card disappears + stats refresh
- [x] 32. Update `frontend/src/components/admin/AdminSidebar.tsx`: add "Calificacion Empatia" link to `/admin/empathy-ratings`, positioned after "Metricas".
- [x] 33. Update `frontend/src/App.tsx`: add route `/admin/empathy-ratings` → `<EmpathyRatings />` inside the admin RoleGuard + AdminLayout block.
- [x] 34. Update `frontend/src/pages/admin/Config.tsx`:
  - Add "Bloqueo de configuracion para estudio" toggle section at the top of "Guardrails de seguridad" section
  - When ON: show warning banner, gray-out guardrails inputs (visual + `disabled`)
  - Save attempts on guardrails when locked: open confirmation modal "El bloqueo de estudio esta activo. Confirma override?"
  - On override confirm: PATCH sent with header `X-Study-Lock-Override: true`
  - Lock toggle itself always interactive

### Verification

- [x] 3- [ ] 35. Backend: `python -c "from app.main import app; routes = [r.path for r in app.routes if 'admin' in r.path]; print(len(routes), 'admin routes')"` — should be 26+ (was 23 in Fase 8).
- [x] 3- [ ] 36. Frontend: `npx tsc --noEmit` clean.
- [x] 3- [ ] 37. Migration verification: `alembic current` returns head; query `SELECT key FROM system_config WHERE key='study_lock_enabled'` returns 1 row.
- [ ] 38. Smoke test: login admin → /admin/users (cohort filter works) → assign a user to piloto-fase1 → /admin/metrics?tab=study (sees ?cohort=piloto-fase1 default) → /admin/empathy-ratings (queue loads, can submit a rating) → /admin/config (toggle study_lock_enabled = true, attempt to change safety_keywords → 423 + override modal).
