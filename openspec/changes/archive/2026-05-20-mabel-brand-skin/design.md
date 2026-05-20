## Design Decisions

Reference assets:
- `docs/design-references/mabel-brand-skin/prototype-tokens.css` — design tokens fuente
- `docs/design-references/mabel-brand-skin/01-chat-empty-wide.png` — chat empty home (referencia visual principal)
- Original prototype `~/Downloads/Mabel AI Psychological ChatBot/` — todos los `.jsx` (sidebar, chat, settings, crisis, screens)

### D-01: Paleta exacta del prototipo en CSS vars

**Decision:** Reemplazar completamente las CSS vars actuales (cream/warm browns ad-hoc) por las definidas en `prototype-tokens.css`. Estructura:
- `--mabel-{50..900}` (brand ramp UMB red, `mabel-600 = #A51916`)
- `--ink-{50..900}` (warm neutrals — backgrounds + text)
- `--gray-{50..700}` (cool grays para system surfaces)
- `--success-{50/200/600/700}`, `--warn-*`, `--danger-*`, `--info-*` (semantic)

**Rationale:** El prototipo encapsula la identidad UMB. Replicar literalmente.

**Critical:** **NO mantener** los aliases anteriores (`--bg`, `--bg-elevated`, etc.). Eliminar y reescribir todo el codigo que los consume para usar las vars del prototipo directamente. Migrar de `bg-[var(--bg-elevated)]` a `bg-white` o `bg-[var(--ink-50)]` segun corresponda. Este es el trabajo principal de Cap 6.1.

### D-02: Tipografia — Nunito reemplaza Fraunces

**Decision:** Eliminar `Fraunces` completamente. Cargar `Nunito` (weights 400-800) como font-family principal (`--font-sans`). Inter sigue para UI body (`--font-ui`). La utility `.font-display` se mantiene pero ahora apunta a Nunito (no Fraunces).

**Rationale:** Nunito es warm, rounded, empatica — match perfecto para salud mental psicoeducativa. Fraunces era editorial sophisticated, demasiado seria.

### D-03: Spacing 4px grid + tipografia variables

**Decision:** Adoptar el spacing del prototipo (`--space-1..13` en 4px increments) como CSS vars. NO eliminar Tailwind defaults — coexisten. Los componentes nuevos usan inline style con vars del prototipo donde sea relevante.

**Rationale:** El prototipo usa inline styles intensivamente. Replicar fielmente significa adoptar ese patron en componentes brand-critical (Composer, Sidebar items, Settings overlay, Crisis overlay). Tailwind utility classes siguen para layout estructural.

### D-04: Icon library — lucide + un componente Icon propio

**Decision:** Mantener `lucide-react` para la mayoria de iconos (Plus, Search, Mic, Send, Settings, etc.). Crear `components/ui/MabelLogo.tsx` que renderiza el SVG circular Mabel del prototipo (path "M16 3C8.8 3 3 8.8..." en circulo). Donde se necesite un Avatar con "M" (sidebar brand, chat avatar, login splash), usar `<MabelLogo />` o `<Avatar initials="M" />` consistente.

**Rationale:** lucide cubre 95% de iconos. Solo el logo Mabel es brand-critico y debe ser SVG propio. El resto puede mapearse 1:1 lucide → prototype name.

### D-05: Composer con arrow-right en boton circular

**Decision:** El Send button NO usa el icono `Send` (paper plane). Usa `ArrowRight` de lucide en boton circular `mabel-600`. Fondo `ink-200` cuando disabled (sin texto), `mabel-600` activo, hover `mabel-700`.

**Rationale:** El prototipo lo define asi. Mas friendly que el paper plane.

### D-06: Burbujas asimetricas con esquinas exactas

**Decision:**
- **Usuario**: `borderRadius: 18px 18px 4px 18px` (esquina inferior derecha "atada"), `background: mabel-600`, `color: white`, padding `11px 15px`, `font-size: 14.5px`, max-width `min(560px, 75%)`.
- **Asistente**: `borderRadius: 4px 18px 18px 18px` (esquina superior izquierda "atada"), `background: white`, `border: 1px solid ink-200`, `color: ink-900`, mismo padding/font, mismo max-width.

Avatar M circular 32px aparece **antes** del bubble asistente. Para usuario, NO hay avatar.

**Rationale:** Patron clasico chat empatico. Refuerza diferenciacion sin sobrecargar.

### D-07: Sidebar — "Nueva sesion" como CTA primario destacado

**Decision:** El boton "Nueva sesion" arriba del nav es rojo `mabel-600` solido, full-width, con icono `+` y texto en `font-weight: 600`. NO es un link discreto — es la accion principal del estudiante.

**Rationale:** Visible en la captura. UX clara: el camino feliz es "iniciar nueva sesion".

### D-08: SOS sticky arriba del perfil

**Decision:** El boton "Linea de crisis SOS" es un item sticky al final del flex (justo arriba del profile pill) con `background: mabel-50`, border `mabel-100`, color `mabel-700`, icono `AlertTriangle`. NO se confunde con un nav item regular. Es un **anchor de seguridad permanente**.

Este boton funciona en paralelo con el SosFab flotante (bottom-right). Ambos abren el mismo `CrisisOverlay`.

**Rationale:** Doble accesibilidad al SOS. El FAB es para emergencia desde cualquier vista; el sidebar item refuerza presencia constante.

### D-09: Profile menu (UserMenu actual)

**Decision:** Mantener el `UserMenu.tsx` que ya construimos (popover anchored al profile pill). Sus items se adaptan al prototipo:
- Header con `user.name` + `user.email`
- Configuracion (Cmd+,) -> /settings
- Perfil -> /settings?tab=account (mapeo Mabel)
- Privacidad -> /settings?tab=privacy
- Ayuda y soporte (placeholder, deferred)
- Separador
- Cerrar sesion (rojo)

