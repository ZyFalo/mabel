## MODIFIED Requirements

### Requirement: Focus category validation in CheckinPayload

The backend CheckinPayload schema SHALL validate the `focus` field against the 6 valid categories defined in the interface specification #09: Academico, Social, Familiar, Salud, Economico, Otro. The field SHALL use a Pydantic Literal type to enforce validation. Invalid values MUST be rejected with a 422 Unprocessable Entity response. The field SHALL remain optional (nullable).

#### Scenario: Valid focus category accepted

Given a student submits a check-in with focus="Academico"
When the backend validates the CheckinPayload
Then the request SHALL be accepted and the check-in saved

#### Scenario: Invalid focus category rejected

Given a student submits a check-in with focus="InvalidCategory"
When the backend validates the CheckinPayload
Then the backend SHALL return 422 Unprocessable Entity

#### Scenario: Null focus accepted

Given a student submits a check-in without a focus field
When the backend validates the CheckinPayload
Then the request SHALL be accepted with focus=null
