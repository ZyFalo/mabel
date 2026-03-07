## ADDED Requirements

### Requirement: User registration endpoint
The system SHALL expose `POST /api/v1/auth/register` that creates a new user. The request body SHALL include `email` (string, required), `password` (string, required), and `display_name` (string, required). The endpoint SHALL hash the password with bcrypt (cost factor 12) and store it in `users.hashed_password`. The `users.role` SHALL default to `'student'`. The response SHALL return the created user's `id`, `email`, `display_name`, and `created_at` with HTTP 201.

#### Scenario: Successful registration
- **WHEN** a POST request is sent to `/api/v1/auth/register` with `{"email": "test@est.umb.edu.co", "password": "Abc12345!", "display_name": "Test User"}`
- **THEN** a new row is inserted into `users` with `hashed_password` (bcrypt hash), `role='student'`, `created_at=CURRENT_TIMESTAMP`, and `deleted_at=NULL`, and the response is HTTP 201 with `{ id, email, display_name, created_at }`

#### Scenario: Email domain validation
- **WHEN** a POST request is sent with `email` that does not match `@est.umb.edu.co`
- **THEN** the response is HTTP 422 with error message "El email debe ser institucional (@est.umb.edu.co)"

#### Scenario: Duplicate email
- **WHEN** a POST request is sent with an `email` that already exists in `users`
- **THEN** the response is HTTP 409 with error message "Este email ya esta registrado"

#### Scenario: Weak password
- **WHEN** a POST request is sent with `password` that does not meet strength requirements (min 8 chars, 1 uppercase, 1 number, 1 special character)
- **THEN** the response is HTTP 422 with specific validation error

#### Scenario: Short display name
- **WHEN** a POST request is sent with `display_name` shorter than 2 characters
- **THEN** the response is HTTP 422 with validation error

### Requirement: User login endpoint
The system SHALL expose `POST /api/v1/auth/login` that authenticates a user and returns a JWT. The request body SHALL include `email` (string, required), `password` (string, required), and `remember_me` (boolean, optional, default false). The JWT payload SHALL contain `sub` (string, user UUID), `role` (string, 'student' or 'admin'), and `exp` (timestamp). Default expiration SHALL be 24 hours; if `remember_me` is true, expiration SHALL be 7 days. The JWT SHALL be signed with HS256 using `JWT_SECRET` from environment.

#### Scenario: Successful login as student
- **WHEN** a POST request is sent with valid email and password for a user with `role='student'`
- **THEN** the response is HTTP 200 with `{ access_token, token_type: "bearer", user: { id, email, display_name, role } }`

#### Scenario: Successful login as admin
- **WHEN** a POST request is sent with valid email and password for a user with `role='admin'`
- **THEN** the response is HTTP 200 with the same structure, and `user.role` is `"admin"`

#### Scenario: Invalid credentials
- **WHEN** a POST request is sent with invalid email or password
- **THEN** the response is HTTP 401 with generic message "Credenciales invalidas" (SHALL NOT reveal which field is incorrect)

#### Scenario: Deleted account
- **WHEN** a POST request is sent for a user where `deleted_at IS NOT NULL`
- **THEN** the response is HTTP 401 with "Credenciales invalidas"

#### Scenario: Disabled account
- **WHEN** a POST request is sent for a user where `disabled_at IS NOT NULL`
- **THEN** the response is HTTP 403 with message "Cuenta deshabilitada" and the `disabled_reason` field

#### Scenario: Remember me extends token
- **WHEN** `remember_me` is true
- **THEN** the JWT `exp` claim SHALL be set to 7 days from now instead of 24 hours

### Requirement: Forgot password endpoint
The system SHALL expose `POST /api/v1/auth/forgot-password` that initiates password recovery. The request body SHALL include `email` (string, required). The system SHALL generate 32 random bytes, compute SHA-256, and store the hash in `password_reset_tokens.token_hash`. The `expires_at` SHALL be 1 hour from creation. In MVP, the response SHALL include the raw token (simulated — no SMTP).

#### Scenario: Successful password reset request
- **WHEN** a POST request is sent with a registered email
- **THEN** a new row is inserted into `password_reset_tokens` with `user_id`, `token_hash` (SHA-256), `expires_at` (now + 1 hour), `used_at=NULL`, and the response is HTTP 200 with `{ message, reset_link }` where `reset_link` contains the raw token

#### Scenario: Unregistered email
- **WHEN** a POST request is sent with an email not in `users`
- **THEN** the response is HTTP 200 with the same success message (SHALL NOT reveal whether email exists)

### Requirement: Reset password endpoint
The system SHALL expose `POST /api/v1/auth/reset-password` that resets a user's password using a valid token. The request body SHALL include `token` (string, required) and `new_password` (string, required). The system SHALL hash the token with SHA-256, look up the hash in `password_reset_tokens`, validate it has not expired and `used_at IS NULL`, update `users.hashed_password`, and set `password_reset_tokens.used_at` to current timestamp.

#### Scenario: Successful password reset
- **WHEN** a POST request is sent with a valid, unexpired token and a strong new password
- **THEN** `users.hashed_password` is updated with the new bcrypt hash, `password_reset_tokens.used_at` is set, and the response is HTTP 200 with `{ message: "Contrasena actualizada exitosamente" }`

