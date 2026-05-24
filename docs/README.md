# Documentación Mabel IA

> **Este es el punto de entrada de la documentación.** Lee este README para saber **qué leer y en qué orden** según lo que necesites hacer. Está pensado para humanos y para IAs con acceso de lectura al repositorio.

---

## Contrato para IAs lectoras

Si eres una IA (Claude, ChatGPT, otra) cuyo trabajo es **generar, actualizar o responder preguntas sobre la documentación del proyecto Mabel IA**, este es tu contrato:

### Fuentes que SÍ debes consultar (orden de confiabilidad)

1. **`CLAUDE.md`** (raíz del repo) — overview oficial. Léelo primero. Define el alcance, stack, fases y convenciones del proyecto.
2. **Esta carpeta `docs/`** — documentación técnica, funcional y legal mantenida en sincronía con el código.
3. **Código fuente** (`backend/`, `frontend/`, `db/`, `Dockerfile`, `railway.cron.toml`) — verdad última cuando una afirmación de documentación parezca dudosa.
4. **`backend/alembic/versions/*.py`** — fuente de verdad del esquema de base de datos (las migraciones aplicadas son la realidad operativa; el DDL declarativo en `db/schema_postgresql.sql` puede tener drift parcial).
5. **`MEMORY.md`** del proyecto (en `~/.claude/projects/-Users-williampena-Desktop-Mabel-IA/memory/`) — auto-memoria con decisiones, workflow agreements y estado acumulado. Útil para entender el *por qué* de decisiones recientes.
6. **`git log` + commits recientes** — para entender qué cambió últimamente y por qué (las descripciones de commit son extensas y explican motivación).

### Fuentes que NO debes consultar (obsoletas o engañosas)

- **Notion** (`Mabel IA Documentation` workspace + sub-páginas). Última actualización ~2026-03-07; el código avanzó 11 semanas más sin propagación. Solo úsalo para contexto histórico de decisiones D-01 a D-15 si el detalle no está en `docs/DECISIONES.md`.
- **`openspec/specs/*.md`** — especificaciones pre-implementación. No reflejan el estado actual.
- **`openspec/changes/archive/*`** — propuestas históricas de cada fase. Útiles como historia, no como referencia técnica viva.
- **Archivos `.docx` en `~/Downloads/`** — son los manuales de tesis para el tribunal. Tienen su propia auditoría (`docs/AUDITORIA_MANUALES_2026-05-24.md`). No son fuente para documentación técnica del sistema.

### Cómo verificar que un dato sigue vigente

Antes de afirmar "X funciona así" en documentación generada:

- **Si es código**: `grep`/`Read` el archivo. Lo que está hoy es lo válido.
- **Si es schema**: lista `backend/alembic/versions/`, lee la última revisión + las anteriores hasta hallar el cambio.
- **Si es decisión arquitectónica**: busca en `docs/DECISIONES.md` o en `MEMORY.md`.
- **Si es algo histórico ("hicimos X en Fase 5")**: revisa `docs/FASES_IMPLEMENTACION.md` o `git log --grep="fase-5"`.

### Cómo proponer cambios sin permisos de escritura

Si eres una IA **read-only** y detectas que algo en `docs/` está desactualizado:

- **Reporta el drift al humano** con: archivo afectado, línea, qué dice ahora, qué dice el código/realidad, fix propuesto.
- **No inventes** completar la sección con suposiciones — el humano debe validar antes de aplicar.

---

## Índice de documentos

### Entrada y overview

| Archivo | Propósito | Cuándo leerlo |
|---|---|---|
| `../CLAUDE.md` | Overview oficial del proyecto (qué es, stack, fases, convenciones) | **Siempre primero**, antes de cualquier otra cosa |
| `README.md` (este) | Índice y contrato | Para saber qué leer después |

### Referencias técnicas

