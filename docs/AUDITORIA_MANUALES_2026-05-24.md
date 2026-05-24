# Auditoría Manuales — 2026-05-24

**Alcance**: Manual Técnico (`Manual_MABELOFICIAL.docx`) + Manual de Usuario (`MANUAL DE USUARIO UNIVERSIDAD MANUELA BELTRÁN.docx`), ambos en `~/Downloads/`.
**Línea base del codebase**: commit `8adbb54` (`feat(retention): cron L2 redaction...`).
**Método**: extracción texto-plano vía `python-docx` → cross-check línea por línea contra `db/schema_postgresql.sql`, `backend/app/`, `frontend/src/`, `docs/`, `CLAUDE.md`.
**Por qué existe este doc**: la sesión previa hizo una auditoría que se perdió en context compaction (solo quedaron los conteos agregados). Este documento es el registro trazable para que no se pierda otra vez.

---

## Resumen ejecutivo

| Manual | 🔴 Mentiras | 🟠 Imprecisiones | 🟡 Gaps | Total |
|---|---:|---:|---:|---:|
| Técnico | 11 | 10 | 2 | **23** |
| Usuario | 7 | 11 | 7 | **25** |
| **Total** | **18** | **21** | **9** | **48** |

(Los hallazgos clasificados como OK por los auditores no se listan aquí — solo lo que requiere cambio.)

### Hallazgos de mayor impacto (top 10, ranked)

| # | Sev | Manual | Lugar | Problema |
|---|---|---|---|---|
| 1 | 🔴 CRIT | Usuario | TABLE 47 R2 | "Revocación total elimina TODOS los datos, irreversible" — falso: el modal real dice "Tus datos NO se eliminan. Es reversible re-aceptando el consentimiento" |
| 2 | 🔴 CRIT | Técnico | P[0224]/P[0234]/P[0278]/P[0296] | "100% local", "LLM Local", "SQLite/PostgreSQL" — contradice arquitectura real Railway+Modal.com |
| 3 | 🔴 CRIT | Usuario | P[0313] | "Widget de 5 corazones en SessionEnd con UPSERT a session_rating" — el widget no existe en SessionEnd.tsx |
| 4 | 🔴 CRIT | Usuario | P[0261] | Botón "Ver más recursos de ayuda" en SOS — no existe en SosPanel.tsx |
| 5 | 🔴 CRIT | Técnico | TABLE 37 | Puertos 5000/8001/8002/8003 fabricados — los reales son 5173 (Vite dev), 8000 (FastAPI), 5432 (Postgres) |
| 6 | 🔴 CRIT | Técnico | P[0046] | "NO OLVIDAR TABLAS" — placeholder visible en doc final |
| 7 | 🟡 GAP | Usuario | TABLE 25 | LlmStatusChip + toast cold + 5-stage progressive text no documentados (lo primero que ve el estudiante con Mabel-Gemma4) |
| 8 | 🔴 CRIT | Usuario | TABLE 25 R6 | "Botón Modo Avatar → Avatar 3D" — el botón es "Hablar", es 2D, condicional a preferencias |
| 9 | 🔴 CRIT | Usuario | TABLE 22 R2/R3 | Check-in: sueño en horas (real: calidad mal/regular/bien/muy bien), foco "Laboral" (real: 8 cats incluyendo Pareja/Económico/Futuro) |
| 10 | 🔴 CRIT | Técnico | TABLE 15 R2 | `safety_events.user_id` documentado como NOT NULL — es NULLABLE con SET NULL (Evo 005b, D-14) |

---

## Parte 1 — Manual Técnico

### 1.1 Mentiras (11)

