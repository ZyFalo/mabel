# Estrategia de Testing — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `899bd44`
> **Realidad actual**: **NO existen tests automatizados en el repo**. Este documento describe (a) el estado actual honesto, (b) qué debe testearse, (c) el orden recomendado para introducir tests sin romper el flujo de desarrollo, (d) los criterios de calidad que el código ya cumple pre-tests (linters, types, code-review skill).
> **Owner**: Ag.10 (QA & Testing).

---

## 1. Estado real al 2026-05-24

| Tipo de test | Existe en el repo | Notas |
|---|---|---|
| Backend unit (`pytest`) | ❌ | `pytest` NO está en `backend/requirements.txt` ni hay `backend/tests/`. Hay que instalarlo antes de empezar (`pip install pytest pytest-asyncio pytest-cov httpx`). |
| Backend integration | ❌ | Sin fixtures de DB, sin `conftest.py` |
| Frontend unit (`vitest`) | ❌ | NO está en `frontend/package.json` (sí está mencionado en Notion como D-04 stack pero nunca instalado) |
| Frontend E2E (`playwright`) | ❌ | Mismo caso: documentado en stack original, nunca instalado |
| Smoke tests | 🟡 manual | `backend/scripts/smoke_admin_bulk_action.py`, `smoke_admin_delete_user.py`, `smoke_tokens_capture.py` existen pero son scripts standalone, no `pytest`. Sin aserciones formales; útiles como playbook manual. |
| Type checking | ✅ | Backend: Pydantic + SQLAlchemy types verifican en runtime. Frontend: `npx tsc --noEmit` debe pasar (sin errores actualmente) |
| Linting | ✅ | Backend: `ruff check .`. Frontend: `eslint` + `prettier` |
| Code review (manual) | ✅ | Skill `code-review` invocado high-effort pre-commit grande (memoria `code-review-workflow`) — equivale a un review humano con 3 ángulos + verifiers |

**Implicación**: el código se sostiene hoy por: (1) linters, (2) type checking, (3) code-review skill manual, (4) smoke tests ad-hoc del autor. No hay safety net automática. Cualquier refactor depende del cuidado humano.

---

## 2. Por qué no hay tests todavía (contexto)

- **MVP académico de 3 estudiantes** con timeline fijo (tesis). Priorización de features sobre cobertura de tests.
- **D-11**: instrumentos de evaluación del estudio se administran externamente (Google Forms), no requieren tests.
- **Memoria `dev-prod-status`**: "Mabel-IA en pre-prod. Cambios de schema vía force-update local; no obligatorio crear migraciones Alembic formales hasta deploy" — la misma filosofía aplica a tests: aceptable durante pre-prod, obligatorio antes del piloto real con 30 estudiantes.

**Cuándo deja de ser aceptable**: en el momento que se abra el sistema a los 30 estudiantes del estudio cuasiexperimental. Sin tests, un regresión en guardrails o en el cron L2 puede comprometer compliance legal (Ley 1581/2012).

---

## 3. Qué debe testearse — priorización

### 3.1 🔴 CRÍTICO (bloqueante antes de piloto)

| Área | Razón | Tipo de test sugerido |
|---|---|---|
| **Guardrails pipeline** (`GuardrailsService.pre_filter` + `post_filter`) | Una activación falsa-negativa puede dejar pasar contenido de riesgo; un falso-positivo bloquea conversación legítima | Unit + integration: 20+ casos con fixtures de mensajes reales |
| **Auth + JWT** (`auth_service.login`, middleware `get_current_user`) | Una falla aquí compromete TODO el sistema | Unit + integration: tokens válidos/inválidos/expirados, RBAC student vs admin |
| **Consent gating** (`require_consent` middleware) | Estudiante sin consentimiento NO puede usar chat (Ley 1581) | Integration: rutas protegidas devuelven 403 sin consent |
| **Hard DELETE D-14** (`account_service.delete_account`) | CASCADE debe limpiar todo + audit emitido ANTES del DELETE + `safety_events.user_id` queda NULL | Integration con DB real |
| **Cron L2 redaction** (`redact_old_message_ids.py`) | Compliance Ley 1581 art. 4 minimización | Unit: idempotencia, no toca recientes, preserva otras keys. Smoke real ya implementado en `docs/DATA_RETENTION_POLICY.md` §10 |
| **`history_service.apply_history_toggle_off`** | Ramifica por scope (soft hide vs hard delete) — error aquí pierde data o expone data | Integration: 2 fixtures (scope=`solo_uso` vs `uso_mejora_anon`) |

### 3.2 🟠 ALTO (debería existir antes del piloto, no bloqueante)

| Área | Tipo |
|---|---|
| **LLM adapters** (`OpenAICompatAdapter.generate_stream`, `GeminiAdapter`) — contrato del Protocol, especialmente `usage_sink` | Unit con mocks |
| **Cold-start retry** (8×10s + 3×backoff) | Unit con httpx mock |
| **Streaming SSE** (formato events `{"token":..}`, `{"risk_detected":..}`, `{"done":..}`) | Integration: cliente lee stream y deserializa |
| **Lazy session create** (POST sin id, primer mensaje crea sesión) | Integration |
| **Métricas admin** (`metrics_service`: ttest_rel, wilcoxon, IC) | Unit con datasets fixture |
| **Audit log emission** — toda acción en `ALLOWED_ACTIONS` debe poder emitirse correctamente | Integration |
| **Frontend guards** (`ConsentGuard`, `OnboardingGuard`, `RoleGuard`) | E2E o unit con React Testing Library |
| **HeartRating** (idempotencia upsert en `session_ratings`) | Integration |

### 3.3 🟡 MEDIO (post-piloto)

