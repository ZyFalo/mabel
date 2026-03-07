## ADDED Requirements

### Requirement: GET preferences endpoint
The backend SHALL expose GET /api/v1/preferences/me that returns the current user's preferences or 404 if no record exists.

#### Scenario: Student has preferences
- **WHEN** authenticated student with existing preferences calls GET /api/v1/preferences/me
- **THEN** it SHALL return 200 with PreferencesResponse containing all 7 columns

#### Scenario: Student needs onboarding
- **WHEN** authenticated student without preferences record calls GET /api/v1/preferences/me
- **THEN** it SHALL return 404 with detail "Preferencias no encontradas"

### Requirement: PUT preferences upsert endpoint
The backend SHALL expose PUT /api/v1/preferences that creates or updates the preferences record. All fields SHALL be optional.

#### Scenario: Create preferences during onboarding
- **WHEN** student without preferences calls PUT /api/v1/preferences with partial fields
- **THEN** it SHALL INSERT a new record with provided values and DB defaults for unprovided fields
- **THEN** it SHALL return 200 with the full PreferencesResponse

#### Scenario: Update single preference
- **WHEN** student with existing preferences calls PUT with only save_history=false
- **THEN** it SHALL UPDATE only save_history, leaving other fields unchanged
- **THEN** it SHALL return 200 with full PreferencesResponse

#### Scenario: Invalid preferred_chat_mode
- **WHEN** student sends preferred_chat_mode="invalid"
- **THEN** it SHALL return 422 validation error

### Requirement: Preferences schemas
The backend SHALL define UpdatePreferencesRequest with all Optional fields and PreferencesResponse with from_attributes mapping all 7 DB columns.

#### Scenario: Schema maps to DB columns
- **WHEN** Preference model is serialized via PreferencesResponse
- **THEN** it SHALL include user_id (UUID), save_history (bool), ui_language (str), tts_voice (str|null), accessibility (dict|null), checkin_enabled (bool), preferred_chat_mode (str)

### Requirement: PreferenceRepository create and update
The repository SHALL be extended with create(user_id, **kwargs) and update(preference, **kwargs) methods.

#### Scenario: Create new preference record
- **WHEN** repo.create(user_id, save_history=True) is called
- **THEN** it SHALL INSERT into preferences with user_id as PK and commit

#### Scenario: Update existing preference record
- **WHEN** repo.update(preference, save_history=False) is called
- **THEN** it SHALL UPDATE only the provided fields, commit, and refresh

### Requirement: PreferenceService with upsert logic
The service SHALL implement get_preferences and upsert_preferences with create-or-update semantics.

#### Scenario: Upsert creates when not exists
- **WHEN** no preferences exist for user_id
- **THEN** upsert_preferences SHALL call repo.create with non-None fields

#### Scenario: Upsert updates when exists
- **WHEN** preferences exist for user_id
- **THEN** upsert_preferences SHALL call repo.update with non-None fields

### Requirement: Preference router setup
The router SHALL use prefix /preferences and require require_role("student") for both endpoints.

#### Scenario: Router dependency injection
- **WHEN** request arrives at preferences endpoint
- **THEN** it SHALL inject PreferenceRepository(db) and PreferenceService(repo)
