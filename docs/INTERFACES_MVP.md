# Catálogo de Interfaces MVP — Mabel IA

> **Estado**: alineado al 2026-05-24 · 44+ interfaces reales (42 originales + 2 nuevas + cambios estructurales)
> **Fuente de verdad**: este archivo + `frontend/src/App.tsx` + `frontend/src/pages/` + `frontend/src/components/`
> **Reemplaza**: `docs/INTERFACES_MVP_CATALOGO.md` (deprecated, eliminar tras validación) y la página Notion "Interfaces MVP — Catálogo Funcional Completo" (snapshot 2026-03-01 obsoleta)
> **Decisiones vivas asociadas**: D-01 a D-15 en `docs/DECISIONES.md` (o memoria persistente del proyecto)

---

## 1. Resumen ejecutivo

| Categoría | Conteo real (2026-05-24) | Diferencia vs Notion 2026-03-01 |
|-----------|--------------------------|---------------------------------|
| Pantallas/rutas estudiante | 16 (incluye `/voice` y `/checkin/new` lazy) | +2 (Voice 2D + lazy session create) |
| Pantallas/rutas admin | 9 (incluye `EmpathyRatings`) | +1 (EmpathyRatings) |
| Modales transversales | 12+ (settings/ + chat/ + ui/) | +6 (BulkActionModal, DisableUserModal, EnableUserModal, ChangePasswordModal, ConfirmHideHistoryModal, SessionExpiredModal) |
| Componentes transversales nuevos | LlmStatusChip, StreamingIndicator, MabelAvatar, ReactiveRings, charts/, InfoHint, ExportCsvButton, UserDetailDrawer | Sin equivalente en Notion |
| Pantallas Notion eliminadas / fusionadas | #15 Settings (modal), #19 404 (no existe), #23 Login admin (unificado), #35 Footer (no renderizado) | — |

### Estado funcional / branding

- **Brand-skin aplicado** (commits `ca845f4` student + `543f4b9` admin). La afirmación de Notion "este catálogo NO define estilo visual" YA NO es vinculante: la paleta UMB (primary `#A51916`, accent `#0F303A`, danger `#DC2626`) está aplicada en `StudentLayout`, `AdminLayout`, `AuthShell`, todos los primitivos de Settings y el chat.
- **Sidebar global de 220px** (estudiante: `StudentSidebarV3`; admin: `AdminSidebar`). Variante colapsada con iconos centrados (commit e91d0d2/fdaca26/6d5a77e).
- **SOS FAB** (`components/ui/SosFab.tsx`) — 56px, white, 2px `#DC2626` border, esquina inferior derecha, presente sólo en layouts estudiante autenticados.

### Distinción rutas / modales / componentes

- **Ruta**: aparece en `App.tsx` con `<Route path=...>` (44 rutas reales).
- **Modal global**: se abre vía `useOutletContext().openSettings(tab?)` o handler local (`open*` state). NO tiene URL.
- **Componente transversal**: vive en `components/<dominio>/` y se monta en múltiples pantallas (Toast, Skeleton, Markdown, SosFab, SosPanel, ConfirmModal, EmptyState, etc.).

---

## 2. Mapa de rutas (App.tsx 2026-05-24)

