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
  - `HeartRating` agrega calificación empática inline por mensaje (feed para #44).
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
- **Propósito**: panel de calificaciones empáticas inter-rater (HeartRating capturado en `Chat.tsx`) para cumplir criterio de éxito "empatía ≥ 4/5 en ≥80% de casos".

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
- **`AdminSidebar`** — 9 links (Dashboard, Users, Reports, Safety Events, Metrics, Empathy Ratings, Config, Audit Logs) + badges polling-based.

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
| `HeartRating.tsx` | Rating empático por mensaje. |
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

## Apéndice — Cómo mantener este catálogo

1. Cada vez que se agrega/quita una ruta en `frontend/src/App.tsx`, actualizar §2 y la entrada correspondiente.
2. Cada vez que un modal global cambia su contrato (tabs Settings, ARCO export, etc.), actualizar §3/§5/§10.
3. Cuando aterrice una decisión D-N nueva, agregar fila en §8 con interfaces afectadas.
4. Mantener `docs/INTERFACES_MVP_CATALOGO.md` como referencia histórica hasta validación PO, luego eliminar.
5. El conteo "44 interfaces" se reajustará cuando se cierre el drift (#19, #23, #35) o ingresen nuevas pantallas.
