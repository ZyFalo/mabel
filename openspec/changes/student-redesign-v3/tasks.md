## Tasks

### Capability 1 — design-system-v3 (foundation)

#### Tokens + theme
- [x] 1. Update `frontend/src/index.css`: define CSS variables for light and dark themes scoped to `:root[data-theme="light"]` and `:root[data-theme="dark"]`. Include all tokens per design.md D-02. Add `prefers-color-scheme` fallback to auto-detect when `data-theme="auto"`.
- [x] 2. Create `frontend/src/hooks/useTheme.ts`: exposes `{theme, setTheme, resolvedTheme}`. Persists to `localStorage` (`mabel_theme`). Listens to `prefers-color-scheme` media query when `theme === 'auto'`. Writes to `<html data-theme>` immediately. When user is authenticated, also persists via `updatePreferences({accessibility: {...prev, theme}})`.
- [x] 3. In `frontend/src/App.tsx` (or a new ThemeProvider at the top of the tree), call `useTheme()` on app mount to apply the persisted theme BEFORE first paint (no FOUC). Set `<html data-theme>` from a sync localStorage read.

#### Fonts + animations
- [x] 4. Add to `frontend/src/index.css`: `@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..500;1,9..144,300..500&display=swap');`. Define `.font-display` utility for `font-family: 'Fraunces', serif`.
- [x] 5. Add keyframes `fadeUp`, `fadeIn`, `scaleIn`, `streamingPulse` and classes `.fade-up`, `.fade-in`, `.scale-in` in `frontend/src/index.css`. Wrap all in `@media (prefers-reduced-motion: no-preference) { ... }`.

#### Primitives UI
- [x] 6. Create `frontend/src/components/ui/Toggle.tsx`: button role="switch" with aria-checked. Animated thumb. Uses `--accent` for on, `--border-strong` for off.
- [x] 7. Create `frontend/src/components/ui/Segmented.tsx`: button group with optional icon per option. Active uses `bg-elevated text-strong shadow-sm`, inactive `text-muted hover:text`.
- [x] 8. Create `frontend/src/components/ui/Slider.tsx`: range custom with track + fill + thumb. Format prop for value display.
- [x] 9. Create `frontend/src/components/ui/Field.tsx`: wrapper row/vertical with label + description + control slot.
- [x] 10. Create `frontend/src/components/ui/NativeSelect.tsx`: select with custom ChevronDown.
- [x] 11. Create `frontend/src/components/ui/Markdown.tsx`: ~60 lines, renderer for **bold**, `code`, numbered lists, bulleted lists, paragraphs, links (http/https only).

#### Keyboard shortcuts
- [x] 12. Create `frontend/src/hooks/useKeyboardShortcuts.ts`: takes a `Record<'cmd+b'|'cmd+,'|'esc', () => void>` and registers a window-level keydown listener. Detect `metaKey || ctrlKey + key` (cross-platform). Skip when target is `INPUT|TEXTAREA|CONTENTEDITABLE` UNLESS `allowInInputs: true`.

#### Verification
- [x] 13. Run `cd frontend && npx tsc --noEmit` clean.
- [x] 14. Manual: in a temporary test page or a quick `App.tsx` console.log, verify that `useTheme().resolvedTheme` reacts to OS `prefers-color-scheme` changes.
- [x] 15. Manual: verify Fraunces loads (open Network tab, see woff2 request, render an `<h1 class="font-display italic">` and confirm serif appears).

### Capability 2 — sidebar-redesign

