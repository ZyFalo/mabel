## Tasks

### Group 1: Backend — Dependencies & Config
- [x] Add `google-generativeai>=0.8,<1` to `backend/requirements.txt`
- [x] Add `CONTEXT_WINDOW_SIZE: int = 20` to `Settings` in `backend/app/core/config.py`

### Group 2: Backend — LLM Abstraction Layer
- [x] Create `backend/app/services/llm/__init__.py`
- [x] Create `backend/app/services/llm/provider.py` with `LLMProvider` Protocol (method: `generate_stream`)
- [x] Create `backend/app/services/llm/gemini_adapter.py` with `GeminiAdapter` implementing `LLMProvider` using `google-generativeai` SDK
- [x] Create `backend/app/services/llm/prompts.py` with Mabel system prompt constant

### Group 3: Backend — Pydantic Schemas
- [x] Create `backend/app/schemas/chat.py` with: `CreateSessionRequest`, `SessionResponse`, `CreateSessionResponse`, `SessionDetailResponse`, `CheckinPayload`, `UpdateSessionRequest`, `SendMessageRequest`, `MessageResponse`, `CreateReportRequest`, `ReportResponse`, `ReportCheckResponse`

### Group 4: Backend — Repositories
- [x] Create `backend/app/repositories/session_repository.py` with `SessionRepository` (create, get_by_id, list_by_user, update, close_active)
- [x] Create `backend/app/repositories/message_repository.py` with `MessageRepository` (create, list_by_session, get_by_id, get_recent_context)
- [x] Create `backend/app/repositories/message_report_repository.py` with `MessageReportRepository` (create, check_exists)
- [x] Create `backend/app/repositories/preference_repository.py` with `PreferenceRepository` (get_by_user_id)

### Group 5: Backend — Services
- [x] Create `backend/app/services/chat_service.py` with `ChatService`: create_session (with unique active enforcement + checkin_opt_in snapshot), list_sessions, get_session, update_session (check-in + end), send_message (with save_history logic, context window, SHA-256, latency_ms, streaming via LLMProvider)
- [x] Create `backend/app/services/report_service.py` with `ReportService`: create_report (with ownership validation + safety_event creation placeholder), check_report

### Group 6: Backend — Routers
- [x] Create `backend/app/routers/session_router.py` with: POST /sessions (201), GET /sessions, GET /sessions/:id, PATCH /sessions/:id
- [x] Create `backend/app/routers/message_router.py` with: POST /sessions/:id/messages (SSE streaming), GET /sessions/:id/messages — nested under session_router (merged into session_router.py)
- [x] Create `backend/app/routers/report_router.py` with: POST /messages/:id/reports (201), GET /messages/:id/reports/check

### Group 7: Backend — Main.py Update
- [x] Register `session_router` and `report_router` in `backend/app/main.py` with correct prefixes and tags

### Group 8: Frontend — Transversal Components
- [x] Create `frontend/src/stores/toastStore.ts` with `useToastStore` (addToast, removeToast, toasts list)
- [x] Create `frontend/src/components/ui/Toast.tsx` — global toast container (4 types, auto-dismiss 5s, top-right, close button)
- [x] Create `frontend/src/components/ui/ConfirmModal.tsx` — reusable confirmation modal (simple + verification variants)
- [x] Create `frontend/src/components/ui/Skeleton.tsx` — skeleton loader components (SkeletonCard, SkeletonChat, SkeletonText) with animate-pulse
- [x] Create `frontend/src/components/ui/EmptyState.tsx` — generic empty state (icon, title, description, optional action)
- [x] Create `frontend/src/components/ui/SosFab.tsx` — SOS FAB button placeholder (56px circle, white bg, 2px #DC2626 border, bottom-right fixed)

### Group 9: Frontend — Layout & Sidebar
- [x] Create `frontend/src/components/layout/Sidebar.tsx` — student sidebar (#34B): new session button, history grouped by date, active session badge, settings link, user info, history-disabled variant
- [x] Create `frontend/src/components/layout/StudentLayout.tsx` — layout wrapper: Header + Sidebar + main content area + SOS FAB
- [x] Create `frontend/src/stores/chatStore.ts` with `useChatStore`: sessions, currentSession, messages, isStreaming, streamingText, loadSessions, createSession, loadMessages, sendMessage (SSE via fetch + ReadableStream), endSession

### Group 10: Frontend — Pages
- [x] Create `frontend/src/pages/Home.tsx` (#08) — personalized greeting, 3-4 suggestion cards, click creates session
- [x] Create `frontend/src/pages/CheckIn.tsx` (#09) — mood slider (0-10), sleep input, focus categories (6), notes textarea (max 500), continue/skip
- [x] Create `frontend/src/pages/Chat.tsx` (#10, no Avatar) — message bubbles, text input (max 2000), send button, typing indicator, end session button, report flag per assistant bubble, "Ya reportado" badge
- [x] Create `frontend/src/pages/SessionEnd.tsx` (#18) — farewell message, session summary card (duration, messages, mood), new session + home buttons
- [x] Create `frontend/src/pages/SessionDetail.tsx` (#14) — breadcrumb, metadata, check-in data, read-only conversation, delete button (disabled placeholder), back button
- [x] Create `frontend/src/components/chat/ReportModal.tsx` (#11) — reason radios (5), severity slider (1-5), details textarea (max 1000), submit/cancel

### Group 11: Frontend — Router & Integration
- [x] Update `frontend/src/App.tsx`: replace HomePlaceholder with real Home, add routes for /session/:id/checkin, /session/:id/chat, /session/:id/end, /session/:id/detail — all inside ProtectedRoute + ConsentGuard + StudentLayout

### Verification
- [x] Run `npx openspec validate fase-3-chat-core-gemini` and confirm no errors
- [x] Verify all 8 API endpoints listed in proposal are covered by router tasks
- [x] Verify all 11 interfaces (#08, #09, #10, #11, #14, #18, #34B, #36, #37, #38, #39) are covered by frontend tasks
