"""Admin Metrics service — Capability 4 (admin-metrics).

Aggregations for dashboard KPIs and 5 metrics tabs (Uso, Bienestar, Tecnicas,
Seguridad, Estudio). Implements D-11 (raw SQL aggregations, no caching),
D-03 (never serialize messages.content), D-08 (CSV anonymization).

Statistics computed with numpy (scipy is not installed). Cohen's d and a
two-tailed paired t-test approximation are implemented manually.
"""

from __future__ import annotations

import hashlib
import math
import uuid
from collections.abc import AsyncGenerator
from datetime import date, datetime, timedelta, timezone
from typing import Any

import numpy as np
from sqlalchemy import Float, Integer, String, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.models.message_report import MessageReport
from app.models.safety_event import SafetyEvent
from app.models.session import Session as SessionModel
from app.models.survey_response import SurveyResponse
from app.models.user import User
from app.repositories.survey_response_repository import SurveyResponseRepository

# Gemini 2.5 Flash pricing snapshot (USD per 1M tokens).
# Source: Google AI pricing page (as of 2026 — verified for gemini-2.5-flash).
# Update here if the model or rate card changes.
GEMINI_PRICE_INPUT_PER_M_USD = 0.075
GEMINI_PRICE_OUTPUT_PER_M_USD = 0.30


def _hash16(value: object) -> str:
    """Anonymize an id-like value via SHA-256 truncated to 16 hex chars (D-08)."""
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _date_range(from_date: date | None, to_date: date | None) -> tuple[date, date]:
    """Normalize from/to. Default last 30 days inclusive."""
    today = date.today()
    to_d = to_date or today
    from_d = from_date or (to_d - timedelta(days=30))
    if from_d > to_d:
        from_d, to_d = to_d, from_d
    return from_d, to_d


def _to_dt(d: date, end: bool = False) -> datetime:
    return datetime.combine(d, datetime.max.time() if end else datetime.min.time())


# ---------------------------------------------------------------------------
# Statistics helpers (numpy only — no scipy)
# ---------------------------------------------------------------------------


def _safe_mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(np.mean(values))


def _safe_std(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    return float(np.std(values, ddof=1))


def _ci95(values: list[float]) -> tuple[float | None, float | None]:
    """95% CI for the mean (normal approximation)."""
    n = len(values)
    if n < 2:
        return None, None
    mean = float(np.mean(values))
    std = float(np.std(values, ddof=1))
    sem = std / math.sqrt(n)
    return mean - 1.96 * sem, mean + 1.96 * sem


def _normal_two_tail_p(z: float) -> float:
    """Two-tailed p-value via normal approx. erf — acceptable for pilot study."""
    return float(2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0)))))


def _paired_stats(
    pairs: list[tuple[float, float]],
) -> tuple[float | None, float | None, float | None, float | None]:
    """Return (mean_pre, mean_post, cohens_d, p_value) for paired (pre, post) data.

    Returns Nones gracefully when n < 2.
    """
    if not pairs:
        return None, None, None, None
    pre = np.array([p for p, _ in pairs], dtype=float)
    post = np.array([q for _, q in pairs], dtype=float)
    mean_pre = float(np.mean(pre))
    mean_post = float(np.mean(post))
    if len(pairs) < 2:
        return mean_pre, mean_post, None, None
    diffs = post - pre
    sd_diffs = float(np.std(diffs, ddof=1))
    if sd_diffs == 0:
        return mean_pre, mean_post, None, None
    cohens_d = float(np.mean(diffs) / sd_diffs)
    t_value = float(np.mean(diffs) / (sd_diffs / math.sqrt(len(diffs))))
    p_value = _normal_two_tail_p(t_value)
    return mean_pre, mean_post, cohens_d, p_value


