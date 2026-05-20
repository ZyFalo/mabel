## Design Decisions

### D-01: Tokens UMB a CSS variables runtime-switchable

**Decision:** Migrar tokens (`primary #A51916`, `accent #0F303A`, `danger #DC2626`, `success #16A34A`, `warning #F59E0B`, neutros) a CSS variables inyectadas en `<html>` via `data-theme` attribute. Tailwind utility classes usan `bg-[var(--bg-elevated)]` notation.

**Rationale:** Permite dark mode sin recompilar Tailwind, density runtime-switchable, font-size accessibility aplicable real. Patron del demo Lumen.

**Constraint:** El accent UMB (#A51916) es FIJO — no se expone al usuario. Solo cambian fondos, bordes, texto entre light/dark.

### D-02: Modo claro/oscuro/auto

**Decision:** Implementar `data-theme="light"|"dark"` en `<html>`. Auto = lee `prefers-color-scheme`. Preferencia persiste en `localStorage` (`mabel_theme`) y en `preferences.accessibility.theme` (JSONB, sin migracion porque ya es flexible).

**Paleta light:**
```
--bg              #FAFAF7   (cream calido sutil, no blanco frio)
--bg-elevated     #FFFFFF   (cards, modales)
--bg-sidebar      #F2F0EA   (sidebar cream)
--bg-hover        #ECE9DF
--bg-active       #E0DCCC
--bg-user-msg     #ECE9DF   (burbuja usuario)
--bg-code         #E0DCCC
--border          #E0DCCC
--border-subtle   #ECE9DF
--border-strong   #C5BFA8
--text            #2F2C24   (texto principal)
--text-strong     #1A1812   (titulos)
--text-muted      #5C5648
--text-faint      #85806F
--accent          #A51916   (primary UMB — fijo)
--accent-glow     rgba(165, 25, 22, 0.14)
--danger          #DC2626
--success         #16A34A
--warning         #F59E0B
```

**Paleta dark:**
```
--bg              #1F1D1A
--bg-elevated     #2A2823
--bg-sidebar      #161512
--bg-hover        #34322C
--bg-active       #423E35
--bg-user-msg     #34322C
--bg-code         #2D2B26
--border          #34322C
--border-subtle   #2A2823
--border-strong   #52493D
--text            #D4CFC1
--text-strong     #F0EBD8
--text-muted      #A09B8C
--text-faint      #7A7567
--accent          #DC4844   (rojo UMB iluminado para contraste dark)
--accent-glow     rgba(220, 72, 68, 0.20)
--danger          #EF4444
--success         #22C55E
--warning         #FBBF24
```

**Rationale:** El cream sutil light + warm brown dark mantienen la calidez emocional (vs blanco/negro frios). El accent en dark se aclara ligeramente para preservar contraste WCAG AA.

### D-03: Tipografia Fraunces + Inter

**Decision:** Fraunces solo en titulares (h1, h2 grandes, greetings, logo wordmark) en pesos 300-500, opsz variable. Inter para body, controles, navegacion. Cargar via Google Fonts inline en `<style>` con `display: swap`.

**Rationale:** Inter ya esta en el proyecto (usado actualmente). Fraunces aporta calidez editorial italic en greetings ("Buenos dias, Andrea") sin reemplazar la sans body. ~25KB extra woff2.

### D-04: Sidebar 2 estados

**Decision:** `StudentSidebar.tsx` admite `open` boolean prop. `open=true` → 272px con conversaciones agrupadas, footer expandido. `open=false` → 56px rail con iconos verticales + tooltips ARIA. Transicion `transition-[width] 300ms ease-out`.

Estado persiste en `localStorage` (`mabel_sidebar_open`). Atajo Cmd+B/Ctrl+B toggle.

**Responsive:**
- Desktop (>1024px): default open, manual toggle
- Tablet (640-1024): default collapsed
- Mobile (<640): sidebar como drawer con backdrop oscuro; toggle abre/cierra full overlay

**Rationale:** Patron del demo. Responsive natural sin breakpoints inventados. Cmd+B es atajo industria.

### D-05: Burbujas asimetricas

**Decision:**
- **Usuario:** burbuja con `bg-user-msg`, alineada a la derecha, `rounded-2xl rounded-br-md`, max-width 80% desktop / 85% tablet / 90% mobile
- **Asistente:** SIN burbuja. Full-width (con max constraint del container). Avatar circular pequeño (28px) a la izquierda mostrando logo Mabel. Texto renderizado con `<Markdown>` component custom. Acciones (Copy, Refresh, Reportar, badge "Ya reportado") aparecen en `opacity-0 group-hover:opacity-100` bajo el contenido.

**Rationale:** Patron del demo Lumen. Mejora legibilidad de respuestas largas (sin caja restringiendo). Mantiene la diferenciacion user/assistant clara.

**Critical:** Las acciones por mensaje (reportar, etc.) NO se pierden — solo cambian su trigger a hover.

### D-06: Composer flotante

**Decision:** `Composer` component es una card con `bg-elevated + border + rounded-[22px] + shadow-sm`. Focus: `focus-within:border-accent/60 + shadow-glow`. Estructura interna:
- Textarea expansivo (auto-grow max 200px)
- Bottom row con 3 grupos:
  - Izquierda: boton mic ASR (con borde pulsante rojo cuando recording, sin cambios funcionales), boton mute TTS toggle
  - Centro: vacio o herramientas futuras
  - Derecha: boton Send (bg-accent, disabled cuando empty o streaming)
- Disclaimer "Mabel es psicoeducativa..." inmediatamente debajo en `text-faint text-[11px]`

**Critical:** El boton SOS NO va aqui — se mantiene como FAB flotante absoluto en bottom-right (su posicion actual). El composer no lo absorbe.

### D-07: Markdown rendering custom

**Decision:** Crear `components/ui/Markdown.tsx` (~60 lineas, sin libreria externa). Soporta:
- `**bold**` → `<strong>` con `text-strong`
- `` `code` `` → `<code>` con `bg-code text-accent`
- Listas numeradas (`1. item`) con numero accent + `flex gap-3`
- Listas no ordenadas (`- item`) con bullet accent
- Parrafos separados por `\n\n`
- Links `[text](url)` → `<a target="_blank">` (defensivo: solo http/https)

**Rationale:** Gemini ya devuelve estos formatos. Renderizarlos plain es desperdicio. Sin libreria externa evita bundle bloat.

### D-08: Settings full-screen con tabs verticales

**Decision:** `/settings` deja de ser una pagina con secciones apiladas y se convierte en una vista con:
- Header altura 48px con titulo "Configuracion" y X (cierra/vuelve)
- Sidebar interno 220px en desktop con tabs verticales; en mobile/tablet tabs horizontales arriba con scroll-x
- Content area scrolleable derecha con `max-w-2xl` centrado

**Secciones (las que ya existen en Mabel — NO se agregan ni quitan):**
1. Privacidad (save_history, checkin_enabled)
2. Accesibilidad (subtitulos, contraste, font_size)
3. Voz (TTS toggle, voice selector, preview)
4. Cuenta (email, cambiar password, revocar consent, eliminar cuenta)
5. Mis datos / ARCO (export json/csv, info Ley 1581)
6. (opcional) Apariencia: tema claro/oscuro/auto (NUEVO controlador para D-02)

**Rationale:** Patron del demo. Mejor organizacion vs pagina plana. Mantenemos TODA la funcionalidad actual.

### D-09: Animaciones globales

**Decision:** Agregar a `index.css`:
```css
@keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
@keyframes scaleIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
@keyframes streamingPulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
.fade-up { animation: fadeUp 0.4s ease-out backwards; }
.fade-in { animation: fadeIn 0.2s ease-out; }
.scale-in { animation: scaleIn 0.22s cubic-bezier(0.16,1,0.3,1); }
```

Aplicar:
- Mensajes nuevos: `fade-up` con `style={{ animationDelay: ${i*30}ms }}` (stagger)
- Welcome → Chat: `fade-in`
- Modales: `scale-in`
- Streaming cursor: `bg-accent w-[7px] h-[15px] animate-pulse`

**Critical:** Respetar `prefers-reduced-motion: reduce` → animations off.

### D-10: Primitivos UI nuevos

**Decision:** Crear en `components/ui/`:
- `Toggle.tsx` — switch animado (replace del `<input type="checkbox">` actual)
- `Segmented.tsx` — button group icon+label
- `Slider.tsx` — range custom con track + glow
- `Field.tsx` — wrapper label+description+control (horizontal y vertical)
- `NativeSelect.tsx` — select con ChevronDown custom
- `Markdown.tsx` — renderer minimo
- `KbdShortcut.tsx` — opcional, para mostrar atajos

Los componentes ya existentes (`Toast`, `ConfirmModal`, `Skeleton`, `EmptyState`, `SessionExpiredModal`, `ConnectionError`, `SosFab`) se MANTIENEN. Si necesitan re-style se ajusta visual mente sin romper API.

### D-11: Hook useKeyboardShortcuts

**Decision:** Crear `hooks/useKeyboardShortcuts.ts` que registra:
- `Cmd/Ctrl + B` → toggle sidebar
- `Cmd/Ctrl + ,` → abrir/cerrar Settings (cuando este implementado el patron full-screen)
- `Esc` → cerrar Settings overlay (no toca SOS — SOS tiene su propio handler)

**Critical:** Esc NO debe cerrar el SOS panel automaticamente (decision PO existente de Fase 4).

### D-12: Responsive breakpoints

**Decision:** Mantener los breakpoints Tailwind default (`sm 640`, `md 768`, `lg 1024`, `xl 1280`). Patrones:
- Mobile-first siempre
- Sidebar: drawer overlay en `<md`, fixed-collapsed en `md-lg`, fixed-open en `>lg`
- Composer width: full minus padding en mobile, `max-w-3xl mx-auto` en desktop
- Settings tabs: horizontal scroll en `<md`, vertical en `>=md`
- Welcome grid sugerencias: 1 columna en `<sm`, 2 columnas en `>=sm`
- Burbujas: max-w 90/85/80% en mobile/tablet/desktop

### D-13: Preservacion explicita de features

**Cualquier deviation de los archivos siguientes requiere documentar en `tasks.md`:**

Critical features preserved:
- `SosFab.tsx` — posicion bottom-right, color #DC2626, 56px circle. INTACTO.
- `SosPanel.tsx` — modal con lineas de ayuda. Estilizado con scale-in pero logica intacta.
- Crisis automatica (`riskDetected` → `stopTts() + stopSubtitles() + setShowSos(true)`). INTACTO.
- Boton microfono con `animate-pulse border-[#DC2626]` cuando recording. INTACTO logica, reposicionado dentro del composer.
- Boton mute TTS dentro del composer (no fuera). INTACTO logica.
- Subtitulos: spans en burbuja del asistente con `bg-primary/20`. INTACTO sobre el nuevo render asistente full-width.
- Reportar mensaje: ahora aparece en hover dentro de las acciones del mensaje asistente (no como icono permanente). Funcionalidad y modal INTACTOS.
- Badge "Ya reportado": se mantiene como label visible bajo el mensaje.
- Auto-greeting (`POST /sessions/:id/greeting`): logica intacta; renderiza en la primera burbuja asistente.
- Check-in (#09): formulario intacto, restilizado con primitivos nuevos (Slider para mood, Segmented para focus, etc.).
- Onboarding 3 pasos: rutas intactas, restilizado.
- Todos los modales (delete, revoke, ARCO, password): logica intacta, scale-in en mount.
- Toast notifications: logica intacta, restilizado.
- TopBar con "Finalizar sesion": logica intacta, reubicado.
- Disclaimer "Mabel es psicoeducativa, no reemplaza profesional": reubicado al footer del composer.

### D-14: Admin panel NO se toca

**Decision:** Todos los archivos bajo `frontend/src/pages/admin/`, `frontend/src/components/admin/` quedan EXACTAMENTE como estan. AdminLayout, AdminSidebar, todas las paginas admin son independientes y no consumen los nuevos primitivos en V3.

**Rationale:** El usuario confirmo que le gusta el admin actual. Si en el futuro se decide migrar, sera otra capability separada.

### D-15: Estructura de archivos

**Nuevos (10):**
- `frontend/src/components/ui/Toggle.tsx`
- `frontend/src/components/ui/Segmented.tsx`
- `frontend/src/components/ui/Slider.tsx`
- `frontend/src/components/ui/Field.tsx`
- `frontend/src/components/ui/NativeSelect.tsx`
- `frontend/src/components/ui/Markdown.tsx`
- `frontend/src/components/layout/StudentSidebarV3.tsx` (reemplaza `Sidebar.tsx` cuando este completo)
- `frontend/src/components/layout/CollapsedSidebar.tsx`
- `frontend/src/components/chat/MessageAssistant.tsx` (nuevo render asistente)
- `frontend/src/components/chat/Composer.tsx` (extraido de Chat.tsx)
- `frontend/src/hooks/useKeyboardShortcuts.ts`
- `frontend/src/hooks/useTheme.ts` (light/dark/auto)

**Modificados (~15):**
- `frontend/src/index.css` (CSS vars + fonts + animations)
- `frontend/src/App.tsx` (data-theme prop, useTheme hook)
- `frontend/src/components/layout/StudentLayout.tsx` (usar nuevo sidebar)
- `frontend/src/components/layout/Header.tsx` (refinado)
- `frontend/src/pages/Home.tsx` (Welcome time-based + grid)
- `frontend/src/pages/Chat.tsx` (composer extraido + render asimetrico)
- `frontend/src/pages/CheckIn.tsx` (primitivos nuevos)
- `frontend/src/pages/Settings.tsx` (tabs verticales)
- `frontend/src/pages/Onboarding.tsx` (restyle 3 pasos)
- `frontend/src/pages/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `Landing.tsx`, `Consent.tsx`, `ConsentRejected.tsx`, `ConsentRequired.tsx` (restyle)
- `frontend/src/components/ui/Toast.tsx`, `ConfirmModal.tsx`, `SosFab.tsx`, `SessionExpiredModal.tsx` (restyle con nuevos tokens, API intacta)
- `frontend/src/components/sos/SosPanel.tsx` (scale-in + restyle)
- `frontend/src/components/chat/ReportModal.tsx` (restyle)
- `frontend/src/components/settings/*Modal.tsx` (4 modales — restyle)
- `tailwind.config.ts` (extender con safelist para `var(--*)` arbitrary values si Tailwind v4 lo requiere)
