## ADDED Requirements

### Requirement: Cohort column and filter in Users page

The page `frontend/src/pages/admin/Users.tsx` SHALL:
- Add a "Cohorte" column to the table displaying `cohort` (or "—" if null)
- Add a "Cohorte" filter input (free text or known-values dropdown: `piloto-fase1`, `dev`, etc.) to the FilterBar that passes `cohort=` query param to the API

#### Scenario: Filter users to piloto cohort

Given the admin types `piloto-fase1` in the cohort filter
When the filter applies
Then `GET /admin/users?cohort=piloto-fase1` SHALL be called
And the table SHALL display only users with that cohort

### Requirement: Cohort selector in UserDetail

The page `frontend/src/pages/admin/UserDetail.tsx` SHALL include a "Asignar cohorte" control in the "Informacion general" card. It SHALL be either:
- An editable text input + save button
- OR a dropdown with known cohort values + custom option

On save, calls `PATCH /admin/users/:id/cohort` with `{cohort: value | null}`. Shows toast on success/error. "Eliminar cohorte" button sets it to null.

#### Scenario: Set cohort

Given a user with no cohort
When the admin enters `piloto-fase1` and clicks save
Then PATCH SHALL fire with `{cohort: "piloto-fase1"}`
And on success the UI SHALL refresh the user detail

### Requirement: Cohort filter on Metrics page

The page `frontend/src/pages/admin/Metrics.tsx` SHALL add a "Cohorte" filter to the top toolbar (next to date range). The selected cohort SHALL be persisted in URL query param `?cohort=`.

When the admin opens the page on Tab E (Estudio), if no cohort is in the URL, the page SHALL default to `?cohort=piloto-fase1` (per D-08).

All tab fetches SHALL pass the cohort to their endpoint.

#### Scenario: Default piloto cohort on Tab E

Given the admin navigates to `/admin/metrics?tab=study`
When the page mounts and no cohort param is present
Then the URL SHALL update to `?tab=study&cohort=piloto-fase1`
And the metrics study endpoint SHALL be called with that cohort

#### Scenario: Clear cohort filter

Given a cohort is set
When the admin clicks "Limpiar cohorte"
Then the cohort param SHALL be removed from URL
And all tab fetches SHALL drop the cohort param

### Requirement: Tab E renders statistical rigor

In Tab E ("Estudio") of `Metrics.tsx`, the wellbeing pre/post comparison block SHALL render:
- `n_paired` and `n_excluded` shown prominently
- `test_used` (label: "Test estadistico: Paired t-test" or "Test estadistico: Wilcoxon signed-rank")
- `shapiro_p` (when present) labeled "Shapiro-Wilk p-value: 0.XX (n>0.05 = paramétrico)"
- Cohen's d card: if value is null, show "Cohen's d: no calculable (n_paired < 10)"; if present, show value with interpretation badge (small <0.2, mediano 0.2-0.5, grande >=0.5)
- p_value: if test_skipped_reason is present, show "—"; else show with formatting

#### Scenario: Render skipped Cohen's d

Given `cohens_d = null` and `test_skipped_reason = "n_paired < 10"`
When Tab E renders
Then the Cohen's d card SHALL display "No calculable (n_paired < 10)"
And it SHALL NOT show a numeric value

### Requirement: Empathy Ratings page

The frontend SHALL provide `frontend/src/pages/admin/EmpathyRatings.tsx` at route `/admin/empathy-ratings` (under RoleGuard admin + AdminLayout).

UI:
- Top stats panel: n total ratings (from `GET /admin/empathy-ratings/stats?cohort=...`), mean score, pct >= 4, distribution bar chart
- Cohort filter (defaults to `piloto-fase1`)
- Queue section: shows up to 20 un-rated messages
  - Each card displays: assistant message content (Spanish, preserving formatting), session created_at, optional preceding user message for context (if backend returns)
  - Scoring widget: 1-5 stars/slider, criteria checkboxes (5-6 items: "Tono empatico", "Validacion emocional", "Sin alucinacion", "Sugerencia constructiva", "Sin diagnostico clinico")
  - "Calificar" button -> POST `/admin/empathy-ratings`
- After submitting a rating, that card disappears from the queue and stats refresh

#### Scenario: Submit a rating

Given the admin opens the queue and sees a message
When they select score 4 + 3 criteria checked + click Calificar
Then POST `/admin/empathy-ratings` SHALL fire with `{message_id, score: 4, criteria: {...}}`
And on success the card SHALL disappear and stats SHALL refresh

### Requirement: AdminSidebar adds Empathy link

`AdminSidebar.tsx` SHALL add a new nav link:
- Label "Calificacion Empatia"
- Path `/admin/empathy-ratings`
- Position: after "Metricas", before "Usuarios"

#### Scenario: Link is visible and routes correctly

Given the admin is on any /admin/* page
When the AdminSidebar renders
Then a link labeled "Calificacion Empatia" SHALL be present
And clicking it SHALL navigate to /admin/empathy-ratings

### Requirement: Study lock UI in Config

The `Config.tsx` page SHALL add (at the top of section 02 "Guardrails de seguridad") a "Bloqueo de configuracion para estudio" toggle. When ON:
- A clear banner appears: "Bloqueo activo: cambios a guardrails requieren override explicito"
- The Guardrails inputs (safety_keywords list, severity slider, enabled toggle) SHALL be visually disabled (gray, cursor not-allowed)
- Attempting to save shows a confirmation modal: "El bloqueo de estudio esta activo. Confirma override?"
  - On confirm, the PATCH request includes header `X-Study-Lock-Override: true`
  - On cancel, no PATCH is made
- The lock toggle itself is always interactive

#### Scenario: Lock disables guardrails inputs

Given study_lock_enabled = true
When the admin opens Config page
Then the safety_keywords add button and severity slider SHALL be visually disabled
And a banner SHALL warn about the lock

#### Scenario: Override confirmation

Given the lock is active
When admin clicks save on a guardrails change
Then a modal SHALL prompt "Confirma override?"
And on confirm, PATCH SHALL fire with the override header
