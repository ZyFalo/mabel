## Tasks

### Grupo 1 — Backend: Schemas + Dependencias

- [x] 1.1 Instalar dependencias backend: `PyJWT`, `bcrypt` (añadir a `requirements.txt` o `pyproject.toml`)
- [x] 1.2 Crear `backend/app/schemas/auth.py` con `RegisterRequest`, `LoginRequest`, `LoginResponse`, `ForgotPasswordRequest`, `ResetPasswordRequest`, `UserResponse` — validaciones de email UMB, password strength, display_name min 2 chars
- [x] 1.3 Crear `backend/app/schemas/consent.py` con `AcceptConsentRequest`, `PatchConsentRequest` (action, scope?), `ConsentStatusResponse`, `ConsentVersionResponse`, `ConsentResponse` — validación de scope enum y action enum

### Grupo 2 — Backend: Repositories

- [x] 2.1 Crear `backend/app/repositories/user_repository.py` con `UserRepository`: `get_by_id`, `get_by_email`, `create`, `update_password` — async con `AsyncSession`
- [x] 2.2 Crear `backend/app/repositories/password_reset_repository.py` con `PasswordResetRepository`: `create`, `get_by_token_hash` (filtro `used_at IS NULL`), `mark_used`
- [x] 2.3 Crear `backend/app/repositories/consent_repository.py` con `ConsentRepository`: `get_by_user_and_version`, `get_latest_by_user`, `create`, `update`
- [x] 2.4 Crear `backend/app/repositories/consent_version_repository.py` con `ConsentVersionRepository`: `get_active` (filtro `status='active'`), `get_by_id`

### Grupo 3 — Backend: Servicios

- [x] 3.1 Crear `backend/app/services/auth_service.py` con `AuthService`: `register` (validar email UMB, unicidad, hash bcrypt cost 12), `login` (verificar credenciales, generar JWT HS256 con PyJWT, expiración 24h/7d), `forgot_password` (generar 32 bytes random, SHA-256, crear token, retornar enlace simulado), `reset_password` (validar token hash, verificar expiry y used_at, actualizar password, marcar usado)
- [x] 3.2 Crear `backend/app/services/consent_service.py` con `ConsentService`: `get_active_version`, `accept_consent` (INSERT solo para nueva aceptación/nueva versión), `patch_consent` (re-accept: UPDATE revoked_at=NULL + scope + accepted_at), `get_consent_status` (lógica de 4 estados: ok/no_consent/revoked/new_version_required)

### Grupo 4 — Backend: Middleware de Auth

- [x] 4.1 Crear `backend/app/middleware/auth.py` con: `get_current_user` (dependency: decodificar JWT, verificar en BD, rechazar deleted_at IS NOT NULL), `require_role(role)` (dependency factory: verificar user.role), `require_consent` (dependency: verificar consent status == "ok")

### Grupo 5 — Backend: Routers

- [x] 5.1 Crear `backend/app/routers/auth_router.py` con: `POST /register` (público), `POST /login` (público), `POST /forgot-password` (público), `GET /reset-password/{token}` (público, validar token), `POST /reset-password` (público, consumir token)
- [x] 5.2 Crear `backend/app/routers/consent_router.py` con: `GET /consent-versions/active` (autenticado), `POST /consents` (autenticado, student, primera aceptación), `PATCH /consents/current` (autenticado, student, re-aceptación), `GET /users/me/consent-status` (autenticado)
- [x] 5.3 Crear `backend/app/routers/users_router.py` con: `GET /users/me` (autenticado)
- [x] 5.4 Actualizar `backend/app/main.py`: registrar `auth_router` (prefix `/api/v1/auth`), `consent_router` (prefix `/api/v1`), `users_router` (prefix `/api/v1/users`). Mantener health check.

### Grupo 6 — Backend: Seed Data

- [x] 6.1 Crear migración Alembic de seed data: insertar 1 `consent_version` con status='active', version="1.0", title="Consentimiento Informado — Mabel IA", body con texto placeholder referenciando Ley 1581/2012

### Grupo 7 — Frontend: Infraestructura Auth

