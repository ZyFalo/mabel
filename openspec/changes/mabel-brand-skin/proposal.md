## Why

El estudiante usuario aporta un prototipo completo (`Mabel AI Psychological ChatBot`, 2256 lineas + tokens.css 177 lineas + 7 PNGs de referencia) que define la identidad visual definitiva para Mabel/UMB. La rama actual `feat/student-redesign` tiene buena estructura (Lumen-inspired) pero la **piel** debe migrar a la del prototipo (paleta brand ramp, Nunito font, layout warmer, iconografia propia, overlays full-screen).

**Regla de oro:** se replica el diseno, estructura y colores del prototipo. Se MANTIENEN solo las opciones funcionales que Mabel YA soporta (no agregamos Notificaciones del prototipo). Cero perdida de funcionalidad. La rama es `feat/student-redesign`.

## What Changes

Aplicar la "piel Mabel-brand" del prototipo sobre la estructura ya implementada:

- **Tokens & tipografia**: migrar `index.css` a la paleta `tokens.css` del prototipo (mabel-50/900 + ink-50/900 + cool grays + semantic colors). Nunito reemplaza a Fraunces. Inter sigue para UI body.
- **Iconografia**: agregar componente `<Icon name="logo">` del prototipo (Mabel "M" en circulo) + iconografia lucide-react se conserva
- **Sidebar**: reskin para parecerse a `sidebar.jsx`: boton "Nueva sesion" rojo destacado, lista historial con clock+fecha+duracion, boton "Linea de crisis SOS" sticky arriba del perfil, profile pill que abre menu (perfil/privacidad/ayuda/cerrar sesion)
- **Chat Empty (Home)**: avatar M grande circular, greeting 32px bold "Hola, {nombre}." + subtitulo warm, composer rounded-20 con paperclip+mic+send arrow, suggestion chips pills, footer con lock + "Conversaciones cifradas - Mabel no reemplaza atencion profesional"
- **Chat Active**: header con titulo de sesion + badge "Activa" verde + voice/more buttons; burbujas asimetricas con esquinas exactas (user `18 18 4 18`, assistant `4 18 18 18`); composer con arrow-right
- **Settings**: overlay 1100x720 con sidebar interno 280px + breadcrumb + 5 secciones Mabel (Privacidad, Accesibilidad, Voz, Cuenta, Mis datos ARCO). Toggle bar style, Card boxes, PrimaryButton/SecondaryButton, Zona destructiva con bg danger-50.
- **Crisis (SOS) overlay**: hero band rojo con heart icon + "Estamos aqui contigo" 24px + lineas hotline + boton "Continuar con Mabel"
- **Auth + Onboarding**: AuthShell con panel izquierdo gradient `mabel-700→600→800` + decorative circles + branding Mabel UMB + lock badge footer; panel derecho con formulario blanco

## Capabilities

### New Capabilities

- `tokens-and-typography` — index.css migrado a paleta prototype + Nunito font + animations conservadas
- `sidebar-skin` — StudentSidebarV3 + CollapsedSidebar reskin completo (Nueva sesion rojo, historial con clock, SOS sticky, profile menu)
- `chat-skin` — Home.tsx + Chat.tsx + Composer reskin (avatar M grande, burbujas asimetricas, suggestion chips, session header con badge Activa)
- `settings-overlay` — Settings.tsx migrado a overlay full-screen 1100x720 con sidebar interno + breadcrumb + 5 secciones Mabel (sin Notificaciones)
- `crisis-overlay` — SosPanel.tsx reskin (header band rojo, heart icon, lineas hotline en cards, continuar con Mabel button)
- `auth-onboarding-skin` — AuthShell con gradient izquierdo + branding + 7 pantallas (Landing, Login, Register, Consent x3, Onboarding x3) restyled

## Impact

- **Frontend**: ~20 archivos modificados + 1 archivo nuevo (`components/ui/Icon.tsx` con Mabel logo SVG)
- **Backend**: CERO cambios (endpoints, modelos, servicios intactos)
- **BD**: CERO migraciones
- **Performance**: Nunito font (~30KB woff2) reemplaza Fraunces (~25KB). Net +5KB.
- **Funcionalidad preservada al 100%**: SOS FAB + crisis automatica + check-in form + auto-greeting + ASR mic + TTS auto-play+mute + subtitulos + reportar mensaje + draft localStorage + auto-greeting + Settings 5 secciones (Privacidad, Accesibilidad, Voz, Cuenta, ARCO) + onboarding 3 pasos + todos los modales (delete/revoke/password/ARCO/confirm/sessionExpired/report) + UserMenu popover con shortcuts a tabs + Cmd+B sidebar toggle
- **Admin panel**: INTACTO. Solo cambia el lado estudiante.

## Out of Scope

- NO se agrega seccion "Notificaciones" del prototipo (Mabel no la soporta hoy)
- NO se cambia el icon set de lucide-react (solo se agrega el `<MabelLogo>` SVG del prototipo para branding)
- NO dark mode (se removio en commit anterior)
- "Buscar sesiones" sigue como placeholder visual (search real es V2)
