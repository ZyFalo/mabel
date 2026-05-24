# Avatar 3D Animado con Lip Sync — Especificacion Tecnica

> **Proyecto:** Mabel IA — Asistente de Psicoeducacion para Salud Mental Estudiantil UMB
> **Agente lider:** Agente 15 (3D & Avatar Engineer)
> **Agentes contribuyentes:** 04 (Backend), 05 (Frontend), 07 (Voice), 08 (Safety), 09 (UX/UI), 11 (DevOps)
> **Fecha de decision:** 2026-02-22
> **Estado:** APROBADO

---

## 1. Resumen Ejecutivo

Se implementa un avatar 3D animado con lip sync como Modo Avatar alternativo en la interfaz de chat (#10). El avatar usa modelos VRM renderizados con React Three Fiber, y lip sync basado en analisis de frecuencia de audio en el navegador (Web Audio API). La solucion elegida prioriza cero impacto en latencia, cero cambios backend, y viabilidad para un equipo de 3 estudiantes de pregrado, con calidad suficiente para la sustentacion de tesis.

---

## 2. Decision Tecnica: Pipeline de Lip Sync

### 2.1 Opciones Evaluadas

| Opcion | Descripcion | Calidad | Latencia | Complejidad | Viabilidad MVP |
|--------|-------------|---------|----------|-------------|----------------|
| **A** | Visemas desde Piper TTS (backend) | Excelente | +0s (si streaming) | Alta — requiere modificar internals de Piper | Baja |
| **B+D** | Web Audio API (frecuencia) + three-vrm | Buena | +0s (real-time) | Baja — todo en frontend | **Alta** |
| **C** | rhubarb-lip-sync (microservicio) | Muy buena | +1-3s por turno | Media — nuevo servicio Docker | Media |
| **D puro** | talkinghead o libreria todo-en-uno | Variable | +0s | Media — dependencia fuerte | Media |

### 2.2 Opcion Elegida: B+D Hibrido

**Web Audio API con analisis de frecuencia + three-vrm (@pixiv/three-vrm)**

### 2.3 Justificacion Detallada

**Criterio 1 — Calidad del lip sync (peso: 30%)**

El analisis de bandas de frecuencia (no solo amplitud) permite distinguir las 5 formas vocalicas basicas que el estandar VRM soporta nativamente:

| Vocal | F1 (Hz) | F2 (Hz) | Blend shape VRM |
|-------|---------|---------|-----------------|
| A | ~800 | ~1200 | `aa` — boca abierta |
| E | ~400 | ~2300 | `ee` — labios extendidos |
| I | ~300 | ~2800 | `ih` — labios mas extendidos |
| O | ~500 | ~800 | `oh` — labios redondeados |
| U | ~300 | ~800 | `ou` — labios muy redondeados |

Combinado con:
- Amplitud general para apertura de mandibula (`jaw open`)
- Interpolacion suave (lerp) entre shapes para transiciones naturales
- Parpadeo aleatorio y micro-movimientos durante el habla

El resultado es un lip sync visualmente convincente. No es fonetico al 100%, pero para una evaluacion de tesis de pregrado donde el jurado evalua "los labios se mueven sincronizados con el habla", es mas que suficiente.

**Criterio 2 — Viabilidad MVP (peso: 25%)**

- **Cero cambios backend:** Piper TTS sigue entregando solo audio (WAV/OGG). No hay modificaciones al endpoint de TTS, no hay nuevo formato de respuesta.
- **Cero servicios nuevos:** No se agrega rhubarb-lip-sync ni ningun otro contenedor Docker.
- **Libreria madura:** @pixiv/three-vrm tiene +3K stars en GitHub, documentacion extensa, y ejemplos de lip sync con Web Audio API.
- **Implementacion estimada:** Un desarrollador puede tener un prototipo funcional en 2-3 sprints, versus 4-5 sprints para la Opcion A o C.

**Criterio 3 — Impacto en latencia (peso: 20%)**

**Cero latencia adicional.** El pipeline actual:
```
Usuario habla → ASR (~2-4s) → Gemini (~3-10s) → Piper TTS (~1-2s) → Audio
```

Con la Opcion B+D, el audio empieza a reproducirse inmediatamente y el lip sync ocurre en tiempo real mientras el audio suena. No hay paso de procesamiento adicional.

Comparativa:
- Opcion A: +0s (si se modifica Piper para streaming de visemas) o impracticable
- **Opcion B+D: +0s** (analisis en tiempo real)
- Opcion C: +1-3s (procesamiento batch de audio por rhubarb)
- Opcion D puro: +0s (similar a B+D)

**Criterio 4 — Rendimiento frontend (peso: 15%)**

- `AnalyserNode` de Web Audio API: nativo del navegador, overhead negligible (~0.1ms por frame)
- three-vrm: optimizado para modelos VRM, renderizado eficiente de blend shapes
- React Three Fiber: reconciliacion fuera del thread principal de React
- Budget: 30 FPS en Intel UHD 620 es alcanzable con modelo GLB <= 5MB y un solo personaje en escena

**Criterio 5 — Complejidad de implementacion (peso: 10%)**

| Aspecto | B+D (elegida) | A | C |
|---------|---------------|---|---|
| Archivos backend nuevos | 0 | 3-5 | 2-3 |
| Servicios Docker nuevos | 0 | 0 | 1 |
| Librerias frontend nuevas | 4 | 4 | 4 |
| Endpoints API nuevos | 0 | 1 | 1 |
| Cambios en pipeline TTS | 0 | Significativos | 0 |

### 2.4 Ruta de Mejora Post-MVP

Si el jurado de tesis requiere lip sync mas preciso (fonetico), se puede agregar rhubarb-lip-sync (Opcion C) como **mejora incremental** sin cambiar el frontend:
1. Agregar servicio `rhubarb` a Docker Compose (Agent 11)
2. Backend recibe audio de Piper → lo pasa por rhubarb → genera JSON de visemas
3. Frontend consume el JSON de visemas EN LUGAR del analisis de frecuencia
4. Los blend shapes y el componente React NO cambian — solo la fuente de datos

---

## 3. Diagrama de Flujo del Pipeline Completo

```
FLUJO COMPLETO: Usuario → Avatar con Lip Sync

1. ENTRADA DE USUARIO
   Usuario escribe texto         Usuario habla por microfono
          |                              |
          v                              v
   POST /messages              POST /asr (audio blob)
          |                              |
          |                     faster-whisper (ASR)
          |                              |
          |                     Transcripcion texto
          |                              |
          +----------+-------------------+
                     |
                     v
2. PROCESAMIENTO BACKEND
   Pre-filtro guardrails (Agent 08)
          |
          v
   API Gemini (inferencia LLM)
          |
          v
   Post-filtro guardrails + metadata emocional
          |
          +---------+---------+
          |                   |
          v                   v
   Texto respuesta      Tono emocional
          |             (metadata JSON)
          |                   |
          v                   |
3. SINTESIS DE VOZ              |
   Piper TTS                    |
          |                     |
          v                     |
   Audio WAV/OGG                |
          |                     |
          v                     v
4. ENTREGA AL FRONTEND (SSE stream)
   {text, audio_url, emotion_tone}
          |
          +----------+-----------+
          |          |           |
          v          v           v
5. RENDERING EN BROWSER
   Mini-chat     Audio       Avatar 3D
   (burbujas)    playback    (three-vrm)
                    |            |
                    v            v
              Web Audio API   Expresion facial
              AnalyserNode    (segun emotion_tone)
                    |
                    v
              Analisis de frecuencia
              (F1, F2 → vocal A/E/I/O/U)
                    |
                    v
              Blend shapes VRM
              (aa, ee, ih, oh, ou + jaw)
                    |
                    v
              LIP SYNC SINCRONIZADO
              (30 FPS, real-time)
```

### 3.1 Flujo durante crisis (guardrail activado)

```
Guardrail detecta riesgo
          |
          v
   1. Corta TTS inmediatamente (Agent 07)
   2. Notifica al modulo 3D: evento "crisis"
          |
          v
   Avatar:
   - Pausa animacion de habla
   - Transicion a expresion empatica/neutra (500ms)
   - Canvas 3D se atenua (opacity: 0.3)
          |
          v
   Panel SOS aparece como overlay
   (z-index sobre canvas 3D)
          |
          v
   safety_event registrado en BD
```

---

## 4. Stack Tecnologico del Avatar 3D

| Tecnologia | Version | Proposito | Tamano estimado |
|------------|---------|-----------|-----------------|
| @react-three/fiber | >=8.15 | Renderizado 3D declarativo en React | ~45KB gzip |
| @react-three/drei | >=9.88 | Helpers para R3F (OrbitControls, Environment, etc.) | ~35KB gzip |
| three | >=0.160 | Motor 3D WebGL subyacente | ~150KB gzip |
| @pixiv/three-vrm | >=3.0 | Carga y animacion de modelos VRM | ~25KB gzip |
| **Total librerias 3D** | | | **~255KB gzip** |
| Modelo VRM placeholder | | Avatar con blend shapes | **<= 5MB** |

### 4.1 Formato del Modelo VRM

El modelo VRM placeholder (y el modelo definitivo de la Universidad) DEBE incluir:

**Blend shapes requeridos (minimo):**

| Categoria | Blend shape | Descripcion | Uso |
|-----------|-------------|-------------|-----|
| Visemas | `viseme_aa` | Boca abierta (vocal A) | Lip sync |
| Visemas | `viseme_ee` | Labios extendidos (vocal E) | Lip sync |
| Visemas | `viseme_ih` | Labios muy extendidos (vocal I) | Lip sync |
| Visemas | `viseme_oh` | Labios redondeados (vocal O) | Lip sync |
| Visemas | `viseme_ou` | Labios muy redondeados (vocal U) | Lip sync |
| Visemas | `viseme_sil` | Boca cerrada (silencio) | Lip sync |
| Ojos | `blink` | Parpadeo bilateral | Idle, todas las animaciones |
| Ojos | `blinkLeft` | Parpadeo izquierdo | Expresiones |
| Ojos | `blinkRight` | Parpadeo derecho | Expresiones |
| Expresion | `happy` | Sonrisa | Tono alentador |
| Expresion | `sad` | Tristeza sutil | Tono empatico |
| Expresion | `neutral` | Expresion neutra | Default, crisis |
| Expresion | `surprised` | Sorpresa leve | Escuchando |
| Expresion | `relaxed` | Expresion relajada/calma | Tono calmante |

**Rig de animacion:**
- Esqueleto humanoide (HumanoidBones del estandar VRM)
- Minimo: cabeza, cuello, columna superior, brazos superiores
- Ideal: rig completo para gestos de manos y postura

**Materiales:**
- MToon shader (estandar VRM) o PBR estandar
- Texturas optimizadas (max 2048x2048)

**Modelo placeholder del MVP:**
- Creado con VRoid Studio (gratuito, exporta VRM nativo)
- Personaje femenino generico con apariencia profesional y empatica
- Nombre del archivo: configurable via `VITE_AVATAR_MODEL_URL` (variable de entorno)

### 4.2 API del Componente React

```tsx
// Componente principal del avatar (lazy-loaded)
interface AvatarCanvasProps {
  audioSource: MediaStream | HTMLAudioElement | null;
  emotionTone: 'neutral' | 'empathetic' | 'concerned' | 'encouraging';
  avatarState: 'idle' | 'speaking' | 'listening' | 'thinking' | 'crisis';
  onWebGLError: () => void;  // Callback para fallback
  onFPSBelowThreshold: () => void;  // Callback si FPS < 20
}

// Estado global (Zustand store)
interface AvatarStore {
  chatMode: 'chat' | 'avatar';        // Modo actual
  avatarState: AvatarState;           // Estado de animacion
  emotionTone: EmotionTone;           // Expresion facial
  webglSupported: boolean;            // Soporte WebGL detectado
  setChatMode: (mode: 'chat' | 'avatar') => void;
  setAvatarState: (state: AvatarState) => void;
  setEmotionTone: (tone: EmotionTone) => void;
}
```

### 4.3 Configuracion Intercambiable del Modelo

```env
# .env — Configuracion del avatar 3D
VITE_AVATAR_MODEL_URL=/assets/models/mabel-placeholder.vrm
VITE_AVATAR_ENABLED=true
VITE_AVATAR_FPS_THRESHOLD=20
VITE_AVATAR_MODEL_MAX_SIZE_MB=5
```

El modelo se puede intercambiar sin cambios de codigo:
1. Colocar nuevo archivo `.vrm` o `.glb` en `/public/assets/models/`
2. Actualizar `VITE_AVATAR_MODEL_URL` en `.env`
3. Reiniciar el frontend

**Requisito para el modelo de la Universidad:** Debe incluir los blend shapes listados en la seccion 4.1 con los nombres exactos. Se provee un documento de especificacion de blend shapes como entregable.

---

## 5. Historia de Usuario HU-18

### HU-18: Avatar 3D Animado con Lip Sync

**Como** estudiante,
**quiero** ver un avatar 3D animado de Mabel que mueva los labios cuando habla,
**para** sentir una interaccion mas natural y humana durante mis sesiones de apoyo.

### Criterios de Aceptacion

| # | Criterio | Verificacion |
|---|----------|--------------|
| 1 | Existe un boton de switch entre "Modo Chat" y "Modo Avatar" en la interfaz de chat | Manual + E2E |
| 2 | En Modo Avatar, el avatar 3D se renderiza ocupando ~70% del area principal | Manual + screenshot |
| 3 | Cuando el TTS reproduce audio, los labios del avatar se mueven sincronizados | Manual + video |
| 4 | El avatar tiene animacion idle (respiracion, parpadeo) cuando no habla | Manual |
| 5 | El avatar cambia expresion segun contexto emocional (neutro, empatico, preocupado, alentador) | Manual + test de integracion |
| 6 | Mini-chat de texto visible y funcional en Modo Avatar (~30% inferior) | Manual + E2E |
| 7 | Input de texto y voz funciona igual en ambos modos | E2E |
| 8 | SOS FAB visible y funcional sobre el canvas 3D | Manual + E2E |
| 9 | Rendimiento minimo: 30 FPS en GPU integrada (Intel UHD 620) | Benchmark automatizado |
| 10 | Modelo 3D intercambiable (VRM/GLB) sin cambios de codigo (via variable de entorno) | Test de configuracion |
| 11 | Fallback graceful si WebGL no soportado: mensaje al usuario + Modo Chat | Test automatizado |
| 12 | Durante crisis: avatar pausa, expresion empatica, panel SOS como overlay | Test de integracion + manual |
| 13 | Switch Modo Avatar / Modo Chat preserva el estado de la conversacion sin perdida | E2E |
| 14 | Lazy loading: Three.js y assets 3D solo se cargan al activar Modo Avatar por primera vez | Performance test (bundle analyzer) |

### Relacion con otras HU

- **HU-05 (Chat):** HU-18 es una extension del chat — agrega un modo visual alternativo
- **HU-07 (Voz ASR/TTS):** HU-18 consume el audio TTS para el lip sync
- **HU-08 (Derivacion SOS):** HU-18 debe respetar el protocolo de crisis en el canvas 3D
- **HU-09 (Subtitulos):** Los subtitulos funcionan igual en Modo Avatar (sobre el mini-chat)
- **HU-10 (Accesibilidad):** El fallback para dispositivos sin WebGL es un requisito de accesibilidad

---

## 6. Impacto en Interfaces Existentes

### 6.1 Modificacion de Interfaz #10 (Chat Principal)

Se agrega el **Modo Avatar** como modo visual alternativo. Los cambios son ADITIVOS — el Modo Chat actual no se modifica:

**Nuevos elementos UI (solo visibles en Modo Avatar):**
- Boton switch "Modo Chat / Modo Avatar": toggle — alterna entre modos
- Canvas 3D del avatar: canvas WebGL — ocupa ~70% del area principal en Modo Avatar
- Mini-chat compacto: contenedor scroll — ultimos N mensajes, visible en ~30% inferior
- Controles de avatar: grupo — volumen TTS (slider), pausar avatar (toggle)
- Indicador de estado del avatar: badge — "Escuchando...", "Pensando...", "Hablando..."

**Nuevos estados:**
- **Modo Avatar - Idle:** Avatar con animacion de respiracion y parpadeo, mini-chat visible
- **Modo Avatar - Hablando:** Lip sync activo + expresion contextual, audio TTS reproduciendose
- **Modo Avatar - Escuchando:** Avatar en postura atenta, ASR activo, indicador de grabacion
- **Modo Avatar - Pensando:** Avatar con inclinacion de cabeza reflexiva, esperando respuesta de Gemini
- **Modo Avatar - Crisis:** Avatar pausado con expresion empatica, panel SOS como overlay
- **WebGL no soportado:** Toast "Tu dispositivo no soporta el modo avatar" + permanece en Modo Chat
- **FPS bajo:** Toast de advertencia + opcion de volver a Modo Chat

**Nuevas acciones:**
- Click switch "Modo Avatar" → carga lazy del modulo 3D → renderiza canvas + mini-chat
- Click switch "Modo Chat" → destruye contexto WebGL → vuelve a burbujas completas
- Ajustar volumen TTS → slider en controles de avatar
- Pausar avatar → toggle que congela la animacion pero no el audio

**Nuevas validaciones:**
- WebGL soportado: verificar `WebGLRenderingContext` antes de activar Modo Avatar
- FPS monitor: si FPS < 20 en los primeros 5 segundos, notificar y ofrecer fallback
- Tamano de modelo: verificar que el archivo VRM/GLB <= 5MB antes de cargar

### 6.2 Layout del Modo Avatar

```
+-----------------------------------------------------------+
|                    HEADER (rojo UMB)                       |
|  [=] Logo Mabel IA          [Nombre usuario] [Logout]     |
+------------+----------------------------------------------+
|            |  +----------------------------------------+  |
|  SIDEBAR   |  |                                        |  |
| (historial)|  |          AVATAR 3D DE MABEL            |  |
|            |  |    (canvas WebGL, ~70% area principal)  |  |
|            |  |                                        |  |
|            |  |   [Animacion idle / hablando /          |  |
|            |  |    lip sync con TTS / escuchando]       |  |
|            |  |                                        |  |
|            |  |        Estado: "Hablando..."            |  |
|            |  +----------------------------------------+  |
|            |  +----------------------------------------+  |
|            |  | Mini-chat (~30% inferior)               |  |
|            |  | Mabel: "Entiendo como te sientes..."    |  |
|            |  | Tu: "Hoy me siento un poco ansioso"     |  |
|            |  | ---------------------------------       |  |
|            |  | [Input texto] [Mic] [Enviar]            |  |
|            |  +----------------------------------------+  |
|            |  [Vol: ---o---] [Pausar] [Chat/Avatar] [SOS] |
+------------+----------------------------------------------+
```

---

## 7. Impacto en Base de Datos

### 7.1 Cambios al esquema

Se requieren 2 cambios minimos al esquema de BD:

**Cambio 1:** Nueva columna en `preferences`
```sql
-- Preferencia de modo de chat del usuario (chat con burbujas vs avatar 3D)
ALTER TABLE preferences ADD COLUMN preferred_chat_mode TEXT NOT NULL DEFAULT 'chat'
  CHECK (preferred_chat_mode IN ('chat', 'avatar'));
```

**Cambio 2:** Nueva columna en `sessions`
```sql
-- Indicador de si la sesion uso el modo avatar (para metricas del estudio)
ALTER TABLE sessions ADD COLUMN avatar_used BOOLEAN NOT NULL DEFAULT FALSE;
```

### 7.2 Justificacion

- `preferences.preferred_chat_mode`: Permite recordar la preferencia del usuario entre sesiones. Se restaura al iniciar una nueva sesion. DEFAULT 'chat' para que el Modo Chat siga siendo el default.
- `sessions.avatar_used`: Permite al Agente 13 (Research) analizar si el uso del avatar correlaciona con mejores resultados en el estudio cuasiexperimental (SUS, bienestar percibido). Es un BOOLEAN simple, no un enum, porque lo que importa es si se uso o no (no cuanto tiempo).

---

## 8. Impacto en Tech Stack

### Nueva sección en `docs/TECH_STACK.md`: Avatar 3D y Lip Sync

| Tecnologia | Version | Justificacion |
|------------|---------|---------------|
| @react-three/fiber | >=8.15 | Renderizado 3D declarativo integrado con React 18. Permite embeber un canvas WebGL como componente React con lazy loading via `React.lazy()` + `Suspense`, alineado con la arquitectura SPA existente. |
| @react-three/drei | >=9.88 | Coleccion de helpers para R3F: `OrbitControls` (camara), `Environment` (iluminacion), `useGLTF` (carga de modelos). Reduce boilerplate significativamente. |
| three | >=0.160 | Motor WebGL subyacente. Requerido por R3F. Version 0.160+ por mejoras en WebGL2 y compatibilidad con VRM 1.0. |
| @pixiv/three-vrm | >=3.0 | Carga y animacion de modelos VRM (estandar abierto de Pixiv). Incluye `VRMExpressionManager` con blend shapes nativos para lip sync (aa, ee, ih, oh, ou) y expresiones faciales (happy, sad, neutral, surprised, relaxed). Eliminado de dependencia de SDKs propietarios como ReadyPlayerMe. |
| Web Audio API | (nativa) | API nativa del navegador para analisis de frecuencia de audio en tiempo real. `AnalyserNode` con FFT permite distinguir las 5 formas vocalicas basicas para lip sync sin latencia adicional ni procesamiento backend. |

### Nueva ADR #14

**ADR #14 — Lip sync via Web Audio API + three-vrm (no backend processing)**

Se elige realizar el lip sync **completamente en el frontend** mediante analisis de frecuencia de audio (Web Audio API `AnalyserNode`) mapeado a los 5 blend shapes vocalicos del estandar VRM, en lugar de opciones que requieran procesamiento backend (rhubarb-lip-sync, modificaciones a Piper TTS). Razones: (a) cero impacto en latencia — el analisis ocurre en tiempo real mientras el audio se reproduce, sin agregar milisegundos al turno, (b) cero cambios backend — Piper TTS sigue generando solo audio, sin modificaciones al endpoint ni al pipeline, (c) cero servicios Docker nuevos — no se agrega rhubarb-lip-sync ni ningun otro contenedor, manteniendo la simplicidad operativa para 3 estudiantes, (d) el estandar VRM con @pixiv/three-vrm es open-source y no depende de servicios cloud (ReadyPlayerMe), alineado con el principio de operacion 100% local del MVP, (e) la calidad del lip sync basado en frecuencia es suficiente para la evaluacion de tesis — los evaluadores verifican sincronizacion visual, no precision fonetica. Ruta de mejora documentada: si se requiere precision fonetica post-MVP, se puede agregar rhubarb-lip-sync como fuente alternativa de visemas sin cambiar el componente React ni los blend shapes.

---

## 9. Estimaciones

### 9.1 Tamano de Bundle (impacto en frontend)

| Componente | Tamano (gzip) | Carga |
|------------|---------------|-------|
| three.js | ~150KB | Lazy (solo en Modo Avatar) |
| @react-three/fiber | ~45KB | Lazy |
| @react-three/drei | ~35KB | Lazy |
| @pixiv/three-vrm | ~25KB | Lazy |
| **Subtotal librerias** | **~255KB** | **Lazy** |
| Modelo VRM placeholder | ~3-5MB | Lazy (fetch on demand) |
| **Total Modo Avatar** | **~3.3-5.3MB** | **Solo cuando se activa** |

El Modo Chat no se ve afectado. Las librerias 3D se cargan via code splitting (Vite dynamic import) solo cuando el usuario hace click en "Modo Avatar" por primera vez.

### 9.2 Estimacion de Latencia (sin impacto)

| Etapa | Latencia actual | Latencia con avatar | Delta |
|-------|-----------------|---------------------|-------|
| ASR (faster-whisper) | 2-4s | 2-4s | 0s |
| LLM (Gemini API) | 3-10s | 3-10s | 0s |
| Guardrails (pre+post) | <100ms | <100ms | 0s |
| TTS (Piper) | 1-2s | 1-2s | 0s |
| Lip sync | N/A | En paralelo con audio | **0s** |
| **Total por turno** | **6-16s** | **6-16s** | **0s** |

### 9.3 Requisitos Minimos de Hardware del Cliente

| Componente | Requisito minimo | Recomendado |
|------------|------------------|-------------|
| GPU | Intel UHD 620 o equivalente (WebGL 2.0) | GPU dedicada (GTX 1050+) |
| VRAM | 256MB disponible | 512MB+ |
| RAM | 4GB total sistema | 8GB+ |
| Navegador | Chrome 90+, Firefox 90+, Edge 90+ | Ultima version estable |
| Resolucion | 1280x720 | 1920x1080 |

---

## 10. Riesgos y Mitigaciones

| # | Riesgo | Probabilidad | Impacto | Mitigacion |
|---|--------|--------------|---------|------------|
| 1 | WebGL no soportado en equipo del estudiante | Baja | Alto | Fallback automatico a Modo Chat con mensaje informativo |
| 2 | FPS < 30 en GPU integrada | Media | Medio | FPS monitor con threshold, reduccion automatica de calidad (sombras, AA), fallback a Modo Chat |
| 3 | Modelo VRM de la Universidad sin blend shapes correctos | Media | Alto | Documento de especificacion entregado a la Universidad con blend shapes exactos, herramienta de validacion de blend shapes |
| 4 | Lip sync no suficientemente convincente para el jurado | Baja | Alto | Ruta de mejora a rhubarb-lip-sync documentada, implementable en 1 sprint adicional |
| 5 | Tamano de bundle 3D excesivo | Baja | Bajo | Lazy loading + code splitting ya implementado. Tree-shaking de three.js. |
| 6 | Conflicto de estados entre Modo Chat y Modo Avatar | Media | Medio | Zustand store unificado para estado de conversacion, independiente del modo visual |

---

## 11. Cronograma Estimado

| Sprint | Entregable |
|--------|-----------|
| Sprint N | Componente base R3F + carga de modelo VRM + animacion idle (respiracion, parpadeo) |
| Sprint N+1 | Pipeline de lip sync (Web Audio API → blend shapes) + expresiones faciales contextuales |
| Sprint N+2 | Integracion con TTS pipeline + switch Modo Avatar/Chat + mini-chat + fallback WebGL |
| Sprint N+3 | Benchmarks de rendimiento + optimizacion + comportamiento de crisis + tests E2E |

---

## 12. Apendice: Mapeo Frecuencia → Blend Shape

Algoritmo simplificado para el analisis de frecuencia en el frontend:

```
1. AnalyserNode obtiene frequencyData (Uint8Array, 1024 bins)
2. Calcular energia por banda:
   - low  (80-400 Hz)  → correlaciona con vocales cerradas (U, O)
   - mid  (400-2000 Hz) → correlaciona con vocales abiertas (A)
   - high (2000-4000 Hz) → correlaciona con vocales frontales (E, I)
3. Calcular amplitud general (RMS) → controla jaw open (apertura de mandibula)
4. Mapear bandas a blend shapes:
   - Si amplitud < threshold → viseme_sil (silencio)
   - Si low dominante → viseme_ou (U) o viseme_oh (O)
   - Si mid dominante → viseme_aa (A)
   - Si high dominante → viseme_ee (E) o viseme_ih (I)
5. Aplicar lerp (interpolacion lineal) para transiciones suaves (~60ms)
6. Actualizar VRMExpressionManager cada frame (requestAnimationFrame)
```

Este algoritmo es una heuristica, no una clasificacion fonetica exacta. Produce resultados visualmente convincentes porque las transiciones suaves y el timing correcto con el audio son mas importantes para la percepcion humana que la precision exacta de cada fonema.
