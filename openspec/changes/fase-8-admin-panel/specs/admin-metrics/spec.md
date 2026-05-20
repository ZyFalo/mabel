## ADDED Requirements

### Requirement: Dashboard endpoint

The backend SHALL expose GET `/api/v1/admin/dashboard` returning 6 KPIs and 6 time-series for the last 30 days. KPIs: `total_users`, `users_new_this_week`, `sessions_today`, `safety_events_24h`, `reports_pending`, `latency_avg_ms`, `sus_avg`. Series: `sessions_per_day`, `mood_distribution_30d` (3 buckets: 0-3, 4-6, 7-10), `latency_per_day`, `safety_events_by_type_30d`, `guardrails_activations_14d`, `last_5_safety_events`.

#### Scenario: Dashboard returns KPI bundle

Given the database has users and sessions
When admin requests `/admin/dashboard`
Then the response SHALL contain all 7 KPIs and 6 series with consistent shapes

### Requirement: Metrics tab A — Uso

The backend SHALL expose GET `/api/v1/admin/metrics/usage` with query `from`, `to`. Returns: `active_users_per_day` (date, count), `sessions_per_user_distribution` (buckets `1-2`, `3-5`, `6-10`, `10+`), `avg_messages_per_session` (number), `avg_session_duration_minutes` (number).

#### Scenario: Usage metrics returned

Given there are sessions in the given date range
When admin requests `/admin/metrics/usage?from=2026-01-01&to=2026-03-01`
Then the response SHALL contain all 4 fields with proper shapes

### Requirement: Metrics tab B — Bienestar

The backend SHALL expose GET `/api/v1/admin/metrics/wellbeing` returning: `mood_per_day` (date, mean), `focus_distribution_per_week` (week, focus_category, count), `sleep_per_day` (date, mean), `mood_summary` ({mean, median, std, ci95_low, ci95_high, min, max}). All metrics computed only over `sessions.checkin_payload` where `checkin_completed_at IS NOT NULL`.

#### Scenario: Only completed check-ins counted

Given there are sessions where `checkin_completed_at IS NULL`
When wellbeing metrics are computed
Then those sessions SHALL be excluded from all aggregations

### Requirement: Metrics tab C — Tecnicas

The backend SHALL expose GET `/api/v1/admin/metrics/technical` returning: `latency_percentiles_per_day` (date, p50, p95, p99), `pct_turns_under_20s` (number), `tokens_per_day` (date, prompt_tokens, completion_tokens), `gemini_cost_estimate_usd` (number, computed from token counts).

#### Scenario: Latency p50 under target

Given assistant messages with `latency_ms < 20000`
When metrics technical is queried
Then `pct_turns_under_20s` SHALL be >= 90%

### Requirement: Metrics tab D — Seguridad

The backend SHALL expose GET `/api/v1/admin/metrics/safety` returning: `safety_events_per_day`, `guardrails_type_distribution`, `infraction_rate` (number), `top_keywords` (list of {keyword_anonymized, count, percentage}).

#### Scenario: Top keywords are anonymized

Given keywords from `system_config.safety_keywords` were triggered
When metrics safety is queried
Then `top_keywords[].keyword_anonymized` SHALL be a hash (not the raw keyword)

### Requirement: Metrics tab E — Estudio

The backend SHALL expose GET `/api/v1/admin/metrics/study` returning: `sus_distribution` (buckets), `sus_mean_vs_target` ({mean, target: 70}), `empathy_distribution` (buckets), `cohens_d_estimate` (number), `wellbeing_pre_post_comparison` (`{group, n, mean_pre, mean_post, diff, cohens_d, p_value}`). All from `survey_responses` table.

#### Scenario: Pre/post pairs computed

Given there are paired `survey_responses` for `wellbeing` instrument across `pre` and `post` phases
When study metrics is computed
Then `wellbeing_pre_post_comparison` SHALL include `mean_pre`, `mean_post`, `cohens_d`

### Requirement: CSV export — metrics

The backend SHALL expose GET `/api/v1/admin/metrics/export.csv?tab=usage|wellbeing|technical|safety|study&from=&to=` that streams a CSV with anonymized columns appropriate to the tab. The endpoint SHALL log `action="export_data"`.

#### Scenario: Export streams CSV with right columns

Given admin requests `/admin/metrics/export.csv?tab=wellbeing&from=2026-01-01&to=2026-03-01`
When the endpoint responds
Then the content-type SHALL be `text/csv`
And the audit log SHALL record `action="export_data"` with `details.tab="wellbeing"`

### Requirement: Admin dashboard page (#24)

The frontend SHALL provide `/admin` displaying: 6 KPI cards (using `MetricCard` with color thresholds for latency and SUS), 4 line/bar charts (sessions per day, mood distribution, latency per day, guardrails activations), 1 donut chart (safety events by type), 1 mini-table (last 5 safety events with link to detail). KPI cards `safety_events_24h` and `reports_pending` SHALL be clickable and route to the corresponding admin page. Polling refreshes every 30s.

#### Scenario: Latency KPI color reflects threshold

Given `latency_avg_ms = 18000`
When the KPI card renders
Then it SHALL show a green indicator

#### Scenario: KPIs poll every 30s

Given the dashboard is open
When 30 seconds pass
Then the dashboard SHALL re-fetch `/admin/dashboard`

### Requirement: Admin metrics page (#27 with 5 tabs)

The frontend SHALL provide `/admin/metrics` as a single page with 5 internal tabs (Uso, Bienestar, Tecnicas, Seguridad, Estudio). Active tab persists in URL via query param `?tab=<name>`. Global controls SHALL include date range selector, `ExportCsvButton` (passes current tab), refresh button. Each tab renders the appropriate Recharts visualizations per the corresponding backend endpoint shape.

#### Scenario: Tab persists in URL

Given the admin selects the "Bienestar" tab
When the tab activates
Then the URL SHALL become `/admin/metrics?tab=wellbeing`
And reloading the page SHALL restore that tab

### Requirement: Recharts dependency

The frontend SHALL add `recharts` as a runtime dependency. Chart components SHALL be wrapped in `components/admin/charts/` providing typed wrappers: `LineChartWrapper`, `BarChartWrapper`, `DonutChartWrapper`, `MetricLineWithReference` (line with horizontal reference like 20s threshold).

#### Scenario: Chart wrappers exported

Given the admin imports a chart wrapper
When the wrapper renders with valid data
Then a Recharts-based SVG chart SHALL be displayed with the data points
