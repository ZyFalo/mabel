## ADDED Requirements

### Requirement: EmpathyRating repository

The backend SHALL provide `app/repositories/empathy_rating_repository.py` with:
- `async def create(message_id, rater_id, score, criteria) -> EmpathyRating` (no commit)
- `async def list_unrated_messages(rater_id, cohort=None, limit=20) -> list[Message]` — returns `assistant`-role messages that the given rater has NOT yet rated. If `cohort` is provided, filters by session author's cohort.
- `async def list_by_filters(cohort=None, rater_id=None) -> list[EmpathyRating]` — returns ratings, optionally joined to filter by author cohort or rater.
- `async def stats(cohort=None) -> dict` — returns `{n: int, mean: float | None, distribution: list[{bucket: "1"-"5", count: int}], pct_4_or_above: float | None}`

#### Scenario: Sample unrated messages

Given there are 100 assistant messages, the rater has rated 5 of them
When `list_unrated_messages(rater_id=R, limit=20)` is called
Then the result SHALL contain up to 20 messages
And NONE of them SHALL have an existing rating from rater R

#### Scenario: Stats reflect ratings

Given 10 ratings exist with scores [4, 5, 5, 3, 4, 5, 4, 4, 5, 2]
When `stats()` is called
Then `n` SHALL be 10
And `mean` SHALL be approximately 4.1
And `pct_4_or_above` SHALL be 80.0 (8 of 10 are >= 4)

### Requirement: Empathy ratings router

The backend SHALL expose under prefix `/api/v1/admin/empathy-ratings`:

- `GET /queue?limit=20&cohort=<str>`: returns up to N un-rated assistant messages for the current admin. Response: list of `{message_id, session_id, content, created_at, session_started_at}`. Random sampling. Limit 1-100.
- `POST /` body `{message_id, score: int 1-5, criteria: dict | null}`: create a rating. `rater_id` is taken from JWT. Returns the created rating. 409 if rating already exists for that (message, rater) pair.
- `GET /stats?cohort=<str>`: returns aggregated stats (see repo signature). Used by Tab E.

All endpoints require admin role. `POST /` writes an audit_logs entry with `action="empathy_rate"` (new action type — extend ALLOWED_ACTIONS) `target_type="message"`, `target_id=message_id`, `details={score, criteria}`.

#### Scenario: Queue returns content for rating

Given the rater has no prior ratings
When `GET /admin/empathy-ratings/queue?limit=5` is called
Then the response SHALL contain up to 5 items
And each item SHALL include `message_id`, `content`, and timing context

#### Scenario: Duplicate rating returns 409

Given the rater has already rated message X with score 4
When POSTing another rating for X
Then the response SHALL be 409

### Requirement: metrics_study uses empathy_ratings

`AdminMetricsService.metrics_study()` SHALL compute `empathy_distribution` and `pct_empathy_4_or_above` from `EmpathyRatingRepository.stats(cohort)`. The `survey_responses` table is NO LONGER the source for these fields.

The response SHALL include the new field `pct_empathy_4_or_above: float | null` alongside `empathy_distribution`.

#### Scenario: Empathy data swap

Given there are 10 empathy_ratings (8 >= 4) and 5 survey_responses with instrument='empathy_rubric' (all = 3)
When `/admin/metrics/study` is queried
Then `pct_empathy_4_or_above` SHALL be 80.0 (from empathy_ratings, not surveys)

### Requirement: metrics_study statistical rigor

`AdminMetricsService.metrics_study()` SHALL expose in the response:
- `wellbeing_pre_post_comparison[i].n_paired: int` — pares completos
- `wellbeing_pre_post_comparison[i].n_excluded: int` — usuarios con pre o post pero no ambos
- `wellbeing_pre_post_comparison[i].shapiro_p: float | null` — p-value de Shapiro-Wilk sobre `diffs` (null si n_paired < 10 o no aplicable)
- `wellbeing_pre_post_comparison[i].test_used: "paired_t" | "wilcoxon" | null` — el test efectivamente usado para `p_value`
- `wellbeing_pre_post_comparison[i].cohens_d` — solo poblado si `n_paired >= 10`; null en caso contrario
- `wellbeing_pre_post_comparison[i].test_skipped_reason: str | null` — ej: "n_paired < 10"

Test selection logic:
1. If `n_paired < 10`: skip stats; return nulls + `test_skipped_reason="n_paired < 10"`
2. Else: run `scipy.stats.shapiro(diffs)`. If `shapiro_p < 0.05`: `test_used="wilcoxon"`, run `scipy.stats.wilcoxon`. Else: `test_used="paired_t"`, run `scipy.stats.ttest_rel`.

`scipy` SHALL be added to `backend/requirements.txt`.

#### Scenario: Low n skips inferential stats

Given n_paired = 5
When metrics_study is queried
Then `cohens_d` SHALL be null
And `test_skipped_reason` SHALL be "n_paired < 10"

#### Scenario: Non-normal diffs uses Wilcoxon

Given diffs are skewed (shapiro_p < 0.05) with n_paired = 20
When metrics_study is queried
Then `test_used` SHALL be "wilcoxon"
And `p_value` SHALL be from `scipy.stats.wilcoxon`

### Requirement: Cohort propagation in metrics

`metrics_study(cohort=None)` AND all sibling metrics methods SHALL accept and apply the cohort filter (joining sessions/messages to users via user_id and filtering `users.cohort = :cohort`).

#### Scenario: Cohort scope study calculations

Given users in cohorts piloto-fase1 (n=20) and dev (n=5)
When metrics_study is queried with `cohort="piloto-fase1"`
Then n_paired and all aggregates SHALL count only piloto-fase1 users