| # | Lugar docx | Cita textual | Verdad codebase | Fix |
|---|---|---|---|---|
| T-M1 | P[0046] | "NO OLVIDAR TABLAS" | TODO sin resolver, placeholder visible | Eliminar línea o reemplazar por listado real de 15 tablas |
| T-M2 | TABLE 7 R3 | `hashed-password` (con guión) | `hashed_password` (underscore). Postgres no acepta guiones sin comillas | Renombrar `hashed-password` → `hashed_password`, `created-at` → `created_at` |
| T-M3 | TABLE 8 R3 | `consents.version TEXT NOT NULL` | Columna eliminada en Evo 005 (`db/schema_postgresql.sql:13-14`). Reemplazada por `consent_version_id UUID FK NOT NULL` | Sustituir fila por `consent_version_id UUID NOT NULL FK→CONSENT_VERSIONS(id)` + agregar `revoked_at TIMESTAMPTZ NULL` |
| T-M4 | TABLE 18 entera + P[0078] inconsistencia | "Sin sección 4.2" + TABLE 18 completa SQLite vs PostgreSQL | PostgreSQL 16 único (`CLAUDE.md`). TABLA 18 huérfana, contradice P[0078] | Eliminar TABLA 18 completa. En TABLE 35 R8 y P[0224] cambiar "DB (SQLite/PostgreSQL)" → "DB (PostgreSQL 16)" |
| T-M5 | TABLE 12 R2-R3 (message_reports) | Descripciones desplazadas (la fila de `message_id` describe al reporter, etc.) | `db/schema_postgresql.sql:179-192` | Re-alinear: `message_id`→"Mensaje reportado"; `reporter_id`→"Usuario que envió el reporte"; `reason`→"Motivo: hallucination\|harmful\|privacy\|low_empathy\|other"; `details`→"Descripción opcional"; `status`→"open\|triaged\|resolved\|dismissed" |
| T-M6 | TABLE 15 R2 (safety_events) | `user_id UUID FK→USERS(id)` (implícito NOT NULL) | NULLABLE con `ON DELETE SET NULL` (Evo 005b, D-14, `db/schema_postgresql.sql:216`) | `user_id UUID NULL, FK→USERS(id) ON DELETE SET NULL. Nullable: el evento se preserva anónimo si la cuenta se elimina (D-14)` |
| T-M7 | TABLE 24 R4 (CU-11) | "Paso 3: Aplica clasificador de sentimiento de riesgo (sentiment_risk)" | El propio manual dice en TABLE 15 que `sentiment_risk` es post-MVP. Solo prefiltro de keywords activo | Eliminar paso 3. Dejar solo prefiltro de keywords de `system_config.safety_keywords` |
| T-M8 | P[0224] | "DB (SQLite/PostgreSQL), LLM Local (~3B + LoRA/QLoRA)" | LLM en Modal.com (no local), Gemma E4B ~3.5GB cuantizado (no ~3B), DB solo PostgreSQL 16 | "FastAPI Backend (Railway), Guardrails, LLM Mabel-Gemma4 (Modal.com OpenAI-compat), ASR Whisper (interno), TTS Piper (subprocess), DB PostgreSQL 16 (Railway)" |
| T-M9 | P[0234] | "LLM Local" | Modal.com (`backend/app/services/llm/prompts.py:11`) | "LLM Mabel-Gemma4 (Modal.com)" |
| T-M10 | P[0278] / P[0296] | "Diagrama 100% local" / "Mac M4 o PC RTX 2060" | Railway + Modal.com (híbrido). Solo ASR/TTS son locales al backend container | "Diagrama híbrido: Railway (backend container) + Modal.com (LLM GPU serverless)" |
| T-M11 | TABLE 37 (puertos) | "SPA 5000 / LLM 8001 / ASR 8002 / TTS 8003" | Fabricados. Reales: SPA dev 5173 (Vite), prod sirve desde 8000 (`Dockerfile:56`). LLM HTTPS a Modal sin puerto local. ASR/TTS son módulos internos sin puerto | Reescribir tabla: "SPA dev 5173 (Vite) / SPA prod servida por FastAPI 8000 / FastAPI 8000 REST+SSE / Postgres 5432 (5433 docker local) / LLM HTTPS Modal.com (sin puerto local) / ASR Whisper módulo interno / TTS Piper subprocess" |

### 1.2 Imprecisiones (10)

