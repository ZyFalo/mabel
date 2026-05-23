"""Consent-scope eligibility filter for research/analytics surfaces.

Per the Consentimiento Informado v1.0 (Ley 1581/2012), users opt into one
of two scopes when accepting consent:

- ``solo_uso``: their data only powers the system they're using; it does
  NOT enter aggregated analytics, dashboards, the empathy-rating queue,
  or CSV exports tied to the research/thesis.
- ``uso_mejora_anon``: in addition to operating the system, their
  *anonymized* data may be used to improve the service and inform the
  research (Fase 8.1).

Until this helper landed, the scope choice was decorative — every admin
metric and every empathy-rating queue pulled from the full user table
regardless of scope, which means a user who explicitly chose
``solo_uso`` still saw their check-ins flow into ``metrics_wellbeing``,
their messages flow into the empathy queue, etc. That breaks the
purpose-limitation principle of Ley 1581/2012.

This module is the single source of truth for "who is research-eligible".
All admin services that compute research/analytics surfaces import
``get_research_eligible_user_ids`` and filter their queries by it.

# Matrix of which surfaces use this filter

Filtered (research / thesis / dashboard aggregations):
- ``AdminMetricsService.metrics_usage / wellbeing / technical / study``
- ``AdminMetricsService.metrics_safety`` (infraction_rate, top_keywords)
- ``AdminMetricsService.export_csv`` (all tabs)
- ``AdminMetricsService.dashboard_kpis`` (sus_avg, sessions_per_day_30d,
  mood_distribution_30d, latency_per_day_30d)
- ``AdminEmpathyService.get_queue / list_rated``

NOT filtered (operational / legal safety surfaces that must include
everyone regardless of consent scope):
- ``audit_logs`` (legal requirement to log every action)
- ``safety_events`` (required by SOS protocol — see also D-14)
- ``message_reports`` admin queue (legal triage)
- Dashboard "what's happening now" KPIs: ``total_users``,
  ``users_new_this_week``, ``sessions_today``, ``safety_events_24h``,
  ``safety_events_active``, ``reports_pending``, ``latency_avg_ms``,
  ``safety_events_by_type_30d``, ``guardrails_activations_14d``,
  ``last_5_safety_events``
- The user's own chat history (it's their session; consent governs
  research use, not operational delivery)
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.consent import Consent
from app.models.user import User

# Sentinel scope value that opts the user into research/analytics use.
# Mirrors ``ConsentScope.uso_mejora_anon`` in schemas/consent.py and the
# CHECK constraint ``chk_consents_scope`` on the consents table.
RESEARCH_SCOPE = "uso_mejora_anon"


async def get_research_eligible_user_ids(db: AsyncSession) -> list[uuid.UUID]:
    """Return the user_ids whose *latest active* consent has research scope.

    "Latest active" means: most recent ``accepted_at`` among rows where
    ``revoked_at IS NULL``. A user with multiple historical consents
    (because the document was republished and they re-accepted) is
    represented by the newest non-revoked row.

    Returns an empty list if nobody qualifies. Callers that filter
    ``User.id.in_(eligible_ids)`` will then return empty result sets,
    which is semantically correct — no consenting users means no
    research data to surface.

    Why the window function:
    A user can in principle have multiple non-revoked consents (one per
    consent_version they accepted historically). The UNIQUE constraint
    ``uq_consents_user_version`` keeps each (user, version) pair unique,
    but doesn't restrict to one row per user. ROW_NUMBER per user
    ordered by accepted_at DESC picks the "current" consent, and we
    only count the user if THAT row has scope == 'uso_mejora_anon'.
    Without this, a user who downgraded from research scope to
    ``solo_uso`` would still be eligible because their older
    ``uso_mejora_anon`` row would match.

    Behavior across consent-version transitions (intentional)
    --------------------------------------------------------
    This helper does NOT require the user's latest consent to point at
    the CURRENTLY ACTIVE ``consent_version``. It only requires that the
    latest non-revoked row has ``scope='uso_mejora_anon'``. The reason
    is operational: when the admin publishes a new version (v2.0), every
    user is asked to re-accept on next login, but in the meantime their
    previously accepted v1.0 row is still in effect — Mabel cannot
    pretend the user has no consent at all until they re-sign. So we
    surface them as "research-eligible" while their previously-chosen
    scope is still valid; the moment they re-accept (or revoke) the
    decision updates and propagates everywhere.

    Truth table:

    | Last non-revoked consent | Active version? | Latest scope        | Eligible? |
    |--------------------------|-----------------|---------------------|-----------|
    | v1.0                     | v1.0 active     | uso_mejora_anon     | YES       |
    | v1.0                     | v2.0 active     | uso_mejora_anon     | YES       |
    | v1.0 + v2.0 (re-signed)  | v2.0 active     | uso_mejora_anon     | YES       |
    | v1.0 + v2.0 (re-signed)  | v2.0 active     | solo_uso            | NO        |
    | v1.0                     | v1.0 active     | solo_uso            | NO        |
    | (all revoked or none)    | any             | n/a                 | NO        |

    Practical consequence: publishing a new consent version does NOT
    "blank" the admin metrics dashboard. Existing users keep contributing
    under their previously chosen scope until they explicitly change it.
    """
    row_number = func.row_number().over(
        partition_by=Consent.user_id,
        order_by=Consent.accepted_at.desc(),
    ).label("rn")

    latest_consent_sq = (
        select(
            Consent.user_id.label("user_id"),
            Consent.scope.label("scope"),
            row_number,
        )
        .where(Consent.revoked_at.is_(None))
        .subquery()
    )

    # Defensive role guard: even if a row in `consents` accidentally
    # belongs to an admin (e.g. a historic registration when an admin
    # went through the normal student flow, or a future SQL edit), we
    # exclude them from research datasets. Admins are NEVER part of the
    # study cohort by definition — they're operators of the system, not
    # participants. Without this JOIN+filter, an admin who at some point
    # had a non-revoked `uso_mejora_anon` row would leak into thesis
    # aggregations. Belt-and-suspenders on top of the operational rule
    # that admins shouldn't have consent rows in the first place.
    stmt = (
        select(latest_consent_sq.c.user_id)
        .join(User, User.id == latest_consent_sq.c.user_id)
        .where(
            latest_consent_sq.c.rn == 1,
            latest_consent_sq.c.scope == RESEARCH_SCOPE,
            User.role != "admin",
        )
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]