- [x] 16. Create `frontend/src/components/layout/CollapsedSidebar.tsx`: 56px rail with icon buttons (Expand, Plus prominent, Search, MessageSquare, Settings, User avatar at bottom). Each button has tooltip on hover + `title` attribute.
- [x] 17. Create `frontend/src/components/layout/StudentSidebarV3.tsx`: accepts `open` prop. When `open=true` renders 272px expanded with grouped conversations + footer; when `open=false` renders `<CollapsedSidebar />`. Animates width 300ms `ease-out`.
- [x] 18. Implement temporal grouping in `StudentSidebarV3` (Hoy, Ayer, Esta semana, Hace 30 dias, Anteriores). Reuse logic from existing `Sidebar.tsx`.
- [x] 19. Implement "Historial desactivado" variant when `preferences.save_history === false` (mantener mensaje + link a /settings).
- [x] 20. Implement footer: 28px avatar with linear-gradient + initials, display_name + role label, separate Settings icon button.
- [x] 21. Update `frontend/src/components/layout/StudentLayout.tsx` to use `StudentSidebarV3`. Persist `open` state in `localStorage` (`mabel_sidebar_open`). Apply responsive defaults via `useEffect + window.matchMedia`.
- [x] 22. Register Cmd+B shortcut in `StudentLayout` via `useKeyboardShortcuts` to toggle sidebar.
- [x] 23. Mobile behavior: when viewport `< md`, render sidebar as a drawer overlay (`fixed inset-y-0 left-0 z-50` + backdrop `bg-black/50 z-40`). Add a hamburger button in `Header.tsx` for mobile.
- [x] 24. Verify `npx tsc --noEmit` clean. Smoke: open `/home`, toggle sidebar with button and with Cmd+B; verify on mobile width opens as overlay.

### Capability 3 — chat-redesign

#### Composer + TopBar
- [x] 25. Create `frontend/src/components/chat/Composer.tsx`: extract from current `Chat.tsx` the input area. Card style per design.md D-06. Includes mic ASR (preserved logic), mute TTS toggle (preserved logic), send button. Auto-grow textarea max 200px. Enter sends, Shift+Enter newline.
- [x] 26. Create `frontend/src/components/chat/TopBar.tsx`: 48px bar with "Mabel IA" Fraunces label left, "Finalizar sesion" button right (opens existing ConfirmModal).

#### Welcome (Home)
- [x] 27. Update `frontend/src/pages/Home.tsx`: implement time-based greeting ("Buenos dias/tardes/noches, [first name]" with Fraunces italic, accent on name). Centered layout `flex-1 flex flex-col items-center justify-center`. max-w-2xl.
- [x] 28. In Home.tsx, render `<Composer />` below the greeting, then the 2x2 grid of 4 existing suggestions. Each suggestion: card with icon chip (accent variants per card), `hover:scale-110` on icon. Click pre-fills composer and submits.

#### Chat messages
- [x] 29. Update `frontend/src/pages/Chat.tsx`: replace the current message rendering with asymmetric pattern. User: bubble right aligned. Assistant: full-width, 28px avatar left, content via `<Markdown />`, actions in `opacity-0 group-hover:opacity-100`. Streaming cursor preserved.
- [x] 30. In Chat.tsx, apply `fade-up` class on each message with `style={{ animationDelay: ${idx*30}ms }}`.
- [x] 31. In Chat.tsx, preserve EXACTLY: report icon (now in hover actions), "Ya reportado" badge (visible always when in reportedIds), subtitles span highlighting, draft restore from localStorage, send/streaming logic, auto-greeting effect.
- [x] 32. Replace the chat input area with `<Composer />` import (from task 25). Replace the chat top section with `<TopBar />` (from task 26).
- [x] 33. Add disclaimer below composer: "Mabel es una asistente de psicoeducacion. No reemplaza atencion profesional. Lineas de ayuda disponibles via SOS." `text-center text-[11px] text-faint mt-2.5`.

#### SOS preserved
- [x] 34. Verify `SosFab` is still rendered in `StudentLayout`. Position bottom-right preserved. Style refresh to align with design tokens but border #DC2626 and red color preserved.
- [x] 35. Verify the crisis automatica effect (`riskDetected` → `stopTts() + stopSubtitles() + setShowSos(true)`) still works after refactor.

#### Verification
- [x] 36. `npx tsc --noEmit` clean. Smoke: open /home, see greeting time-based + grid; click suggestion → creates session → chat opens with auto-greeting from Mabel as first asistant msg (full-width avatar); send a message → streaming cursor visible; mic button shows pulsing red border when recording (need to grant permission); hover an assistant message → Copy/Report icons appear; verify SOS FAB visible bottom-right.

### Capability 4 — settings-redesign