| Área | Tipo |
|---|---|
| **Onboarding flow completo** | E2E (Playwright) |
| **Settings modal — 4 tabs** | Component + integration |
| **Admin panel — lifecycle de usuarios** | E2E |
| **Voice mode** (`/voice`, `MabelAvatar` estados) | Component (sin audio real) + manual con audio |
| **PWA install + offline behavior** | E2E (cuando D-15 esté implementado) |

### 3.4 🟢 BAJO (nice-to-have)

- A11y: `axe-core` runs sobre cada page
- Visual regression: Chromatic / Percy
- Performance: Lighthouse CI

---

## 4. Setup recomendado cuando se introduzcan tests

### 4.1 Backend (pytest)

```bash
cd backend
source .venv/bin/activate
pip install pytest pytest-asyncio pytest-cov httpx
mkdir tests
touch tests/__init__.py tests/conftest.py
```

`tests/conftest.py` mínimo:
```python
import pytest
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings
from app.models.base import Base

@pytest.fixture
async def db_session():
    # Usar DB de tests separada: DATABASE_URL_TEST en .env.test
    engine = create_async_engine(settings.DATABASE_URL.replace("/mabel_dev", "/mabel_test"))
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
```

Patrón de test:
```python
# tests/test_account_service.py
import pytest
from app.services.account_service import AccountService

@pytest.mark.asyncio
async def test_delete_account_emits_audit_before_delete(db_session):
    # arrange: crear user + safety_event
    # act: delete_account
    # assert: audit_log emitido con email_snapshot, safety_events.user_id es NULL
    ...
```

### 4.2 Frontend (vitest + @testing-library/react)

```bash
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

`vitest.config.ts` mínimo:
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
})
```

### 4.3 E2E (playwright)

```bash
cd frontend
npm install --save-dev @playwright/test
npx playwright install
```

`playwright.config.ts` apuntando a `http://localhost:5173` (con backend corriendo en `:8000`).

---

## 5. CI/CD (cuando se introduzca)

GitHub Actions workflow `.github/workflows/test.yml` propuesto (no commiteado todavía):
```yaml
name: tests
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r backend/requirements.txt
      - run: cd backend && alembic upgrade head
      - run: cd backend && pytest --cov=app --cov-report=term-missing
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci
      - run: cd frontend && npx tsc --noEmit
      - run: cd frontend && npx eslint .
      - run: cd frontend && npx vitest run
```

---

## 6. Criterios de cobertura (cuando los tests existan)

| Área | Cobertura mínima | Cobertura objetivo |
|---|---|---|
| `services/` (negocio) | 70% | 85% |
| `services/llm/` (adapters) | 60% (mocking obligatorio) | 75% |
| `repositories/` | 80% (simples) | 90% |
| `routers/` | 60% (integration) | 80% |
| `middleware/auth.py` | 90% | 95% |
| `scripts/` (incl. cron) | 100% (críticos para compliance) | 100% |
| Frontend components UI | 50% | 70% |
| Frontend hooks | 80% | 90% |
| Frontend stores | 70% | 85% |

Total backend: **≥75%**. Total frontend: **≥65%**.

---

## 7. Tests manuales obligatorios pre-deploy

Mientras los tests automatizados no existen, antes de cada deploy:

1. **Login + chat básico**: estudiante puede registrarse → consent → onboarding → enviar mensaje → recibir respuesta SSE.
2. **Guardrails activan**: mensaje con keyword crítica (lista en `system_config.safety_keywords`) dispara `risk_detected` + abre Panel SOS.
3. **Hard DELETE**: crear cuenta → eliminarla → verificar en BD que data desapareció + `safety_events` conservados con `user_id=NULL`.
4. **Cron L2 idempotente**: ejecutar 2× seguidos en local con seed, verificar que la segunda devuelve `0 affected`.
5. **Admin lifecycle**: deshabilitar usuario → re-habilitar → eliminar permanentemente, audit log debe registrar las 3 acciones.
6. **LLM cold-start UX**: forzar cold start (esperar 5+ min idle en Modal) → enviar mensaje → verificar que LlmStatusChip pasa amber → texto progresivo en burbuja → respuesta llega <90s.

---

## 8. Step 0 — concepto del agente QA original

El agente Ag.10 definió un **"Step 0"**: suite automatizada de verificación que debe pasar antes de cualquier interacción con humanos (criterio: 0 alertas críticas). Cuando se implemente, debería cubrir:
- 10 prompts estándar (incluyendo crisis variants) → 0 violaciones de guardrail
- Latencia mediana ≤20s (con LLM warm)
- 0 crashes en 100 turnos consecutivos
- VRAM/CPU estables bajo carga

Estado: **no implementado**. Es un blocker formal para abrir el piloto.

---

## 9. Drift / pendientes

- `pytest` NO instalado (ni el directorio `tests/`)
- `vitest`, `playwright`, `pytest-cov`, `pytest-asyncio`, `@testing-library/react` NO instalados
- Sin `.env.test` template
- Sin GitHub Actions workflow
- Sin fixtures de seed data reutilizable
- Smoke tests existentes (`backend/scripts/smoke_*.py`) NO se invocan en CI ni tienen aserciones formales — son scripts manuales
- Step 0 (Ag.10) sin implementar — bloqueante para piloto

---

## 10. Referencias

- Memoria `code-review-workflow` — proceso actual de review manual high-effort
- `docs/AGENTES.md` Ag.10 — owner de testing
- `docs/DEPLOY_RUNBOOK.md` §6 — troubleshooting manual sin tests
- `docs/DATA_RETENTION_POLICY.md` §10 — smoke test inline reproducible del cron L2
- `backend/scripts/smoke_*.py` — scripts existentes (no formales)