| # | Lugar docx | Cita textual | Verdad codebase | Fix |
|---|---|---|---|---|
| T-I1 | P[0043] | "13 tablas: ... audit_log, session_rating y survey_response/empathy_rating" | **15 tablas** reales. Plural correcto: `audit_logs`, `session_ratings`. `survey_responses` y `empathy_ratings` son DOS tablas separadas. Falta `system_config`. | "15 tablas: users, consent_versions, consents, preferences, sessions, messages, message_reports, attachments, safety_events, password_reset_tokens, audit_logs, survey_responses, empathy_ratings, session_ratings, system_config — organizadas en 6 grupos" |
| T-I2 | TABLES 7-15, 17 (columnas temporales) | `TIMESTAMP NOT NULL DEFAULT NOW` | `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP` (Evo 006, `db/schema_postgresql.sql:29`) | Replace global: `TIMESTAMP` → `TIMESTAMPTZ`, `NOW` → `CURRENT_TIMESTAMP` |
| T-I3 | TABLE 9 (preferences) | Falta documentar `preferred_chat_mode` | Existe desde Evo 003 (`db/schema_postgresql.sql:103-104`): `TEXT NOT NULL DEFAULT 'chat' CHECK IN ('chat','avatar')` | Agregar fila `preferred_chat_mode TEXT NOT NULL DEFAULT 'chat' CHECK IN (chat,avatar)` |
| T-I4 | TABLE 11 (messages) | 11 columnas | 14 columnas. Faltan: `latency_ms` (Evo 004), `asr_latency_ms`, `llm_latency_ms`, `tts_latency_ms` (Evo 006, `db/schema_postgresql.sql:142-145`) | Agregar 4 filas INT NULL: "latency_ms, asr/llm/tts_latency_ms — latencias por etapa del pipeline para RNF-01" |
| T-I5 | TABLE 15 R4 (safety_events) | `event_type` con CHECK; status no documentado | NO hay CHECK en `event_type` (`db/schema_postgresql.sql:218` — TEXT NOT NULL). Falta documentar `status` (Evo 002, L220-221): `TEXT NOT NULL DEFAULT 'active' CHECK IN ('active','reviewed','resolved')` | Agregar fila `status` y aclarar que `event_type` no tiene CHECK (es convención backend) |
| T-I6 | R8 (RF-08) Onboarding | "Onboarding de 2 pasos" | PO decidió 3 pasos (decisión 2026-02-23). Pasos 2-3 fusionados/ocultos temporalmente hasta llegar Avatar 2D animado | "Onboarding nominal 3 pasos (Privacidad, Accesibilidad, Voz). En MVP el paso de Voz está provisionalmente fusionado con Accesibilidad porque las opciones avanzadas de voz/avatar están deshabilitadas hasta Fase 9" |
| T-I7 | TABLE 2 R5 (RNF-09) | "Mensajes NUNCA a APIs comerciales de terceros" | `LLM_BASE_URL` default es Gemini OpenAI-compat. `LLM_FLAVOR=mabel_gemma4` es lo que activa el prompt fijo. La garantía depende de la config de `LLM_BASE_URL` en prod | "En despliegue productivo, `LLM_FLAVOR=mabel_gemma4` + `LLM_BASE_URL=https://...modal.run/v1` apuntan a la instancia Modal de la UMB. El adaptador OpenAICompat soporta también Gemini (fallback) o cualquier `/v1/chat/completions`. La garantía depende de la config en prod, no del código por sí solo." |
| T-I8 | TABLE 19 R2 (Mabel IA actor) | "system prompt fijo de 151 palabras" | `MABEL_GEMMA4_SYSTEM_PROMPT` en `backend/app/services/llm/prompts.py:46-61` tiene ~110 palabras | "system prompt fijo (`prompts.py:MABEL_GEMMA4_SYSTEM_PROMPT`) que vive en el modelo fine-tuned. Ver el archivo para el conteo exacto." |
| T-I9 | TABLE 36 R1 | "Backend FastAPI (Railway) \| Hardware físico" | Railway es PaaS con containers Docker | "Container PaaS (Railway)". Agregar fila para Cron Service Railway (redact_old_message_ids 03:00 UTC) |
| T-I10 | TABLE 35 R5 | "Mabel-Gemma4 ... ~3B ... Storage Local" | Gemma E4B ~3.5GB cuantizado. Sin storage local — es HTTPS a Modal.com | "modelo Gemma 4 E4B (~3.5GB cuantizado Q4_K_M GGUF). Dependencia: cliente OpenAI-compat sobre HTTPS a Modal.com" |

