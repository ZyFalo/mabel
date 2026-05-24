# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and any other AI consuming this repository's documentation. It is the canonical entry point.

> **Estado**: alineado al 2026-05-24 · commit `4d124e2` ("docs(audit): registrar auditoria...")
> **Para navegación de la documentación**: ver `docs/README.md`.

## Project Overview

**Mabel-IA** is an AI-powered virtual assistant for mental health psychoeducational support for students at Universidad Manuela Beltrán (UMB), Bogotá, Colombia. Thesis project (Ingeniería de Software, 2026). Quasi-experimental study (pretest-posttest, 30 students).

**Current phase**: Fases 1-8 implemented and merged to `main` (pilotable + admin panel + retention cron). Fases 9 (avatar 3D) and 10 (testing/deployment polish) pending. See `docs/FASES_IMPLEMENTACION.md`.

**Hosting**: hybrid Railway + Modal.com (NOT 100% local as earlier drafts said).
- Backend (FastAPI), Frontend (built SPA), Postgres → Railway (container PaaS).
- LLM Mabel-Gemma4-E4B (fine-tuned Gemma 4 E4B, Q4_K_M GGUF ~3.5GB) → Modal.com (serverless GPU T4).
- Cron L2 retention service → Railway (separate service, daily 03:00 UTC).

## Development Commands

```bash
# Backend — start dev server
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend — start dev server
cd frontend && npm run dev   # http://localhost:5173

# Database — PostgreSQL via Docker (local dev only)
docker compose up -d          # starts postgres:16 on port 5433

# Migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Linting
cd backend && ruff check . && ruff format .
cd frontend && npx eslint . && npx prettier --check .

# Frontend build (production)
cd frontend && npm run build

# TypeScript check
cd frontend && npx tsc --noEmit

# Cron L2 retention — run manually
cd backend && source .venv/bin/activate && python -m scripts.redact_old_message_ids

# Piper TTS setup (only needed for local dev; production downloads in Dockerfile)
bash scripts/setup-piper.sh
```

## Architecture

**Monorepo**: `backend/` (FastAPI) + `frontend/` (React SPA) + `db/` (DDL declarative, see drift note in `docs/DB_SCHEMA.md`).

