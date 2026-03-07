## Context

Mabel IA tiene el scaffold completo (Fase 1): 13 modelos SQLAlchemy, migración Alembic aplicada, FastAPI con health check, y frontend React+Vite+Tailwind. No existe lógica de negocio, repositorios, servicios, ni páginas funcionales.

Las 4 tablas necesarias ya existen en BD: `users` (9 cols), `password_reset_tokens` (6 cols), `consent_versions` (8 cols), `consents` (6 cols). Los modelos SQLAlchemy correspondientes también existen con relationships configuradas.

El backend usa async stack completo: asyncpg + SQLAlchemy async + FastAPI async.

## Goals / Non-Goals

**Goals:**
- Implementar registro, login, logout, y recuperación de contraseña
- Implementar flujo completo de consentimiento informado (Ley 1581/2012)
- Establecer la estructura de capas (schemas/repositories/services/routers) como patrón para fases siguientes
- Crear las páginas frontend de auth y consentimiento con navegación funcional
- Proteger rutas con JWT + consent guards

**Non-Goals:**
- SMTP real para recovery emails (MVP usa enlace simulado)
- OAuth / SSO / MFA (post-MVP)
- Refresh tokens (MVP usa un solo JWT con expiración configurable)
- Rate limiting en endpoints de auth (Fase 10 — Polish)
- Páginas de admin (Fase 8)
- Onboarding post-consentimiento (Fase 5)

## Decisions

### D1: Estructura de capas backend

```
backend/app/
├── schemas/        # Pydantic DTOs (request/response)
│   ├── auth.py
│   └── consent.py
├── repositories/   # Data access (SQLAlchemy queries)
│   ├── user_repository.py
│   ├── consent_repository.py
│   └── password_reset_repository.py
├── services/       # Business logic
│   ├── auth_service.py
│   └── consent_service.py
├── routers/        # FastAPI endpoints
│   ├── auth_router.py
│   └── consent_router.py
└── middleware/     # Auth dependencies
    └── auth.py     # get_current_user, require_role, require_consent
```

**Rationale**: Repository pattern aísla queries de lógica de negocio. Service layer centraliza reglas (validación de email UMB, lógica de consentimiento). Routers solo orquestan. Este patrón se reutilizará en todas las fases siguientes.

**Alternativa descartada**: Todo en routers (más simple, pero no escala a 13 tablas y no permite testeo unitario de lógica).

### D2: JWT con PyJWT (no python-jose)

- **Librería**: PyJWT (python-jose está discontinuado, ver CLAUDE.md)
- **Algoritmo**: HS256 con `JWT_SECRET` de `.env`
- **Payload**: `{ "sub": str(user_id), "role": "student|admin", "exp": timestamp }`
- **Expiración**: 24h por defecto, 7 días si "Recordar sesión"
- **Storage frontend**: `localStorage` (simple para MVP, no cookies HttpOnly)
- **Logout**: Client-side — borrar token de localStorage y Zustand store

**Rationale**: Stateless simplifica el MVP. No requiere tabla de sesiones JWT ni Redis. El trade-off es que no se puede invalidar server-side, aceptable para MVP con 30 usuarios.

### D3: Bcrypt para password hashing

- **Librería**: `bcrypt` (via `passlib` deprecated — usar bcrypt directo)
- **Cost factor**: 12 (balance seguridad/latencia para MVP)
- **Verificación**: `bcrypt.checkpw()` con timing-safe comparison

**Alternativa descartada**: Argon2 (mejor en teoría, pero bcrypt es más estándar y suficiente para MVP).

### D4: Password reset con token SHA-256

- **Flujo**: Generar 32 bytes random → SHA-256 → almacenar hash en `password_reset_tokens.token_hash`
- **Expiración**: 1 hora (`expires_at`)
- **Uso único**: Marcar `used_at` al consumir
- **MVP**: No envía email — retorna el token en la response (simulado)
- **Índice parcial**: `idx_prt_token_active` (WHERE used_at IS NULL) ya existe

### D5: Flujo de consentimiento

```
Login → check consent_status →
  "ok"                  → continuar a /home
  "no_consent"          → redirect /consent-required (variante A)
  "revoked"             → redirect /consent-required (variante B)
  "new_version_required" → redirect /consent-required (variante C)
```

- **Versión activa**: `consent_versions WHERE status = 'active'` (debe haber exactamente 1)
- **Aceptación**: INSERT en `consents` con `consent_version_id` + `scope`
- **Re-aceptación post-revocación**: UPDATE existente (SET `revoked_at = NULL`, actualizar `scope` y `accepted_at`) — UNIQUE constraint `(user_id, consent_version_id)` lo exige
- **Nueva versión**: INSERT nuevo (diferente `consent_version_id`)
- **Seed data**: Al menos 1 `consent_version` con status='active' para testing

### D6: Estructura frontend

```
frontend/src/
├── api/
│   └── client.ts       # Axios instance + JWT interceptor
├── stores/
│   └── authStore.ts     # Zustand: user, token, isAuthenticated, role
├── guards/
│   ├── ProtectedRoute.tsx   # Requiere auth
│   ├── PublicRoute.tsx      # Redirect si ya autenticado
│   ├── RoleGuard.tsx        # Requiere rol específico
│   └── ConsentGuard.tsx     # Requiere consentimiento vigente
├── pages/
│   ├── Landing.tsx          # #01
│   ├── Register.tsx         # #02
│   ├── Login.tsx            # #03
│   ├── ForgotPassword.tsx   # #04
│   ├── ResetPassword.tsx    # #05
│   ├── Consent.tsx          # #06
│   ├── ConsentRequired.tsx  # #22 (3 variantes)
│   ├── ConsentRejected.tsx  # #41
│   └── AccessDenied.tsx     # #32
├── components/
│   └── layout/
│       └── Header.tsx       # #33 (2 variantes: student/admin)
└── App.tsx                  # React Router config
```

**Rationale**: Separación clara entre guards (lógica de navegación), pages (vistas), stores (estado), y api (comunicación). Los guards envuelven rutas en React Router.

### D7: Validación de email institucional

- **Frontend**: Regex `/^[a-zA-Z0-9._%+-]+@est\.umb\.edu\.co$/`
- **Backend**: Misma validación en Pydantic schema
- **Decisión**: Solo `@est.umb.edu.co` para estudiantes. Admins se crean via seed/script (no registro público).

## Risks / Trade-offs

- **JWT en localStorage** → Vulnerable a XSS. Mitigation: No hay contenido user-generated renderizado sin sanitizar en MVP. Post-MVP: migrar a HttpOnly cookies.
- **Sin refresh tokens** → Si JWT expira durante uso, el usuario debe re-loguearse. Mitigation: Expiración de 24h (o 7 días con "Recordar") es suficiente para sesiones de estudio.
- **Sin rate limiting** → Endpoints de login/register vulnerables a brute force. Mitigation: MVP con 30 usuarios en red local UMB. Post-MVP: rate limiting por IP.
- **Enlace simulado para password reset** → No es flujo real de email. Mitigation: Aceptable para MVP/tesis. Se documenta como limitación.
- **Una sola consent_version activa** → Si se activa una nueva sin archivar la anterior, el sistema puede fallar. Mitigation: Lógica de servicio valida unicidad al activar.