### 1.3 Gaps (2)

| # | Tema faltante | Verdad codebase | Fix propuesto |
|---|---|---|---|
| T-G1 | Cron L2 redaction | `backend/scripts/redact_old_message_ids.py` + `railway.cron.toml` + `docs/DATA_RETENTION_POLICY.md §10` (2026-05-24) | Agregar CU-26 "Redacción L2 de payload (Cron sistema)": cada 24h 03:00 UTC, `UPDATE safety_events SET payload = payload - 'message_id' WHERE created_at < NOW() - INTERVAL '30 days'`. Cumple Ley 1581/2012 art. 4 minimización |
| T-G2 | Audit logs sistema | Triple `actor_role` (admin\|student\|system) desde Evo 007 | Documentar en sección audit_logs los tres tipos de actor y las acciones de sistema (cron, user_login_failed) |

---

## Parte 2 — Manual de Usuario

### 2.1 Mentiras (7)

| # | Lugar docx | Cita textual | Verdad codebase | Fix |
|---|---|---|---|---|
| U-M1 | TABLE 47 R2 | "Revocación total: se eliminan TODOS los datos. Irreversible." | Modal real (`RevokeConsentModal.tsx:194`): "Perderás acceso temporal hasta re-aceptar el consentimiento. Tus datos NO se eliminan" | "Revocación total: pierdes acceso temporal hasta re-aceptar el consentimiento. Tus datos NO se eliminan (para eso usa Eliminar cuenta). Es reversible." |
| U-M2 | P[0313] (SessionEnd) | "Widget de 5 corazones con UPSERT a session_rating" | `SessionEnd.tsx` solo renderiza hero + resumen + 2 botones nav. `HeartRating` existe pero no está montado aquí | Eliminar mención al widget en SessionEnd o documentar el lugar real donde se muestra (chat per-mensaje); marcar pendiente si no existe en sesión |
| U-M3 | P[0261] (SOS) | "Botón Ver más recursos de ayuda" | No existe en `SosPanel.tsx`. Acciones reales: cerrar (X/backdrop), "Llamar" por línea, "Continuar con Mabel" | Eliminar la fila. Si se quiere, marcar como post-MVP |
| U-M4 | TABLE 75 R6 (troubleshooting) | "Avatar no se anima → verifica micrófono en Preferencias" | Avatar 2D depende de `voice_enabled + voice_mode_enabled`, NO de micrófono. TTS solo afecta el estado `speaking` | "Verifica que tengas activado *Voz de Mabel* y *Modo voz 2D* en Preferencias > Voz. Si persiste, recarga la página (F5)" |
| U-M5 | TABLE 20 R5 (Home sugerencias) | "Quiero hablar sobre estrés académico / Solo quiero desahogarme / Necesito técnicas de relajación / Tengo problemas para dormir" | `frontend/src/pages/Home.tsx:35-56`: 4 chips reales — "Cómo me siento hoy / Quiero hablar de algo / Tengo estrés académico / Necesito motivación" | Reemplazar lista por las 4 reales |
| U-M6 | TABLE 22 R2 (Check-in sueño) | "Horas de sueño: < 4h / 4-6h / 6-8h / > 8h" | Campo principal es `Calidad de sueño anoche` segmented (Mal/Regular/Bien/Muy bien, SHAWQ). Horas es input numérico opcional | "Calidad de sueño anoche: segmented (Mal/Regular/Bien/Muy bien). Horas de sueño: input numérico opcional" |
| U-M7 | TABLE 22 R3 (Check-in foco) | "Académico / Familiar / Social / Laboral / Salud / Otro" | 8 categorías reales (`frontend/src/constants/checkin.ts:37-46`): Académico, Social, Familiar, Pareja, Salud, Económico, Futuro, Otro. NO existe "Laboral" | "Académico / Social / Familiar / Pareja / Salud / Económico / Futuro / Otro (multi-select)" |
| U-M8 | TABLE 25 R6 (Chat) | "Botón Modo Avatar → Avatar 3D" | Botón se llama "Hablar", abre Avatar **2D** (`Chat.tsx:531-562`). Condicional a voice prefs ON | "Botón Hablar: abre el modo voz con Mabel 2D animada (#10B). Solo visible si activaste *Voz de Mabel* + *Modo voz 2D* en preferencias" |

