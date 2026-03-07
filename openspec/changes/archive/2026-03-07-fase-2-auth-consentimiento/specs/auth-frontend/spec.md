## ADDED Requirements

### Requirement: Landing page (#01)
The system SHALL render a landing page at route `/` that displays the Mabel IA logo, title, tagline, a brief description (2-3 paragraphs), a "Registrarse" primary button navigating to `/register`, an "Iniciar sesion" secondary button navigating to `/login`, a "Como funciona?" section with 3 step cards, an institutional UMB section, and a privacy policy link. The page SHALL NOT require authentication.

#### Scenario: Visitor sees landing
- **WHEN** a non-authenticated user navigates to `/`
- **THEN** the landing page renders with all described elements and both navigation buttons are functional

#### Scenario: PWA install banner (conditional)
- **WHEN** the browser supports PWA installation AND the app is not already installed (not standalone mode) AND the user has not dismissed the banner in the last 7 days
- **THEN** a banner appears with text "Instala Mabel IA en tu dispositivo para acceso rapido" and "Instalar" / "Ahora no" buttons

### Requirement: Register page (#02)
The system SHALL render a registration form at route `/register` with fields: `display_name` (required, min 2 chars), `email` (required, must match `@est.umb.edu.co`), `password` (required, min 8 chars, 1 uppercase, 1 number, 1 special), `confirm_password` (must match password). The page SHALL include a password strength indicator (progress bar: red/yellow/green), inline validation messages per field, and a link to `/login`.

#### Scenario: Successful registration
- **WHEN** the user fills all fields correctly and submits
- **THEN** `POST /api/v1/auth/register` is called, and on success the user is redirected to `/login` with a toast "Cuenta creada exitosamente"

#### Scenario: Client-side validation
- **WHEN** the user submits with invalid fields
- **THEN** inline error messages appear below each invalid field WITHOUT making an API call

#### Scenario: Server-side duplicate email
- **WHEN** the server returns 409 (duplicate email)
- **THEN** a toast shows "Este email ya esta registrado"

### Requirement: Login page (#03)
The system SHALL render a login form at route `/login` with fields: `email` (required), `password` (required), `remember_me` checkbox. On successful login, the JWT SHALL be stored in localStorage and the Zustand auth store, and the user SHALL be redirected to `/home` (student) or `/admin` (admin) based on the `role` in the response. The page SHALL include links to `/register` and `/forgot-password`.

#### Scenario: Successful student login
- **WHEN** a student logs in with valid credentials
- **THEN** JWT is stored, auth store is updated with `{ user, token, isAuthenticated: true, role: "student" }`, and redirect to `/home`

#### Scenario: Successful admin login
- **WHEN** an admin logs in with valid credentials
- **THEN** same as student but redirect to `/admin`

#### Scenario: Invalid credentials
- **WHEN** login returns 401
- **THEN** a generic error message "Credenciales invalidas" is displayed (no field-specific hints)

#### Scenario: Disabled account
- **WHEN** login returns 403 with disabled reason
- **THEN** the error message shows "Cuenta deshabilitada: <reason>"

### Requirement: Forgot password page (#04)
The system SHALL render a forgot password form at route `/forgot-password` with an email input and a submit button. On submission, it SHALL call `POST /api/v1/auth/forgot-password`. In MVP, the response contains a simulated reset link which SHALL be displayed directly on the page. The page SHALL include a "Volver al login" link.

#### Scenario: Submit recovery request
- **WHEN** the user enters a valid email and submits
- **THEN** `POST /api/v1/auth/forgot-password` is called, and the response message is shown. In MVP, the simulated reset link is displayed.

#### Scenario: Always show success
- **WHEN** the API returns success (regardless of whether email exists)
- **THEN** the same success message is shown: "Si el email esta registrado, recibiras instrucciones"

### Requirement: Reset password page (#05)
The system SHALL render a password reset form at route `/reset-password/:token`. On mount, it SHALL call `GET /api/v1/auth/reset-password/:token` to validate the token. If valid, it shows inputs for new password and confirm password with strength indicator. If invalid/expired, it shows an error with a "Solicitar nuevo enlace" link to `/forgot-password`.

#### Scenario: Valid token shows form
- **WHEN** the token is valid
- **THEN** the form renders with new password and confirm password fields

#### Scenario: Expired token shows error
- **WHEN** the token is invalid or expired
- **THEN** an error message "Este enlace ha expirado. Solicita uno nuevo." is shown with a link to `/forgot-password`

#### Scenario: Successful password change
- **WHEN** the user submits valid new password
- **THEN** `POST /api/v1/auth/reset-password` is called, and on success redirect to `/login` with toast "Contrasena actualizada"

