# Fase 10 — Spec ejecutiva: PWA + Instrumentos + Testing + Polish

> **Estado**: ⏳ Pendiente · alineado al 2026-05-24 · commit `899bd44`
> **Owner**: Ag.05 (Frontend) + Ag.10 (QA) + Ag.13 (Research) + Ag.02 (Architect, supervisión)
> **Decisión bloqueante**: D-15 (PWA via `vite-plugin-pwa` — decidida, NO implementada)

Fase 10 es la fase de **cierre del MVP**: convierte la SPA en una experiencia instalable, formaliza la batería de tests automatizados, integra los instrumentos de investigación externos, y pule lo que quedó pendiente. Es lo último antes de declarar el sistema "listo para sustentar tesis".

---

## 1. Componentes de Fase 10

### 1.1 PWA (Progressive Web App)

**Estado actual**: `vite-plugin-pwa` NO está en `frontend/package.json`. La decisión D-15 (2026-03-01) lo aprobó pero la implementación quedó en backlog.

**Qué se construye**:
- Instalación: `npm install --save-dev vite-plugin-pwa`
- Configurar en `vite.config.ts`:
  - `manifest.json` con `name`, `short_name="Mabel"`, `theme_color="#A51916"`, `background_color="#0F303A"`, icons 192/512/maskable.
  - Service Worker autogenerado con Workbox.
  - Estrategias de cache:
    - **Cache-first** para assets estáticos (`*.js`, `*.css`, fonts, images, VRM si Fase 9 activa).
    - **Network-first** con fallback offline para `/api/v1/*`.
    - **Stale-while-revalidate** para el SPA shell.
  - `display: "standalone"` para que se vea como app nativa.
- Banner de instalación: componente `<InstallPrompt />` que escucha `beforeinstallprompt` event.
- Update flow: notificar al usuario cuando hay nueva versión del SW disponible.

**Por qué importa para Mabel IA**:
- Estudiantes acceden mayoritariamente desde móvil.
- PWA evita publicar en App Store / Play Store (costo + burocracia).
- Permite shortcut en home screen → engagement consistente durante el estudio.
- Offline parcial: si pierde conexión durante una sesión, el SPA shell sigue cargado (aunque chat requiera red).

**Lo que NO hace en MVP**:
- NO push notifications (requiere infra adicional + permisos).
- NO sync offline de mensajes (chat es síncrono con el LLM en Modal).
- NO background sync.

### 1.2 Suite de testing automatizada

Implementar la estrategia descrita en `docs/TESTING_STRATEGY.md` §3.1 + §3.2 + §4. Específicamente:

**Backend** (`backend/tests/`):
- Estructura `tests/unit/`, `tests/integration/`, `tests/conftest.py` con fixture de DB de tests.
- Cobertura mínima 75% sobre `services/`, `repositories/`, `middleware/`.
- **Críticos bloqueantes**:
  - `test_guardrails_service.py` — 20+ casos de mensajes (positivos, negativos, edge cases legales).
  - `test_account_service.py` — D-14 hard delete + CASCADE + audit pre-delete.
  - `test_history_service.py` — ramificación por scope.
  - `test_cron_redact.py` — idempotencia + range correctness.
  - `test_auth_middleware.py` — JWT válido/expirado, RBAC, consent gating.

**Frontend** (`frontend/src/__tests__/`):
- `vitest` + `@testing-library/react` instalado.
- Tests de hooks críticos: `useLlmPrewarm`, `useElapsedSeconds`, `useTts`, `useSubtitles`.
- Tests de guards y stores Zustand.
- Cobertura mínima 65%.

**E2E** (`frontend/tests-e2e/`):
- `@playwright/test` instalado.
- Flow completo crítico: registro → consent → onboarding → primer chat → check-in → SOS → eliminar cuenta.
- Flow admin: login → users list → disable → re-enable → delete permanently.

**CI/CD**:
- `.github/workflows/test.yml` con jobs backend + frontend + e2e.
- Postgres 16 como service en CI.
- Bloquear merge a `main` si tests fallan.