### 2.2 Imprecisiones (11)

| # | Lugar docx | Problema | Fix |
|---|---|---|---|
| U-I1 | P[0148] (Landing) | "Pantalla bienvenida con copy 'Qué bueno verte de nuevo'" — ese copy vive en Home (post-login), no en Landing | Describir Landing real: CTAs "Iniciar sesión"/"Registrarse", sección "¿Cómo funciona?" |
| U-I2 | P[0216] (Home saludo) | Saludo descrito como párrafo largo | Es frase corta única, aleatoria de pool de ~30 según bucket horario (`frontend/src/utils/greetings.ts`). Ejemplos: "Buenas tardes, Juan.", "Hola, Juan. Tómate un respiro." |
| U-I3 | P[0232] (greeting Chat) | "Mabel saluda con copy exacto" | Lo genera el LLM en streaming, no es fijo. Etiquetar como "ejemplo representativo" |
| U-I4 | TABLE 22 R1 (caritas) | "Muy mal / Mal / Regular / Bien / Muy bien" | Labels reales: "Muy mal / Mal / Neutral / Bien / Excelente" (`checkin.ts:80-86`) |
| U-I5 | P[0260] (SOS) | "Botón Volver al chat" | Se llama "Continuar con Mabel" (`SosPanel.tsx:311`) |
| U-I6 | TABLE 33 R0/R1 (hotlines) | "Líneas 123, 106 ICBF, 155, Bienestar UMB" | Hardcoded: Línea 106 ICBF + Línea 141 Línea de la Vida. El resto se configura desde `system_config.sos_hotline_numbers` (admin lo edita) |
| U-I7 | TABLE 47 R1 (reducir alcance) | Copy genérico | Modal real (`RevokeConsentModal.tsx:151-164`): "Tus datos solo se usarán para el funcionamiento del sistema. Se excluyen de mejoras anónimas" → reescribir reflejando que solo cambia scope a `solo_uso`, no borra datos |
| U-I8 | P[0166] (Login) | Copy fabricado | Citar el copy literal de `Login.tsx` |
| U-I9 | TABLE 76 R10 (glosario) | "Avatar 3D" con definición 2D | Renombrar a "Avatar 2D" o agregar "(Fase 9 — Avatar 3D pendiente, MVP usa Avatar 2D ilustrado)" |
| U-I10 | TABLE 67 R1 | "Proveedor LLM: Google Gemini / Local" | Default productivo es Mabel-Gemma4 vía Modal. Gemini es fallback legacy. Local no es opción en MVP | "Mabel-Gemma4 (Modal.com, default) / Gemini (fallback legacy)" |
| U-I11 | P[0188] / TABLE 15 (Onboarding) | Tabla legacy de Accesibilidad/Voz | Reemplazar con la tabla real del Paso 2: 4 toggles jerárquicos (Voz de Mabel master + Modo voz 2D + Mabel lee en chat + Resaltar palabras), regla: apagar master coerciona los 3 sub-toggles a false |

### 2.3 Gaps (7)

