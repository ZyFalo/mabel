## ADDED Requirements

### Requirement: Alembic seed migration for system_config
The backend SHALL have an Alembic migration that inserts the 4 initial operational keys into `system_config`.

#### Scenario: Seed data insertion
- **WHEN** the migration runs (upgrade)
- **THEN** it SHALL INSERT the following 4 rows into `system_config`:

1. **sos_hotline_numbers**
   - `key`: `"sos_hotline_numbers"`
   - `value`: `[{"name":"Linea 106 ICBF","number":"018000112440"},{"name":"Linea 141 Linea de la Vida","number":"018000113113"},{"name":"Linea UMB Bienestar","number":"POR_DEFINIR"}]`
   - `description`: `"Lineas de crisis mostradas en Panel SOS (#12). Array JSON configurable por admin desde #30."`

2. **safety_keywords**
   - `key`: `"safety_keywords"`
   - `value`: `["suicidio","morir","hacerme dano"]`
   - `description`: `"Keywords de deteccion de crisis"`

3. **sos_severity_threshold**
   - `key`: `"sos_severity_threshold"`
   - `value`: `3`
   - `description`: `"Umbral de severidad para activacion automatica de SOS (1-5)"`

4. **guardrails_enabled**
   - `key`: `"guardrails_enabled"`
   - `value`: `true`
   - `description`: `"Toggle global de guardrails (true/false)"`

#### Scenario: Seed data rollback
- **WHEN** the migration is rolled back (downgrade)
- **THEN** it SHALL DELETE the 4 rows WHERE key IN ('sos_hotline_numbers', 'safety_keywords', 'sos_severity_threshold', 'guardrails_enabled')

#### Scenario: Idempotency
- **WHEN** the migration runs and the keys already exist
- **THEN** it SHALL use INSERT ... ON CONFLICT (key) DO NOTHING to avoid errors
