## Tasks

### Capability 6.1 — tokens-and-typography

- [x] 1. Replace `frontend/src/index.css` content (keep the `@import "tailwindcss"` line) with the full prototype palette: `--mabel-50..900`, `--ink-50..900`, `--gray-50..700`, semantic colors (success/warn/danger/info), spacing 4px grid `--space-1..13`, radii `--r-xs..3xl + --r-full`, borders, shadows including `--shadow-brand`, `--ring-mabel`/`--ring-danger`, motion (`--ease-out`, `--ease-in-out`, `--dur-fast/base/slow`), layout vars
- [x] 2. Remove all references to legacy CSS vars (`--bg`, `--bg-elevated`, `--bg-sidebar`, `--bg-hover`, `--bg-active`, `--bg-user-msg`, `--bg-code`, `--border`, `--border-subtle`, `--border-strong`, `--text`, `--text-strong`, `--text-muted`, `--text-faint`, `--text-placeholder`, `--accent`, `--accent-glow`) from TSX/CSS. Migrate each usage to the appropriate prototype var. Common mappings:
  - `--bg` → `var(--ink-50)`
  - `--bg-elevated` → `#fff`
  - `--bg-sidebar` → `var(--ink-50)`
  - `--bg-hover` → `var(--ink-100)`
  - `--bg-active` → `var(--mabel-50)`
  - `--bg-user-msg` → `var(--mabel-600)` (now bubble bg, not gray)
  - `--border` → `var(--ink-200)`
  - `--border-subtle` → `var(--ink-100)`
  - `--border-strong` → `var(--ink-300)`
  - `--text` → `var(--ink-700)`
  - `--text-strong` → `var(--ink-900)`
  - `--text-muted` → `var(--ink-500)`
  - `--text-faint` → `var(--ink-400)`
  - `--text-placeholder` → `var(--ink-400)`
  - `--accent` → `var(--mabel-600)`
  - `--accent-glow` → `var(--ring-mabel)`
  - `--danger` → `var(--danger-600)`
  - `--success` → `var(--success-600)`
- [x] 3. Update `index.css` @import: load `Nunito:wght@400;500;600;700;800` from Google Fonts; REMOVE Fraunces. Define `--font-sans: 'Nunito', ...`, `--font-ui: 'Inter', ...`. `.font-display` uses `var(--font-sans)` with Nunito.
- [x] 4. Preserve animations: keep `@keyframes fadeUp/fadeIn/scaleIn` and utility classes. Adjust fadeUp `translateY` from 8px to **6px** per prototype.
- [x] 5. Verify: `cd frontend && npx tsc --noEmit` clean + `npm run build` success. Visit / page on browser — verify Nunito is loaded (Network tab) and that no element looks broken (cream `ink-50` bg should be default).

### Capability 6.2 — sidebar-skin

- [x] 6. Create `frontend/src/components/ui/MabelLogo.tsx` — SVG component rendering the prototype's logo path (`M16 3C8.8 3 3 8.8...`) in a circle with `currentColor`. Accepts `size` prop default 28.
- [x] 7. Refactor `frontend/src/components/layout/StudentSidebarV3.tsx`:
  - Width 268 expanded / 60 collapsed
  - Brand header: MabelLogo size 28 + "Mabel" 15px bold + "UMB · Bienestar" 11px ink-400
  - "Nueva sesion" button mabel-600 bg + white + shadow-sm + Plus icon (full-width, primary CTA)
  - Nav items: "Buscar sesiones" (Search icon) + "Conversaciones" (MessageCircle icon, active when in chat)
  - HISTORIAL subheader uppercase 10.5px ink-400 letter-spacing 0.06em
  - Session row: 13px bold title + meta row with Clock icon + when + duration
  - Sticky SOS button (mabel-50 bg + mabel-100 border + AlertTriangle icon + "Linea de crisis SOS") positioned just above profile footer
  - Profile pill (existing UserMenu wiring preserved)
  - Floating collapse toggle (24×24 circle, position absolute top:18px right:-12px, ChevronLeft/Right)
- [x] 8. Refactor `CollapsedSidebar.tsx` to width 60px, MabelLogo at top, then Plus (Nueva sesion), Search, MessageSquare, AlertTriangle (SOS), and avatar at bottom.
- [x] 9. Refactor `UserMenu.tsx` items per the prototype list: Configuracion (Cmd+,), Perfil (→ /settings?tab=account), Privacidad (→ /settings?tab=privacy), Ayuda y soporte (placeholder), separator, Cerrar sesion (mabel-700 text).
- [x] 10. Wire SOS button (sidebar new sticky) to open `CrisisOverlay` — same handler as `SosFab`. NO existing safety_event logic changes.

### Capability 6.3 — chat-skin