### 1.3 Instrumentos de investigación

**Estado actual**: D-11 fijó que SUS/empatía se administran externamente (Google Forms). D-13 fijó importación vía API. Las tablas `survey_responses` y `empathy_ratings` existen desde Evo 006.

**Qué falta**:
- Endpoint `POST /api/v1/admin/survey-responses/import` — actualmente solo existen los endpoints de empathy_ratings (POST individual). Necesitamos batch import desde CSV exportado de Google Forms.
- UI en panel admin: pestaña "Importar resultados" en Métricas con botón "Subir CSV SUS pre/post" + validador de schema.
- Documentar el formato CSV esperado (columnas, encoding, separador).
- Validación de que cada `survey_response` se asocie a un `user_id` real (FK CASCADE).
- Test de import idempotente: re-importar el mismo CSV NO duplica filas.

**Reportes para tesis**:
- Vista admin: "Reporte cuasiexperimental" que muestre:
  - Comparativa pre vs post bienestar (con effect size Cohen's d + IC95).
  - SUS score con interpretación cualitativa (≥70 = aceptable).
  - Distribución de calificaciones empáticas inter-rater.
  - Confiabilidad inter-rater (κ de Cohen o ICC).
- Export a PDF para anexo de tesis.

### 1.4 Pulido final

**Accesibilidad WCAG**:
- Auditoría con `axe-core` runner manual o automatizado en CI.
- Verificar contraste de colores (`#A51916` sobre fondos claros — ya cumple WCAG AA).
- Keyboard navigation en todos los flows.
- ARIA labels en todos los iconos clickeables.
- Skip links para usuarios de screen reader.

**Performance**:
- Lighthouse score ≥90 en mobile (después de PWA install).
- Bundle analysis: detectar dependencias no usadas (recharts pesa, considerar code-splitting por tab del admin).
- Lazy load de admin pages (no se usa en mayoría de sesiones).

**Documentación final**:
- Manual de usuario `.docx` actualizado con los cambios post-auditoria 2026-05-24 (ver `docs/AUDITORIA_MANUALES_2026-05-24.md` §"Pendientes (8)").
- Manual técnico `.docx` actualizado con cron L2, Mabel-Gemma4, 3 capas UX wait.
- DPIA refrescada con cron L2 como control activo (DR-09).

**Backups**:
- Configurar backup automatizado de Railway Postgres (snapshot diario, retención 7 días).
- Documentar procedimiento de restore en `docs/DEPLOY_RUNBOOK.md` §7.

**Monitoreo**:
- Alertas básicas: 5xx rate, latencia LLM (p95), cron failure.
- Dashboard Railway compartido con el comité de tesis.

---

## 2. Criterios de aceptación

| # | Criterio | Cómo se mide |
|---|---|---|
| PWA-1 | App instalable desde Chrome móvil/desktop | "Add to Home Screen" disponible; banner aparece tras 2da visita |
| PWA-2 | Service Worker cachea assets estáticos | Network tab muestra `(ServiceWorker)` en segunda carga |
| PWA-3 | API offline graceful: muestra mensaje de error claro | Mock offline en DevTools; UI muestra "Sin conexión" toast |
| PWA-4 | Lighthouse PWA audit pasa | Score ≥90 en categoría PWA |
| TEST-1 | `backend/tests/` cubre ≥75% de servicios | `pytest --cov` reporte |
| TEST-2 | `frontend/src/__tests__/` cubre ≥65% | `vitest --coverage` |
| TEST-3 | E2E flow crítico pasa | `playwright test` 100% verde |
| TEST-4 | CI bloquea merges con tests rojos | GitHub branch protection rule |
| INST-1 | Import SUS funcional | Admin sube CSV → registros aparecen en `survey_responses` |
| INST-2 | Reporte cuasiexperimental visible | Admin → Reporte → ve gráficos pre/post |
| POL-1 | Lighthouse mobile ≥90 | Run en Chrome DevTools |
| POL-2 | A11y axe-core 0 violations críticas | `npx @axe-core/cli http://localhost:5173/*` |
| POL-3 | Backup Postgres configurado | Railway dashboard muestra snapshots |
| POL-4 | DPIA + manuales actualizados | Files commiteados con hash |

---

## 3. Pre-requisitos antes de arrancar Fase 10

- [ ] Hito Pilotable cerrado (Fase 8 done, ya está al 2026-05-24)
- [ ] Datos del piloto recopilados (al menos N=15 estudiantes con pre+post completados)
- [ ] Decisión PO: ejecutar Fase 10 completa o subset (PWA + tests pueden ir, instrumentos esperan a más data)
- [ ] Sprint dedicado de Ag.05 + Ag.10 + Ag.13 (~4-6 semanas)

---

## 4. Riesgos

| Riesgo | Mitigación |
|---|---|
| PWA Service Worker introduce stale data (usuario ve UI vieja) | Update flow agresivo: detectar nueva versión y notificar al usuario "Recargar para actualizar" |
| Tests retroactivos descubren bugs latentes que retrasan el piloto | Priorizar tests post-piloto si ya está corriendo; pre-piloto solo críticos §3.1 |
| Import CSV con encoding/separador inesperado | Validador estricto + log detallado de filas rechazadas |
| Lighthouse PWA <90 por requisitos no obvios (HTTPS, manifest correcto, viewport meta) | Pre-validar con `lighthouse --view --preset=desktop` en local antes de deploy |
| DPIA outdated → riesgo legal | Ag.12 sign-off obligatorio antes de marcar Fase 10 done |

---

## 5. Cronograma estimado

| Sprint | Foco | Owner | Estimación |
|---|---|---|---|
| 1 | PWA setup + manifest + SW + install banner | Ag.05 | 1 sem |
| 2 | Suite tests backend críticos (§1.2 backend) | Ag.10 + Ag.04 | 2 sem |
| 3 | Suite tests frontend + E2E críticos | Ag.10 + Ag.05 | 2 sem |
| 4 | CI/CD setup + branch protection | Ag.11 + Ag.10 | 0.5 sem |
| 5 | Import endpoint + UI + reporte cuasiexperimental | Ag.04 + Ag.05 + Ag.13 | 2 sem |
| 6 | Pulido final (A11y, performance, backups, monitoring) | Ag.09 + Ag.11 | 1 sem |
| 7 | Manuales `.docx` actualizados + DPIA refresh | Ag.14 + Ag.12 | 1 sem |

**Total**: ~9-10 semanas. Paralelizable parcialmente entre Ag.05 / Ag.10 / Ag.13.

---

## 6. Out-of-scope para Fase 10

- Push notifications (requiere infraestructura adicional + permisos del usuario)
- Sync offline de mensajes (incompatible con LLM síncrono en Modal)
- Multi-idioma (MVP es ES-CO únicamente)
- Internacionalización (i18n) — requiere refactor amplio
- Avatar 3D — es Fase 9 separada (`docs/FASE_9_AVATAR_3D_SPEC.md`)
- Integraciones externas (WhatsApp, Telegram, Calendly) — fuera de alcance académico

---

## 7. Definition of Done

Fase 10 cierra cuando:
- ✅ Los 14 criterios de aceptación de §2 pasan
- ✅ El skill `code-review` aprueba la suite completa de tests
- ✅ Ag.12 firma DPIA actualizado
- ✅ Ag.14 firma manuales `.docx` actualizados
- ✅ Ag.01 declara el sistema "listo para defensa de tesis"

---

## 8. Referencias

- D-15 (PWA): `docs/DECISIONES.md`
- D-11 (instrumentos externos): `docs/DECISIONES.md`
- D-13 (import via API): `docs/DECISIONES.md`
- Testing detallado: `docs/TESTING_STRATEGY.md`
- Deploy y backups: `docs/DEPLOY_RUNBOOK.md`
- Auditoría de manuales pendientes: `docs/AUDITORIA_MANUALES_2026-05-24.md`
- Tabla de fases: `docs/FASES_IMPLEMENTACION.md` Fase 10