- [x] 7.1 Crear `frontend/src/api/client.ts`: instancia Axios con baseURL, request interceptor (JWT de authStore), response interceptor (401 → logout + redirect /login)
- [x] 7.2 Crear `frontend/src/stores/authStore.ts`: Zustand store con state (token, user, isAuthenticated), actions (login, logout, initialize), persistencia en localStorage
- [x] 7.3 Crear `frontend/src/guards/ProtectedRoute.tsx`: redirect a `/login` si no autenticado
- [x] 7.4 Crear `frontend/src/guards/PublicRoute.tsx`: redirect a `/home` o `/admin` según rol si ya autenticado
- [x] 7.5 Crear `frontend/src/guards/RoleGuard.tsx`: redirect a `/403` si rol no coincide
- [x] 7.6 Crear `frontend/src/guards/ConsentGuard.tsx`: llamar `GET /users/me/consent-status`, redirect a `/consent-required` si status != "ok". No aplicar a rutas de consent.

### Grupo 8 — Frontend: Páginas Públicas

- [x] 8.1 Crear `frontend/src/pages/Landing.tsx` (#01): logo, título, descripción, botones registro/login, sección "Cómo funciona" (3 cards), sección institucional, link privacidad. Responsive.
- [x] 8.2 Crear `frontend/src/pages/Register.tsx` (#02): formulario con display_name, email (@est.umb.edu.co), password (indicador fuerza), confirm password. Validación inline. POST /api/v1/auth/register → redirect /login con toast.
- [x] 8.3 Crear `frontend/src/pages/Login.tsx` (#03): formulario email, password, remember_me checkbox. POST /api/v1/auth/login → almacenar JWT → redirect según rol. Error genérico "Credenciales inválidas".
- [x] 8.4 Crear `frontend/src/pages/ForgotPassword.tsx` (#04): formulario email. POST /api/v1/auth/forgot-password → mostrar mensaje + enlace simulado MVP. Link "Volver al login".
- [x] 8.5 Crear `frontend/src/pages/ResetPassword.tsx` (#05): validar token en mount (GET), si válido mostrar formulario nueva contraseña + confirmar + indicador fuerza. Si inválido/expirado, mostrar error + link a /forgot-password. POST /api/v1/auth/reset-password → redirect /login con toast.
- [x] 8.6 Crear `frontend/src/pages/AccessDenied.tsx` (#32): layout centrado sin header, icono candado, título "Acceso denegado", botón "Volver" → /home.

### Grupo 9 — Frontend: Páginas de Consentimiento

- [x] 9.1 Crear `frontend/src/pages/Consent.tsx` (#06): montar GET /consent-versions/active (si 404: mensaje "No hay versión disponible" + botón cerrar sesión), texto legal scrollable con scroll obligatorio (checkbox deshabilitado hasta scroll al final), sección propósito, sección ARCO, radio scope, checkbox aceptación, botón "Aceptar y continuar" (disabled hasta scroll+checkbox+scope), botón "Rechazar" → /consent/rejected. Primera aceptación: POST /api/v1/consents. Re-aceptación: PATCH /api/v1/consents/current con action "re-accept". Redirect condicional: GET /api/v1/preferences/me → si 404 → /onboarding/preferences (placeholder → /home en Fase 2), si 200 → /home.
- [x] 9.2 Crear `frontend/src/pages/ConsentRequired.tsx` (#22): montar GET /users/me/consent-status, renderizar variante A (no_consent), B (revoked), o C (new_version_required). Botones según variante. Layout centrado sin sidebar.
- [x] 9.3 Crear `frontend/src/pages/ConsentRejected.tsx` (#41): título, explicación Ley 1581, beneficios, botón "Volver a revisar" → /consent, botón "Cerrar sesión" → logout.

### Grupo 10 — Frontend: Layout + Router

- [x] 10.1 Crear `frontend/src/components/layout/Header.tsx` (#33): variante student (logo→/home, hamburger, nombre, logout) y variante admin (logo→/admin, nombre, badge Admin, badges safety/reports, logout). DELETE /api/v1/auth/logout (client-side: clear localStorage + Zustand + redirect /login).
- [x] 10.2 Actualizar `frontend/src/App.tsx`: configurar React Router con todas las rutas — públicas (PublicRoute), protegidas (ProtectedRoute + ConsentGuard), admin (ProtectedRoute + RoleGuard). Llamar authStore.initialize() en mount.

### Grupo 11 — Verificación

- [x] 11.1 Verificar que el backend arranca sin errores: `cd backend && python -m uvicorn app.main:app --port 8000`
- [x] 11.2 Verificar que el frontend arranca sin errores: `cd frontend && npm run dev`
- [x] 11.3 Test manual: registro → login → consent → redirect a /home (flujo completo)