- [x] 11. Refactor `frontend/src/pages/Home.tsx`:
  - Centered Avatar M (size 56) with shadow-brand
  - Greeting "Hola, {firstName}." 32px bold ink-900 letter-spacing -0.02em
  - Subtitle "Soy Mabel, tu asistente de bienestar en la UMB. Este es un espacio seguro y confidencial. ¿Por dónde quieres empezar?" 16px ink-500 max-width 540
  - Composer integrated
  - 4 SuggestionChip pills (Heart/Cómo me siento hoy, MessageCircle/Quiero hablar de algo, Brain/Tengo estrés académico, Sparkles/Necesito motivación) with hover bg mabel-50 + border mabel-300 + color mabel-700
  - Footer: lock 12 + "Conversaciones cifradas · Mabel no reemplaza la atención profesional" 12px ink-400
- [x] 12. Refactor `frontend/src/components/chat/Composer.tsx`:
  - Card: bg white, border ink-200 (focused mabel-300), border-radius 20, padding 14px 16px 10px, shadow-sm (focused: ring-mabel + shadow-sm)
  - Textarea auto-grow max 200px, 15px Nunito
  - Bottom row: LEFT Paperclip + Mic 34×34 hover bg ink-100, RIGHT hint "↵ para enviar" 11px ink-400 + Send circular 34×34 mabel-600 with ArrowRight (disabled ink-200)
  - PRESERVE the existing mic recording state (animate-pulse border #DC2626) — only update size/colors to match
- [x] 13. Create new `SuggestionChip` inline component within Home (or as `components/chat/SuggestionChip.tsx`): rounded-full pill with white bg + ink-200 border + 13px ink-700, hover mabel-50 bg + mabel-300 border + mabel-700 text + shadow-xs
- [x] 14. Refactor `frontend/src/pages/Chat.tsx` message rendering:
  - User bubble: max-width min(560px, 75%), padding 11px 15px, border-radius `18px 18px 4px 18px`, bg mabel-600, white, 14.5px line-height 1.55, shadow-xs. Container flex justify-end gap-12 row-reverse align-flex-start mb-22. NO avatar.
  - Assistant: container flex gap-12 align-flex-start mb-22. Avatar M 32px on LEFT (margin-top 2). Bubble border-radius `4px 18px 18px 18px`, bg white, border ink-200, ink-900 text. Content via `<Markdown />`. Streaming cursor 7×15 bg-mabel-600 pulse. Hover actions (Copy, Flag/Reportar) below. "Ya reportado" badge always visible if reported.
  - Timestamp 11px ink-400 below each bubble
- [x] 15. ChatActive session header bar: padding 14px 24px, border-bottom ink-200, bg rgba(255,255,255,0.7) backdrop-blur 8px. Left: session title 14.5px bold + green "Activa" pill (10.5px success-700, bg success-50, padding 2px 8px, radius full, with green dot). Right: 2 icon buttons (voice, more) — voice could be future, more = open menu with "Finalizar sesion" item that triggers existing handler.
- [x] 16. PRESERVE all existing handlers: handleSend, handleEndSession, handleMicToggle, handleCopy, handleReportDone, riskDetected effect, draft restore, auto-greeting, sendMessage flow.
- [x] 17. Move disclaimer to below Composer in ChatActive (same as Home pattern).
- [x] 18. Verify: tsc + smoke test new chat flow

### Capability 6.4 — settings-overlay

- [x] 19. Create `frontend/src/components/settings/primitives/` directory with: `SettingsField.tsx`, `Toggle.tsx` (overload variant with label+hint+border-bottom-ink-100 — separate from base ui Toggle), `Card.tsx`, `PrimaryButton.tsx`, `SecondaryButton.tsx`, `Input.tsx` (with prefix icon + password reveal toggle + ring-mabel focus), `SaveBar.tsx`, `SettingsNavItem.tsx`, `SectionHeader.tsx`
- [x] 20. Refactor `frontend/src/pages/Settings.tsx` from full-page to modal overlay:
  - Container: position absolute inset-0 z-20 bg rgba(26,17,16,0.32) backdrop-blur 4 fade-in
  - Modal: min(100%, 1100px) × min(100%, 720px), bg white, radius 18, border ink-200, shadow-xl, scale-in
  - LEFT 280px sidebar (bg ink-50, border-right) with header "AJUSTES" eyebrow + "Preferencias" title + 5 SettingsNavItem
  - RIGHT flex-1 with header (breadcrumb "Ajustes / {section}" + X close) + scroll content max-w 580 padding 28 32
  - Click backdrop closes; X closes; Esc closes (preserve existing useKeyboardShortcuts esc handler)
- [x] 21. 5 sections content:
  - PrivacidadSection: 2 toggles (save_history, checkin_enabled) + ARCO info card + Consentimiento warn card
  - AccesibilidadSection: 1 toggle contrast + Segmented font_size + 1 toggle subtitles
  - VozSection: 1 toggle TTS + voice select + preview button + Segmented chat/avatar mode
  - CuentaSection: email read-only + change password form inline + danger zone with delete button
  - ArcoSection: Ley 1581 text + "Ver mis datos" button (opens ArcoExportModal)
- [x] 22. PRESERVE all existing save handlers (savePrivacy, saveAccessibility, saveVoice, change password, revoke consent, delete account, ARCO export). All 4 modal triggers route to existing modals unchanged.
- [x] 23. PRESERVE `?tab=` deeplink support — when modal opens with `?tab=voice`, activeTab is set to voice. Map prototype IDs: `appearance` → ignored (removed). Existing tabs: privacy, accessibility, voice, account, arco.

### Capability 6.5 — crisis-overlay

- [ ] 24. Refactor `frontend/src/components/sos/SosPanel.tsx` to match `crisis.jsx`:
  - Backdrop: rgba(26,17,16,0.32) backdrop-blur 4 fade-in
  - Card: min(100%, 720px) max-h 92%, bg white, radius 18, border ink-200, shadow-xl, scale-in
  - Hero band: bg mabel-50, border-bottom mabel-100, padding 32 32 28, text-center
    - X close abs top-right
    - Heart icon 56px circle white + shadow-sm
    - Title "Estamos aqui contigo" 24px bold
    - Subtitle "Si estas pasando por un momento dificil..."
  - Hotline lines as cards (bg white, border ink-200, radius 12, padding 14 16) with phone icon left + name/number center + "Llamar" button right
  - Footer: outline "Continuar con Mabel" button — closes overlay, returns to chat
- [ ] 25. Hotline lines: read from existing `/sos` endpoint (system_config.sos_hotline_numbers) — PRESERVE existing fetch + fallback list (Linea 106, Linea 141, UMB Bienestar with phones).
- [ ] 26. PRESERVE existing safety_event registration (`POST /safety-events`) with `trigger: "manual"` when the overlay opens, regardless of source (SosFab, sidebar button, or auto).
- [ ] 27. The SosFab in StudentLayout stays unchanged (still works as a trigger).

### Capability 6.6 — auth-onboarding-skin

- [ ] 28. Create `frontend/src/components/auth/AuthShell.tsx` with:
  - LEFT panel: flex-1 padding 48 56, gradient mabel-700→600→800 160deg, 2 decorative circles absolute, brand row top with Avatar M white + Mabel IA / UMB, hero `{side}` prop centered, footer with lock + disclaimer 12px opacity 0.7
  - RIGHT panel: flex-1 bg white padding 48 56, formulario max-w 420 centered
  - Mobile (<md): left panel becomes ~120px top header bar with brand + reduced gradient
- [ ] 29. Refactor each auth page to use AuthShell:
  - `Landing.tsx`: hero "Bienestar emocional · UMB" + CTA group (Iniciar sesion + Registrarme)
  - `Login.tsx`: hero "Bienvenido de vuelta" + existing login form on right (preserve all logic including role-based redirect and remember_me)
  - `Register.tsx`: hero "Empieza tu camino con Mabel" + register form
  - `ForgotPassword.tsx` + `ResetPassword.tsx`: hero with relevant copy + form
- [ ] 30. `Consent.tsx`, `ConsentRejected.tsx`, `ConsentRequired.tsx`: wider variant (max-w-2xl form area in right panel) to fit legal body. 3 existing variants (sin consent, revocado, nueva version) preserved.
- [ ] 31. `Onboarding.tsx`: 3 steps with progress bar (h-1 ink-200 + mabel-600 fill), card with primitives, PrimaryButton/SecondaryButton, fade-in on step transitions. Preserve existing 3-step flow (Privacidad → Accesibilidad → Voz) + finalize → /home.
- [ ] 32. Restyle 7 modals: ChangePassword, Revoke, Delete, ArcoExport, Confirm, SessionExpired, Report — backdrop rgba(26,17,16,0.32) backdrop-blur 4, card bg white radius 18 shadow-xl scale-in, Nunito titles, mabel-600 primary button. Props/APIs UNTOUCHED.

### Verification

- [ ] 33. Frontend: `cd frontend && npx tsc --noEmit` clean.
- [ ] 34. Frontend: `cd frontend && npm run build` success.
- [ ] 35. Backend: `cd backend && source .venv/bin/activate && python -c "from app.main import app; print('OK')"` — no changes expected.
- [ ] 36. Admin panel untouched: `git diff main..feat/student-redesign --name-only | grep admin | wc -l` → 0 (admin files unchanged from main).
- [ ] 37. Visual smoke (manual): with admin credentials, walk through every screen — login → consent → onboarding → home → chat (text + mic) → sidebar SOS → settings overlay 5 tabs → logout via UserMenu. Verify SOS FAB visible + functional.
- [ ] 38. Functional smoke (manual): trigger crisis automatica (send a guardrail keyword) → CrisisOverlay opens automatically, TTS stops; reportar mensaje → modal opens + saves; check-in → form submits; finalizar sesion → end session route works.