def _bucket_score(values: list[float], edges: list[tuple[float, float]], labels: list[str]) -> list[dict]:
    """Bucket scores into [low, high) intervals (last bucket is inclusive)."""
    out = []
    for (lo, hi), label in zip(edges, labels, strict=False):
        count = sum(1 for v in values if (lo <= v < hi) or (label == labels[-1] and v == hi))
        out.append({"bucket": label, "count": count})
    return out


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class AdminMetricsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.survey_repo = SurveyResponseRepository(db)

    # -----------------------------------------------------------------------
    # Dashboard
    # -----------------------------------------------------------------------

    async def dashboard_kpis(self, cohort: str | None = None) -> dict[str, Any]:
        now = _utc_now()
        today = date.today()
        week_ago = now - timedelta(days=7)
        day_ago = now - timedelta(hours=24)
        thirty_days_ago = now - timedelta(days=30)
        fourteen_days_ago = now - timedelta(days=14)

        # KPI: total active users
        total_users_stmt = (
            select(func.count()).select_from(User).where(User.deleted_at.is_(None))
        )
        if cohort is not None:
            total_users_stmt = total_users_stmt.where(User.cohort == cohort)
        total_users = await self._scalar(total_users_stmt)

        # KPI: new users this week
        new_week_stmt = (
            select(func.count())
            .select_from(User)
            .where(User.deleted_at.is_(None), User.created_at >= week_ago)
        )
        if cohort is not None:
            new_week_stmt = new_week_stmt.where(User.cohort == cohort)
        users_new_this_week = await self._scalar(new_week_stmt)

        # KPI: sessions today (by date of started_at)
        sessions_today_stmt = (
            select(func.count())
            .select_from(SessionModel)
            .where(func.date(SessionModel.started_at) == today)
        )
        if cohort is not None:
            sessions_today_stmt = sessions_today_stmt.join(
                User, SessionModel.user_id == User.id
            ).where(User.cohort == cohort)
        sessions_today = await self._scalar(sessions_today_stmt)

        # KPI: safety events in last 24h
        safety_24h_stmt = (
            select(func.count())
            .select_from(SafetyEvent)
            .where(SafetyEvent.created_at >= day_ago)
        )
        if cohort is not None:
            safety_24h_stmt = safety_24h_stmt.join(
                User, SafetyEvent.user_id == User.id
            ).where(User.cohort == cohort)
        safety_events_24h = await self._scalar(safety_24h_stmt)

        # KPI: open reports
        reports_pending_stmt = (
            select(func.count())
            .select_from(MessageReport)
            .where(MessageReport.status == "open")
        )
        if cohort is not None:
            reports_pending_stmt = reports_pending_stmt.join(
                User, MessageReport.reporter_id == User.id
            ).where(User.cohort == cohort)
        reports_pending = await self._scalar(reports_pending_stmt)

        # KPI: avg latency over last 30 days (assistant messages only)
        latency_avg_stmt = (
            select(func.avg(Message.latency_ms))
            .where(
                Message.role == "assistant",
                Message.latency_ms.is_not(None),
                Message.created_at >= thirty_days_ago,
            )
        )
        if cohort is not None:
            latency_avg_stmt = (
                latency_avg_stmt.join(SessionModel, Message.session_id == SessionModel.id)
                .join(User, SessionModel.user_id == User.id)
                .where(User.cohort == cohort)
            )
        latency_result = await self.db.execute(latency_avg_stmt)
        latency_raw = latency_result.scalar()
        latency_avg_ms = int(latency_raw) if latency_raw is not None else 0

        # KPI: SUS average
        sus_scores = await self._sus_scores(cohort=cohort)
        sus_avg = _safe_mean(sus_scores)

        # Series: sessions per day (last 30d)
        sessions_per_day_30d = await self._sessions_per_day(thirty_days_ago, now, cohort=cohort)

        # Series: mood distribution (last 30d)
        mood_distribution_30d = await self._mood_distribution(thirty_days_ago, now, cohort=cohort)

        # Series: latency per day (last 30d)
        latency_per_day_30d = await self._latency_per_day(thirty_days_ago, now, cohort=cohort)

        # Series: safety events by type (last 30d)
        safety_events_by_type_30d = await self._safety_events_by_type(
            thirty_days_ago, now, cohort=cohort
        )

        # Series: guardrails activations (last 14d) — event_type 'risk_detected'
        guardrails_activations_14d = await self._guardrails_per_day(
            fourteen_days_ago, now, event_type="risk_detected", cohort=cohort
        )

        # Last 5 safety events
        last_5_stmt = (
            select(SafetyEvent)
            .order_by(SafetyEvent.created_at.desc())
            .limit(5)
        )
        if cohort is not None:
            last_5_stmt = (
                select(SafetyEvent)
                .join(User, SafetyEvent.user_id == User.id)
                .where(User.cohort == cohort)
                .order_by(SafetyEvent.created_at.desc())
                .limit(5)
            )
        last_5_result = await self.db.execute(last_5_stmt)
        last_5_safety_events = []
        for ev in last_5_result.scalars().all():
            severity = None
            if isinstance(ev.payload, dict):
                sev = ev.payload.get("severity")
                if isinstance(sev, (int, float)):
                    severity = int(sev)
            last_5_safety_events.append(
                {
                    "id": str(ev.id),
                    "event_type": ev.event_type,
                    "severity": severity,
                    "status": ev.status,
                    "created_at": ev.created_at.isoformat() if ev.created_at else None,
                }
            )

        return {
            "total_users": total_users,
            "users_new_this_week": users_new_this_week,
            "sessions_today": sessions_today,
            "safety_events_24h": safety_events_24h,
            "reports_pending": reports_pending,
            "latency_avg_ms": latency_avg_ms,
            "sus_avg": sus_avg,
            "sessions_per_day_30d": sessions_per_day_30d,
            "mood_distribution_30d": mood_distribution_30d,
            "latency_per_day_30d": latency_per_day_30d,
            "safety_events_by_type_30d": safety_events_by_type_30d,
            "guardrails_activations_14d": guardrails_activations_14d,
            "last_5_safety_events": last_5_safety_events,
        }

    # -----------------------------------------------------------------------
    # Tab A — Uso
    # -----------------------------------------------------------------------

    async def metrics_usage(
        self,
        from_date: date | None,
        to_date: date | None,
        cohort: str | None = None,
    ) -> dict[str, Any]:
        from_d, to_d = _date_range(from_date, to_date)
        from_dt, to_dt = _to_dt(from_d), _to_dt(to_d, end=True)

        # Active users per day (distinct user_id in sessions)
        day_col = func.date_trunc("day", SessionModel.started_at).label("day")
        active_users_stmt = (
            select(day_col, func.count(func.distinct(SessionModel.user_id)).label("count"))
            .where(SessionModel.started_at >= from_dt, SessionModel.started_at <= to_dt)
            .group_by(day_col)
            .order_by(day_col)
        )
        if cohort is not None:
            active_users_stmt = active_users_stmt.join(
                User, SessionModel.user_id == User.id
            ).where(User.cohort == cohort)
        active_users_result = await self.db.execute(active_users_stmt)
        active_users_per_day = [
            {"date": _date_str(d), "count": int(c)} for d, c in active_users_result.all()
        ]

        # Sessions per user distribution
        per_user_stmt = (
            select(SessionModel.user_id, func.count().label("count"))
            .where(SessionModel.started_at >= from_dt, SessionModel.started_at <= to_dt)
            .group_by(SessionModel.user_id)
        )
        if cohort is not None:
            per_user_stmt = per_user_stmt.join(
                User, SessionModel.user_id == User.id
            ).where(User.cohort == cohort)
        per_user_result = await self.db.execute(per_user_stmt)
        buckets = {"1-2": 0, "3-5": 0, "6-10": 0, "10+": 0}
        for _, count in per_user_result.all():
            c = int(count)
            if c <= 2:
                buckets["1-2"] += 1
            elif c <= 5:
                buckets["3-5"] += 1
            elif c <= 10:
                buckets["6-10"] += 1
            else:
                buckets["10+"] += 1

        # Avg messages per session
        msg_stmt = (
            select(func.count().label("c"))
            .select_from(Message)
            .join(SessionModel, Message.session_id == SessionModel.id)
            .where(SessionModel.started_at >= from_dt, SessionModel.started_at <= to_dt)
            .group_by(Message.session_id)
        )
        if cohort is not None:
            msg_stmt = msg_stmt.join(User, SessionModel.user_id == User.id).where(
                User.cohort == cohort
            )
        msg_result = await self.db.execute(msg_stmt)
        counts = [int(c) for (c,) in msg_result.all()]
        avg_messages_per_session = float(np.mean(counts)) if counts else 0.0

        # Avg session duration (only ended sessions)
        duration_stmt = (
            select(
                func.avg(
                    func.extract("epoch", SessionModel.ended_at - SessionModel.started_at) / 60.0
                )
            )
            .where(
                SessionModel.started_at >= from_dt,
                SessionModel.started_at <= to_dt,
                SessionModel.ended_at.is_not(None),
            )
        )
        if cohort is not None:
            duration_stmt = duration_stmt.join(
                User, SessionModel.user_id == User.id
            ).where(User.cohort == cohort)
        duration_result = await self.db.execute(duration_stmt)
        duration_raw = duration_result.scalar()
        avg_session_duration_minutes = float(duration_raw) if duration_raw is not None else 0.0

        return {
            "active_users_per_day": active_users_per_day,
            "sessions_per_user_distribution": buckets,
            "avg_messages_per_session": round(avg_messages_per_session, 2),
            "avg_session_duration_minutes": round(avg_session_duration_minutes, 2),
        }

    # -----------------------------------------------------------------------
    # Tab B — Bienestar
    # -----------------------------------------------------------------------

    async def metrics_wellbeing(
        self,
        from_date: date | None,
        to_date: date | None,
        cohort: str | None = None,
    ) -> dict[str, Any]:
        from_d, to_d = _date_range(from_date, to_date)
        from_dt, to_dt = _to_dt(from_d), _to_dt(to_d, end=True)

        # Common filter: only sessions with completed check-in
        completed_filter = (
            SessionModel.checkin_completed_at.is_not(None),
            SessionModel.checkin_completed_at >= from_dt,
            SessionModel.checkin_completed_at <= to_dt,
            SessionModel.checkin_payload.is_not(None),
        )

        def _apply_cohort(stmt):
            if cohort is None:
                return stmt
            return stmt.join(User, SessionModel.user_id == User.id).where(
                User.cohort == cohort
            )

        mood_expr = cast(SessionModel.checkin_payload["mood"].astext, Float)
        sleep_expr = cast(SessionModel.checkin_payload["sleep"].astext, Float)
        focus_expr = SessionModel.checkin_payload["focus"].astext

        # Mood per day (mean)
        day_col = func.date_trunc("day", SessionModel.checkin_completed_at).label("day")
        mood_stmt = (
            select(day_col, func.avg(mood_expr).label("mean"))
            .where(*completed_filter)
            .group_by(day_col)
            .order_by(day_col)
        )
        mood_stmt = _apply_cohort(mood_stmt)
        mood_result = await self.db.execute(mood_stmt)
        mood_per_day = [
            {"date": _date_str(d), "mean": float(m) if m is not None else None}
            for d, m in mood_result.all()
        ]

        # Sleep per day (mean)
        sleep_stmt = (
            select(day_col, func.avg(sleep_expr).label("mean"))
            .where(*completed_filter)
            .group_by(day_col)
            .order_by(day_col)
        )
        sleep_stmt = _apply_cohort(sleep_stmt)
        sleep_result = await self.db.execute(sleep_stmt)
        sleep_per_day = [
            {"date": _date_str(d), "mean": float(m) if m is not None else None}
            for d, m in sleep_result.all()
        ]

        # Focus distribution per week
        week_col = func.date_trunc("week", SessionModel.checkin_completed_at).label("week")
        focus_stmt = (
            select(week_col, focus_expr.label("focus"), func.count().label("count"))
            .where(*completed_filter)
            .group_by(week_col, focus_expr)
            .order_by(week_col)
        )
        focus_stmt = _apply_cohort(focus_stmt)
        focus_result = await self.db.execute(focus_stmt)
        focus_distribution_per_week = [
            {
                "week": _date_str(w),
                "focus_category": (f if f is not None else "unknown"),
                "count": int(c),
            }
            for w, f, c in focus_result.all()
        ]

        # Mood summary (numpy)
        mood_values_stmt = select(mood_expr).where(*completed_filter)
        mood_values_stmt = _apply_cohort(mood_values_stmt)
        mood_values_result = await self.db.execute(mood_values_stmt)
        mood_values = [float(v) for v in mood_values_result.scalars().all() if v is not None]
        if mood_values:
            ci_low, ci_high = _ci95(mood_values)
            mood_summary = {
                "mean": float(np.mean(mood_values)),
                "median": float(np.median(mood_values)),
                "std": _safe_std(mood_values),
                "ci95_low": ci_low,
                "ci95_high": ci_high,
                "min": float(np.min(mood_values)),
                "max": float(np.max(mood_values)),
            }
        else:
            mood_summary = {
                "mean": None,
                "median": None,
                "std": None,
                "ci95_low": None,
                "ci95_high": None,
                "min": None,
                "max": None,
            }

        return {
            "mood_per_day": mood_per_day,
            "focus_distribution_per_week": focus_distribution_per_week,
            "sleep_per_day": sleep_per_day,
            "mood_summary": mood_summary,
        }

    # -----------------------------------------------------------------------
    # Tab C — Tecnicas
    # -----------------------------------------------------------------------

    async def metrics_technical(
        self,
        from_date: date | None,
        to_date: date | None,
        cohort: str | None = None,
    ) -> dict[str, Any]:
        from_d, to_d = _date_range(from_date, to_date)
        from_dt, to_dt = _to_dt(from_d), _to_dt(to_d, end=True)

        def _apply_msg_cohort(stmt):
            if cohort is None:
                return stmt
            return (
                stmt.join(SessionModel, Message.session_id == SessionModel.id)
                .join(User, SessionModel.user_id == User.id)
                .where(User.cohort == cohort)
            )

        # Latency percentiles per day (assistant messages)
        day_col = func.date_trunc("day", Message.created_at).label("day")
        latency_filter = (
            Message.role == "assistant",
            Message.latency_ms.is_not(None),
            Message.created_at >= from_dt,
            Message.created_at <= to_dt,
        )
        latency_float = cast(Message.latency_ms, Float)
        p50 = func.percentile_cont(0.5).within_group(latency_float.asc()).label("p50")
        p95 = func.percentile_cont(0.95).within_group(latency_float.asc()).label("p95")
        p99 = func.percentile_cont(0.99).within_group(latency_float.asc()).label("p99")

        percentiles_stmt = (
            select(day_col, p50, p95, p99)
            .where(*latency_filter)
            .group_by(day_col)
            .order_by(day_col)
        )
        percentiles_stmt = _apply_msg_cohort(percentiles_stmt)
        percentiles_result = await self.db.execute(percentiles_stmt)
        latency_percentiles_per_day = [
            {
                "date": _date_str(d),
                "p50": float(v50) if v50 is not None else None,
                "p95": float(v95) if v95 is not None else None,
                "p99": float(v99) if v99 is not None else None,
            }
            for d, v50, v95, v99 in percentiles_result.all()
        ]

        # Pct turns under 20s
        total_turns_stmt = select(func.count()).select_from(Message).where(*latency_filter)
        under_20s_stmt = (
            select(func.count())
            .select_from(Message)
            .where(*latency_filter, Message.latency_ms < 20000)
        )
        total_turns_stmt = _apply_msg_cohort(total_turns_stmt)
        under_20s_stmt = _apply_msg_cohort(under_20s_stmt)
        total_turns = int((await self.db.execute(total_turns_stmt)).scalar_one())
        under_20s = int((await self.db.execute(under_20s_stmt)).scalar_one())
        pct_turns_under_20s = (under_20s / total_turns * 100.0) if total_turns > 0 else 0.0

        # Tokens per day (assistant messages — completion + matching prompt)
        token_day_col = func.date_trunc("day", Message.created_at).label("day")
        tokens_stmt = (
            select(
                token_day_col,
                func.coalesce(func.sum(Message.tokens_prompt), 0).label("prompt_tokens"),
                func.coalesce(func.sum(Message.tokens_completion), 0).label("completion_tokens"),
            )
            .where(
                Message.created_at >= from_dt,
                Message.created_at <= to_dt,
            )
            .group_by(token_day_col)
            .order_by(token_day_col)
        )
        tokens_stmt = _apply_msg_cohort(tokens_stmt)
        tokens_result = await self.db.execute(tokens_stmt)
        tokens_per_day = []
        total_prompt = 0
        total_completion = 0
        for d, p, c in tokens_result.all():
            tokens_per_day.append(
                {
                    "date": _date_str(d),
                    "prompt_tokens": int(p),
                    "completion_tokens": int(c),
                }
            )
            total_prompt += int(p)
            total_completion += int(c)

        # Gemini cost estimation (Task 30)
        cost_in = total_prompt * GEMINI_PRICE_INPUT_PER_M_USD / 1_000_000.0
        cost_out = total_completion * GEMINI_PRICE_OUTPUT_PER_M_USD / 1_000_000.0
        gemini_cost_estimate_usd = round(cost_in + cost_out, 4)

        return {
            "latency_percentiles_per_day": latency_percentiles_per_day,
            "pct_turns_under_20s": round(pct_turns_under_20s, 2),
            "tokens_per_day": tokens_per_day,
            "gemini_cost_estimate_usd": gemini_cost_estimate_usd,
        }

    # -----------------------------------------------------------------------
    # Tab D — Seguridad
    # -----------------------------------------------------------------------

    async def metrics_safety(
        self,
        from_date: date | None,
        to_date: date | None,
        cohort: str | None = None,
    ) -> dict[str, Any]:
        from_d, to_d = _date_range(from_date, to_date)
        from_dt, to_dt = _to_dt(from_d), _to_dt(to_d, end=True)

        def _apply_safety_cohort(stmt):
            if cohort is None:
                return stmt
            return stmt.join(User, SafetyEvent.user_id == User.id).where(
                User.cohort == cohort
            )

        # Safety events per day
        day_col = func.date_trunc("day", SafetyEvent.created_at).label("day")
        per_day_stmt = (
            select(day_col, func.count().label("count"))
            .where(SafetyEvent.created_at >= from_dt, SafetyEvent.created_at <= to_dt)
            .group_by(day_col)
            .order_by(day_col)
        )
        per_day_stmt = _apply_safety_cohort(per_day_stmt)
        per_day_result = await self.db.execute(per_day_stmt)
        safety_events_per_day = [
            {"date": _date_str(d), "count": int(c)} for d, c in per_day_result.all()
        ]

        # Guardrails type distribution
        type_stmt = (
            select(SafetyEvent.event_type, func.count().label("count"))
            .where(SafetyEvent.created_at >= from_dt, SafetyEvent.created_at <= to_dt)
            .group_by(SafetyEvent.event_type)
            .order_by(func.count().desc())
        )
        type_stmt = _apply_safety_cohort(type_stmt)
        type_result = await self.db.execute(type_stmt)
        guardrails_type_distribution = [
            {"event_type": t, "count": int(c)} for t, c in type_result.all()
        ]

        # Infraction rate (events / messages) — last 30 days, regardless of window
        thirty_days_ago = _utc_now() - timedelta(days=30)
        events_30d_stmt = (
            select(func.count())
            .select_from(SafetyEvent)
            .where(SafetyEvent.created_at >= thirty_days_ago)
        )
        if cohort is not None:
            events_30d_stmt = events_30d_stmt.join(
                User, SafetyEvent.user_id == User.id
            ).where(User.cohort == cohort)
        messages_30d_stmt = (
            select(func.count())
            .select_from(Message)
            .where(Message.created_at >= thirty_days_ago)
        )
        if cohort is not None:
            messages_30d_stmt = (
                messages_30d_stmt.join(SessionModel, Message.session_id == SessionModel.id)
                .join(User, SessionModel.user_id == User.id)
                .where(User.cohort == cohort)
            )
        events_30d = int((await self.db.execute(events_30d_stmt)).scalar_one())
        messages_30d = int((await self.db.execute(messages_30d_stmt)).scalar_one())
        infraction_rate = (events_30d / messages_30d) if messages_30d > 0 else 0.0

        # Top keywords (anonymized) — extract from safety_events.payload->>'keywords' (array)
        keywords_stmt = (
            select(SafetyEvent.payload)
            .where(
                SafetyEvent.created_at >= from_dt,
                SafetyEvent.created_at <= to_dt,
                SafetyEvent.payload.is_not(None),
            )
        )
        keywords_stmt = _apply_safety_cohort(keywords_stmt)
        keywords_result = await self.db.execute(keywords_stmt)
        counter: dict[str, int] = {}
        total_kw = 0
        for (payload,) in keywords_result.all():
            if not isinstance(payload, dict):
                continue
            kws = payload.get("keywords")
            if not isinstance(kws, list):
                continue
            for kw in kws:
                if not isinstance(kw, str) or not kw.strip():
                    continue
                key_anon = _hash16(kw.lower().strip())
                counter[key_anon] = counter.get(key_anon, 0) + 1
                total_kw += 1

        top_sorted = sorted(counter.items(), key=lambda kv: kv[1], reverse=True)[:10]
        top_keywords = [
            {
                "keyword_anonymized": k,
                "count": v,
                "percentage": round((v / total_kw * 100.0) if total_kw > 0 else 0.0, 2),
            }
            for k, v in top_sorted
        ]

        return {
            "safety_events_per_day": safety_events_per_day,
            "guardrails_type_distribution": guardrails_type_distribution,
            "infraction_rate": round(infraction_rate, 6),
            "top_keywords": top_keywords,
        }

    # -----------------------------------------------------------------------
    # Tab E — Estudio
    # -----------------------------------------------------------------------

    async def metrics_study(self, cohort: str | None = None) -> dict[str, Any]:
        sus_scores = await self._sus_scores(cohort=cohort)
        empathy_scores = await self._empathy_scores(cohort=cohort)
        pairs = await self._wellbeing_pairs(cohort=cohort)

        sus_buckets = _bucket_score(
            sus_scores,
            edges=[(0, 25), (25, 50), (50, 75), (75, 100)],
            labels=["0-25", "25-50", "50-75", "75-100"],
        )

        empathy_buckets = _bucket_score(
            empathy_scores,
            edges=[(0, 1), (1, 2), (2, 3), (3, 4), (4, 5)],
            labels=["0-1", "1-2", "2-3", "3-4", "4-5"],
        )

        sus_mean = _safe_mean(sus_scores)
        sus_mean_vs_target = {"mean": sus_mean, "target": 70}

        # Cohen's d estimate over wellbeing pairs
        mean_pre, mean_post, cohens_d, p_value = _paired_stats(pairs)
        cohens_d_estimate = cohens_d

        if mean_pre is None:
            wellbeing_pre_post_comparison = []
        else:
            diff = (mean_post - mean_pre) if (mean_pre is not None and mean_post is not None) else None
            wellbeing_pre_post_comparison = [
                {
                    "group": "all",
                    "n": len(pairs),
                    "mean_pre": mean_pre,
                    "mean_post": mean_post,
                    "diff": diff,
                    "cohens_d": cohens_d,
                    "p_value": p_value,
                }
            ]

        return {
            "sus_distribution": sus_buckets,
            "sus_mean_vs_target": sus_mean_vs_target,
            "empathy_distribution": empathy_buckets,
            "cohens_d_estimate": cohens_d_estimate,
            "wellbeing_pre_post_comparison": wellbeing_pre_post_comparison,
        }

    # -----------------------------------------------------------------------
    # CSV export
    # -----------------------------------------------------------------------

    async def export_csv(
        self,
        tab: str,
        from_date: date | None,
        to_date: date | None,
        cohort: str | None = None,
    ) -> AsyncGenerator[list[str], None]:
        """Yield CSV rows (lists of str) for the chosen tab.

        Anonymizes id-like columns via SHA-256 truncated to 16 hex chars.
        Never includes messages.content (D-03).
        """
        from_d, to_d = _date_range(from_date, to_date)
        from_dt, to_dt = _to_dt(from_d), _to_dt(to_d, end=True)

        if tab == "usage":
            yield ["date", "session_id_hash", "user_id_hash", "started_at", "ended_at", "messages_count"]
            stmt = (
                select(
                    SessionModel.id,
                    SessionModel.user_id,
                    SessionModel.started_at,
                    SessionModel.ended_at,
                    func.count(Message.id).label("msg_count"),
                )
                .outerjoin(Message, Message.session_id == SessionModel.id)
                .where(
                    SessionModel.started_at >= from_dt,
                    SessionModel.started_at <= to_dt,
                )
                .group_by(SessionModel.id)
                .order_by(SessionModel.started_at)
            )
            if cohort is not None:
                stmt = stmt.join(User, SessionModel.user_id == User.id).where(
                    User.cohort == cohort
                )
            result = await self.db.execute(stmt)
            for sid, uid, started, ended, mc in result.all():
                yield [
                    started.date().isoformat() if started else "",
                    _hash16(sid),
                    _hash16(uid) if uid else "",
                    started.isoformat() if started else "",
                    ended.isoformat() if ended else "",
                    str(int(mc) if mc is not None else 0),
                ]

        elif tab == "wellbeing":
            yield ["date", "session_id_hash", "user_id_hash", "mood", "sleep", "focus"]
            stmt = (
                select(
                    SessionModel.id,
                    SessionModel.user_id,
                    SessionModel.checkin_completed_at,
                    SessionModel.checkin_payload,
                )
                .where(
                    SessionModel.checkin_completed_at.is_not(None),
                    SessionModel.checkin_completed_at >= from_dt,
                    SessionModel.checkin_completed_at <= to_dt,
                )
                .order_by(SessionModel.checkin_completed_at)
            )
            if cohort is not None:
                stmt = stmt.join(User, SessionModel.user_id == User.id).where(
                    User.cohort == cohort
                )
            result = await self.db.execute(stmt)
            for sid, uid, when, payload in result.all():
                payload = payload or {}
                yield [
                    when.date().isoformat() if when else "",
                    _hash16(sid),
                    _hash16(uid) if uid else "",
                    str(payload.get("mood", "")),
                    str(payload.get("sleep", "")),
                    str(payload.get("focus", "")),
                ]

        elif tab == "technical":
            yield [
                "date",
                "message_id_hash",
                "session_id_hash",
                "latency_ms",
                "tokens_prompt",
                "tokens_completion",
            ]
            stmt = (
                select(
                    Message.id,
                    Message.session_id,
                    Message.created_at,
                    Message.latency_ms,
                    Message.tokens_prompt,
                    Message.tokens_completion,
                )
                .where(
                    Message.role == "assistant",
                    Message.created_at >= from_dt,
                    Message.created_at <= to_dt,
                )
                .order_by(Message.created_at)
            )
            if cohort is not None:
                stmt = (
                    stmt.join(SessionModel, Message.session_id == SessionModel.id)
                    .join(User, SessionModel.user_id == User.id)
                    .where(User.cohort == cohort)
                )
            result = await self.db.execute(stmt)
            for mid, sid, when, lat, tp, tc in result.all():
                yield [
                    when.date().isoformat() if when else "",
                    _hash16(mid),
                    _hash16(sid) if sid else "",
                    str(lat if lat is not None else ""),
                    str(tp if tp is not None else ""),
                    str(tc if tc is not None else ""),
                ]

        elif tab == "safety":
            yield [
                "date",
                "event_id_hash",
                "user_id_hash",
                "session_id_hash",
                "event_type",
                "status",
                "severity",
            ]
            stmt = (
                select(SafetyEvent)
                .where(
                    SafetyEvent.created_at >= from_dt,
                    SafetyEvent.created_at <= to_dt,
                )
                .order_by(SafetyEvent.created_at)
            )
            if cohort is not None:
                stmt = stmt.join(User, SafetyEvent.user_id == User.id).where(
                    User.cohort == cohort
                )
            result = await self.db.execute(stmt)
            for ev in result.scalars().all():
                sev = None
                if isinstance(ev.payload, dict):
                    raw_sev = ev.payload.get("severity")
                    if isinstance(raw_sev, (int, float)):
                        sev = int(raw_sev)
                yield [
                    ev.created_at.date().isoformat() if ev.created_at else "",
                    _hash16(ev.id),
                    _hash16(ev.user_id) if ev.user_id else "",
                    _hash16(ev.session_id) if ev.session_id else "",
                    ev.event_type,
                    ev.status,
                    str(sev) if sev is not None else "",
                ]

        elif tab == "study":
            yield [
                "user_id_hash",
                "instrument",
                "phase",
                "score",
                "administered_at",
            ]
            stmt = select(SurveyResponse).order_by(SurveyResponse.administered_at.desc())
            if cohort is not None:
                stmt = stmt.join(User, SurveyResponse.user_id == User.id).where(
                    User.cohort == cohort
                )
            surveys_result = await self.db.execute(stmt)
            for s in surveys_result.scalars().all():
                yield [
                    _hash16(s.user_id) if s.user_id else "",
                    s.instrument,
                    s.phase,
                    str(float(s.score)) if s.score is not None else "",
                    s.administered_at.isoformat() if s.administered_at else "",
                ]

        else:
            yield ["error"]
            yield [f"unknown_tab:{tab}"]

    # -----------------------------------------------------------------------
    # Internal helpers (private aggregations)
    # -----------------------------------------------------------------------

    async def _scalar(self, stmt) -> int:
        result = await self.db.execute(stmt)
        value = result.scalar()
        return int(value) if value is not None else 0

    async def _sessions_per_day(
        self, from_dt: datetime, to_dt: datetime, cohort: str | None = None
    ) -> list[dict]:
        day_col = func.date_trunc("day", SessionModel.started_at).label("day")
        stmt = (
            select(day_col, func.count().label("count"))
            .where(SessionModel.started_at >= from_dt, SessionModel.started_at <= to_dt)
            .group_by(day_col)
            .order_by(day_col)
        )
        if cohort is not None:
            stmt = stmt.join(User, SessionModel.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        return [{"date": _date_str(d), "count": int(c)} for d, c in result.all()]

    async def _mood_distribution(
        self, from_dt: datetime, to_dt: datetime, cohort: str | None = None
    ) -> dict[str, int]:
        mood_expr = cast(SessionModel.checkin_payload["mood"].astext, Float)
        stmt = select(mood_expr).where(
            SessionModel.checkin_completed_at.is_not(None),
            SessionModel.checkin_completed_at >= from_dt,
            SessionModel.checkin_completed_at <= to_dt,
            SessionModel.checkin_payload.is_not(None),
        )
        if cohort is not None:
            stmt = stmt.join(User, SessionModel.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        bajo = medio = alto = 0
        for v in result.scalars().all():
            if v is None:
                continue
            mv = float(v)
            if mv <= 3:
                bajo += 1
            elif mv <= 6:
                medio += 1
            else:
                alto += 1
        return {"bajo": bajo, "medio": medio, "alto": alto}

    async def _latency_per_day(
        self, from_dt: datetime, to_dt: datetime, cohort: str | None = None
    ) -> list[dict]:
        day_col = func.date_trunc("day", Message.created_at).label("day")
        stmt = (
            select(day_col, func.avg(Message.latency_ms).label("avg_ms"))
            .where(
                Message.role == "assistant",
                Message.latency_ms.is_not(None),
                Message.created_at >= from_dt,
                Message.created_at <= to_dt,
            )
            .group_by(day_col)
            .order_by(day_col)
        )
        if cohort is not None:
            stmt = (
                stmt.join(SessionModel, Message.session_id == SessionModel.id)
                .join(User, SessionModel.user_id == User.id)
                .where(User.cohort == cohort)
            )
        result = await self.db.execute(stmt)
        return [
            {"date": _date_str(d), "avg_ms": int(a) if a is not None else 0}
            for d, a in result.all()
        ]

    async def _safety_events_by_type(
        self, from_dt: datetime, to_dt: datetime, cohort: str | None = None
    ) -> list[dict]:
        stmt = (
            select(SafetyEvent.event_type, func.count().label("count"))
            .where(SafetyEvent.created_at >= from_dt, SafetyEvent.created_at <= to_dt)
            .group_by(SafetyEvent.event_type)
            .order_by(func.count().desc())
        )
        if cohort is not None:
            stmt = stmt.join(User, SafetyEvent.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        return [{"event_type": t, "count": int(c)} for t, c in result.all()]

    async def _guardrails_per_day(
        self,
        from_dt: datetime,
        to_dt: datetime,
        event_type: str,
        cohort: str | None = None,
    ) -> list[dict]:
        day_col = func.date_trunc("day", SafetyEvent.created_at).label("day")
        stmt = (
            select(day_col, func.count().label("count"))
            .where(
                SafetyEvent.created_at >= from_dt,
                SafetyEvent.created_at <= to_dt,
                SafetyEvent.event_type == event_type,
            )
            .group_by(day_col)
            .order_by(day_col)
        )
        if cohort is not None:
            stmt = stmt.join(User, SafetyEvent.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        return [{"date": _date_str(d), "count": int(c)} for d, c in result.all()]

    # ----- Survey helpers (cohort-aware) ------------------------------------

    async def _sus_scores(self, cohort: str | None = None) -> list[float]:
        stmt = select(SurveyResponse.score).where(
            SurveyResponse.instrument == "sus",
            SurveyResponse.score.is_not(None),
        )
        if cohort is not None:
            stmt = stmt.join(User, SurveyResponse.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        return [float(row) for row in result.scalars().all() if row is not None]

    async def _empathy_scores(self, cohort: str | None = None) -> list[float]:
        stmt = select(SurveyResponse.score).where(
            SurveyResponse.instrument == "empathy_rubric",
            SurveyResponse.score.is_not(None),
        )
        if cohort is not None:
            stmt = stmt.join(User, SurveyResponse.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        return [float(row) for row in result.scalars().all() if row is not None]

    async def _wellbeing_pairs(
        self, cohort: str | None = None
    ) -> list[tuple[float, float]]:
        stmt = select(
            SurveyResponse.user_id,
            SurveyResponse.instrument,
            SurveyResponse.phase,
            SurveyResponse.score,
        ).where(
            SurveyResponse.instrument.in_(["wellbeing_pre", "wellbeing_post"]),
            SurveyResponse.score.is_not(None),
            SurveyResponse.user_id.is_not(None),
        )
        if cohort is not None:
            stmt = stmt.join(User, SurveyResponse.user_id == User.id).where(
                User.cohort == cohort
            )
        result = await self.db.execute(stmt)
        rows = result.all()

        pre: dict[uuid.UUID, float] = {}
        post: dict[uuid.UUID, float] = {}
        for user_id, instrument, _phase, score in rows:
            if score is None or user_id is None:
                continue
            if instrument == "wellbeing_pre":
                pre[user_id] = float(score)
            elif instrument == "wellbeing_post":
                post[user_id] = float(score)

        pairs: list[tuple[float, float]] = []
        for uid, pre_val in pre.items():
            if uid in post:
                pairs.append((pre_val, post[uid]))
        return pairs


def _date_str(d: Any) -> str:
    """Format a datetime/date from date_trunc as YYYY-MM-DD."""
    if d is None:
        return ""
    if isinstance(d, datetime):
        return d.date().isoformat()
    if isinstance(d, date):
        return d.isoformat()
    return str(d)