| # | Tema faltante | Notas |
|---|---|---|
| U-G1 | TABLE 25 — `LlmStatusChip` | Píldora clickeable en header del chat. 4 estados (warm verde / cold amber pulsante / down rojo / unknown gris). ARIA dialog con popover. **Es lo primero que ve el estudiante al cargar el chat.** |
| U-G2 | TABLE 25 — Toast cold start | Aparece al enviar primer mensaje si estado del LLM es `cold` o `unknown`: "Mabel está despertando del descanso — tu respuesta puede tardar 60-90s, pero ya está procesándose" |
| U-G3 | TABLE 25 — 5-stage progressive text | El manual menciona solo 2 stages (pensando → despertando). Reales (`streamingStatus.ts`): 0-3s "pensando" → 3-10s "cuidadosa" → 10-25s "tomándose su tiempo" → 25-60s "despertando del descanso" → 60+s "Sigue procesando". Una vez fluyen tokens: "Mabel está escribiendo" |
| U-G4 | TABLE 28 R1 (Voice) | Avatar 2D durante `thinking` también muestra texto progresivo de espera en cold start |
| U-G5 | TABLE 74 R6 (FAQ) | Mención al `LlmStatusChip` en respuesta a "¿por qué tarda mucho?" |
| U-G6 | P[0303] (Settings ARCO) | Settings actual tiene 4 tabs: Privacidad / Voz / Cuenta / Mis datos (ARCO). La tab Accesibilidad fue retirada (`Settings.tsx:91-97`, commit 543f4b9). ARCO + Consentimiento fusionados en "Mis datos" |
| U-G7 | P[0388] / TABLE 70 R3 (Admin) | Admin lifecycle completo: Deshabilitar / Rehabilitar / Eliminar / Audit log + multi-select bulk actions (commit ffe1211). Manual solo menciona Deshabilitar |

---

## Plan de aplicación

### Fase A — Fixes a aplicar directamente sobre los `.docx` (vía python-docx)
Las **mentiras puntuales** (T-M1, T-M2, T-M11 puerto, U-M3 botón inexistente, U-M5 chips, U-M6/U-M7 check-in, U-M8 botón) son sustituciones de string que `python-docx` puede hacer sin riesgo del bug de Twips. Aplicar in-place.

### Fase B — Extensión vía Addendum
Cuando el fix requiere:
- Eliminar una tabla entera (TABLE 18 SQLite),
- Reescribir tablas grandes (TABLE 37 puertos, P[0188] Onboarding),
- Agregar nuevas secciones (cron L2, LlmStatusChip, toast, progressive text),

extender los `Addendum_*_2026-05-24.docx` existentes con sección "Actualización 2 — 2026-05-24" en lugar de mass-edit los originales. Más seguro contra el bug de Twips float.

### Fase C — Reseteo de listas
T-M10 / U-M11 implican retirar tablas legacy completas y reemplazarlas — mejor documentarlo en Addendum y dejar comentado en el original.

---

## Trazabilidad

- **Antes**: la auditoría previa (2026-05-23) detectó "3 mentiras + 9 imprecisiones + 8 gaps HIGH" — solo conteo, sin detalle, se perdió en compaction.
- **Ahora**: las 48 entradas de este doc son verificables contra git blame del codebase referenciado.

## Estado de aplicación (2026-05-24)

| Fase | Alcance | Resultado |
|---|---|---|
| **A** — fixes in-place | 31 sustituciones de string sobre `Manual_MABELOFICIAL.docx` y `MANUAL DE USUARIO UMB.docx` vía `python-docx` | ✅ 30/31 aplicadas (solo `updated-at` no estaba presente) |
| **B** — addendum técnico | 9 secciones nuevas A2.1-A2.9 en `Addendum_Manual_Tecnico_2026-05-24.docx` | ✅ 81 párrafos, 11 tablas |
| **B** — addendum usuario | 14 secciones nuevas A2.1-A2.10 (incl. 3 sub-secciones Capa 1/2/3) en `Addendum_Manual_Usuario_2026-05-24.docx` | ✅ 98 párrafos, 9 tablas |
| **C** — retiro SQLite TABLE 18 | Documentado en A2.9 del addendum técnico | ✅ |

### Backups
- `Manual_MABELOFICIAL.docx.audit-2026-05-24.bak` (1.6MB)
- `MANUAL DE USUARIO UMB.docx.audit-2026-05-24.bak` (93KB)
- `Addendum_Manual_Tecnico_2026-05-24.docx.audit-2026-05-24.bak` (40KB)
- `Addendum_Manual_Usuario_2026-05-24.docx.audit-2026-05-24.bak` (39KB)