- [ ] 37. Refactor `frontend/src/pages/Settings.tsx`: split into a `SettingsLayout` (header + nav + content) and one component per tab (PrivacyTab, AccessibilityTab, VoiceTab, AccountTab, ArcoTab, ApariencaTab).
- [ ] 38. Implement vertical tabs nav (md:flex-col) with the 6 sections. Horizontal scroll on mobile.
- [ ] 39. PrivacyTab uses `<Toggle>` and `<Field>` primitives. Preserves existing save logic (updatePreferences) and the existing "Guardar" button.
- [ ] 40. AccessibilityTab: Toggle subtitles, Toggle contrast, Segmented for font_size. Preserves existing save logic.
- [ ] 41. VoiceTab: Toggle TTS, NativeSelect voice, Preview button (existing logic), Segmented chat/avatar mode.
- [ ] 42. AccountTab: email read-only, buttons that open existing modals (Change Password, Revoke Consent, Delete Account).
- [ ] 43. ArcoTab: "Ver mis datos" button opens existing ArcoExportModal. Ley 1581 info text preserved.
- [ ] 44. ApariencaTab (NEW): Segmented for theme light/dark/auto with Sun/Moon/Monitor icons. Calls `useTheme().setTheme(value)`.
- [ ] 45. Add header X with `navigate(-1)` (fallback `/home`) + Esc shortcut via useKeyboardShortcuts.
- [ ] 46. `npx tsc --noEmit` clean. Smoke: open /settings, switch between tabs, change a toggle and save (verify endpoint fires), change theme and verify immediate switch, X closes back to previous page.

### Capability 5 — auth-onboarding-redesign

- [ ] 47. Update `frontend/src/pages/Landing.tsx`: card layout with Fraunces title, animations on mount.
- [ ] 48. Update `frontend/src/pages/Login.tsx`: card layout, primitives for inputs, `fade-in` on card. Existing logic intact.
- [ ] 49. Update `frontend/src/pages/Register.tsx`: same pattern.
- [ ] 50. Update `frontend/src/pages/ForgotPassword.tsx` and `ResetPassword.tsx`: same pattern.
- [ ] 51. Update `frontend/src/pages/Consent.tsx`, `ConsentRejected.tsx`, `ConsentRequired.tsx`: wider card (max-w-2xl), prose for legal body, accept/reject buttons styled.
- [ ] 52. Update `frontend/src/pages/Onboarding.tsx`: step indicator with progress bar at accent color, card layout per step, primitives for toggles/segmented, `fade-in` on step change.
- [ ] 53. Restyle modals: ChangePasswordModal, RevokeConsentModal, DeleteAccountModal, ArcoExportModal, ConfirmModal, SessionExpiredModal, ReportModal — backdrop bg-black/40 backdrop-blur-sm, card with `scale-in`, Fraunces titles. Logic intact.
- [ ] 54. `npx tsc --noEmit` clean. Smoke: test full flow new user — Register → Consent → Onboarding 3 steps → Home → Chat → Settings, verify all modals scale-in, theme persists across pages.

### Verification

- [ ] 55. Backend imports OK (should not require, since no backend changes): `cd backend && source .venv/bin/activate && python -c "from app.main import app; print('OK')"`
- [ ] 56. Frontend: `npx tsc --noEmit` clean + `npm run build` succeeds.
- [ ] 57. Admin panel unaffected: navigate to `/admin` (with admin user) and confirm all admin pages look unchanged (same Lumen-style is NOT applied to admin).
- [ ] 58. Manual smoke checklist:
  - SOS FAB visible and functional on every student page
  - Crisis automatica trigger (send "suicidio" — guardrail) opens SOS panel
  - Microfono pulse red while recording
  - TTS auto-play + mute persists
  - Subtitulos word-by-word render in assistant bubble (now full-width)
  - Reportar mensaje + "Ya reportado" badge functional
  - Check-in form (Slider mood, Segmented focus) saves to backend
  - Auto-greeting renders as first assistant message
  - Sidebar Cmd+B toggle + localStorage persist
  - Theme switcher: light/dark/auto, persists to backend
  - All modals scale-in animate
  - Mobile: sidebar drawer overlay; responsive max-widths on bubbles
