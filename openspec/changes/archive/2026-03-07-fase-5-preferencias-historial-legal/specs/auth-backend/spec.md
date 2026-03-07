## MODIFIED Requirements

### Requirement: Change password endpoint
The auth router SHALL expose PUT /api/v1/auth/change-password with current password verification.

#### Scenario: Successful password change
- **WHEN** authenticated user sends correct current_password and valid new_password
- **THEN** it SHALL return 200 with success message

#### Scenario: Wrong current password
- **WHEN** current_password does not match stored hash
- **THEN** it SHALL return 401 with "Contrasena actual incorrecta"

#### Scenario: New password same as current
- **WHEN** new_password equals current_password
- **THEN** it SHALL return 400 with "La nueva contrasena debe ser diferente a la actual"

#### Scenario: New password fails strength rules
- **WHEN** new_password does not meet requirements (min 8, 1 upper, 1 number, 1 special)
- **THEN** it SHALL return 422 validation error

### Requirement: ChangePasswordRequest schema
The schema SHALL validate new_password with the same strength rules as RegisterRequest.

#### Scenario: Schema validates password strength
- **WHEN** ChangePasswordRequest is created with weak new_password
- **THEN** Pydantic SHALL raise ValidationError

### Requirement: AuthService change_password method
The service SHALL verify current password, check passwords differ, hash new password, and update via repository.

#### Scenario: Full service flow
- **WHEN** change_password is called with valid inputs
- **THEN** it SHALL call verify_password, then hash_password, then user_repo.update_password