### Requirement: Access denied page (#32)
The system SHALL render an access denied page at route `/403` with a lock/shield icon, title "Acceso denegado", a generic message, and a button to navigate to `/home`. The page SHALL NOT include a header or sidebar (centered layout like #20/#22).

#### Scenario: Student tries admin route
- **WHEN** a student navigates to `/403`
- **THEN** the page renders with centered layout, no header, and the "Volver" button navigates to `/home`

### Requirement: Header component (#33)
The system SHALL render a header/navbar component on all authenticated pages. The header SHALL have two variants:
- **Student variant**: Logo Mabel IA (link to `/home`), hamburger button for sidebar toggle, user display name, logout button. NO history or settings icons.
- **Admin variant**: Logo Mabel IA (link to `/admin`), admin display name, "Admin" badge, safety events badge (red if > 0), reports badge (red if > 0), logout button.

Logout SHALL clear the JWT from localStorage, reset the Zustand auth store, and redirect to `/login`.

#### Scenario: Student sees student header
- **WHEN** an authenticated student views any protected page
- **THEN** the student variant header renders with logo, hamburger, name, and logout

#### Scenario: Admin sees admin header
- **WHEN** an authenticated admin views any admin page
- **THEN** the admin variant header renders with logo, name, Admin badge, and logout

#### Scenario: Logout clears state
- **WHEN** the user clicks the logout button
- **THEN** localStorage token is removed, auth store is reset, and the user is redirected to `/login`

### Requirement: Zustand auth store
The system SHALL implement an auth store in `frontend/src/stores/authStore.ts` using Zustand with the following state: `token` (string | null), `user` (object | null with id, email, display_name, role), `isAuthenticated` (boolean). Actions: `login(token, user)`, `logout()`, `initialize()` (check localStorage on mount).

#### Scenario: Store persists across page refresh
- **WHEN** the user refreshes the page and a JWT exists in localStorage
- **THEN** `initialize()` restores the token and user from localStorage into the store

#### Scenario: Store clears on logout
- **WHEN** `logout()` is called
- **THEN** `token` is set to null, `user` is set to null, `isAuthenticated` is false, and localStorage is cleared

### Requirement: Axios client with JWT interceptor
The system SHALL configure an Axios instance in `frontend/src/api/client.ts` with `baseURL` pointing to the backend API. A request interceptor SHALL attach the JWT from the auth store as `Authorization: Bearer <token>`. A response interceptor SHALL detect 401 responses, call `logout()` on the auth store, and redirect to `/login`.

#### Scenario: Authenticated requests include JWT
- **WHEN** the auth store has a token
- **THEN** all API requests include `Authorization: Bearer <token>` header

#### Scenario: 401 triggers auto-logout
- **WHEN** any API response returns 401
- **THEN** the auth store is cleared and the user is redirected to `/login`

### Requirement: Protected route guard
The system SHALL implement a `ProtectedRoute` component in `frontend/src/guards/ProtectedRoute.tsx` that wraps routes requiring authentication. If `isAuthenticated` is false, it SHALL redirect to `/login`.

#### Scenario: Unauthenticated user
- **WHEN** a non-authenticated user tries to access a protected route
- **THEN** they are redirected to `/login`

### Requirement: Public route guard
The system SHALL implement a `PublicRoute` component in `frontend/src/guards/PublicRoute.tsx` that wraps routes for non-authenticated users. If `isAuthenticated` is true, it SHALL redirect to `/home` (student) or `/admin` (admin).

#### Scenario: Authenticated user visits login
- **WHEN** an authenticated user navigates to `/login` or `/register`
- **THEN** they are redirected to their home page based on role

### Requirement: Role guard
The system SHALL implement a `RoleGuard` component in `frontend/src/guards/RoleGuard.tsx` that wraps routes requiring a specific role. If the user's role does not match, it SHALL redirect to `/403`.

#### Scenario: Student accesses admin route
- **WHEN** a student tries to access a route guarded with `role="admin"`
- **THEN** they are redirected to `/403`

### Requirement: React Router configuration
The system SHALL configure React Router in `App.tsx` with these routes:
- Public: `/` (Landing), `/register`, `/login`, `/forgot-password`, `/reset-password/:token`
- Protected (student): `/home`, `/consent`, `/consent-required`, `/consent/rejected`, `/403`
- Protected (admin): `/admin` (placeholder)
- Catch-all: redirect to `/`

#### Scenario: Route structure
- **WHEN** the app loads
- **THEN** all routes are registered with appropriate guards (PublicRoute, ProtectedRoute, RoleGuard)
