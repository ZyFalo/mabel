# Fase 9 — Spec ejecutiva: Avatar 3D + Lip Sync

> **Estado**: ⏳ Pendiente · alineado al 2026-05-24 · commit `899bd44`
> **Owner**: Ag.15 (3D & Avatar Engineer)
> **Decisión técnica completa**: `docs/AVATAR_3D_DECISION_TECNICA.md` (ADR aprobado 2026-02-22)
> **Sustituto vigente en MVP**: avatar 2D ilustrado en `frontend/src/components/voice/MabelAvatar.tsx` + `ReactiveRings.tsx`, montado en `frontend/src/pages/Voice.tsx` (ruta `/session/:id/voice`).

Este documento es la **versión ejecutiva** del avatar 3D para Fase 9: qué falta concretamente, criterios de aceptación medibles, riesgos y cronograma. La especificación técnica detallada (decisión de lip sync, blend shapes, FPS targets) vive en `docs/AVATAR_3D_DECISION_TECNICA.md`.

---

## 1. ¿Por qué Fase 9 sigue pendiente?

- **MVP Híbrido** (Railway + Modal) priorizó pilotabilidad del estudio antes que polish visual.
- El sustituto 2D ya cubre la UX equivalente: 5 estados visuales (idle/listening/thinking/speaking/error) + sincronización con audio TTS por mute/duración de Piper.
- La rúbrica de empatía del estudio (HU-18 criterio 9-10) no requiere 3D para validar acompañamiento empático.
- Bundle del frontend en MVP: ~350KB gzipped. Agregar three.js + drei + three-vrm añade ~255KB (+73%); el modelo VRM placeholder agrega 3-5MB. Acumulado: +1-2s de Time to Interactive.

**Cuándo activar Fase 9**: post-piloto cuantitativo (si SUS ≥70 + efecto bienestar ≥0.3), si la investigación cualitativa muestra que los estudiantes piden "más presencia" o "ver a quien me habla".

---

## 2. Alcance (qué se construye)

### 2.1 Cambios en frontend

**Nuevos archivos**:
- `frontend/src/components/avatar3d/AvatarCanvas.tsx` — React Three Fiber root con `@react-three/drei` Stage + Camera.
- `frontend/src/components/avatar3d/VrmModel.tsx` — loader con `@pixiv/three-vrm`. Cargado lazy via `React.lazy()`.
- `frontend/src/components/avatar3d/useLipSync.ts` — hook que toma `MediaStream` del TTS, ejecuta `AnalyserNode` (Web Audio API), mapea FFT a 5 visemes (aa/ee/ih/oh/ou) + sil.
- `frontend/src/components/avatar3d/useIdleAnimations.ts` — blink (cada 3-7s random), micro-movimientos de cabeza.
- `frontend/src/components/avatar3d/ExpressionController.ts` — happy/sad/neutral/surprised según `safety_flags` o contexto del mensaje.
- `frontend/src/pages/Voice.tsx` — extender con switch "Modo 2D ↔ Modo 3D" (UX: pestañas en TopBar).

**Modificaciones**:
- `frontend/package.json` — añadir `@react-three/fiber`, `@react-three/drei`, `three`, `@pixiv/three-vrm`.
- `frontend/src/stores/chatStore.ts` — flag `avatarMode: '2d' | '3d'`.
- `frontend/src/pages/Settings.tsx` — toggle "Preferir avatar 3D" (persistido en `preferences.preferred_chat_mode`).

### 2.2 Cambios en backend
**Ninguno necesario.** La BD ya tiene `preferences.preferred_chat_mode` y `sessions.avatar_used` desde el initial migration. El streaming de audio TTS ya funciona via `GET /api/v1/tts/synthesize`. El frontend hace todo el lip sync local con Web Audio API — cero load en el backend.

Excepción: si se opta por la **alternativa C** (rhubarb-lip-sync server-side), se requiere un nuevo microservicio Docker + endpoint. ADR original lo descartó por +1-3s latencia.

### 2.3 Asset: modelo VRM

