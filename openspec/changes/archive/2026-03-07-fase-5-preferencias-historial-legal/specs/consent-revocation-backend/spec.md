## MODIFIED Requirements

### Requirement: Reduce scope action for PATCH consents
The service SHALL support action "reduce-scope" on PATCH /api/v1/consents/current that changes scope to "solo_uso" without revoking.

#### Scenario: Reduce scope from uso_mejora_anon to solo_uso
- **WHEN** PATCH with action "reduce-scope" and consent has scope "uso_mejora_anon" and revoked_at IS NULL
- **THEN** it SHALL update scope to "solo_uso" and return 200 with ConsentResponse

#### Scenario: Reduce scope fails if already solo_uso
- **WHEN** consent scope is already "solo_uso"
- **THEN** it SHALL return 409 ALREADY_SOLO_USO

#### Scenario: Reduce scope fails if consent revoked
- **WHEN** consent has revoked_at set
- **THEN** it SHALL return 409 CONSENT_REVOKED

### Requirement: Revoke action for PATCH consents
The service SHALL support action "revoke" that sets revoked_at to server timestamp.

#### Scenario: Revoke consent totally
- **WHEN** PATCH with action "revoke" and consent is active (revoked_at IS NULL)
- **THEN** it SHALL set revoked_at = NOW() and return 200 with ConsentResponse

#### Scenario: Revoke fails if already revoked
- **WHEN** consent already has revoked_at set
- **THEN** it SHALL return 409 ALREADY_REVOKED

### Requirement: ConsentActionEnum extension
The enum SHALL include "reduce-scope" and "revoke" values alongside existing "re-accept".

#### Scenario: Enum accepts all three actions
- **WHEN** ConsentActionEnum values are enumerated
- **THEN** it SHALL contain re-accept, reduce-scope, and revoke

### Requirement: Consent router error handlers for new actions
The router SHALL map new ValueError codes to appropriate HTTP responses.

#### Scenario: New error codes mapped to 409
- **WHEN** ConsentService raises ALREADY_SOLO_USO, CONSENT_REVOKED, or ALREADY_REVOKED
- **THEN** the router SHALL return HTTPException 409 with descriptive detail
