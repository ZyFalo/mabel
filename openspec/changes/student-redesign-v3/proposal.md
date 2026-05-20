## Why

El panel de estudiante actual de Mabel-IA es funcional pero estructuralmente plano — sidebar fija de 220px, mensajes ambos en burbujas, settings como pagina plana, sin animaciones ni jerarquia tipografica. El usuario presento un demo de referencia (`lumen-chat-demo.jsx`, estilo Claude) cuyo layout, comportamiento responsive, flujos de navegacion y animaciones aportan calidad editorial-conversacional alineada con el rol empatico de Mabel.

**Regla de oro:** este redesign es PURAMENTE visual + estructural + responsive + animaciones. CERO funcionalidad existente se elimina, se oculta ni se modifica logicamente. Todas las opciones, botones, modales y flujos actuales se preservan al 100%.

## What Changes

Replicar la estructura y comportamiento del demo Lumen, adaptado al dominio Mabel:

- **Design system v3 (foundation)**: tokens UMB migrados a CSS variables runtime-switchable, modo claro/oscuro/auto, Fraunces (titulares) + Inter (body), animaciones globales (fadeUp/fadeIn/scaleIn), primitivos UI (Toggle, Segmented, Slider, Field, NativeSelect, Markdown)
- **Sidebar estudiante**: 2 estados (272px expandido / 56px rail collapsed con tooltips), Cmd+B toggle, agrupacion temporal mantenida, footer con avatar+settings button
- **Chat redesign**: Welcome con greeting time-based + grid 2x2 sugerencias + composer integrado; composer flotante con sombra+glow, mic+mute+send dentro; burbujas asimetricas (user con bubble / assistant full-width + avatar + markdown); animations fadeUp stagger en mensajes
- **Settings redesign**: vista full-screen con tabs verticales (6 secciones existentes — sin agregar ni quitar). Reuso de primitivos UI.
- **Auth + Onboarding redesign**: Login/Register/Forgot/Reset/Consent/Onboarding con cards refinadas, Fraunces en titulares, animations de entrada

## Capabilities

### New Capabilities

- `design-system-v3` — CSS vars tokens, dark mode, fonts, animations, primitivos UI, hook useKeyboardShortcuts
- `sidebar-redesign` — StudentSidebar 2 estados + CollapsedSidebar rail + Cmd+B
- `chat-redesign` — Home, Chat, Composer, Message, TopBar, Markdown rendering, SOS preserved, ASR/TTS preserved
- `settings-redesign` — Settings.tsx tabs verticales, modales preservados (delete, revoke, ARCO, password)
- `auth-onboarding-redesign` — Landing, Login, Register, Forgot/Reset, Consent (3 variantes), Onboarding (3 pasos)

## Impact

- **Frontend**: ~15 archivos modificados + ~10 archivos nuevos (primitivos UI + Markdown + hook)
- **Backend**: CERO cambios (endpoints, modelos, servicios intactos)
- **BD**: CERO migraciones
- **Performance**: Fraunces font +1 request (~25KB woff2); animaciones puramente CSS
- **Accesibilidad**: dark mode anade compliance HU-09; tabular-nums en metricas; tooltips ARIA en rail collapsed
- **Funcionalidad preservada 100%**: SOS FAB, crisis automatica, check-in form, auto-greeting, ASR mic pulsante, TTS auto-play+mute, subtitulos word-by-word, reportar mensaje + "ya reportado" badge, finalizar sesion, historial agrupado, draft localStorage, saludo Home + 4 sugerencias, TopBar sesion, toasts, modales (password/revoke/delete/ARCO), onboarding 3 pasos, disclaimer empatico, lineas SOS — TODOS INTACTOS
- **Admin panel**: INTACTO. Solo cambia el lado estudiante. `AdminSidebar.tsx` y todas las paginas `/admin/*` quedan exactamente como estan.

## Out of Scope

- No se agregan controles que no existan en Mabel (NO accent picker, NO model selector, NO memory toggle, NO export beyond ARCO, NO idioma multi)
- Atajos de teclado limitados a los que aportan valor sin requerir backend nuevo (Cmd+B sidebar; otros deferred)
- Cmd+K busqueda de conversaciones: deferred V2 (requiere indexar mensajes)