### Backend Layers (backend/app/)
- **routers/** — FastAPI endpoints organized by feature. Admin routers under `routers/admin/` (users, reports, safety-events, metrics, config, audit-logs, empathy-ratings).
- **services/** — Business logic (chat_service, auth_service, guardrails_service, consent_service, account_service, asr_service, tts_service, and admin services).
- **services/llm/** — LLM abstraction: `LLMProvider(Protocol)` + adapters. **Default**: `OpenAICompatAdapter` (works with Modal-hosted Mabel-Gemma4, Gemini OpenAI-compat, vLLM, Ollama). **Legacy fallback**: `GeminiAdapter` (google-generativeai SDK).
- **repositories/** — Data access layer.
- **models/** — SQLAlchemy ORM models (15 tables — see `docs/DB_SCHEMA.md`).
- **schemas/** — Pydantic DTOs.
- **middleware/auth.py** — JWT auth + consent + disabled-user check.
- **core/config.py** — Pydantic Settings. `JWT_SECRET` is optional (default `""`) so cron service can import settings without crashing; web service validates it in its lifespan.
- **core/database.py** — async SQLAlchemy engine + session factory.

### Frontend Structure (frontend/src/)
- **pages/** — Route components. Student (17): Landing, Register, Login, ForgotPassword, ResetPassword, Consent, ConsentRejected, ConsentRequired, AccessDenied, Onboarding, Home, CheckIn, Chat, **Voice** (modo voz 2D), SessionEnd, SessionDetail, Settings. Admin (9): Dashboard, Users, UserDetail, Reports, SafetyEvents, Metrics, Config, AuditLogs, EmpathyRatings.
- **stores/** — Zustand (authStore, chatStore, preferencesStore, toastStore, adminStore).
- **guards/** — Route protection (ProtectedRoute, ConsentGuard, OnboardingGuard, PublicRoute, RoleGuard).
- **components/** — `layout/`, `sos/`, `chat/` (incl. `LlmStatusChip`, `StreamingIndicator`), `settings/`, `voice/` (`MabelAvatar`, `ReactiveRings`), `admin/`, `ui/`.
- **hooks/** — `useAudioRecorder`, `useTts`, `useSubtitles`, `useLlmPrewarm`, `useElapsedSeconds`, `useKeyboardShortcuts`.
- **utils/** — `streamingStatus.ts` (5-stage progressive wait text), `greetings.ts`.
- **api/client.ts** — Axios with JWT interceptor.

### Key Patterns
- **SSE streaming**: Chat messages stream via Server-Sent Events.
- **Guardrails pipeline**: pre-filter (user input) → LLM → post-filter (assistant output). Keywords + severity threshold from `system_config`.
- **Two-layer config**: `.env` for infrastructure (DATABASE_URL, JWT_SECRET, LLM_*) + `system_config` table for runtime params (sos_hotline_numbers, safety_keywords, sos_severity_threshold, guardrails_enabled).
- **Privacy by design**: Optional history (save_history toggle); soft hide (`sessions.hidden_at`) for non `solo_uso` scopes; hard DELETE with CASCADE; `safety_events.user_id` SET NULL on user delete (D-14); cron L2 redacts `message_id` from old `safety_events.payload` (Ley 1581/2012 art. 4 minimización).
- **UX wait layers** (Mabel-Gemma4 cold start): `useLlmPrewarm` polls `/api/v1/llm/health` (Page Visibility guarded); `useElapsedSeconds` counts wait; `streamingStatusText` produces 5-stage progressive text; `LlmStatusChip` in chat header shows warm/cold/down/unknown.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, Python 3.11+, Pydantic, SQLAlchemy 2.0 (async), Alembic, Uvicorn, openai>=1.50 (OpenAI-compat client) |
| Frontend | React 19, TypeScript, Vite 7, TailwindCSS v4, Zustand, React Router 7, Axios, Recharts, lucide-react |
| Database | PostgreSQL 16 (single engine dev/prod, Docker Compose local + Railway prod) |
| LLM (primary) | Mabel-Gemma4-E4B fine-tune (Q4_K_M GGUF ~3.5GB) hosted on Modal.com (NVIDIA T4) via OpenAI-compat |
| LLM (fallback) | Google Gemini 2.5 Flash via google-generativeai SDK (legacy) |
| Voice | faster-whisper (ASR, model size configurable), Piper TTS (subprocess, voice baked into Docker image) |
| Auth | PyJWT + bcrypt (stateless JWT) |
| Deploy | Railway (container PaaS), Modal.com (LLM serverless GPU), Docker multi-stage build |

Full detail: `docs/TECH_STACK.md`.

## Database

**15 tables in PostgreSQL 16** (Evo 011 added `session_ratings`, Evo 012 added `sessions.hidden_at`). DDL declarative file `db/schema_postgresql.sql` has partial drift — **`backend/alembic/versions/*.py` is the operational truth**. Full catalog: `docs/DB_SCHEMA.md`.

UUIDs for all PKs (`gen_random_uuid()`), except `system_config` (TEXT PK). All temporal columns are `TIMESTAMPTZ` (Evo 007 conversion).

## Environment Variables

Required in `.env` (root) for the web service:
- `DATABASE_URL` — PostgreSQL async connection string
- `JWT_SECRET` — secret for JWT signing (web service requires; cron service does not — validates in lifespan)

LLM (defaults work but should be overridden in production):
- `LLM_PROVIDER` (default `openai_compat`; alt: `gemini_native`)
- `LLM_FLAVOR` (default `generic`; **prod uses `mabel_gemma4`** for the fixed-prompt fine-tune)
- `LLM_BASE_URL` (default Gemini OpenAI-compat URL; **prod points to `https://<modal-app>.modal.run/v1`**)
- `LLM_API_KEY` (preferred; falls back to `GEMINI_API_KEY`)
- `LLM_MODEL` (default `gemini-2.5-flash`; prod `mabel-gemma4-e4b`)
- `LLM_TIMEOUT_MS` (default `30000`; prod `180000` for cold start)

Optional with defaults in `config.py`: `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`, `CORS_ORIGINS`, `CONTEXT_WINDOW_SIZE`, `WHISPER_MODEL`, `PIPER_VOICE`, `PIPER_MODEL_PATH`, `UPLOAD_DIR`.

## API Endpoints

All prefixed with `/api/v1/`. Auth via `Authorization: Bearer <JWT>`. Full inventory in OpenAPI at `/docs` (uvicorn) and summarized in `docs/TECH_STACK.md`.

Categories: auth, consent, users, preferences, sessions, messages (SSE), reports, safety-events, voice (asr, tts), llm (health), admin/* (users, reports, safety-events, metrics, config, audit-logs, empathy-ratings), system-config, health.

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#A51916` | Header bg, primary buttons, UMB red |
| `accent` | `#0F303A` | Sidebar bg, teal |
| `danger` | `#DC2626` | SOS FAB, crisis alerts |
| `success` | `#16A34A` | Success states |
| `warning` | `#F59E0B` | Warning states |

SOS FAB: 56px circle, white bg, 2px `#DC2626` border, bottom-right. ASR recording: pulsing red border `#DC2626`. Brand-skin applied to student (commit `ca845f4`) and admin (commit `543f4b9`).

## Mandatory Conventions

- **Database changes**: Use the `database-schema-designer` skill before schema modifications.
- **Frontend creation**: Use the `frontend-design` skill before creating/modifying UI.
- **Documentation lookup**: Consult Context7 MCP before writing code for any library.
- **Mockups**: `Mockups/mockups.pen` (42 screens). Use Pencil MCP tools, NOT Read/Grep for `.pen` files.
- **Auth**: PyJWT (not python-jose). JWT stateless sessions with bcrypt.
- **LLM identity**: Never expose Google/Gemini identity. Mabel IA is the only identity (the Mabel-Gemma4 system prompt is fixed and lives in `backend/app/services/llm/prompts.py`).
- **Language**: All user-facing content in Spanish (es). Code identifiers in English.
- **Documentation updates**: Any PR affecting architecture, schema, deploy, or user flow MUST include the corresponding update in `docs/*.md`. Verified by code-review skill pre-commit.
- **Code review pre-commit**: Run `/review` (high-effort, 3 angles + verifiers) on staged changes before commit. Resolve all findings, then commit. See `MEMORY.md` workflow agreements.

## Development State

| Fase | Description | Status |
|------|-------------|--------|
| 1 | Infrastructure + DB | ✅ Done |
| 2 | Auth + Consent | ✅ Done |
| 3 | Chat Core + LLM | ✅ Done (migrated to Mabel-Gemma4) |
| 4 | Guardrails + SOS | ✅ Done |
| 5 | Preferences + Onboarding + Legal | ✅ Done |
| 6 | Check-in + Reports | ✅ Done |
| 7 | Voice ASR/TTS | ✅ Done |
| 8 | Admin Panel | ✅ Done (commits `ffe1211`, `ca845f4`) |
| 9 | 3D Avatar + Lip Sync | ⏳ Pending (MVP uses 2D animated avatar in `/voice`) |
| 10 | Testing + QA + Deployment polish | ⏳ Pending |

Additionally completed but not in original 10-phase plan:
- LLM swap to OpenAI-compat + Mabel-Gemma4 (commit `768b17d`, 2026-05-23)
- Cron L2 retention service (commit `8adbb54`, 2026-05-24)
- 3-layer UX wait communication for LLM cold start (commits `ee2d3ca` + `fd089b3`, 2026-05-24)
- Manual audit + addenda for thesis manuals (commit `4d124e2`, 2026-05-24)

Full historical detail: `docs/FASES_IMPLEMENTACION.md`.

## Legal Context

Colombian law: Ley 1581/2012 (data protection) + Decreto 1377/2013, Ley 1616/2013 (mental health), Resolución 8430/1993 (research risk classification), Ley 1419/2010 (telehealth). UNESCO 2021 AI ethics + EU AI Act (transparency principles). Full compliance design: `docs/DATA_RETENTION_POLICY.md`.

## Success Criteria

- SUS usability >= 70
- Well-being effect size >= 0.3
- Median latency <= 20s (Mabel-Gemma4 warm; cold start 60-90s only on first message after >5min idle)
- 0 critical guardrail violations
- Empathetic tone >= 4/5 in >= 80% of cases

## Where to find more

`docs/README.md` is the master index. Start there if you're not sure where to look. Notion pages are obsolete (>2 months stale) — do not consult them.