- Crear con [VRoid Studio](https://vroid.com/en/studio) (gratuito, exporta VRM nativo).
- Diseño coherente con la marca Mabel (paleta `#A51916` UMB).
- Configurable via env var `VITE_AVATAR_MODEL_URL` (intercambiable sin redeploy).
- Servir desde `/static/avatar.vrm` (mismo Dockerfile que ya sirve frontend assets).

---

## 3. Criterios de aceptación medibles

| # | Criterio | Cómo se mide |
|---|---|---|
| 1 | Switch Modo 2D ↔ 3D en `/voice` funcional | E2E test: click switch → canvas 3D aparece <2s |
| 2 | Canvas 3D ocupa ~70% del viewport principal | CSS layout verificable visualmente |
| 3 | Lip sync sincronizado con audio TTS (latencia ≤100ms aparente) | Manual: grabación de pantalla + análisis subjetivo + grupo focal (n=5) |
| 4 | Animación idle (respiración + parpadeo aleatorio) | Visible cuando estado=`idle`; blink cada 3-7s random |
| 5 | 5 expresiones faciales contextuales | `safety_flags.empathy_required=true` → expresión `relaxed`; mensaje SOS → `neutral` (no `sad`, evita reforzar negatividad) |
| 6 | Mini-chat ~30% inferior funcional | Composer + lista compacta de últimos 3 mensajes |
| 7 | Input texto/voz funciona en ambos modos | Composer compartido entre 2D y 3D |
| 8 | SOS FAB visible sobre canvas 3D | `z-index: 9999` + verificar overlay |
| 9 | **≥30 FPS** en GPU integrada (MacBook M1 base / Intel UHD 620) | `stats.js` overlay durante 60s; mediana ≥30 |
| 10 | Modelo intercambiable via `VITE_AVATAR_MODEL_URL` | Build con env var distinta → modelo distinto aparece |
| 11 | **Fallback graceful**: si WebGL no soportado o FPS<20 → mantener Modo 2D | Detectar con `gl.getContextAttributes()` + benchmark inicial 3s; si falla, render `<MabelAvatar />` (2D actual) |
| 12 | **Crisis**: avatar pausa animación + expresión empática + SOS overlay | Cuando `risk_detected` event llega vía SSE: `pause animations + setExpression('relaxed') + open SosPanel` |
| 13 | Switch preserva contexto de conversación | Cambiar 2D↔3D no recarga la sesión ni pierde el historial scroll |
| 14 | **Lazy loading**: assets 3D solo se descargan al activar Modo 3D | `React.lazy()` + dynamic import; verificar en Network tab que three.js no aparece hasta toggle |

---

## 4. Pre-requisitos antes de arrancar Fase 9

- [ ] Decisión PO confirmada: ejecutar Fase 9 (vs invertir el esfuerzo en otro feature post-piloto)
- [ ] Modelo VRM placeholder creado (o budget para contratar artista 3D)
- [ ] Métricas del piloto disponibles para justificar inversión (SUS, efecto bienestar)
- [ ] Tests del MVP estables (`docs/TESTING_STRATEGY.md` §3.1 + 3.2 cubiertos) — sin tests, regresión silenciosa de 2D al introducir 3D es muy fácil

---

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Bundle size aumenta >50% → TTI lento en móviles del piloto | Lazy load obligatorio + service worker pre-cache solo si usuario activa Modo 3D una vez |
| Lip sync de Web Audio API queda "uncanny valley" (boca no sincroniza bien) | A/B test con grupo focal (n=5) antes de release a todo el piloto |
| GPU integrada de algunos estudiantes <20 FPS | Fallback automático a 2D detectado en boot (criterio 11) |
| Modelo VRM con uncanny features | VRoid Studio + revisión de Ag.09 antes de release |
| Conflicto con LlmStatusChip / SosPanel (z-index) | Layout test E2E que verifica los 3 visibles |
| Tiempo de desarrollo subestimado | Sprint dedicado de 3-4 semanas para Ag.15 con sign-off de Ag.01 |

---

## 6. Cronograma estimado (orientativo)

| Sprint | Hito | Estimación |
|---|---|---|
| 1 | Setup React Three Fiber + VRM loader + modelo placeholder cargando + camera/lights | 1 sem |
| 2 | Lip sync pipeline (AnalyserNode → blend shapes) + idle animations | 1 sem |
| 3 | Integración con `/voice`: switch 2D↔3D, mini-chat, expresiones contextuales, crisis handler | 1 sem |
| 4 | Optimización rendimiento (lazy load, fallback, benchmarks), QA, code-review skill, ajustes UX | 1 sem |

**Total**: ~4 semanas con 1 dev (Ag.15) dedicado. Si el dev es nuevo a React Three Fiber, +1 semana de ramp-up.

---

## 7. Comparación: 2D actual vs 3D propuesto

| Aspecto | 2D (MVP actual) | 3D (Fase 9 propuesta) |
|---|---|---|
| Bundle JS | ~0 (PNG + SVG inline) | +255KB gzipped |
| Asset | 1 PNG base + SVG overlay (<200KB) | 1 VRM ~3-5MB |
| Estados visuales | 5 (idle/listening/thinking/speaking/error) | 5 + 5 expresiones + lip sync |
| Lip sync | ❌ (boca estática con SVG overlay) | ✅ (5 visemes via FFT) |
| Presencia percibida | Aceptable, ilustración estática | Mayor (movimiento + expresión) |
| Compatibilidad device | 100% | ~95% (fallback automático para el resto) |
| FPS objetivo | 60 (GPU no requerida) | ≥30 (GPU integrada mínima) |
| Latencia | 0 | ≤100ms aparente (audio→viseme) |
| Implementación | ✅ DONE | ⏳ 4 sprints |
| Mantenimiento | Bajo (CSS keyframes) | Medio (three.js debug + GPU compat) |

---

## 8. Decisión pendiente del PO

**Pregunta clave**: ¿Justifica el costo (4 sprints + bundle bloat + complejidad de mantenimiento) el valor incremental (mayor presencia visual) en el contexto del estudio?

**Recomendación implícita del PM (Ag.01)**: ejecutar Fase 9 **solo si**:
1. El piloto valida que el chat + voz funcionan bien (SUS ≥70).
2. Hay budget para 1 mes adicional post-piloto.
3. El equipo de investigación valida que el incremento "vale" estudiar (hipótesis testable en Fase 11 si existe).

---

## 9. Referencias

- ADR completo: `docs/AVATAR_3D_DECISION_TECNICA.md`
- Sustituto 2D actual: `frontend/src/components/voice/MabelAvatar.tsx` + `ReactiveRings.tsx`, `frontend/src/pages/Voice.tsx`
- Tabla de fases: `docs/FASES_IMPLEMENTACION.md` Fase 9
- Memoria pin: `~/.claude/projects/.../memory/onboarding-pending-when-voice-avatar-lands.md` (toggles UI deshabilitados pendientes)
- HU-18 catálogo: `docs/INTERFACES_MVP.md` #43 (Voice actual) + #10B (Avatar 3D propuesto)
