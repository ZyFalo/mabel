## Why

Mabel IA no tiene sistema de autenticación ni flujo de consentimiento informado. Sin auth, ninguna funcionalidad posterior (chat, historial, preferencias) puede asociarse a un usuario. Sin consentimiento (obligatorio por Ley 1581/2012), el sistema no puede operar legalmente con datos de estudiantes. Esta es la Fase 2 del plan de implementación y bloquea todas las fases siguientes.

## What Changes

- **Registro de usuarios** (HU-01): POST `/api/v1/auth/register` con email institucional `@est.umb.edu.co`, bcrypt hashing, validación de fuerza de contraseña
- **Login con JWT** (HU-02): POST `/api/v1/auth/login` con PyJWT, claims `sub` (user_id) + `role`, stateless sessions
- **Logout**: DELETE `/api/v1/auth/logout` (client-side token removal)
- **Recuperación de contraseña**: POST `/api/v1/auth/forgot-password` + POST `/api/v1/auth/reset-password` con token SHA-256 (tabla `password_reset_tokens`), enlace simulado en MVP (sin SMTP)
- **Consentimiento informado** (HU-03): GET `/api/v1/consent-versions/active`, POST `/api/v1/consents`, PATCH `/api/v1/consents/:id` (re-aceptación post-revocación vía UPDATE), GET `/api/v1/users/me/consent-status`
- **Middleware de autenticación**: Dependency `get_current_user` que valida JWT y extrae claims
- **Guard de consentimiento**: Middleware/dependency que verifica consentimiento vigente antes de permitir acceso a rutas protegidas
- **Frontend auth pages**: #01 Landing, #02 Registro, #03 Login, #04 Recuperar Contraseña, #05 Restablecer Contraseña, #06 Consentimiento Informado, #22 Consentimiento Requerido (3 variantes), #32 Acceso Denegado, #33 Header/Navbar, #41 Rechazo de Consentimiento
- **Auth store (Zustand)**: Estado global de autenticación (token, user, isAuthenticated, role)
- **React Router guards**: ProtectedRoute (auth), ConsentGuard (consentimiento vigente), RoleGuard (admin vs student)

## Capabilities

### New Capabilities
- `auth-backend`: Registro, login, logout, recuperación de contraseña, middleware JWT, guards de rol. Tablas: `users`, `password_reset_tokens`.
- `consent-backend`: Flujo de consentimiento informado — consent_versions CRUD (admin), consents CRUD (estudiante), consent-status check, guard de consentimiento. Tablas: `consent_versions`, `consents`.
- `auth-frontend`: Páginas públicas (#01, #02, #03, #04, #05, #32), Header (#33), auth store Zustand, React Router guards, axios interceptor para JWT.
- `consent-frontend`: Páginas de consentimiento (#06, #22, #41), ConsentGuard, integración con auth store.

### Modified Capabilities
- `backend-scaffold`: Se añaden routers de auth y consent al FastAPI app, se configura el middleware de autenticación.

## Impact

- **Backend**: Nuevos directorios `schemas/`, `repositories/`, `services/`, `routers/` bajo `backend/app/`. Nuevas dependencias: `PyJWT`, `bcrypt`, `python-multipart`.
- **Frontend**: Nueva estructura de páginas en `frontend/src/pages/`, store en `frontend/src/stores/`, componentes en `frontend/src/components/`, guards en `frontend/src/guards/`. Nuevas dependencias: ya instalados `axios`, `react-router-dom`, `zustand`.
- **Modelos existentes**: No se modifican — `User`, `Consent`, `ConsentVersion`, `PasswordResetToken` ya existen de la Fase 1.
- **Base de datos**: No se crean tablas nuevas — las 4 tablas ya existen. Se usarán seed data para `consent_versions` (al menos 1 versión activa para testing).
- **Seguridad**: JWT stateless, bcrypt cost factor 12, token SHA-256 para password reset, no PII en logs, mensajes de error genéricos ("Credenciales inválidas").