| Path | Componente | Guard requerido | Descripción |
|------|------------|-----------------|-------------|
| `/` | `Landing` | `PublicRoute` | Bienvenida pública con CTA registro/login. |
| `/register` | `Register` | `PublicRoute` | Alta de cuenta estudiante (correo `@est.umb.edu.co`). |
| `/login` | `Login` | `PublicRoute` | Login unificado student + admin (D-01). |
| `/forgot-password` | `ForgotPassword` | `PublicRoute` | Solicita enlace de reset (MVP: muestra link simulado, D-03). |
| `/reset-password/:token` | `ResetPassword` | `PublicRoute` | Reset de contraseña por token. |
| `/consent` | `Consent` | `ProtectedRoute` | Acepta versión activa de consentimiento informado. |
| `/consent-required` | `ConsentRequired` | `ProtectedRoute` | Bloqueo cuando no hay consentimiento vigente (variantes A/B/C). |
| `/consent/rejected` | `ConsentRejected` | `ProtectedRoute` | Pantalla post-rechazo (no modal, ver §7). |
| `/403` | `AccessDenied` | `ProtectedRoute` | Estudiante intentando acceder a `/admin/*`. |
| `/onboarding` | `Onboarding` | `ProtectedRoute` + `RoleGuard(student)` + `ConsentGuard` | Onboarding 3-pasos (privacidad → voz → accesibilidad), full-screen sin sidebar. |
| `/home` | `Home` | + `OnboardingGuard` + `StudentLayout` | Dashboard estudiante (saludo, "Nueva sesión", sesiones recientes). |
| `/settings` | `<Navigate to="/home" replace />` | — | Redirige (Settings es modal global, no ruta). |
| `/checkin/new` | `CheckIn` (modo draft) | mismos | Lazy session create — la sesión se crea al primer submit. |
| `/session/:id/checkin` | `CheckIn` | mismos | Check-in pre-sesión sobre sesión existente. |
| `/session/:id/chat` | `Chat` | mismos | Chat principal SSE + reportes + SOS. |
| `/session/:id/voice` | `Voice` | mismos | Modo voz 2D con `MabelAvatar` (sustituye plan #10B 3D). |
| `/session/:id/end` | `SessionEnd` | mismos | Cierre empático de sesión. |
| `/session/:id/detail` | `SessionDetail` | mismos | Vista de sólo lectura de sesión pasada. |
| `/admin` | `AdminDashboard` | `ProtectedRoute` + `RoleGuard(admin)` + `AdminLayout` | KPIs + gráficas del estudio. |
| `/admin/users` | `AdminUsers` | mismos | Tabla con bulk-actions, filtros y `UserDetailDrawer`. |
| `/admin/users/:id` | `AdminUserDetail` | mismos | Detalle agregado (datos sin contenido de mensajes). |
| `/admin/reports` | `AdminReports` | mismos | Triaje de reportes de mensajes. |
| `/admin/safety-events` | `AdminSafetyEvents` | mismos | Ciclo de vida de safety events. |
| `/admin/metrics` | `AdminMetrics` | mismos | Tabs A–E del estudio cuasiexperimental. |
| `/admin/empathy-ratings` | `AdminEmpathyRatings` | mismos | **NUEVA** — calificaciones empáticas inter-rater. |
| `/admin/config` | `AdminConfig` | mismos | Versiones de consentimiento, guardrails, LLM. |
| `/admin/logs` | `AdminAuditLogs` | mismos | Audit logs append-only. |
| `*` | `<Navigate to="/" replace />` | — | Catch-all → landing (NO existe #19 dedicado). |

---

## 3. Catálogo estudiante (#01–#22)

### #01 — Landing / Bienvenida
- **Ruta**: `/`
- **Archivo**: `frontend/src/pages/Landing.tsx`
- **Propósito**: punto de entrada público con CTA a registro/login + secciones institucionales UMB.
- **Cambios desde Notion**: brand-skin aplicado (paleta UMB), copy y secciones actualizadas durante `mabel-brand-skin` (2026-05-20).

### #02 — Registro
- **Ruta**: `/register`
- **Archivo**: `frontend/src/pages/Register.tsx`
- **Propósito**: alta de estudiante con validación de dominio `@est.umb.edu.co` y fortaleza de contraseña.
- **Cambios desde Notion**: usa `AuthShell` (brand-skin) en lugar de layout genérico.

### #03 — Login
- **Ruta**: `/login`
- **Archivo**: `frontend/src/pages/Login.tsx`
- **Propósito**: login unificado student + admin. El backend devuelve `role` en el JWT; `RoleGuard` decide la redirección.
- **Cambios desde Notion**: ya NO existe pantalla separada de admin login (#23 fusionado, D-01 confirmado).

### #04 — Recuperar contraseña
- **Ruta**: `/forgot-password`
- **Archivo**: `frontend/src/pages/ForgotPassword.tsx`
- **Propósito**: solicita reset; MVP devuelve el enlace simulado sin SMTP (D-03).

### #05 — Restablecer contraseña
- **Ruta**: `/reset-password/:token`
- **Archivo**: `frontend/src/pages/ResetPassword.tsx`
- **Propósito**: setea nueva contraseña tras validar token; redirige a `/login`.

### #06 — Consentimiento informado
- **Ruta**: `/consent`
- **Archivo**: `frontend/src/pages/Consent.tsx`
- **Propósito**: lee versión activa de `consent_versions` y registra POST `/consents` con `consent_version_id` + scope.
- **Cambios desde Notion**: rechazo dispara redirect a `/consent/rejected` (página #41, NO modal).

### #07 — Onboarding (configuración inicial)
- **Ruta**: `/onboarding`
- **Archivo**: `frontend/src/pages/Onboarding.tsx`
- **Propósito**: 3 pasos (privacidad → voz → accesibilidad) full-screen sin sidebar (decisión PO para evitar fugas a `/home`).
- **Cambios desde Notion**: el ítem `tts_voice` y los 3 toggles de accesibilidad quedan visibles pero **deshabilitados** hasta que aterricen Voz/Avatar (memoria `onboarding-pending-when-voice-avatar-lands`).

### #08 — Home / Dashboard estudiante
- **Ruta**: `/home`
- **Archivo**: `frontend/src/pages/Home.tsx`
- **Propósito**: saludo, "Nueva sesión", sesiones recientes, acceso a Modo Voz.
- **Cambios desde Notion**: el botón "Nueva sesión" navega a `/checkin/new` (lazy create) en lugar de hacer POST `/sessions` inmediato.

### #09 — Check-in pre-sesión
- **Rutas**: `/checkin/new` (draft) y `/session/:id/checkin` (sesión existente)
- **Archivo**: `frontend/src/pages/CheckIn.tsx`
- **Propósito**: formulario emocional (mood, sueño, foco, notas).
- **Cambios desde Notion**: en `/checkin/new` no hay `id`; al submit se crea sesión + check-in **atómicamente** (lazy session create, commit `ca845f4`). "Saltar todo" vuelve a Home sin crear nada.

### #10 — Chat principal
- **Ruta**: `/session/:id/chat`
- **Archivo**: `frontend/src/pages/Chat.tsx`
- **Componentes propios**: `chat/Composer`, `chat/TopBar`, `chat/StreamingIndicator`, `chat/LlmStatusChip`, `chat/HeartRating`, `chat/SuggestionChip`, `chat/CheckinContextPopover`, `chat/SessionSearchModal`, `chat/ReportModal`, `chat/ConfirmDeleteSessionModal`.
- **Propósito**: conversación SSE con Mabel + reportes por burbuja + acceso al modal SOS + métricas inter-rater.
- **Cambios desde Notion**:
  - `LlmStatusChip` (4 estados: ok/degraded/down/checking) en header con popover ARIA.
  - `StreamingIndicator` 5-stage (idle → thinking → typing → finalizing → error) reemplaza el placeholder genérico "Mabel está escribiendo…".
  - `HeartRating` — calificación del estudiante a **toda la sesión** (1-5 corazones). Recibe `sessionId`, se monta UNA vez al cerrar la sesión (`sessionEnded === true`). Persiste en tabla `session_ratings` (no `empathy_ratings`). NO alimenta #44 (esa cola usa `empathy_ratings` poblada por admins inter-rater, no por estudiantes).
  - El switch "Modo Avatar 3D" (#10B Notion) **NO existe**: el modo voz se accede como ruta separada `/session/:id/voice` con avatar 2D animado (ver #43).

### #11 — Modal de reporte de mensaje
- **Tipo**: modal local del chat
- **Archivo**: `frontend/src/components/chat/ReportModal.tsx`
- **Propósito**: motivo + severidad opcional + detalles libres; respeta UNIQUE(message_id, reporter_id).
- **Cambios desde Notion**: misma especificación funcional.

### #12 — Panel SOS / Crisis
- **Tipo**: panel global superpuesto
- **Archivos**: `frontend/src/components/sos/SosPanel.tsx` + `frontend/src/components/ui/SosFab.tsx` + `frontend/src/components/ui/SosButton.tsx`
- **Propósito**: líneas 106, 141, UMB con `tel:` deeplinks. Activación manual o automática (guardrails post-filter).
- **Cambios desde Notion**: SOS está SOLO como FAB (no en header), consistente con decisión PO. Endpoint `GET /sos` lee `sos_hotline_numbers` desde `system_config`.

### #13 — Historial de sesiones
- **Estado**: **fusionado en `StudentSidebarV3`** (lista temporal con 4 grupos: hoy / 7d / 30d / antiguo). No existe ruta `/history` independiente — el sidebar es el historial.
- **Archivo**: `frontend/src/components/layout/StudentSidebarV3.tsx`
- **Cambios desde Notion**: la ruta `/history` planeada nunca se implementó; la búsqueda se hace vía `chat/SessionSearchModal` (Cmd/Ctrl+K).

### #14 — Detalle de sesión
- **Ruta**: `/session/:id/detail`
- **Archivo**: `frontend/src/pages/SessionDetail.tsx`
- **Propósito**: vista de sólo lectura de la conversación + check-in asociado.
- **Cambios desde Notion**: la eliminación se hace vía `ConfirmDeleteSessionModal` desde la sidebar o desde detalle.

### #15 — Settings / Preferencias
- **Estado**: **MODAL GLOBAL**, no ruta. `/settings` redirige a `/home`.
- **Apertura**: vía `useOutletContext<{ openSettings: (tab?) => void }>().openSettings('privacy' | 'voice' | 'account' | 'data')`.
- **Archivo de orquestación**: `frontend/src/pages/Settings.tsx` (montado como Outlet context por `StudentLayout`).
- **Primitivos**: `components/settings/primitives/{Card, Input, PrimaryButton, SaveBar, SecondaryButton, SectionHeader, SettingsField, SettingsNavItem, Toggle}.tsx`.
- **Tabs reales (4, no 5)**:
  1. **Privacidad** — `save_history`, `checkin_enabled`, `ConfirmHideHistoryModal`.
  2. **Voz** — fusiona Accesibilidad. Toggles de TTS, voz preferida y opciones a11y (contraste/tamaño/dark mode) quedan deshabilitadas hasta Voz/Avatar.
  3. **Cuenta** — email RO, `ChangePasswordModal`, `RevokeConsentModal`, `DeleteAccountModal`.
  4. **Mis datos (ARCO)** — `ArcoExportModal`.
- **Cambios desde Notion**: ya no es página. Accesibilidad ya no es tab independiente. SOS se invoca por FAB, nunca desde Settings.

### #16 — Modal eliminación de cuenta
- **Tipo**: modal
- **Archivo**: `frontend/src/components/settings/DeleteAccountModal.tsx`
- **Propósito**: doble confirmación (input "ELIMINAR" exacto) → DELETE `/users/me` (hard DELETE, D-14) → logout.

### #17 — Modal revocación de consentimiento
- **Tipo**: modal
- **Archivo**: `frontend/src/components/settings/RevokeConsentModal.tsx`
- **Propósito**: opción 1 reduce scope; opción 2 revoca (`revoked_at = NOW()`) y obliga re-aceptación vía `/consent-required` variante B (PO-Q1).

### #18 — Pantalla de sesión finalizada
- **Ruta**: `/session/:id/end`
- **Archivo**: `frontend/src/pages/SessionEnd.tsx`
- **Propósito**: despedida empática + resumen + CTA "Nueva sesión / Home".

### #19 — Error 404
- **Estado**: **NO existe componente dedicado**. `App.tsx` resuelve `path="*"` con `<Navigate to="/" replace />`. Bookmark inválido vuelve a landing.
- **Drift**: Notion plantea pantalla amigable; en código se aceptó UX silenciosa.

### #20 — Error de conexión
- **Tipo**: componente inline
- **Archivo**: `frontend/src/components/ui/ConnectionError.tsx`
- **Propósito**: reintento manual + backoff exponencial; preserva borradores del chat en estado local.

### #21 — Sesión expirada (JWT)
- **Tipo**: modal global montado en `App.tsx`
- **Archivo**: `frontend/src/components/ui/SessionExpiredModal.tsx`
- **Propósito**: se dispara cuando `api/client.ts` recibe 401 y llama `setOnSessionExpired`. Limpia auth y navega a `/login`.

### #22 — Consentimiento requerido
- **Ruta**: `/consent-required`
- **Archivo**: `frontend/src/pages/ConsentRequired.tsx`
- **Propósito**: bloqueo con 3 variantes (A nuevo / B revocado PO-Q1 / C nueva versión); decide variante con GET `/users/me/consent-status`.
- **Cambios desde Notion**: layout centrado sin header alineado al brand-skin nuevo.

---

## 4. Catálogo admin (#23–#33)

### #23 — Login de administrador (NO EXISTE)
- **Estado**: fusionado con #03. El backend devuelve `role=admin` en el JWT; `RoleGuard role="admin"` redirige al `/admin`.
- **Drift**: Notion mantiene esta entrada por completitud. Se sugiere retirarla.

### #24 — Dashboard admin
- **Ruta**: `/admin`
- **Archivo**: `frontend/src/pages/admin/Dashboard.tsx`
- **Componentes**: `admin/MetricCard`, `admin/charts/{BarChartWrapper, LineChartWrapper, DonutChartWrapper, MetricLineWithReference}`.
- **Propósito**: KPIs (usuarios, sesiones hoy, safety events 24h, reportes pendientes, latencia, SUS) + gráficas.

### #25 — Panel de safety events
- **Ruta**: `/admin/safety-events`
- **Archivo**: `frontend/src/pages/admin/SafetyEvents.tsx`
- **Componentes**: `admin/DataTable`, `admin/FilterBar`, `admin/Pagination`, `admin/ExportCsvButton`.
- **Cumple D-03/D-05**: NO muestra contenido de `messages.content`, sólo `safety_flags`, severidad, `session_id` truncado y acciones de ciclo de vida.

### #26 — Panel de reportes (triaje)
- **Ruta**: `/admin/reports`
- **Archivo**: `frontend/src/pages/admin/Reports.tsx`
- **Propósito**: estados open → triaged → resolved/dismissed con `reporter_id` enmascarado.

### #27 — Panel de métricas
- **Ruta**: `/admin/metrics`
- **Archivo**: `frontend/src/pages/admin/Metrics.tsx`
- **Tabs**: A Uso · B Bienestar · C Técnicas · D Seguridad · E Estudio (SUS + empatía + Cohen's d).
- **Cambios desde Notion**: las métricas se sirven en endpoints separados (`/admin/metrics/usage`, `wellbeing`, `technical`, `safety`, `study`). Importación SUS pendiente (D-11).

### #28 — Panel de gestión de usuarios
- **Ruta**: `/admin/users`
- **Archivo**: `frontend/src/pages/admin/Users.tsx`
- **Componentes nuevos**:
  - `admin/BulkActionModal.tsx` — acciones masivas (deshabilitar/habilitar) sobre selección múltiple (commit ffe1211).
  - `admin/DisableUserModal.tsx` — justificación obligatoria, registra en `audit_logs`.
  - `admin/EnableUserModal.tsx` — re-habilitación con motivo.
  - `admin/UserDetailDrawer.tsx` — preview lateral sin abandonar la tabla.
  - `admin/FilterBar.tsx` — buscador + estado + consentimiento + rango registro (combinados).
  - `admin/ExportCsvButton.tsx` — exporta CSV anonimizado.
  - `admin/InfoHint.tsx` — tooltip aclaratorio sobre máscaras y campos.
- **Cumple D-03/D-05**: email enmascarado `e***@est.umb.edu.co`, sólo agregados, log de auditoría en cada mutación.

### #29 — Detalle de usuario (admin)
- **Ruta**: `/admin/users/:id`
- **Archivo**: `frontend/src/pages/admin/UserDetail.tsx`
- **Propósito**: secciones General · Consentimiento · Preferencias (estado) · Estadísticas de uso. Sin contenido de mensajes.

### #30 — Configuración del sistema
- **Ruta**: `/admin/config`
- **Archivo**: `frontend/src/pages/admin/Config.tsx`
- **Cambios desde Notion**: editor en vivo de keywords + umbral SOS + toggle global guardrails. Sección LLM (no sólo Gemini): refleja `LLM_PROVIDER` y permite test de conexión vía `_persist_last_test` con SAVEPOINT (compliance D-12, ver F2/F5/F8 del cleanup admin-panel-debt-cleared).

### #31 — Logs de auditoría
- **Ruta**: `/admin/logs`
- **Archivo**: `frontend/src/pages/admin/AuditLogs.tsx`
- **Migraciones asociadas**: `008_audit_logs_actor.py` (campo `actor_*` consolidado).
- **Propósito**: append-only, exportable, filtra por admin/acción/rango.

### #32 — Acceso denegado (403)
- **Ruta**: `/403`
- **Archivo**: `frontend/src/pages/AccessDenied.tsx`
- **Propósito**: estudiante intentando ruta admin. Sin header (decisión PO).

### #33 — Header / Navbar
- **Estado**: dos variantes implementadas
  - Estudiante: `frontend/src/components/layout/Header.tsx` + `UserMenu.tsx`.
  - Admin: `frontend/src/components/admin/AdminHeader.tsx`.
- **Cambios desde Notion**: el SOS NO está en el header estudiante (sólo FAB). El header admin muestra badges de safety events y reportes pendientes vía polling.

---

## 5. Catálogo transversal (#34–#42)

### #34 — Sidebars
- **#34A AdminSidebar** — `frontend/src/components/admin/AdminSidebar.tsx`. Links a 9 secciones admin con badges.
- **#34B StudentSidebarV3** — `frontend/src/components/layout/StudentSidebarV3.tsx`. 4 grupos temporales + "Nueva sesión" + acceso modal a Settings + colapsable.

### #35 — Footer
- **Estado**: **NO se renderiza en ningún layout actual** (`StudentLayout`, `AdminLayout`, `AuthShell` no lo montan).
- **Drift**: documentado en Notion como mandatorio; en el código se decidió maximizar espacio del chat.

### #36 — Toast
- **Archivo**: `frontend/src/components/ui/Toast.tsx`
- **Store**: `frontend/src/stores/toastStore.ts`
- **Tipos**: success / error / info / warning. Auto-hide configurable.

### #37 — Modal genérico de confirmación
- **Archivo**: `frontend/src/components/ui/ConfirmModal.tsx`
- **Variantes**: simple y "type-to-confirm".

### #38 — Skeleton loaders
- **Archivo**: `frontend/src/components/ui/Skeleton.tsx`
- **Variantes**: cards, tabla, gráfica, chat, formulario, texto.

### #39 — Empty states
- **Archivo**: `frontend/src/components/ui/EmptyState.tsx`
- **Variantes**: sin sesiones, historial off, sin safety events, sin reportes, sin métricas, sin usuarios, sin logs.

### #40 — Modal exportar mis datos (ARCO)
- **Archivo**: `frontend/src/components/settings/ArcoExportModal.tsx`
- **Propósito**: vista resumen + botón "Descargar JSON" (GET `/users/me/export`). Aclara derechos Ley 1581/2012.

### #41 — Rechazo de consentimiento
- **Estado**: **es PÁGINA, no modal**.
- **Ruta**: `/consent/rejected`
- **Archivo**: `frontend/src/pages/ConsentRejected.tsx`
- **Cambios desde Notion**: Notion sugería un modal sobre `/consent`; el equipo eligió una página dedicada para reforzar la decisión y permitir contacto con el equipo de investigación.

### #42 — Modal cambio de contraseña
- **Archivo**: `frontend/src/components/settings/ChangePasswordModal.tsx`
- **Propósito**: contraseña actual + nueva + confirmación; PUT `/auth/change-password`.

---

## 6. Nuevas interfaces / componentes (post-Notion)

### #43 — Voice (modo voz 2D)
- **Ruta**: `/session/:id/voice`
- **Archivo**: `frontend/src/pages/Voice.tsx`
- **Componentes**:
  - `frontend/src/components/voice/MabelAvatar.tsx` — avatar 2D animado (CSS/SVG, sin Three.js).
  - `frontend/src/components/voice/ReactiveRings.tsx` — anillos reactivos al volumen del TTS/ASR.
- **Origen**: commit `e1db168` (2026-05-22).
- **Propósito**: alternativa de baja-fricción al avatar 3D planeado en Notion (#10B/#18). Soporta TTS sólo-mute, ASR pulse rojo, subtítulos sincronizados.
- **Diferencia vs Notion #10B**: NO usa Three.js/VRM/WebGL. Cero requisitos de hardware. Switch desde Chat (`TopBar`) que navega a `/session/:id/voice`.

### #44 — Empathy Ratings (admin)
- **Ruta**: `/admin/empathy-ratings`
- **Archivo**: `frontend/src/pages/admin/EmpathyRatings.tsx`
- **Backend**: `backend/app/services/admin/empathy_service.py`.
- **Migración asociada**: `009_greeting_unique_empathy_updated.py`.
- **Origen**: commit `ffe1211`.
- **Propósito**: panel de calificaciones empáticas **inter-rater** (admins/investigadores califican mensajes seleccionados de la cola). NO es el mismo widget que `HeartRating` del estudiante en #18: aquel califica sesión completa y persiste en `session_ratings`; este califica mensajes individuales y persiste en `empathy_ratings`. Cumple criterio de éxito "empatía ≥ 4/5 en ≥80% de casos".

### Componentes transversales nuevos

| Componente | Archivo | Propósito |
|------------|---------|-----------|
| `LlmStatusChip` | `frontend/src/components/chat/LlmStatusChip.tsx` | Píldora con estado LLM en `TopBar` del chat (ok / degraded / down / checking) + popover ARIA con descripción. |
| `StreamingIndicator` | `frontend/src/components/chat/StreamingIndicator.tsx` | Texto progresivo 5-stage durante streaming SSE (welcome inline + entre tokens). |
| `MabelAvatar` | `frontend/src/components/voice/MabelAvatar.tsx` | Avatar 2D animado para modo voz. |
| `ReactiveRings` | `frontend/src/components/voice/ReactiveRings.tsx` | Visualización reactiva al audio del modo voz. |
| `BulkActionModal` | `frontend/src/components/admin/BulkActionModal.tsx` | Acciones masivas sobre selección en `AdminUsers`. |
| `DisableUserModal` | `frontend/src/components/admin/DisableUserModal.tsx` | Modal con justificación obligatoria → audit log. |
| `EnableUserModal` | `frontend/src/components/admin/EnableUserModal.tsx` | Re-habilitación con motivo. |
| `UserDetailDrawer` | `frontend/src/components/admin/UserDetailDrawer.tsx` | Drawer lateral con detalle agregado sin salir de la tabla. |
| `ExportCsvButton` | `frontend/src/components/admin/ExportCsvButton.tsx` | Botón estándar de export CSV anonimizado. |
| `InfoHint` | `frontend/src/components/admin/InfoHint.tsx` | Tooltip aclaratorio (máscaras, derechos). |
| `charts/*` | `frontend/src/components/admin/charts/` | `BarChartWrapper`, `DonutChartWrapper`, `LineChartWrapper`, `MetricLineWithReference`, `chartTheme.ts` (centraliza paleta UMB en Recharts). |
| `SessionExpiredModal` | `frontend/src/components/ui/SessionExpiredModal.tsx` | Modal global 401 (#21 implementado). |
| `Markdown` | `frontend/src/components/ui/Markdown.tsx` | Render seguro de Markdown en burbujas del chat. |
| `MabelLogo` | `frontend/src/components/ui/MabelLogo.tsx` | Logo SVG del brand-skin. |
| `UmbAvatar` | `frontend/src/components/ui/UmbAvatar.tsx` | Iniciales del usuario para `UserMenu`. |
| `NativeSelect`, `Segmented`, `Slider`, `Toggle`, `Field` | `frontend/src/components/ui/` | Primitivos del design system v2 (settings + admin). |
| `AuthShell` | `frontend/src/components/auth/AuthShell.tsx` | Layout compartido por Landing/Login/Register/Forgot/Reset con paleta UMB. |
| `ConfirmHideHistoryModal` | `frontend/src/components/settings/ConfirmHideHistoryModal.tsx` | Aviso cuando se apaga `save_history`. |
| `CheckinContextPopover` | `frontend/src/components/chat/CheckinContextPopover.tsx` | Muestra al estudiante el contexto del check-in usado por la sesión. |
| `SuggestionChip` | `frontend/src/components/chat/SuggestionChip.tsx` | Chips de sugerencia inicial al primer mensaje. |
| `SessionSearchModal` | `frontend/src/components/chat/SessionSearchModal.tsx` | Cmd/Ctrl+K — búsqueda fuzzy de sesiones (cubre la ausencia de `/history`). |
| `ConfirmDeleteSessionModal` | `frontend/src/components/chat/ConfirmDeleteSessionModal.tsx` | Doble confirmación eliminar sesión desde sidebar o detail. |
| `HeartRating` | `frontend/src/components/chat/HeartRating.tsx` | Captura inter-rater empático por mensaje (feed para #44). |

---

## 7. Interfaces eliminadas o renombradas

| ID Notion | Estado real | Motivo / commit |
|-----------|-------------|-----------------|
| **#10B Modo Avatar 3D** | Reemplazado por **#43 Voice 2D** (`/session/:id/voice`). | Decisión técnica: bajar requisitos de hardware y eliminar dependencia Three.js/VRM. Commit e1db168. |
| **#15 Settings** | Ya NO es ruta. Modal global con 4 tabs (no 5). Accesibilidad fusionada en Voz. `/settings` → `<Navigate to="/home">`. | Commit `ca845f4`. |
| **#19 Error 404** | NO existe componente. Catch-all → `/`. | Decisión silenciosa; pendiente formalizar drift. |
| **#23 Login admin** | NO existe ruta separada. `RoleGuard` redirige según `users.role`. | D-01 confirmado. |
| **#35 Footer** | NO renderizado en ningún layout. | Decisión UX para maximizar espacio. |
| **`/history`** | Reemplazado por sidebar temporal de 4 grupos + `SessionSearchModal`. | Commit `ca845f4`. |
| **`/onboarding/preferences`** | Renombrado a `/onboarding`. | Refactor previo Fase 5. |
| **`/session/new/*`** | Sustituido por `/checkin/new` (lazy create) + `/session/:id/*`. | Commit `ca845f4`. |

---

## 8. Decisiones D-XX que afectan interfaces

| D# | Resumen | Interfaces afectadas |
|----|---------|----------------------|
| D-01 | Login unificado (student + admin) | #03, #23 (eliminada) |
| D-02 | SOS como FAB superpuesto | #12, #33 (header NO lleva SOS) |
| D-03 | Recuperación password simplificada (sin SMTP MVP) | #04, #05 |
| D-04 | Recharts para gráficas admin | #24, #27, `charts/*` |
| D-05 | ARCO como sección en Settings → tab "Mis datos" | #15, #40 |
| D-06 | `audit_logs` separado de `safety_events` | #25, #31, mig. `008` |
| D-07 | Chat 1:1, sin WebSocket multi-usuario; SSE sólo para streaming | #10, #43 |
| D-08 | Empty states con acción sugerida | #39 + todas las pantallas listables |
| D-09 | Consentimiento con scroll obligatorio | #06 |
| D-10 | `password_reset_tokens` separada | backend (afecta #04/#05) |
| D-11 | SUS/empatía administrados externamente | #27 Tab E, **#44 EmpathyRatings**. |
| D-12 | `_persist_last_test` con SAVEPOINT | #30 Config |
| D-14 | Hard DELETE directo MVP + `safety_events.user_id` SET NULL | #16, mig. `005b` |
| D-15 | PWA (vite-plugin-pwa) | Atraviesa todas las rutas, no introduce UI nueva visible |
| (nuevo) | Brand-skin UMB unificado (student + admin) | Atraviesa todas las pantallas. Commits `ca845f4` + `543f4b9`. |
| (nuevo) | Lazy session create vía `/checkin/new` | #08, #09 |
| (nuevo) | Settings como modal global | #15 |
| (nuevo) | Voice 2D en vez de Avatar 3D | #43 (sustituye #10B) |

Para el detalle completo y discusiones véase `docs/DECISIONES.md` (o memoria persistente del proyecto bajo "Decisiones Parte G").

---

## 9. Sidebar y layouts

### Layouts contenedores
| Layout | Archivo | Pantallas que envuelve |
|--------|---------|------------------------|
| `StudentLayout` | `frontend/src/components/layout/StudentLayout.tsx` | Home, Settings (modal), CheckIn, Chat, Voice, SessionEnd, SessionDetail. Provee `openSettings` por Outlet context. |
| `AdminLayout` | `frontend/src/components/admin/AdminLayout.tsx` | Todas las rutas `/admin/*`. |
| `AuthShell` | `frontend/src/components/auth/AuthShell.tsx` | Landing, Login, Register, ForgotPassword, ResetPassword, Consent, ConsentRequired, ConsentRejected, AccessDenied, Onboarding (full-screen sin sidebar). |

### Paleta brand-skin (aplicada)
| Token | Valor | Uso |
|-------|-------|-----|
| `primary` | `#A51916` | Header/CTA estudiante, AdminHeader, botones primarios. |
| `accent` | `#0F303A` | Sidebar background. |
| `danger` | `#DC2626` | SOS FAB, banners destructivos, validaciones. |
| `success` | `#16A34A` | Toasts éxito, badges OK. |
| `warning` | `#F59E0B` | Toasts warning, indicadores latencia 20-30s. |

### Sidebar (220px)
- **`StudentSidebarV3`** — colapsable con iconos centrados (commits e91d0d2, fdaca26, 6d5a77e). 4 grupos temporales que sustituyen `/history`. Botón "Nueva sesión" + acceso modal Settings.
- **`AdminSidebar`** — 8 links (Dashboard, Users, Reports, Safety Events, Metrics, Empathy Ratings, Config, Audit Logs) + badges polling-based.

### Header / UserMenu
- `Header.tsx` + `UserMenu.tsx` montan el avatar (`UmbAvatar`), nombre, acceso a Settings (modal) y logout.
- `AdminHeader.tsx` monta badges de eventos pendientes y el menú admin.

---

## 10. Componentes transversales (catálogo completo)

### `components/ui/`
| Archivo | Propósito |
|---------|-----------|
| `ConfirmModal.tsx` | Modal genérico (#37). |
| `ConnectionError.tsx` | Pantalla/inline de error de red (#20). |
| `EmptyState.tsx` | Empty states reutilizables (#39). |
| `Field.tsx` | Wrapper de formulario con label/help/error. |
| `MabelLogo.tsx` | Logo SVG. |
| `Markdown.tsx` | Renderer Markdown seguro para el chat. |
| `NativeSelect.tsx` | Select nativo estilizado. |
| `Segmented.tsx` | Toggle segmentado (filtros, tabs). |
| `SessionExpiredModal.tsx` | Modal 401 (#21). |
| `Skeleton.tsx` | Loaders (#38). |
| `Slider.tsx` | Slider 0-N (mood, severidad). |
| `SosButton.tsx` | Botón inline SOS. |
| `SosFab.tsx` | FAB SOS 56px (#12). |
| `Toast.tsx` | Sistema de toasts (#36). |
| `Toggle.tsx` | Toggle on/off. |
| `UmbAvatar.tsx` | Iniciales coloreadas. |

### `components/chat/`
| Archivo | Propósito |
|---------|-----------|
| `CheckinContextPopover.tsx` | Muestra contexto check-in al estudiante. |
| `Composer.tsx` | Input + mic + send. |
| `ConfirmDeleteSessionModal.tsx` | Confirmación eliminar sesión. |
| `HeartRating.tsx` | Calificación 1-5 corazones del estudiante a la sesión completa (al cerrar). Persiste en `session_ratings`. NO alimenta #44. |
| `LlmStatusChip.tsx` | Estado LLM en TopBar. |
| `ReportModal.tsx` | Reporte de mensaje (#11). |
| `SessionSearchModal.tsx` | Búsqueda fuzzy de sesiones (Cmd/Ctrl+K). |
| `StreamingIndicator.tsx` | Indicador 5-stage streaming. |
| `SuggestionChip.tsx` | Chips de sugerencia inicial. |
| `TopBar.tsx` | Header del chat con switch Voz + acciones. |

### `components/settings/`
| Archivo | Propósito |
|---------|-----------|
| `ArcoExportModal.tsx` | Export ARCO (#40). |
| `ChangePasswordModal.tsx` | Cambio password (#42). |
| `ConfirmHideHistoryModal.tsx` | Confirma apagar `save_history`. |
| `DeleteAccountModal.tsx` | Eliminación cuenta (#16). |
| `RevokeConsentModal.tsx` | Revocación consentimiento (#17). |
| `primitives/{Card, Input, PrimaryButton, SaveBar, SecondaryButton, SectionHeader, SettingsField, SettingsNavItem, Toggle}.tsx` | Primitivos brand-skin para los tabs del modal. |

### `components/sos/`
| Archivo | Propósito |
|---------|-----------|
| `SosPanel.tsx` | Panel SOS superpuesto (#12). |

### `components/voice/`
| Archivo | Propósito |
|---------|-----------|
| `MabelAvatar.tsx` | Avatar 2D animado para modo voz (#43). |
| `ReactiveRings.tsx` | Anillos reactivos al audio. |

### `components/admin/`
| Archivo | Propósito |
|---------|-----------|
| `AdminHeader.tsx` | Header admin con badges. |
| `AdminLayout.tsx` | Layout admin. |
| `AdminSidebar.tsx` | Sidebar admin (#34A). |
| `BulkActionModal.tsx` | Acciones masivas. |
| `DataTable.tsx` | Tabla reutilizable con sort/select. |
| `DisableUserModal.tsx` | Modal deshabilitar usuario. |
| `EnableUserModal.tsx` | Modal habilitar usuario. |
| `ExportCsvButton.tsx` | Export CSV anonimizado. |
| `FilterBar.tsx` | Filtros combinados. |
| `InfoHint.tsx` | Tooltip aclaratorio. |
| `MetricCard.tsx` | Card KPI. |
| `Pagination.tsx` | Paginador estándar. |
| `UserDetailDrawer.tsx` | Drawer lateral detalle usuario. |
| `charts/BarChartWrapper.tsx` | Wrapper Recharts barras. |
| `charts/DonutChartWrapper.tsx` | Wrapper Recharts dona. |
| `charts/LineChartWrapper.tsx` | Wrapper Recharts líneas. |
| `charts/MetricLineWithReference.tsx` | Línea con threshold horizontal. |
| `charts/chartTheme.ts` | Paleta UMB centralizada. |

### `components/auth/`
| Archivo | Propósito |
|---------|-----------|
| `AuthShell.tsx` | Layout compartido público. |

### `components/layout/`
| Archivo | Propósito |
|---------|-----------|
| `Header.tsx` | Header estudiante. |
| `StudentLayout.tsx` | Layout estudiante con Outlet context para Settings modal. |
| `StudentSidebarV3.tsx` | Sidebar estudiante (#34B). |
| `UserMenu.tsx` | Menú avatar + logout + Settings. |

---

## 11. Drift residual / pendientes

| # | Drift | Decisión sugerida |
|---|-------|-------------------|
| 1 | **#19 Error 404** no existe en código — catch-all redirige a `/`. | Implementar pantalla amigable O retirar formalmente la entrada Notion. |
| 2 | **#35 Footer** no renderizado. | Confirmar con PO si se mantiene la decisión o se reintroduce minimal en `AuthShell`. |
| 3 | **#23 Login admin** sin ruta. | Retirar la entrada de Notion y dejar nota explicativa con D-01. |
| 4 | **Brand-skin** aplicado contradice "no define estilo visual" de Notion. | Eliminar esa cláusula del catálogo Notion; este archivo lo reemplaza. |
| 5 | **#10B Avatar 3D** no se implementó; se sustituyó por #43 Voice 2D. | Marcar #10B/#18 como "diferido post-MVP" en Notion (memoria `onboarding-pending-when-voice-avatar-lands`). |
| 6 | **`/history`** desapareció como ruta. | Confirmar que el sidebar temporal + `SessionSearchModal` cubren HU-12/HU-13 (revisar HU formales). |
| 7 | **Onboarding** mantiene toggles de Voz/Avatar deshabilitados. | Re-activar cuando aterrice TTS final + avatar (memoria persistente). |
| 8 | **Importación SUS/empatía** (D-11) sigue manual / endpoint pendiente. | Definir `POST /admin/metrics/import` o reutilizar feed de HeartRating ya capturado. |
| 9 | **`tts_voice`** y `preferred_chat_mode=avatar` quedan placeholder en preferencias. | Mantener hasta release Voz/Avatar; documentado. |
| 10 | **AccessDenied** se renderiza tanto en `/403` como cuando `RoleGuard role="student"` rechaza a un admin. El admin actualmente es redirigido a `/admin` (mejor UX, ver comentario en `RoleGuard.tsx`). | OK — no requiere acción. |

---

## 12. Acciones / Botones / Opciones — inventario por pantalla

Inventario exhaustivo de controles interactivos por pantalla (#01–#44), derivado directamente del código en `frontend/src/pages/**` + `frontend/src/components/**` (snapshot 2026-05-24). Solo se listan controles que el usuario puede activar — no decoraciones ni indicadores pasivos. Cuando un control depende de un estado o preferencia, se indica en la columna "Visible cuando".

> **Atajos globales** (`frontend/src/hooks/useKeyboardShortcuts.ts`): el hook detecta `cmd+b`, `cmd+,` y `esc` (cmd/ctrl detectado vía `metaKey || ctrlKey`). Solo dispara cuando el foco NO está en `<input>/<textarea>/<select>/contenteditable` salvo que el caller pase `allowInInputs: true`. Hoy el único consumer registrado es `Settings` (modal) que escucha `esc` para cerrar cuando no hay sub-modal activo.

> **FAB SOS global**: presente en todas las pantallas envueltas por `StudentLayout` (Home, CheckIn, Chat, Voice, SessionEnd, SessionDetail). Abre el `SosPanel` superpuesto. Pulsa `onMouseDown` (botón rojo 56px). En pantallas que usan `SosButton variant="floating"` (Home, CheckIn, SessionEnd, SessionDetail) el botón es local; en Chat/Voice el SOS se invoca desde un botón de la TopBar (`openCrisis` del outlet context).

---

### #01 — Landing / Bienvenida

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Iniciar sesion" | Link | navega a `/login` | siempre |
| "Registrarme" | Link | navega a `/register` | siempre |

---

### #02 — Registro

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver al inicio" | Link | navega a `/` | siempre |
| Input "Nombre completo" | text | actualiza `form.display_name` | siempre |
| Input "Correo institucional" | email | valida regex `@umb.edu.co` | siempre |
| Input "Contraseña" | password | calcula barra de fortaleza (Débil/Regular/Buena/Fuerte) | siempre |
| Input "Confirmar contraseña" | password | valida match | siempre |
| "Crear mi cuenta" | botón submit | `POST /auth/register` → `/login` con toast | siempre (deshabilitado mientras `loading`) |
| "Iniciar sesión" (link inferior) | Link | navega a `/login` | siempre |

---

### #03 — Login

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver al inicio" | Link | navega a `/` | siempre |
| Input "Correo institucional" | email | actualiza `form.email` | siempre |
| Input "Contraseña" | password | actualiza `form.password` | siempre |
| "¿Olvidaste tu contraseña?" | Link | navega a `/forgot-password` | siempre |
| Checkbox "Recordarme" | checkbox | flag `remember_me` en el payload | siempre |
| "Iniciar sesión" | botón submit | `POST /auth/login` → `/admin` o `/home` según `user.role` | siempre (deshabilitado mientras `loading`) |
| "Crear cuenta nueva" | Link | navega a `/register` | siempre |

---

### #04 — Recuperar contraseña

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver al inicio de sesión" | Link | navega a `/login` | siempre |
| Input "Correo institucional" | email | actualiza `email` local | `!sent` |
| "Enviar enlace" | botón submit | `POST /auth/forgot-password` (siempre devuelve OK por D-03 anti-enumeración) | `!sent` |

---

### #05 — Restablecer contraseña

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Input "Nueva contraseña" | password | actualiza `form.password` + barra de fortaleza | `valid === true` |
| Input "Confirmar contraseña" | password | actualiza `form.confirm` | `valid === true` |
| "Cambiar contraseña" | botón submit | `POST /auth/reset-password` → `/login` con toast | `valid === true` |
| "Solicitar nuevo enlace" | Link | navega a `/forgot-password` | `valid === false` (token expirado/inválido) |

---

### #06 — Consentimiento informado

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Caja scroll del documento legal | div con `onScroll` | activa `scrolledToEnd` al llegar al final (auto-pasa si el body cabe sin scroll) | siempre que hay versión |
| Radio "Solo uso" | radio | `setScope('solo_uso')` | siempre |
| Radio "Uso + mejora anónima" | radio | `setScope('uso_mejora_anon')` | siempre |
| Tooltip (i) por scope (`InfoHint`) | hover popover | despliega copy largo | siempre |
| Checkbox "He leído y acepto…" | checkbox | habilita `accepted` (sólo activable si `scrolledToEnd`) | siempre |
| "Rechazo" | botón | navega a `/consent/rejected` | siempre |
| "Acepto y continuar" | botón submit | si `status==='revoked'` → `PATCH /consents/current {action:'re-accept', scope}`; si no → `POST /consents {consent_version_id, scope}` → `/home` | `canSubmit` (scrolledToEnd && accepted && scope!=='') |
| "Cerrar sesión" | botón | `logout()` + navega a `/` | sólo en variante `noVersion` (no hay versión activa) |

---

### #07 — Onboarding

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Toggle "Guardar historial de conversaciones" | toggle | `update('save_history', v)` | paso 1 (Privacidad) |
| Toggle "Check-in emocional al inicio" | toggle | `update('checkin_enabled', v)` | paso 1 |
| Toggle "Voz de Mabel" (master) | toggle | `update('voice_enabled', v)` | paso 2 (Voz y experiencia) |
| Toggle "Modo voz 2D" | toggle | `update('voice_mode_enabled', v)` (gated por `voice_enabled`) | paso 2 |
| Toggle "Mabel lee sus respuestas en chat texto" | toggle | `update('tts_enabled', v)` (gated) | paso 2 |
| Toggle "Resaltar palabras mientras Mabel habla" | toggle | `update('subtitles', v)` (gated) | paso 2 |
| Tooltips (i) por opción (`InfoHint`) | hover popover | copy largo explicativo | siempre |
| "Anterior" | botón | `setStep(step-1)` | `step > 0` |
| "Omitir" | botón | si no es último paso → avanza; si es último → `PUT /preferences` con defaults y navega a `/home` | siempre |
| "Continuar" | botón | `setStep(step+1)` | `step < STEPS.length-1` |
| "Comenzar" | botón submit | `PUT /preferences` con coerción si voice off → navega a `/home` | último paso |

---

### #08 — Home / Dashboard estudiante

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `SosButton variant="floating"` | botón flotante | abre `SosPanel` vía `openCrisis` | siempre |
| Card "Empezar con un check-in breve" | botón | navega a `/checkin/new` (lazy: sin crear sesión) | `preferences.checkin_enabled === true` |
| `Composer` compact | textarea + send | `Enter` envía, `Shift+Enter` salto de línea; submit → `createSession()` + `navigate('/session/{id}/chat', {state:{pendingMessage}})` | siempre |
| 4 `SuggestionChip` ("Cómo me siento hoy", "Quiero hablar de algo", "Tengo estrés académico", "Necesito motivación") | botón | `createSession()` + navega a chat con `pendingMessage` del prompt | siempre (deshabilitados durante `creating`) |
| FAB SOS (StudentLayout) | botón | abre `SosPanel` | siempre |

---

### #09 — Check-in pre-sesión

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `SosButton variant="floating"` | botón flotante | abre `SosPanel` | siempre |
| 5 botones mood (radiogroup, iconos) | radio | `toggleMood(lvl)` (click sobre la seleccionada deselecciona) | siempre |
| Segmented "Energía" (4 opciones) | radio | `toggleEnergy` | siempre |
| Segmented "Estrés" (4 opciones) | radio | `toggleStress` | siempre |
| Segmented "Calidad de sueño" (mal/regular/bien/muy_bien) | radio | `toggleSleepQuality` | siempre |
| "También puedo decir las horas" / "Quitar horas exactas" | botón toggle | abre/cierra input numérico de horas | siempre |
| Input "horas" (number 0–24, step 0.5) | number | actualiza `sleepHours` | `sleepHoursOpen === true` |
| Segmented "Soledad/conexión" (4 opciones) | radio | `toggleLoneliness` | siempre |
| Chips de "focos" multi-select | botones aria-pressed | `toggleFocus(value)` | siempre |
| Input "Otro foco" (max 80 chars) | text | actualiza `focusOther` | `focus.includes('Otro')` |
| Textarea "Algo más que quieras compartir" (max 500) | textarea | actualiza `note` | siempre |
| "Saltar todo" | botón | si `isDraft` → navega a `/home`; si edit → navega a `/session/{id}/chat` | siempre |
| "Continuar" | botón submit | si payload vacío → `handleSkip`; si draft → `createSession({checkinPayload})` + navega a chat; si edit → `PATCH /sessions/{id}` + navega a chat | siempre (deshabilitado mientras `submitting`) |
| FAB SOS (StudentLayout) | botón | abre `SosPanel` | siempre |

---

### #10 — Chat principal

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `HeartRating` (1–5 corazones) | botones | `PUT /sessions/{id}/rating` — `session_ratings` | `sessionEnded === true` |
| `LlmStatusChip` (TopBar) | popover ARIA | abre detalle del estado LLM (ok/cold/down/checking/unknown) | siempre |
| `SosButton` (TopBar) | botón pill | `openCrisis()` → abre `SosPanel` | siempre |
| Botón "Hablar" (TopBar) | botón | `navigate('/session/{id}/voice')` | `!sessionEnded && voiceModeEnabled` (master `voice_enabled` && sub `voice_mode_enabled`) |
| `CheckinContextPopover` (TopBar) | popover | muestra el `checkin_payload` de la sesión | siempre |
| Botón 3-puntos `MoreVertical` (TopBar) | dropdown | abre menú con "Finalizar sesión" | siempre |
| Menú > "Finalizar sesión" | menuitem | abre `ConfirmModal` → `endSession(id)` → `/session/{id}/end` | menú abierto, `!sessionEnded` |
| **Composer**: Textarea (max 2000) | textarea | `setInput` con cap; `Enter` envía, `Shift+Enter` salto | siempre (deshabilitado si `isStreaming || isRecording || sessionEnded || awaitingFirstResponse`) |
| **Composer**: Botón micrófono | toggle button | `handleMicToggle` → `useAudioRecorder` start/stop → `POST /asr/transcribe` → `sendMessage` | siempre que `onMicToggle` esté presente |
| **Composer**: Botón mute (Volume2/VolumeX) | toggle | `toggleMute()` (TTS) | `ttsEnabled === true` |
| **Composer**: Botón enviar (ArrowRight circular) | botón submit | `handleSend` → `POST /api/v1/sessions/{id}/messages` (SSE stream) | `value.trim() && !disabled` |
| Hover por burbuja asistente — botón "Copiar" | botón | `navigator.clipboard.writeText(content)` + toast | hover sobre burbuja assistant terminada |
| Hover por burbuja asistente — botón "Reportar" (Flag) | botón | `setReportMessageId(msg.id)` → abre `ReportModal` (#11) | hover sobre burbuja, `!isReported` |
| Banner "Mabel está despertando" | indicador pasivo | — | `llm.status === 'cold'` |
| FAB SOS (StudentLayout) | botón | abre `SosPanel` | siempre |
| `ConfirmModal` "¿Finalizar sesión?" | modal | `handleEndSession` (PATCH endSession) | `showEndModal` |
| `ReportModal` | modal | ver #11 | `reportMessageId !== null` |
| `SosPanel` | overlay | auto al `riskDetected` o manual desde SOS button | `showSos` |

---

### #11 — Modal de reporte de mensaje

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Backdrop click | div | `onClose()` | siempre |
| Botón X cerrar | botón | `onClose()` | siempre |
| Radios "Motivo" (hallucination / harmful / privacy / low_empathy / other) | radio group | `setReason` | siempre |
| Input/Slider severidad (opcional 1–5) | slider | `setSeverity` | siempre |
| Textarea "Detalles" | textarea | `setDetails` | siempre |
| "Cancelar" | botón | `onClose()` | siempre |
| "Enviar reporte" | botón submit | `POST /messages/{id}/reports` con `{reason, severity, details}` → `onReported` → cierra modal | siempre (respeta UNIQUE message_id+reporter_id) |

---

### #12 — Panel SOS / Crisis (overlay)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `SosFab` (botón flotante 56px, bottom-right) | FAB | abre el `SosPanel` | siempre en layouts estudiante autenticados |
| Backdrop click | div | `onClose()` | siempre |
| Botón X cerrar (header) | botón | `onClose()` | siempre |
| Lista de líneas — botón por línea (Línea 106, 141, UMB) | `<a href="tel:{number}">` | abre `tel:` deeplink al sistema operativo | siempre (data viene de `GET /sos` → `sos_hotline_numbers` system_config) |
| "Cerrar" (footer) | botón | `onClose()` | siempre |

---

### #13 — Historial (fusionado en StudentSidebarV3)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "+ Nueva sesión" | botón | `handleNewSession` → `/checkin/new` (lazy) o `/home` según prefs | siempre |
| Botón buscar (icono Search) | botón | abre `SessionSearchModal` (Cmd/Ctrl+K) | siempre |
| Botón "Home" | botón | `navigate('/home')` | siempre |
| Botón "Ajustes" | botón | `onOpenSettings()` (abre modal Settings) | siempre |
| Filas de sesión (por grupo temporal) | botón | `navigate('/session/{id}/chat')` o `/detail` | siempre |
| Menú 3-puntos por sesión | dropdown | abre "Ocultar" + "Eliminar" | hover/click en la fila |
| Menú > "Ocultar conversación" | menuitem | `PATCH /sessions/{id}/hide` | menú abierto |
| Menú > "Eliminar" | menuitem | abre `ConfirmDeleteSessionModal` → `DELETE /sessions/{id}` | menú abierto |
| Botón usuario (footer) | dropdown | abre `UserMenu` (ver #33 abajo) | siempre |
| Botón colapsar/expandir sidebar (ChevronLeft/Right) | toggle | `onToggle()` → alterna ancho 268/60px | siempre |
| `SessionSearchModal` | modal | ver más abajo (#34B) | `searchOpen` |

---

### #14 — Detalle de sesión

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `SosButton variant="floating"` | botón flotante | abre `SosPanel` | siempre |
| Breadcrumb "Inicio" | botón | `navigate('/home')` | siempre |
| `HeartRating` (1–5) | botones | `PUT /sessions/{id}/rating` | `session.ended_at` |
| "Volver" | botón | `navigate('/home')` | siempre |
| "Eliminar sesión" | botón | abre `ConfirmDeleteSessionModal` → `DELETE /sessions/{id}` → `/home` | siempre |
| `ConfirmDeleteSessionModal` | modal | `handleConfirmDelete` | `deleteOpen` |
| FAB SOS (StudentLayout) | botón | abre `SosPanel` | siempre |

---

### #15 — Settings (modal global)

> Apertura: `useOutletContext().openSettings(tab?)` desde Header/UserMenu/StudentSidebarV3. Tabs reales: `privacy | voice | account | arco` (la TabId `accessibility` queda en el tipo pero NO en `VALID_TABS`; bookmarks viejos caen a `privacy`).

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Backdrop click | div | `handleClose()` (con guard: no cierra si hay submodal) | sin submodal abierto |
| Atajo `Esc` (`useKeyboardShortcuts`) | atajo teclado | `handleClose()` | `open && !anySubModalOpen` |
| Botón X cerrar (header) | botón | `handleClose()` | siempre |
| Nav sidebar — `SettingsNavItem` por tab (Privacidad / Voz / Cuenta / Mis datos) | botón | `setActiveTab(id)` | siempre |
| **Tab Privacidad**: Toggle "Guardar historial" | toggle | si ON→OFF abre `ConfirmHideHistoryModal`; OFF→ON `POST /users/me/history/toggle-on` + re-hidrata store | tab activa |
| **Tab Privacidad**: Toggle "Check-in emocional al inicio" | toggle | `setCheckinEnabled` | tab activa |
| **Tab Privacidad**: `SaveBar` "Guardar" | botón | `savePrivacy` → `PUT /preferences { checkin_enabled }` | tab activa |
| **Tab Voz**: Toggle "Voz de Mabel" (master) | toggle | `setVoiceEnabled` | tab activa |
| **Tab Voz**: "Probar voz" | botón | `previewVoice` → `GET /tts/synthesize?text=…` → reproduce blob | `voiceEnabled` |
| **Tab Voz**: Toggle "Modo voz 2D" | toggle | `setVoiceModeEnabled` (gated) | tab activa |
| **Tab Voz**: Toggle "Mabel lee sus respuestas en chat texto" | toggle | `setTtsEnabled` (gated) | tab activa |
| **Tab Voz**: Toggle "Resaltar palabras mientras Mabel habla" | toggle | `setSubtitles` (gated) | tab activa |
| **Tab Voz**: `SaveBar` "Guardar" | botón | `saveVoice` → `PUT /preferences {tts_voice, preferred_chat_mode, accessibility}` con coerción si voice off | tab activa |
| **Tab Cuenta**: "Cambiar contrasena" | botón | abre `ChangePasswordModal` (#42) | tab activa |
| **Tab Cuenta**: campo Email (read-only) | display | — | tab activa |
| **Tab Cuenta**: "Eliminar cuenta" (danger zone) | botón | abre `DeleteAccountModal` (#16) | tab activa |
| **Tab Mis datos (ARCO)**: "Ver mis datos" | botón | abre `ArcoExportModal` (#40) | tab activa |
| **Tab Mis datos (ARCO)**: "Revocar consentimiento" | botón | abre `RevokeConsentModal` (#17) | tab activa |
| `ConfirmHideHistoryModal` | modal | `POST /users/me/history/toggle-off` → muestra `soft_hide`/`hard_delete` según scope | toggle "Guardar historial" → OFF |

---

### #16 — Modal eliminación de cuenta

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Backdrop click | div | `onClose()` | siempre |
| Botón X cerrar (header) | botón | `onClose()` | siempre |
| Input "Escribe ELIMINAR para confirmar" | text | habilita botón cuando match exacto | siempre |
| "Cancelar" | botón | `onClose()` | siempre |
| "Eliminar cuenta" (danger) | botón | `handleDelete` → `DELETE /users/me` (hard DELETE, D-14) → `logout()` → `/` | input === 'ELIMINAR' |

---

### #17 — Modal revocación de consentimiento

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Backdrop click | div | `onClose()` | siempre |
| Botón X cerrar (header) | botón | `onClose()` | siempre |
| "Reducir alcance a 'solo uso'" | botón | `handleReduceScope` → `PATCH /consents/current {action:'reduce_scope'}` | `currentScope === 'uso_mejora_anon'` |
| "Revocar consentimiento" | botón danger | `handleRevoke` → `PATCH /consents/current {action:'revoke'}` (`revoked_at=NOW()`) → redirige a `/consent-required` variante B | siempre |
| "Cancelar" (footer) | botón | `onClose()` | siempre |

---

### #18 — Pantalla de sesión finalizada

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `SosButton variant="floating"` | botón flotante | abre `SosPanel` | siempre |
| "Comenzar una nueva conversación" | botón primario | `navigate('/home')` (lazy-create; no crea sesión hasta enviar) | siempre |
| "Ir al inicio" | botón secundario | `navigate('/home')` | siempre |
| FAB SOS (StudentLayout) | botón | abre `SosPanel` | siempre |

---

### #19 — Error 404

Sin pantalla dedicada. `App.tsx` catch-all `path="*"` resuelve `<Navigate to="/" replace />`. **Sin controles propios.**

---

### #20 — Error de conexión (componente inline `ConnectionError`)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Reintentar" | botón | callback del consumer (re-ejecuta la request fallida con backoff exponencial) | siempre que se monta el componente |

---

### #21 — Modal sesión expirada (JWT 401)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Iniciar sesión" | botón | `onLogin` → limpia auth y navega a `/login` | siempre que se dispare desde `api/client.ts` 401 handler |

---

### #22 — Consentimiento requerido (3 variantes)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Ir al consentimiento" | Link | navega a `/consent` | variante A `no_consent` |
| "Re-aceptar consentimiento" | Link | navega a `/consent` | variante B `revoked` |
| "Revisar nueva versión" | Link | navega a `/consent` | variante C `new_version_required` |
| "Cerrar sesión" | botón | `handleLogout` → `logout()` + `/` | variantes B y C |

---

### #23 — Login admin

No existe ruta separada. Unificado con #03 (D-01). **Sin controles propios.**

---

### #24 — Dashboard admin

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Actualizar" (header) | botón | `fetchDashboard()` → `GET /admin/dashboard` (polling automático cada 30 s) | siempre |
| `MetricCard` "Safety events 24h" | card clickeable | `navigate('/admin/safety-events')` | `kpis.safety_events_24h > 0` |
| `MetricCard` "Reportes pendientes" | card clickeable | `navigate('/admin/reports')` | `kpis.reports_pending > 0` |
| "Ver todos →" (widget últimas 5 sesiones) | botón | `navigate('/admin/safety-events')` | siempre |
| Fila de sesión en la tabla "Últimas 5" | fila clickeable | `navigate('/admin/safety-events')` | sesiones disponibles |
| "Reintentar" (banner error) | botón | `fetchDashboard()` | `errorMsg !== null` |

---

### #25 — Panel safety events

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `FilterBar` > Input "Tipo evento" | text | actualiza filtro | siempre |
| `FilterBar` > Select "Severidad" (1–5 / todos) | select | actualiza filtro | siempre |
| `FilterBar` > Select "Estado" (active / reviewed / resolved / todos) | select | actualiza filtro | siempre |
| `FilterBar` > Input "Desde" (date) | date | actualiza filtro | siempre |
| `FilterBar` > Input "Hasta" (date) | date | actualiza filtro | siempre |
| `FilterBar` > "Reset" | botón | restablece filtros | `activeFilterCount > 0` |
| Tab "Por sesión" / "Lista de eventos" | tablist | `setViewMode` (re-paginación) | siempre |
| Fila/card de evento (expandible) | botón | expande detalle inline | siempre |
| `ExpandedDetail` > chips de transición de estado (active→reviewed, reviewed→resolved, etc.) | botón aria-pressed | `setSelectedTarget(target)` | dentro de detalle expandido |
| `ExpandedDetail` > Textarea "Notas (opcional)" | textarea | `setNotes` | con transición seleccionada |
| `ExpandedDetail` > "Cancelar" | botón | resetea `selectedTarget` + notas | con transición seleccionada |
| `ExpandedDetail` > "Confirmar" | botón submit | `PATCH /admin/safety-events/{id}` con `{status, notes}` | con transición seleccionada |
| `Pagination` (page, page_size) | controles | actualiza page state | siempre |
| "Reintentar" (error banner) | botón | `fetchEvents` | `errorMsg !== null` |

---

### #26 — Panel reportes (triaje)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `FilterBar` > Select "Motivo" (hallucination/harmful/privacy/low_empathy/other/todos) | select | actualiza filtro | siempre |
| `FilterBar` > Select "Severidad" (1–5/todos) | select | actualiza filtro | siempre |
| `FilterBar` > Select "Estado" (open/triaged/resolved/dismissed/todos) | select | actualiza filtro | siempre |
| `FilterBar` > Input "Desde" / "Hasta" (date) | date | actualiza filtro | siempre |
| `FilterBar` > "Reset" | botón | restablece filtros | `activeFilterCount > 0` |
| Fila de reporte (expandible) | botón | expande detalle inline | siempre |
| `ExpandedDetail` > chips de transición de estado | botón aria-pressed | `setSelectedTarget(target)` | dentro de detalle |
| `ExpandedDetail` > Textarea "Notas" | textarea | `setNotes` | con transición seleccionada |
| `ExpandedDetail` > "Cancelar" / "Confirmar" | botón | `PATCH /admin/reports/{id}` con `{status, notes}` | con transición seleccionada |
| `Pagination` | controles | `setPage` / `setPageSize` | siempre |
| "Reintentar" (banner error) | botón | `fetchReports` | `errorMsg !== null` |

---

### #27 — Panel métricas

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `ExportCsvButton` (header) | botón | descarga `/admin/metrics/export.csv?tab=…&from=…&to=…&cohort=…` | siempre |
| Toolbar > Input "Desde" (date) | date | actualiza `draft.from` | siempre |
| Toolbar > Input "Hasta" (date) | date | actualiza `draft.to` | siempre |
| Toolbar > "Aplicar" | botón | `applyRange()` (commit del draft al `range` real) | siempre |
| Toolbar > "Actualizar" | botón | `refresh()` (incrementa `refreshKey` para re-fetch sin cambiar params) | siempre |
| Toolbar > Select "Cohorte" | select | `setCohort(value)` (deshabilitado hasta `cohortsLoaded`) | siempre |
| Toolbar > "Limpiar filtros" | botón | `clearAllFilters()` (rango 30d + cohorte '') | `filtersDirty` |
| Tabs A–E (Uso / Bienestar / Técnicas / Seguridad / Estudio) | tablist | `changeTab(t.key)` (actualiza `?tab=` searchParam) | siempre |
| Tab Estudio > controles SUS/Cohen's d específicos | inputs varios | endpoints dedicados por tab (`/admin/metrics/usage|wellbeing|technical|safety|study`) | dentro de cada tab |
| Tooltips (i) `InfoHint` por métrica/chart | hover popover | despliega definición de la métrica | siempre |

---

### #28 — Admin Users

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `FilterBar` > Input "Buscar" (email o nombre) | text | `updateFilter('q', …)` | siempre |
| `FilterBar` > Select "Estado" (todos/active/disabled) | select | `updateFilter('status', …)` | siempre |
| `FilterBar` > Select "Consentimiento" (todos/ok/no_consent/revoked/new_version_required) | select | `updateFilter('consent_status', …)` | siempre |
| `FilterBar` > Select "Cohorte" | select | `updateFilter('cohort', …)` | siempre |
| `FilterBar` > Input "Registro desde" (date) | date | `updateFilter('created_from', …)` | siempre |
| `FilterBar` > Input "Registro hasta" (date) | date | `updateFilter('created_to', …)` | siempre |
| `FilterBar` > "Reset" | botón | `handleResetFilters` | `activeFilterCount > 0` |
| Checkbox header "Select all in page" (tri-state) | checkbox | `toggleAllInPage` (excluye admins) | siempre |
| Checkbox por fila | checkbox | `toggleRow(id)` (filas admin no tienen checkbox) | `row.role !== 'admin'` |
| Click sobre fila estudiante | fila clickeable | `setDrawerUserId(row.id)` → abre `UserDetailDrawer` | `row.role !== 'admin'` |
| Bulk bar > "Asignar cohorte ▾" | dropdown | abre menú con cohortes existentes + "+ Nueva cohorte…" + "Quitar cohorte" | `selectedIds.size > 0` |
| Menú cohorte > opción cohorte existente | menuitem | `applyBulkCohort(c, c)` → `PATCH /admin/users/cohort/bulk` | menú abierto |
| Menú cohorte > "+ Nueva cohorte…" | menuitem | `window.prompt` + `applyBulkCohort(cohort, cohort)` | menú abierto |
| Menú cohorte > "Quitar cohorte" (danger) | menuitem | `applyBulkCohort(null, 'sin cohorte')` | menú abierto |
| Bulk bar > "Acciones ▾" | dropdown | abre menú con Deshabilitar / Reactivar / Eliminar permanentemente | `selectedIds.size > 0` |
| Menú acciones > "Deshabilitar seleccionados…" | menuitem | `setBulkActionMode('disable')` → `BulkActionModal` | menú abierto |
| Menú acciones > "Reactivar seleccionados" | menuitem | `setBulkActionMode('enable')` → `BulkActionModal` | menú abierto |
| Menú acciones > "Eliminar permanentemente…" (danger) | menuitem | `setBulkActionMode('delete')` → `BulkActionModal` | menú abierto |
| Bulk bar > "Limpiar selección" | botón | `clearSelection` | `selectedIds.size > 0` |
| `Pagination` | controles | `setPage` / `setPageSize` | siempre |
| `UserDetailDrawer` | drawer lateral | ver #29 abajo | `drawerUserId !== null` |
| `BulkActionModal` | modal | confirma acción masiva → único endpoint `POST /admin/users/bulk-action` con `{action:"disable"\|"enable"\|"delete", user_ids:[...], reason?:"..."}` (NO son 3 rutas separadas — el `action` field discrimina) | `bulkActionMode !== null` |
| "Reintentar" (banner error) | botón | `fetchUsers` | `errorMsg !== null` |

---

### #29 — Admin UserDetail (+ Drawer)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver a usuarios" (breadcrumb) | Link | `navigate('/admin/users')` | siempre |
| "Deshabilitar cuenta" (hero) | botón danger | abre `DisableUserModal` | `canDisable` (user activo, no admin) |
| "Reactivar cuenta" (hero) | botón success | abre `EnableUserModal` | usuario deshabilitado (no admin) |
| "Eliminar permanentemente" (hero) | botón ghost danger | abre `BulkActionModal action="delete"` con `selected=[user]` | usuario deshabilitado (no admin) |
| `CohortEditor` > Input texto cohorte | text | `setValue(value)` | siempre |
| `CohortEditor` > "Guardar cohorte" | botón | `PATCH /admin/users/{id}/cohort` con `{cohort: trimmed||null}` | `dirty && !saving` |
| `CohortEditor` > "Eliminar cohorte" | botón | `PATCH /admin/users/{id}/cohort` con `{cohort: null}` | `currentCohort !== null` |
| "Reintentar" (banner error) | botón | `fetchUser` | `errorMsg !== null` |
| `DisableUserModal`: Textarea "Razón" | textarea | obligatoria | abierto |
| `DisableUserModal`: "Cancelar" / "Deshabilitar" | botón | `PATCH /admin/users/{id}/disable` con `{reason}` + `audit_log` → `navigate('/admin/users')` | abierto |
| `EnableUserModal`: Textarea "Motivo" | textarea | obligatoria | abierto |
| `EnableUserModal`: "Cancelar" / "Reactivar" | botón | `PATCH /admin/users/{id}/enable` con `{reason}` + `audit_log` | abierto |
| `BulkActionModal` (delete con N=1): Input "CONFIRMAR" + "Eliminar permanentemente" | botón | `POST /admin/users/bulk/delete` (hard DELETE D-14) → `/admin/users` | abierto |
| **`UserDetailDrawer`** (cuando se abre desde #28): backdrop click | div | `onClose()` | abierto |
| **Drawer**: Botón X cerrar | botón | `onClose()` | siempre |
| **Drawer**: "Ver ficha completa" | botón | `navigate('/admin/users/{id}')` | siempre |
| **Drawer**: "Cerrar" (footer) | botón | `onClose()` | siempre |

---

### #30 — Admin Config

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| **Sección 01 — Consentimiento** | | | |
| `VersionBodyToggle` (active/draft/cada archived) | botón | expande/colapsa preview del body | siempre por versión |
| Input "Version" | text | `setForm.version` | sub-sección "Crear nueva versión" |
| Input "Titulo" | text | `setForm.title` | sub-sección "Crear nueva versión" |
| Textarea "Contenido legal" (rows=12) | textarea | `setForm.body` | sub-sección "Crear nueva versión" |
| "Crear borrador" | botón | `POST /admin/consent-versions` | sub-sección |
| "Publicar versión" | botón warning | activa confirm step | hay `draft` |
| "Confirmar publicación" | botón warning | `POST /admin/consent-versions/{id}/publish` | `confirmPublishId === draft.id` |
| "Cancelar" (publish) | botón | `setConfirmPublishId(null)` | confirm step |
| "Eliminar borrador" | botón danger ghost | activa confirm step | hay `draft` |
| "Confirmar eliminación" | botón danger | `DELETE /admin/consent-versions/{id}` | `confirmDeleteId === draft.id` |
| "Cancelar" (delete) | botón | `setConfirmDeleteId(null)` | confirm step |
| `<details>` Versiones archivadas | summary clickeable | abre/cierra historial | `archived.length > 0` |
| **Sección 02 — Guardrails** | | | |
| Toggle "Bloqueo de configuración para estudio" (study_lock) | switch role | `setStudyLock(!v)` | siempre |
| "Aplicar" (study_lock) | botón | `saveStudyLock` → `PATCH /admin/config/study_lock_enabled` | `studyLockDirty` |
| Toggle "Filtro de guardrails activo" (enabled) | switch | `setEnabled(!v)` | siempre (gated por studyLock — requiere override) |
| "Aplicar" (enabled) | botón | `saveEnabled` → `PATCH /admin/config/guardrails_enabled` (con header `X-Study-Lock-Override` si study_lock on) | `enabledDirty` |
| Slider "Umbral severidad" (1–5) | range | `setThreshold(Number(e.target.value))` | siempre (gated) |
| "Aplicar umbral" | botón | `saveThreshold` → `PATCH /admin/config/sos_severity_threshold` (override header si lock) | `thresholdDirty` |
| Input "Agregar palabra clave" + Enter | text + Enter | `addKeyword()` | siempre (gated) |
| Checkbox "Crítica" (pre-add) | checkbox | `setNewKeywordCritical` | siempre |
| "Agregar" | botón | `addKeyword()` | siempre |
| Chip palabra clave (click) | botón | `toggleKeywordCritical(kw)` | siempre |
| Chip palabra clave × (remove) | botón | `removeKeyword(kw)` | siempre |
| "Guardar lista" | botón | `saveKeywords` → `PATCH /admin/config/safety_keywords` (override header si lock) | `keywordsDirty` |
| **`OverrideConfirmModal`** | modal | "Cancelar" / "Confirmar override" — ejecuta el patch con `X-Study-Lock-Override: true` | `pendingOverride !== null` |
| **Sección 03 — Líneas SOS** | | | |
| Por cada fila: Input "Nombre" | text | `updateRow(i, 'name', …)` | siempre |
| Por cada fila: Input "Numero" | text inputMode=numeric | `updateRow(i, 'number', …)` (valida 7–12 dígitos) | siempre |
| Por cada fila: "Eliminar" | botón | `removeRow(i)` | siempre |
| "+ Agregar linea" | botón | `addRow()` | siempre |
| "Guardar lineas" | botón | `save` → `PATCH /admin/config/sos_hotline_numbers` | `dirty` (validación cliente: nombre + número válido) |
| **Sección 04 — Proveedor LLM** | | | |
| "Probar conexión" | botón | `runTest` → `POST /admin/config/gemini/test` (persiste `last_test` con `_persist_last_test` SAVEPOINT D-12) | siempre |
| "Reintentar" (banner load error) | botón | `loadInfo` → `GET /admin/llm-info` | `!info && loadError` |
| **Sección 05 — Estado del sistema** | | | |
| "Volver a comprobar" | botón | `fetchHealth` → `GET /admin/services-health` | siempre |
| Header > "Reintentar" (banner general error) | botón | `loadConfig` → `GET /admin/config` | `errorMsg !== null` |

---

### #31 — Admin AuditLogs

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `FilterBar` > Input "Actor (email o ID)" | text | `updateFilter('actor', …)` | siempre |
| `FilterBar` > Select "Rol" (todos/admin/student/system) | select | `updateFilter('actor_role', …)` | siempre |
| `FilterBar` > Select "Acción" (con optgroups Admin/Estudiante/Control de datos/Sistema) | select | `updateFilter('action', …)` | siempre |
| `FilterBar` > Input "Desde" / "Hasta" (date) | date | `updateFilter('from'\|'to', …)` | siempre |
| `FilterBar` > "Reset" | botón | `handleResetFilters` | `activeFilterCount > 0` |
| Fila de log (expandible) | botón | expande `ExpandedDetail` (JSON metadata) | siempre |
| `Pagination` | controles | `setPage` / `setPageSize` | siempre |
| "Reintentar" (error banner) | botón | `fetchLogs` → `GET /admin/audit-logs` | `errorMsg !== null` |

---

### #32 — Acceso denegado (/403)

Solo botones de navegación. **Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver al inicio" | Link | navega a `/home` | siempre |

---

### #33 — Header / Navbar + UserMenu

**Acciones / Botones / Opciones** (`Header.tsx` + `UserMenu.tsx` estudiante; `AdminHeader.tsx` admin):

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Botón avatar `UmbAvatar` (estudiante) | dropdown | abre `UserMenu` | siempre |
| `UserMenu` > items "Perfil" / "Privacidad" / "Mis datos" / "Voz" | menuitem | `handleSelectSettings(tab)` → `openSettings(tab)` | menú abierto |
| `UserMenu` > "Cerrar sesión" | botón | `handleLogout` → `useAuthStore.logout()` + `navigate('/login')` | menú abierto |
| Click fuera del UserMenu | document listener | cierra el menú | menú abierto |
| `AdminHeader` > Badges (safety events, reports pendientes) | indicador clickeable | `navigate('/admin/safety-events'\|'/admin/reports')` con polling | siempre |
| `AdminHeader` > menú admin / avatar | dropdown | "Cerrar sesión" → `navigate('/login')` | siempre |
| Note: SOS **no** vive en el header (sólo FAB), por decisión D-02. | | | |

---

### #34A — AdminSidebar

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| `NavLink` por sección (Dashboard, Users, Reports, Safety Events, Metrics, Empathy Ratings, Config, Audit Logs) | Link | navega al path correspondiente | siempre |
| Badges polling (eventos, reportes) | indicador pasivo | refresh periódico (sin click) | siempre |
| "Cerrar sesión" (footer) | botón | `handleLogout` → `navigate('/login')` | siempre |

### #34B — StudentSidebarV3

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "+ Nueva sesión" | botón | `handleNewSession` → `navigate('/checkin/new')` o `/home` según prefs | siempre |
| Botón Search | botón | `setSearchOpen(true)` → abre `SessionSearchModal` | siempre |
| Botón Home | botón | `navigate('/home')` | siempre |
| Botón Settings | botón | `onOpenSettings()` (modal global) | siempre |
| Fila de sesión (groupByDate) | botón | `handleSessionClick(s)` → `/session/{id}/chat` o `/detail` | siempre |
| Menú 3-puntos por sesión > "Ocultar" | menuitem | `PATCH /sessions/{id}/hide` | menú abierto |
| Menú 3-puntos por sesión > "Eliminar" | menuitem | abre `ConfirmDeleteSessionModal` | menú abierto |
| Footer > Botón usuario | botón | `setUserMenuOpen(v)` → abre `UserMenu` | siempre |
| Botón colapsar/expandir (ChevronLeft/Right) | botón | `onToggle()` | siempre |
| **`SessionSearchModal`** | modal | (no atajo `Cmd+K` registrado en hook actual — se abre sólo desde botón Search del sidebar) | `searchOpen` |
| `SessionSearchModal` > Input búsqueda fuzzy | text | filtra sesiones cliente-side | abierto |
| `SessionSearchModal` > Fila resultado | botón | navega a `/session/{id}/chat` | abierto |
| `ConfirmDeleteSessionModal` > "Cancelar" / "Eliminar" | botón | `DELETE /sessions/{id}` | abierto |

---

### #35 — Footer

No renderizado en ningún layout actual. **Sin controles.**

---

### #36 — Toast (`Toast.tsx` + `toastStore`)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Botón X cerrar por toast | botón | `removeToast(id)` | siempre (auto-hide por timer también) |

---

### #37 — Modal genérico de confirmación (`ConfirmModal`)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Cancelar" | botón | `onCancel` | siempre |
| Botón confirm (label personalizable) | botón | `onConfirm` | siempre |
| Backdrop click | div | `onCancel` (en variante simple) | siempre |
| Input "type-to-confirm" (en variante destructiva) | text | habilita botón confirm cuando match | variante con `confirmPhrase` |

---

### #38 — Skeleton loaders

Sin controles. **Solo indicador visual.**

---

### #39 — Empty states

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Botón acción primaria (opcional, label/handler vía prop) | botón | callback del consumer (D-08: empty states con acción sugerida) | si el consumer pasa `actionLabel` + `onAction` |

---

### #40 — Modal exportar mis datos (ARCO)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Backdrop click | div | `onClose()` | siempre |
| Botón X cerrar (header) | botón | `onClose()` | siempre |
| "Descargar JSON" | botón | `downloadJson` → `GET /users/me/export?format=json` → descarga blob | siempre |
| "Descargar CSV" | botón | `downloadCsv` → `GET /users/me/export?format=csv` → descarga blob | siempre |
| "Cerrar" (footer) | botón | `onClose()` | siempre |

---

### #41 — Rechazo de consentimiento (página)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver a revisar el consentimiento" | Link | navega a `/consent` | siempre |
| "Cerrar sesión" | botón | `handleLogout` → `logout()` + `/` | siempre |

---

### #42 — Modal cambio de contraseña

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Backdrop click | div | `onClose` | siempre |
| Botón X cerrar (header) | botón | `onClose` | siempre |
| Input "Contraseña actual" | password | actualiza state | siempre |
| Input "Nueva contraseña" | password | actualiza state + barra fortaleza | siempre |
| Input "Confirmar nueva contraseña" | password | valida match | siempre |
| "Cancelar" | botón | `onClose` | siempre |
| "Cambiar contraseña" | botón submit (`PrimaryButton`) | `PUT /auth/change-password` | `isValid && !saving` |

---

### #43 — Voice (modo voz 2D)

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| "Volver" (TopBar) | botón | `handleExit` → `stopTts()` + `navigate('/session/{id}/chat')` | siempre |
| `LlmStatusChip` (TopBar) | popover ARIA | ver estado LLM (polling 30 s) | siempre |
| Timer 00:00 | display pasivo | — | siempre |
| Botón Mute (`ControlButton` Volume2/VolumeX) | toggle | `toggleMute()` (TTS) | siempre |
| Botón Mic principal (`ControlButton` lg) | toggle button | `handleMicToggle` → `useAudioRecorder` start/stop → `POST /asr/transcribe` (formData con `session_id`) → `sendMessage(id, text, {voiceMode:true})` → SSE | siempre (deshabilitado durante `isProcessing || thinking || speaking`; guard MIN_RECORDING_MS=800) |
| Botón Terminar (`ControlButton` X, danger) | botón | `handleExit` → vuelve al chat texto | siempre |
| Subtítulos / burbujas live | display | renderiza últimas 2 burbujas + streaming preview | activo durante interacción |
| Banner `micError` | indicador pasivo | — | `micError !== null` |
| **Guard**: si `voiceModeEnabled === false` redirige a `/session/{id}/chat` antes de montar mic. | | | |
| FAB SOS (StudentLayout) | botón | abre `SosPanel` | siempre |

---

### #44 — Admin EmpathyRatings

**Acciones / Botones / Opciones**:

| Elemento | Tipo | Acción / Endpoint | Visible cuando |
|---|---|---|---|
| Select "Cohorte" | select | `setCohort(value)` (cohorte requerida — sin ella stats/queue no se cargan) | siempre |
| "Quitar filtro" | botón | `setCohort('')` | `cohort !== ''` |
| "Actualizar" | botón | `fetchStats()` + `fetchQueue()` | siempre |
| "Reintentar" (banner stats) | botón | `fetchStats` → `GET /admin/empathy-ratings/stats?cohort=…` | `statsError !== null` |
| Tab "Pendientes (N)" | botón tab | `setActiveTab('pending')` → `GET /admin/empathy-ratings/queue?cohort=…` | siempre |
| Tab "Calificadas (N)" | botón tab | `setActiveTab('rated')` → `GET /admin/empathy-ratings/rated?cohort=…` | siempre |
| **Por mensaje pendiente**: 5 botones puntaje (1–5) | botón | `setScore(n)` (sólo si `!readOnly`) | tab pendientes |
| **Por mensaje pendiente**: chips de criterios (validación, escucha activa, claridad, calidez, no juicio, etc.) | botón role=checkbox | `toggleCriterion(key)` | tab pendientes |
| **Por mensaje pendiente**: "Enviar calificación" | botón submit | `POST /admin/empathy-ratings` con `{message_id, score, criteria[]}` | tab pendientes (con score elegido) |
| "Cargar más" (paginación pendientes) | botón | `fetchQueue({append:true})` | `queue.length < totalPending` |
| "Cargar más" (paginación rated) | botón | `fetchRated({append:true})` | `ratedItems.length < ratedTotal` |
| Click en mensaje calificado | fila | despliega rating previo (read-only) | tab calificadas |

---

## Apéndice — Cómo mantener este catálogo

1. Cada vez que se agrega/quita una ruta en `frontend/src/App.tsx`, actualizar §2 y la entrada correspondiente.
2. Cada vez que un modal global cambia su contrato (tabs Settings, ARCO export, etc.), actualizar §3/§5/§10.
3. Cuando aterrice una decisión D-N nueva, agregar fila en §8 con interfaces afectadas.
4. Mantener `docs/INTERFACES_MVP_CATALOGO.md` como referencia histórica hasta validación PO, luego eliminar.
5. El conteo "44 interfaces" se reajustará cuando se cierre el drift (#19, #23, #35) o ingresen nuevas pantallas.
6. Cuando se agregue/quite un control interactivo en cualquier `.tsx` de `frontend/src/pages/**` o de un componente que renderiza un control visible al usuario (botón, dropdown, toggle, atajo de teclado, modal), actualizar la entrada correspondiente en §12.