### Cobertura por hallazgo

**Manual Técnico (23)**: T-M1 (Fase A), T-M2 (A), T-M4 (A+C), T-M5 (pendiente — descripciones desplazadas en tabla, mejor manual), T-M6 (B — addendum A2.3), T-M7 (A), T-M8/M9/M10 (A), T-M11 (B — A2.6), T-I1 (A + B-A2.1), T-I2 (B — A2.2), T-I3 (pendiente — campo `preferred_chat_mode`), T-I4 (pendiente — 3 cols latency-split), T-I5 (pendiente — `event_type` sin CHECK + `status`), T-I6 (B — A2.7), T-I7 (A + B-A2.8), T-I8 (A), T-I9 (A), T-I10 (A), T-G1 (B — A2.4), T-G2 (B — A2.5)

**Manual Usuario (25)**: U-M1 (A), U-M2 (pendiente — widget corazones SessionEnd, mejor decisión manual), U-M3 (A), U-M4 (A), U-M5 (A), U-M6 (A), U-M7 (A), U-M8 (A), U-I1 (pendiente — Landing copy), U-I2/I3 (pendiente — saludo Home/greeting), U-I4 (A), U-I5 (A), U-I6 (pendiente — hotlines hardcoded), U-I7 (B — A2.5), U-I8 (pendiente — Login copy), U-I9 (A), U-I10 (A), U-I11 (B — A2.4 Settings), U-G1/G2/G3/G4/G5 (B — A2.1 Capas 1/2/3), U-G6 (B — A2.4), U-G7 (B — A2.8)

### Hallazgos pendientes (8)
Requieren intervención manual o decisión del PO (no se pueden resolver con string-replace o append):

- **T-M5** — descripciones desplazadas en TABLE 12 (mensajes_reports). Mejor re-tipear la tabla manualmente.
- **T-I3** — falta documentar `preferences.preferred_chat_mode` en TABLE 9.
- **T-I4** — falta documentar 3 cols latency-split en TABLE 11.
- **T-I5** — corregir CHECK constraint de `safety_events.event_type` y agregar `status`.
- **U-M2** — widget de 5 corazones en SessionEnd. ¿Decisión PO: implementar el widget o quitar la mención del manual?
- **U-I1** — Landing copy ("Qué bueno verte de nuevo" no es de Landing).
- **U-I2/I3** — saludos del Home y greeting del Chat (son dinámicos, no fijos).
- **U-I6** — hotlines hardcoded vs configurables (semantic edit en cell).
- **U-I8** — copy literal de Login.

Estos quedan listados como deuda en la próxima iteración.

## Hallazgo lateral — Drift DDL vs Alembic

Mientras verificaba el conteo "15 tablas" descubrí que `db/schema_postgresql.sql` solo tiene 14 `CREATE TABLE`. El faltante es `session_ratings`, que existe vía migración Alembic `011_session_ratings.py` pero nunca se propagó al DDL fuente declarado en `CLAUDE.md` como "source of truth". El conteo real (15) coincide con `backend/app/models/*.py`. **Deuda técnica fuera del scope de esta auditoría**: regenerar `db/schema_postgresql.sql` desde `alembic upgrade head` para alinear ambos.

## Referencias

- DDL: `db/schema_postgresql.sql` (14 `CREATE TABLE` declarados; 15 tablas reales tras Alembic mig 011, ~110 columnas tras Evo 007)
- Cron L2: `docs/DATA_RETENTION_POLICY.md §10` + `backend/scripts/redact_old_message_ids.py`
- LLM: `backend/app/services/llm/openai_adapter.py` + `prompts.py`
- UX wait: `frontend/src/{hooks/useLlmPrewarm,utils/streamingStatus,components/chat/{LlmStatusChip,StreamingIndicator}}`
- Settings: `frontend/src/pages/Settings.tsx` (4 tabs, commit 543f4b9)
- Admin lifecycle: commit `ffe1211`
