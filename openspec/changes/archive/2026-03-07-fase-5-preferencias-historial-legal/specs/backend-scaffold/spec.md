## MODIFIED Requirements

### Requirement: Register preference router in main
main.py SHALL import and register preference_router at prefix /api/v1.

#### Scenario: Preference router registered
- **WHEN** the application starts
- **THEN** preference_router SHALL be included at prefix /api/v1 alongside existing routers