#### Scenario: Expired token
- **WHEN** a POST request is sent with a token whose `expires_at < NOW()`
- **THEN** the response is HTTP 400 with "Este enlace ha expirado. Solicita uno nuevo."

#### Scenario: Already used token
- **WHEN** a POST request is sent with a token whose `used_at IS NOT NULL`
- **THEN** the response is HTTP 400 with "Este enlace ya fue utilizado"

#### Scenario: Invalid token
- **WHEN** a POST request is sent with a token whose SHA-256 hash is not found in `password_reset_tokens`
- **THEN** the response is HTTP 400 with "Token invalido"

### Requirement: Validate reset token endpoint
The system SHALL expose `GET /api/v1/auth/reset-password/:token` that validates a token without consuming it. This is used by the frontend to check if the token is valid before showing the form.

#### Scenario: Valid token
- **WHEN** a GET request is sent with a valid, unexpired, unused token
- **THEN** the response is HTTP 200 with `{ valid: true }`

#### Scenario: Invalid or expired token
- **WHEN** a GET request is sent with an invalid, expired, or used token
- **THEN** the response is HTTP 200 with `{ valid: false, reason: "expired" | "used" | "invalid" }`

### Requirement: JWT authentication middleware
The system SHALL provide a FastAPI dependency `get_current_user` that extracts and validates the JWT from the `Authorization: Bearer <token>` header. It SHALL decode the token using `JWT_SECRET` with HS256, extract `sub` (user_id) and `role`, query the `users` table to verify the user exists and `deleted_at IS NULL`, and return the user object.

#### Scenario: Valid JWT
- **WHEN** a request includes a valid, unexpired JWT in the Authorization header
- **THEN** the dependency returns the `User` object with `id`, `email`, `display_name`, `role`

#### Scenario: Missing Authorization header
- **WHEN** a request has no Authorization header
- **THEN** the dependency raises HTTP 401 with `{ detail: "No autenticado" }`

#### Scenario: Expired JWT
- **WHEN** a request includes an expired JWT
- **THEN** the dependency raises HTTP 401 with `{ detail: "Token expirado" }`

#### Scenario: Invalid JWT
- **WHEN** a request includes a malformed or tampered JWT
- **THEN** the dependency raises HTTP 401 with `{ detail: "Token invalido" }`

#### Scenario: Deleted user
- **WHEN** a request includes a valid JWT but the user has `deleted_at IS NOT NULL`
- **THEN** the dependency raises HTTP 401 with `{ detail: "Token invalido" }`

### Requirement: Role-based access control dependency
The system SHALL provide a FastAPI dependency `require_role(role: str)` that wraps `get_current_user` and additionally checks that `user.role` matches the required role.

#### Scenario: Matching role
- **WHEN** the authenticated user has the required role
- **THEN** the dependency returns the user object

#### Scenario: Mismatching role
- **WHEN** the authenticated user does not have the required role
- **THEN** the dependency raises HTTP 403 with `{ detail: "Acceso denegado" }`

### Requirement: Get current user profile
The system SHALL expose `GET /api/v1/users/me` (authenticated) that returns the current user's profile data.

#### Scenario: Authenticated request
- **WHEN** an authenticated request is sent to `/api/v1/users/me`
- **THEN** the response is HTTP 200 with `{ id, email, display_name, role, created_at }`

### Requirement: User repository layer
The system SHALL implement `UserRepository` in `backend/app/repositories/user_repository.py` that provides async data access methods for the `users` table: `get_by_id(id)`, `get_by_email(email)`, `create(data)`, `update_password(user_id, hashed_password)`.

#### Scenario: Repository methods use async session
- **WHEN** any repository method is called
- **THEN** it uses the injected `AsyncSession` and executes queries asynchronously

### Requirement: Password reset repository layer
The system SHALL implement `PasswordResetRepository` in `backend/app/repositories/password_reset_repository.py` that provides: `create(user_id, token_hash, expires_at)`, `get_by_token_hash(token_hash)`, `mark_used(id)`.

#### Scenario: Repository respects partial index
- **WHEN** `get_by_token_hash` is called
- **THEN** the query filters by `token_hash` and `used_at IS NULL` to leverage the `idx_prt_token_active` partial index

### Requirement: Auth service layer
The system SHALL implement `AuthService` in `backend/app/services/auth_service.py` that orchestrates registration, login, forgot-password, and reset-password business logic, using `UserRepository` and `PasswordResetRepository`.

#### Scenario: Service validates business rules
- **WHEN** `register` is called
- **THEN** the service validates email domain, password strength, email uniqueness, hashes the password with bcrypt, and delegates to UserRepository

### Requirement: Pydantic schemas for auth
The system SHALL define Pydantic schemas in `backend/app/schemas/auth.py`: `RegisterRequest` (email, password, display_name), `LoginRequest` (email, password, remember_me), `LoginResponse` (access_token, token_type, user), `ForgotPasswordRequest` (email), `ResetPasswordRequest` (token, new_password), `UserResponse` (id, email, display_name, role, created_at).

#### Scenario: Schema validation
- **WHEN** a request body does not match the schema
- **THEN** FastAPI returns HTTP 422 with field-level validation errors