| Archivo | Propósito |
|---|---|
| `TECH_STACK.md` | Stack tecnológico completo: backend, frontend, BD, LLM, voz, deploy. ADRs vivos. |
| `API_REFERENCE.md` | Catálogo de los ~75 endpoints REST con request/response shape, audit, archivo:linea de implementación. |
| `DB_SCHEMA.md` | Esquema de base de datos: 15 tablas, columnas, FKs, CHECKs, índices, evoluciones 002-012 + Apéndice C (repositorios). |
| `BACKEND_SERVICES.md` | Catálogo de services + repositories + middleware: 11 services, 6 admin services, 5 archivos LLM, 14 repos. |
| `FRONTEND_COMPONENTS.md` | Catálogo de componentes React, 6 hooks, 5 stores, 5 guards, 4 utils, API client. |
| `INTERFACES_MVP.md` | Catálogo funcional de las pantallas del MVP (44 interfaces). |
| `ADMIN_PANEL.md` | Especificación detallada del panel administrativo (Fase 8): tabs, métricas, lifecycle de usuarios, audit logs, configuración. |
| `AVATAR_3D_DECISION_TECNICA.md` | ADR del avatar 3D (Fase 9 — aprobado, diferido). El MVP usa avatar 2D animado en modo voz. |

### Operaciones (deploy, dev, testing)

| Archivo | Propósito |
|---|---|
| `DEPLOY_RUNBOOK.md` | Guía paso a paso de despliegue Railway + Modal.com: primer deploy, env vars, cron service, troubleshooting, rollback, monitoreo. |
| `LOCAL_DEV_SETUP.md` | Setup local en macOS/Linux: pre-requisitos, `.env`, Postgres Docker, backend + frontend, voz opcional, troubleshooting frecuente. |
| `TESTING_STRATEGY.md` | Estado honesto (sin tests automatizados al 2026-05-24) + priorización + setup recomendado + criterios de cobertura + tests manuales obligatorios pre-deploy. |

### Forward-looking (Fases 9-10 pendientes)

| Archivo | Propósito |
|---|---|
| `FASE_9_AVATAR_3D_SPEC.md` | Spec ejecutiva de Fase 9 (Avatar 3D + Lip Sync): alcance, criterios medibles, riesgos, cronograma 4 sprints. |
| `FASE_10_PWA_TESTING_SPEC.md` | Spec ejecutiva de Fase 10 (PWA + Tests + Instrumentos + Polish): 4 componentes, 14 criterios, ~9-10 semanas. |

### Gobernanza, decisiones e historia

| Archivo | Propósito |
|---|---|
| `DECISIONES.md` | Registro completo de decisiones técnicas y de producto: D-01 a D-15 (Notion), decisiones PO 2026-02-23, y decisiones post-implementación (brand-skin, lazy session, swap LLM, etc.). |
| `FASES_IMPLEMENTACION.md` | Estado real de las 10 fases del proyecto al 2026-05-24. Reemplaza el "Flujo de Implementación" de Notion que quedó congelado en marzo. |
| `AGENTES.md` | Sistema de 15 agentes especializados: roles, responsabilidades, permisos. Consolidado y actualizado al estado real (Mabel-Gemma4, Railway, cron L2). Los archivos `.claude/agents/AGENT_*.md` son stubs para Claude Code; el detalle vive aquí. |

### Privacidad, ética y auditoría

| Archivo | Propósito |
|---|---|
| `DATA_RETENTION_POLICY.md` | Política de retención completa (Ley 1581/2012), incluyendo el cron L2 de redacción de `message_id` implementado 2026-05-24. |
| `AUDITORIA_MANUALES_2026-05-24.md` | Auditoría de los manuales de tesis (`.docx`) vs el código real. 48 hallazgos catalogados (mentiras / imprecisiones / gaps). |

---

## Convenciones de mantenimiento

### Regla de oro
> **Cualquier PR que modifique código que afecte arquitectura, schema, deploy, flujo de usuario o decisiones, debe incluir el update del `docs/*.md` correspondiente.** Se verifica vía code-review skill antes de cada commit grande.

### Estructura interna de cada doc
Cada archivo en `docs/` sigue este patrón mínimo:

```markdown
# <Título>

> **Estado**: ✅ alineado al <fecha> · <commit hash o referencia>
> **Fuente de verdad**: este archivo + <referencia al código si aplica>

## <Secciones>
...

## Referencias
- Código: `<paths relevantes>`
- Decisiones relacionadas: `DECISIONES.md` D-XX
- Histórico: commit `<hash>` "<mensaje>"
```

### Cómo encontrar lo más reciente

- **Último commit que tocó docs**: `git log --oneline -- docs/`
- **Estado de una página específica**: el bloque "Estado" al inicio de cada `.md`
- **Cambios estructurales del repo**: `git log --oneline --all | head -30`

### Verificación automatizada

`scripts/verify_docs.py` audita los docs en busca de:
- Dead pointers (paths citados que no existen)
- Refs `archivo:linea` fuera de rango
- Hashes de commit que no existen en git history
- YAML frontmatter inválido en `.claude/agents/AGENT_*.md`
- Numbering gaps (secciones §9.1, §9.2, §9.4 sin §9.3)
- Cross-doc refs `§N.M` a secciones que no existen

```bash
# Verificar todos los docs:
python scripts/verify_docs.py --report-only

# Verificar solo lo staged en git:
python scripts/verify_docs.py --staged
```

Pre-commit hook (no bloqueante por defecto):
```bash
bash scripts/install_pre_commit_hook.sh
```

### Cuándo crear un nuevo archivo en `docs/` vs editar uno existente

- **Crear nuevo**: cuando el tema es independiente y supera ~200 líneas (ej: una nueva fase implementada, una nueva integración mayor).
- **Editar existente**: cuando es una extensión natural de un doc ya presente (ej: añadir una decisión nueva → `DECISIONES.md`).
- **Cuando dudes**: edita un doc existente. Es más fácil dividir después que consolidar dispersión.

---

## Mapa rápido de "necesito saber X, dónde miro"

| Necesito saber... | Voy a... |
|---|---|
| Qué hace el proyecto en general | `CLAUDE.md` |
| Qué versión de React/Python/Postgres usamos | `TECH_STACK.md` |
| Cómo está estructurada la BD | `DB_SCHEMA.md` |
| Qué endpoint usar para X | `API_REFERENCE.md` |
| Qué servicio backend hace qué | `BACKEND_SERVICES.md` |
| Qué componente frontend usar | `FRONTEND_COMPONENTS.md` |
| Cómo correr localmente | `LOCAL_DEV_SETUP.md` |
| Cómo desplegar a producción | `DEPLOY_RUNBOOK.md` |
| Qué hay (o falta) de testing | `TESTING_STRATEGY.md` |
| Por qué decidimos X (D-XX / PO-N / DT-XX) | `DECISIONES.md` + `AGENTES.md` §9 |
| En qué fase está la implementación | `FASES_IMPLEMENTACION.md` |
| Qué pantallas tiene la app | `INTERFACES_MVP.md` |
| Cómo funciona el panel admin | `ADMIN_PANEL.md` |
| Cómo se cumple la Ley 1581 (privacidad) | `DATA_RETENTION_POLICY.md` |
| Cómo funciona el cron L2 de retención | `DATA_RETENTION_POLICY.md` §10 + `backend/scripts/redact_old_message_ids.py` |
| Cómo está organizado el equipo de agentes IA | `AGENTES.md` |
| Qué dice la auditoría sobre los manuales de tesis | `AUDITORIA_MANUALES_2026-05-24.md` |
| Cuál es el avatar planeado vs el actual | `AVATAR_3D_DECISION_TECNICA.md` (ADR completo) + `FASE_9_AVATAR_3D_SPEC.md` (ejecutiva) + `FRONTEND_COMPONENTS.md` (2D actual `MabelAvatar`) |
| Qué falta para terminar el MVP | `FASE_9_AVATAR_3D_SPEC.md` + `FASE_10_PWA_TESTING_SPEC.md` |