**Rationale:** El prototipo y nuestro UserMenu coinciden estructuralmente. Solo se reskinea.

### D-10: Settings como overlay 1100x720 (no full-screen route)

**Decision:** Migrar `/settings` de "ruta full-screen" a **overlay modal** sobre el chat. El sidebar interno (280px ink-50) se mantiene con las 5 secciones Mabel. El area derecha tiene breadcrumb "Ajustes / {Seccion}" + X close.

**5 secciones (sin Notificaciones):**
1. **Privacidad** (Toggle save_history + Toggle checkin_enabled)
2. **Accesibilidad** (Toggle contrast + Segmented font_size + Toggle subtitles)
3. **Voz** (Toggle TTS + NativeSelect voice + Preview + Segmented chat_mode)
4. **Cuenta** (Email read-only + Cambiar contrasena form inline + Zona destructiva con Eliminar cuenta)
5. **Mis datos (ARCO)** (Ver mis datos button + Ley 1581 info text + Revocar consentimiento)

**Rationale:** Patron del prototipo. Mantiene contexto del chat detras. Permite cerrar con click fuera o X.

**Trade-off:** La ruta `/settings` sigue existiendo y abre el overlay. URL share-friendly.

### D-11: SettingsField + Toggle + Card + PrimaryButton/SecondaryButton

**Decision:** Crear primitivos especificos para Settings que matchean exactamente el prototipo:
- `SettingsField` (label + hint + children)
- `Toggle` (variante con label+hint a la izquierda + switch a la derecha + border-bottom ink-100) — **REEMPLAZA** el `Toggle` simple de Cap 1 dentro de Settings
- `Card` (padding 18, border ink-200, radius 14, bg white)
- `PrimaryButton` (mabel-600 + shadow-sm + hover mabel-700)
- `SecondaryButton` (border info-600 + color info-600)
- `Input` (con prefix icon support, focused border mabel-500 + ring-mabel, password reveal toggle)
- `SaveBar` (border-top + PrimaryButton "Guardar cambios")

Estos viven en `components/settings/primitives/` (separado de `components/ui/` que sigue siendo el design system base).

**Rationale:** Settings overlay es lo suficientemente complejo para tener sus propios primitivos. Evita over-generalizacion del design system.

### D-12: Crisis overlay con header band cream

**Decision:** Migrar `SosPanel.tsx`:
- Hero band con `background: var(--mabel-50)`, padding 32px, text-center
- Heart icon en circulo 56px white + shadow-sm
- Titulo "Estamos aqui contigo" 24px bold + subtitulo descriptivo
- Body: lineas hotline (Linea 106, Linea 141, Linea UMB Bienestar) en cards con icono phone + nombre + numero + boton "Llamar"
- Footer con boton secundario "Continuar con Mabel" (cierra overlay)

**Rationale:** Tonalidad emocional adecuada. El cream `mabel-50` es calmante, el heart icon refuerza el cuidado.

### D-13: AuthShell con gradient izquierdo

**Decision:** Para Landing, Login, Register, Consent, Onboarding: layout split:
- **Panel izquierdo** (~50%): gradient `mabel-700 → mabel-600 → mabel-800` 160deg, decorative circles radial-gradient en esquinas, branding "Mabel IA / Universidad Manuela Belt­ran" arriba con avatar M white, mensaje hero en el medio (rotativo segun pantalla), footer con lock + "Tus conversaciones son cifradas y confidenciales"
- **Panel derecho** (~50%): white bg, formulario centrado max-width 420

**Mobile**: el panel izquierdo se colapsa o queda como header reducido arriba.

**Rationale:** Da identidad UMB sin saturar. El gradient deep red comunica seriedad institucional + el formulario blanco la limpieza funcional.

### D-14: Estructura de archivos

**Nuevos:**
- `frontend/src/components/ui/MabelLogo.tsx` — SVG del prototipo
- `frontend/src/components/auth/AuthShell.tsx` — wrapper split panel
- `frontend/src/components/settings/primitives/` — SettingsField, Toggle (overload), Card, PrimaryButton, SecondaryButton, Input, SaveBar

**Modificados (muchos):**
- `frontend/src/index.css` — tokens completos del prototipo
- `frontend/src/components/layout/StudentSidebarV3.tsx`, `CollapsedSidebar.tsx`, `UserMenu.tsx`
- `frontend/src/components/chat/Composer.tsx`, `TopBar.tsx`
- `frontend/src/pages/Home.tsx`, `Chat.tsx`, `Settings.tsx`
- `frontend/src/components/sos/SosPanel.tsx`
- `frontend/src/pages/Landing.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `Consent.tsx`, `ConsentRejected.tsx`, `ConsentRequired.tsx`, `Onboarding.tsx`

### D-15: Preservacion explicita

Cualquier deviation requiere documentar en `tasks.md`. Features preserved:
- SosFab (bottom-right), crisis automatica, ASR mic pulsante, TTS auto-play+mute, subtitulos, auto-greeting, reportar mensaje + "Ya reportado", draft localStorage, send+streaming, finalizar sesion, sidebar 2 estados con Cmd+B, UserMenu popover, ?tab= deeplink
- Modales: ChangePassword, Revoke, Delete, ArcoExport, Confirm, SessionExpired, Report — props/APIs intactas

### D-16: Admin panel NO se toca

Ningun archivo bajo `pages/admin/`, `components/admin/`. AdminLayout y AdminSidebar quedan exactamente como estan.
