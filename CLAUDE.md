# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Mabel-IA** is an AI-powered virtual assistant for mental health psychoeducational support for students at Universidad Manuela Beltrán (UMB), Bogota, Colombia. This is a thesis project (Tesis de Grado - Ingenieria de Software, 2025).

The system provides empathetic conversational support via text and voice, with safety guardrails, crisis detection (SOS), and a quasi-experimental study design (pretest-posttest, 30 students).

**Current phase**: Pre-development / design. No production code exists yet — only documentation, database scripts, and UI mockups. Git is not initialized.

**Completed design artifacts**:
- Database schema: 13 tables, fully reviewed and evolved through Evo 005 (DDL in `db/schema_postgresql.sql`)
- Tech stack: 14 ADRs documented in `TECHSTACK.md`
- Interface catalog: 42 interfaces specified in `docs/INTERFACES_MVP_CATALOGO.md`
- UI mockups: 42 screens in `Mockups/mockups.pen` (22 student + 10 admin + 8 from discrepancy resolution + #10B Avatar + #40 ARCO Modal, Pencil format)
- PO decisions: 25 discrepancies resolved (16 mockup changes, 3 Notion changes, 6 no-change), recorded in auto-memory
- Agent team: 15 Claude Code agent definitions in `.claude/agents/` (14 active + 1 deferred)

## Tech Stack (Planned)

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, Python, Pydantic, SQLAlchemy, Alembic, Uvicorn |
| Frontend | React 18+, Vite, TailwindCSS, Zustand, React Router, vite-plugin-pwa (PWA) |
| Database | PostgreSQL 16 (single engine — dev and production) |
| LLM (MVP) | Google Gemini API (with abstraction layer for future swap) |
| LLM (Post-MVP) | Local ~3B model fine-tuned with LoRA/QLoRA |
| Voice (MVP) | faster-whisper (ASR), Piper TTS (TTS) — SER deferred to Post-MVP |
| Avatar 3D (MVP) | @react-three/fiber, @pixiv/three-vrm, Web Audio API (lip sync) |
| Infrastructure | Docker Compose, GitHub Actions CI/CD, Railway (future cloud) |
| Testing | pytest, Vitest, Playwright, Locust |
| Code Quality | Ruff (Python), ESLint + Prettier (JS/React) |

## Architecture

- **Monolith-local**: FastAPI backend + React SPA (PWA), designed for 100% local deployment (no cloud tokens in MVP)
- **PWA (D-15)**: Progressive Web App via `vite-plugin-pwa`. Service Worker with cache-first (assets) + network-first (API). Manifest.json auto-generated. Installable from browser, no App Store/Google Play dependency. Standalone mode on mobile.
- **Abstraction layer**: The LLM integration uses an interface/adapter pattern so Gemini can be swapped for a local model post-MVP without modifying the rest of the app
- **Patterns**: Repository pattern (DB), Service layer (business logic), Middleware (guardrails)
- **API contracts**: OpenAPI/Swagger between frontend and backend
- **Two-layer configuration (ADR #10)**: Env vars (`.env`/Railway) for infrastructure (DATABASE_URL, JWT_SECRET, GEMINI_API_KEY, GEMINI_MODEL, GEMINI_TIMEOUT_MS, CORS_ORIGINS) + `system_config` table for runtime operational config (sos_hotline_numbers, safety_keywords, sos_severity_threshold, guardrails_enabled)
- **Privacy by design**: No PII in message content, optional history (save_history toggle), hard DELETE with CASCADE (safety_events/survey_responses/audit_logs use SET NULL to preserve anonymous records)

## Database Schema

13 tables in PostgreSQL 16 (DDL source of truth: `db/schema_postgresql.sql`, 272 lines):

- `users` — Auth, email/password, role (student/admin), hard DELETE in MVP (deleted_at reserved for post-MVP grace period), disable with reason
- `consent_versions` — Versioned legal consent documents (Ley 1581/2012), draft/active/archived lifecycle, full text in `body`
- `consents` — User consent acceptance with FK to consent_versions (NOT NULL), revocation support (revoked_at), scope (solo_uso/uso_mejora_anon). Legacy `version` TEXT column removed (Evo 005 — normalized via consent_version_id)
- `preferences` — save_history, language, TTS voice, accessibility (JSONB), checkin_enabled, preferred_chat_mode
- `sessions` — Chat sessions with checkin_opt_in snapshot, checkin_payload (JSONB), avatar_used
- `messages` — role (system/user/assistant), content, safety_flags (JSONB), token counts, latency_ms
- `message_reports` — User reports (hallucination/harmful/privacy/low_empathy/other), unique per (message, user)
- `attachments` — Audio/image/doc files linked to messages
- `safety_events` — Risk detection, SOS redirects, status (active/reviewed/resolved), user_id ON DELETE SET NULL (preserves anonymous records post-account deletion)
- `password_reset_tokens` — Secure token_hash (SHA-256), expiry, partial index on active tokens
- `audit_logs` — Immutable/append-only admin action log (ON DELETE SET NULL preserves logs)
- `survey_responses` — Research instruments (SUS, empathy_rubric, wellbeing_pre/post), UNIQUE per (user, instrument, phase)
- `system_config` — Key-value admin configuration (TEXT PK, JSONB value), runtime operational params (sos_hotline_numbers, safety_keywords, sos_severity_threshold, guardrails_enabled)

UUIDs for all PKs via pgcrypto (`gen_random_uuid()`), except `system_config` which uses TEXT PK. Two user roles: `student` (default) and `admin`, discriminated via `users.role` column and JWT claims.

**Verified metrics** (audited against DDL, 2026-02-25 post-Evo005b): 102 columns, 16 FKs, 13 CHECK constraints, 20 indices, 7 UNIQUE constraints.

**ADR #13**: PostgreSQL 16 is the single database engine for both development (via Docker Compose) and production. SQLite was eliminated entirely — no dual-engine compatibility code.

## Design System v2

Layout: Header (red) + Sidebar (teal, 220px both roles) + Main area (white). SOS FAB: 56px circle, white bg, 2px `#DC2626` border, bottom-right of main area.

| Token | Value | Usage |
|-------|-------|-------|
| `primary` | `#A51916` | Header bg, primary buttons, UMB institutional red |
| `accent` | `#0F303A` | Sidebar bg, secondary elements, teal |
| `danger` | `#DC2626` | SOS FAB border, crisis alerts, destructive actions |
| `success` | `#16A34A` | Success states, confirmations |
| `warning` | `#F59E0B` | Warning states, medium severity |
| `bg-main` | `#FFFFFF` | Main content area background |
| `text-primary` | `#1F2937` | Primary text color (gray-800) |

**PO-approved design constraints** (from discrepancy resolution):
- **SOS**: FAB flotante only — NO SOS button in header
- **TTS (Chat)**: Auto-play + mute global toggle (no per-bubble controls)
- **TTS (Avatar)**: Mute button only in topbar
- **Subtitles**: Highlighted text in chat bubble + red pulsing mic indicator during ASR
- **Sidebar**: 220px both roles, 4 temporal groups (Hoy/Ayer/Esta semana/Anteriores), "Historial desactivado" variant with link to Preferences
- **Onboarding**: 3 steps (Preferencias → Accesibilidad → Voz), each with dedicated mockup (#07, #07B, #07C)
- **#32 Access Denied**: No header, centered layout like #20/#22
- **Transversal components** (#36 Toast, #37 Confirmation Modal, #38 Skeletons): No mockup — implement from Notion spec

## Key Functional Flows

1. **Auth & Onboarding**: Register → Login → Consent acceptance → History preference → Chat
2. **Chat + Check-in + Guardrails**: Create session → Optional check-in (mood/sleep/focus) → Text or voice input → Pre-filter (crisis detection) → LLM inference → Post-filter → Response (text + optional TTS) → Persist messages
3. **Crisis/SOS**: Risk detected → Cut TTS → Show SOS panel → Register safety_event → Offer referral lines
4. **Preferences**: Language, TTS voice, subtitles, contrast, font size, check-in toggle, history toggle
5. **History**: View sessions by date, detail view, delete with double confirmation (CASCADE)
6. **Message Reporting**: Report button per message → Select reason → Optional details → Create report + safety_event
7. **Avatar 3D (HU-18)**: Toggle Modo Chat/Avatar → Load VRM model in canvas → TTS audio → Web Audio API frequency analysis → Blend shape mapping (aa/ee/ih/oh/ou) → 30 FPS lip sync render

## MVP Interfaces

42 functional interfaces defined in `docs/INTERFACES_MVP_CATALOGO.md` (22 student + 10 admin + 10 transversal). Each interface specifies: description, UI elements, actions, states, validations, and connections. Includes 7 Mermaid navigation flows and HU traceability. Cross-validated against mockups with 25 discrepancies resolved by PO. Navigation consistency audited (2026-02-22): deprecated `/history` routes corrected to `/session/:id/detail`, sidebar bifurcation (active→chat, finalized→detail) documented.

## User Stories

18 user stories (HU-01 to HU-18) covering: registration, login, consent, history toggle, chat sessions, check-in, voice (ASR/TTS), crisis derivation (SOS), subtitles, accessibility, session history, message deletion, message reporting, and 3D avatar with lip sync (HU-18).

## Agent Team Structure

15 specialized AI agent roles (14 active + 1 deferred) organized in functional layers:

| Layer | Agents |
|-------|--------|
| Management | Project Manager / Scrum Master |
| Architecture | Software Architect |
| Core Development | Database Engineer, Backend Developer, Frontend Developer, ML/LLM Engineer (DEFERRED), Voice Processing, 3D & Avatar Engineer |
| Security & Quality | Safety & Guardrails, UX/UI Designer, QA & Testing, DevOps & Infrastructure |
| Compliance | Ethics, Privacy & Compliance |
| Research | Research & Analytics |
| Cross-cutting | Documentation & Knowledge |

## Mandatory Agent Conventions

- **Database changes**: Always use the `database-schema-designer` skill before any schema redesign or extension. Apply minimum viable changes with technical justification.
- **Frontend creation**: Always use the `frontend-design` skill before creating or modifying any component, page, or visual element.
- **Documentation lookup**: Always consult the Context7 MCP (`mcp__plugin_context7_context7`) before writing any code, to verify up-to-date documentation for FastAPI, React, PostgreSQL, SQLAlchemy, Alembic, TailwindCSS, Zustand, and any other library in the stack.
- **Documentation hub**: Use the Notion MCP to maintain the 'Mabel IA Documentation' page as single source of truth.
- **Mockups**: UI mockups are in `Mockups/mockups.pen` (primary file, 42 screens + 14 reusable components). `Mockups/mabel.pen` is the legacy file (22 student screens only). Use Pencil MCP tools (not Read/Grep) to access `.pen` files.
- **Auth**: PyJWT (not python-jose, which is discontinued). JWT stateless sessions with bcrypt password hashing.
- **LLM abstraction**: `LLMProvider(Protocol)` + `GeminiAdapter` — adapter pattern for future swap to local model.

## Useful Commands

```bash
# Read .docx files (cannot use Read tool on macOS)
textutil -convert txt -stdout "Tesis II - Compartido.docx"

# List available Claude Code agents
# Use /agents in Claude Code CLI

# Access .pen mockup files — use Pencil MCP tools, NOT Read/Grep
# get_editor_state(), batch_get(), batch_design(), get_screenshot()
```

## Directory Structure

```
Mabel-IA/
├── .agents/skills/              # Claude Code skills (database-schema-designer)
├── .claude/agents/AGENT_*.md    # 15 Claude Code agent definitions
├── .vscode/extensions.json      # Recommended VS Code extensions (claude-code)
├── db/schema_postgresql.sql     # DDL source of truth (13 tables, 272 lines)
├── docs/                        # Interface catalog, schema evolution docs, validation reports
├── Mockups/                     # mockups.pen (primary, 42 screens) + mabel.pen (legacy, 22 student)
├── CLAUDE.md                    # This file
├── TECHSTACK.md                 # 14 ADRs, dependency diagram, stack justifications
└── DB_SCHEMA_REVIEW.md          # 7-axis schema audit
```

## Project Files

| File | Description |
|------|-------------|
| `TECHSTACK.md` | Definitive tech stack with 14 ADRs, dependency diagram, and full justifications (Revision 4) |
| `DB_SCHEMA_REVIEW.md` | 7-axis database schema audit with 3 approved CHECK constraint modifications |
| `db/schema_postgresql.sql` | The ONLY DDL script (272 lines, 13 tables, PostgreSQL 16) — source of truth for schema |
| `docs/INTERFACES_MVP_CATALOGO.md` | Complete functional interface catalog: 42 interfaces, navigation flows, HU traceability |
| `docs/DB_SCHEMA_EVOLUTION_002.md` | Schema evolution documentation: 5 changes, 3 new tables, 4 new columns with justifications |
| `docs/DB_SCHEMA_EVOLUTION_004.md` | Schema evolution 004: +consent_versions, +system_config, +messages.latency_ms, +consents.revoked_at/consent_version_id, 5 new indices |
| `docs/REPORTE_VALIDACION_BD_INTERFACES.md` | Cross-validation report: 87 data operations vs 13-table schema, all gaps resolved |
| `docs/FASE2_MAPEO_OPERACIONES_BD.md` | Phase 2: mapping of 87 data operations to DB tables/columns |
| `docs/FASE3_EVALUACION_CAPA_APLICACION.md` | Phase 3: application layer evaluation (services, repositories, DTOs) |
| `docs/FASE2_VALIDACION_BACKEND_EVO004.md` | Backend validation post-Evo 004: new tables/columns impact on API layer |
| `docs/AVATAR_3D_DECISION_TECNICA.md` | Avatar 3D technical decision: lip sync approach (Web Audio API + three-vrm), HU-18, stack, DB impact, layout |
| `Tesis II - Compartido.docx` | Full thesis document with DB scripts, user stories, use cases, diagrams, methodology |
| `Agentes_IA_Equipo_Desarrollo (1).docx` | 14 AI agent role definitions, responsibilities, tools, deliverables |
| `Preguntas_Resueltas_ProyectoWeb.docx` | Q&A guide covering all 9 project stages |
| `Mockups/mockups.pen` | Primary mockup file: 42 screens (22 student + 10 admin + #10B Avatar + #40 ARCO Modal + #07B/#07C Onboarding + #27B-E Metrics + #41 Consent Rejection + #42 Password Change) + 14 reusable components |
| `Mockups/mabel.pen` | Legacy mockup file (422 KB): original 22 student screens only — superseded by mockups.pen |
| `.claude/agents/AGENT_*.md` | 15 Claude Code agent definitions (01-15), each self-contained with full project context |
| `.agents/skills/database-schema-designer/` | Database schema design skill with guidelines, checklist, and migration template |

## Legal & Compliance Context

Colombian law applies. Key regulations:
- **Ley 1581/2012 + Decreto 1377/2013**: Data protection — informed consent, explicit purposes, security measures for sensitive data
- **Ley 1616/2013 + Ley 2460/2025**: Mental health as fundamental right
- **Resolución 8430/1993**: Minimal risk research classification
- **Ley 1419/2010 + Resolución 2654/2019**: Telehealth/tele-orientation

## Success Criteria

- SUS usability score >= 70
- Perceived well-being improvement with effect size >= 0.3
- Median turn latency <= 20s
- 0 critical guardrail violations on standard prompts
- Empathetic tone rúbrica >= 4/5 in >= 80% of cases

## Language

All user-facing content, prompts, and documentation must be in **Spanish (es)**. Code identifiers and technical documentation may use English.
