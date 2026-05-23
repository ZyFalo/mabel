# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mabel-IA** is an AI-powered virtual assistant for mental health psychoeducational support for students at Universidad Manuela Beltrán (UMB), Bogota, Colombia. Thesis project (Ingenieria de Software, 2026). Quasi-experimental study (pretest-posttest, 30 students).

**Current phase**: Fases 1-7 implemented (pilotable milestone reached). Fases 8-10 pending (admin panel, 3D avatar, testing/deployment).

## Development Commands

```bash
# Backend — start dev server
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend — start dev server
cd frontend && npm run dev   # http://localhost:5173

# Database — PostgreSQL via Docker
docker compose up -d          # starts postgres:16 on port 5433

# Migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# Linting
cd backend && ruff check . && ruff format .
cd frontend && npx eslint . && npx prettier --check .

# Frontend build
cd frontend && npm run build

# TypeScript check
cd frontend && npx tsc --noEmit

# Piper TTS setup (optional — voice synthesis)
bash scripts/setup-piper.sh
```

## Architecture

**Monorepo**: `backend/` (FastAPI) + `frontend/` (React SPA) + `db/` (DDL source of truth)

### Backend Layers (backend/app/)
- **routers/** — FastAPI endpoints (10 routers: auth, consent, sessions, preferences, users, reports, safety-events, system-config, asr, tts)
- **services/** — Business logic (chat_service, auth_service, guardrails_service, consent_service, asr_service, tts_service)
- **services/llm/** — LLM abstraction: `LLMProvider(Protocol)` + `GeminiAdapter`. Adapter pattern for future swap to local model
- **repositories/** — Data access layer (11 repos, one per table used)
- **models/** — SQLAlchemy ORM models (13 tables)
- **schemas/** — Pydantic DTOs for request/response validation
- **middleware/auth.py** — JWT auth + consent verification (`require_auth`, `require_consent`)
- **core/config.py** — Pydantic Settings from `.env`
- **core/database.py** — async SQLAlchemy engine + session factory

### Frontend Structure (frontend/src/)
- **pages/** — Route components (Chat, Home, Settings, Login, Register, Consent, Onboarding, CheckIn, etc.)
- **stores/** — Zustand stores (authStore, chatStore, preferencesStore, toastStore)
- **guards/** — Route protection (ProtectedRoute, ConsentGuard, OnboardingGuard, PublicRoute, RoleGuard)
- **components/** — UI components (layout/, sos/, chat/, settings/, ui/)
- **hooks/** — Custom hooks (useAudioRecorder, useTts, useSubtitles)
- **api/client.ts** — Axios instance with JWT interceptor and base URL

### Key Patterns
- **SSE streaming**: Chat messages stream via Server-Sent Events (`session_router.py:send_message` → `EventSourceResponse`)
- **Guardrails pipeline**: pre-filter (user input) → LLM → post-filter (assistant output). Keywords + severity threshold from `system_config` table
- **Two-layer config**: `.env` for infrastructure (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY) + `system_config` table for runtime params (sos_hotline_numbers, safety_keywords)
- **Privacy by design**: Optional history (save_history toggle), hard DELETE with CASCADE, SET NULL on safety_events/audit_logs

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, Python 3.11+, Pydantic, SQLAlchemy 2.0 (async), Alembic, Uvicorn |
| Frontend | React 18, TypeScript, Vite, TailwindCSS v4, Zustand, React Router v6, Axios |
| Database | PostgreSQL 16 (single engine dev/prod, Docker Compose) |
| LLM | Google Gemini 2.5 Flash (adapter pattern for future swap) |
| Voice | faster-whisper (ASR), Piper TTS (synthesis via subprocess) |
| Auth | PyJWT + bcrypt (stateless JWT) |

## Database

13 tables in PostgreSQL 16. DDL source of truth: `db/schema_postgresql.sql`.
102 columns, 16 FKs, 13 CHECK constraints, 20 indices, 7 UNIQUE constraints.
UUIDs for all PKs (`gen_random_uuid()`), except `system_config` (TEXT PK).

3 Alembic migrations: initial schema → consent_version seed → system_config seeds.

## Environment Variables

Required in `.env` (root):
- `DATABASE_URL` — PostgreSQL async connection string
- `JWT_SECRET` — secret for JWT signing
- `GEMINI_API_KEY` — Google Gemini API key

Optional (with defaults in config.py):
- `GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `GEMINI_TIMEOUT_MS` (default: `30000`)
- `CORS_ORIGINS` (default: `http://localhost:5173`)
- `WHISPER_MODEL` (default: `base`)
- `PIPER_VOICE` (default: `es_ES-mls_9972-low`)
- `PIPER_MODEL_PATH` (default: `models/piper/`)
- `UPLOAD_DIR` (default: `uploads/audio/`)

## API Endpoints (28 routes)

All prefixed with `/api/v1/`. Auth via `Authorization: Bearer <JWT>`.

- **Auth**: POST register, login, forgot-password, reset-password; GET reset-password/:token; PUT change-password
- **Consent**: GET consent-versions/active, users/me/consent-status; POST consents; PATCH consents/current
- **Users**: GET users/me, users/me/export; DELETE users/me
- **Preferences**: GET preferences/me; PUT preferences
- **Sessions**: POST sessions; GET sessions, sessions/:id; PATCH sessions/:id; POST sessions/:id/greeting
- **Messages**: POST sessions/:id/messages (SSE stream); GET sessions/:id/messages
- **Reports**: POST messages/:id/reports; GET messages/:id/reports/check
- **Safety**: POST safety-events; GET sos
- **Voice**: POST asr/transcribe; GET tts/synthesize
- **Health**: GET health

## Design System

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#A51916` | Header bg, primary buttons, UMB red |
| `accent` | `#0F303A` | Sidebar bg, teal |
| `danger` | `#DC2626` | SOS FAB, crisis alerts |
| `success` | `#16A34A` | Success states |
| `warning` | `#F59E0B` | Warning states |

SOS FAB: 56px circle, white bg, 2px `#DC2626` border, bottom-right. ASR recording: pulsing red border `#DC2626`.

## Mandatory Conventions

- **Database changes**: Use the `database-schema-designer` skill before schema modifications
- **Frontend creation**: Use the `frontend-design` skill before creating/modifying UI
- **Documentation lookup**: Consult Context7 MCP before writing code for any library
- **Mockups**: `Mockups/mockups.pen` (42 screens). Use Pencil MCP tools, NOT Read/Grep for `.pen` files
- **Auth**: PyJWT (not python-jose). JWT stateless sessions with bcrypt
- **LLM**: Never expose Google/Gemini identity. Mabel IA is the only identity
- **Language**: All user-facing content in Spanish (es). Code identifiers in English

## Development State

| Fase | Description | Status |
|------|-------------|--------|
| 1 | Infrastructure + DB | Done |
| 2 | Auth + Consent | Done |
| 3 | Chat Core + Gemini | Done |
| 4 | Guardrails + SOS | Done |
| 5 | Preferences + Onboarding + Legal | Done |
| 6 | Check-in + Reports | Done |
| 7 | Voice ASR/TTS | Done |
| 8 | Admin Panel | Pending |
| 9 | 3D Avatar + Lip Sync | Pending |
| 10 | Testing + QA + Deployment | Pending |

## Legal Context

Colombian law: Ley 1581/2012 (data protection), Ley 1616/2013 (mental health), Resolución 8430/1993 (research risk), Ley 1419/2010 (telehealth).

## Success Criteria

- SUS usability >= 70
- Well-being effect size >= 0.3
- Median latency <= 20s
- 0 critical guardrail violations
- Empathetic tone >= 4/5 in >= 80% of cases
