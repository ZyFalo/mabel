# Catálogo de Componentes Frontend — Mabel IA

> **Estado**: alineado al 2026-05-24 · commit `899bd44`
> **Fuente de verdad**: este archivo + `frontend/src/components/*` + `frontend/src/hooks/*`
> **Para qué interfaz usa qué componente**: ver `docs/INTERFACES_MVP.md`.

Este documento describe **todos** los componentes React del frontend de Mabel IA — qué hacen, qué props aceptan, qué stores/hooks consumen y, cuando aplica, qué decisiones no-evidentes se preservan. Está dirigido a una IA externa que solo consume documentación: no se asume acceso al código.

## Convenciones

- **Stack**: TSX + TypeScript estricto, React 18, Vite, React Router v6, Zustand, TailwindCSS v4, Axios, lucide-react para iconografía, Recharts para charts admin.
- **Estilo**: una mezcla de Tailwind atómicas + estilos inline con design tokens `var(--mabel-600)`, `var(--ink-900)`, `var(--success-600)`, etc. La paleta vive en CSS globals (no hay un archivo `tokens.ts`).
- **Estado local**: `useState` / `useRef`. **Estado global**: 5 Zustand stores (sin persistencia salvo `mabel_token` / `mabel_user` / `mabel_sidebar_open` / `mabel_tts_muted` / `mabel_draft` en `localStorage`).
- **Side effects**: hooks personalizados encapsulan polling, recording, TTS y atajos; no llamar `useEffect` directo en páginas si existe un hook que ya lo hace.
- **Accesibilidad**: ARIA `role`, `aria-label`, `aria-expanded`, navegación por teclado (Esc, ↑↓ Enter, Tab) y `aria-live="polite"` para regiones que cambian en tiempo real son obligatorios — varios componentes documentan el fix de a11y del audit 2026-05-24.
- **Idioma**: todo string visible está en español (es-CO). Identificadores TS en inglés.
- **Iconografía**: `lucide-react`. Tamaño habitual 14–18 px, `strokeWidth` por defecto.

## Inventario por categoría

### Layout (`components/layout/`)

#### `Header.tsx`
Encabezado rojo `bg-primary` 56 px de altura usado **solo legacy** — `StudentLayout` lo abandonó por el sidebar; queda como mini-shell para mostrar branding + nombre de usuario + Salir.

```ts
interface HeaderProps {
  onToggleSidebar?: () => void
  showHamburger?: boolean
}
```

Consume `useAuthStore()` (`user`, `logout`). Sin hooks externos. Renderiza `null` si no hay user. Pinta un badge "Admin" cuando `user.role === 'admin'`.

#### `StudentLayout.tsx`
Layout maestro del estudiante: sidebar fija/colapsable a la izquierda (220 px expand / 60 px collapse, drawer 272 px en mobile), `<Outlet />` en el centro y dos modales globales (`SosPanel`, `Settings`) anclados al layout.

Provee vía `<Outlet context={{ openCrisis, openSettings }} />` el tipo `StudentOutletContext`:

```ts
interface StudentOutletContext {
  openCrisis: () => void
  openSettings: (tab?: TabId) => void
}
```

Comportamiento no-evidente:
- **Lazy session**: el botón "Nueva sesión" del sidebar **no crea sesión en backend** — solo navega a `/home`. La sesión nace al primer submit (Chat) o al check-in.
- **Sidebar state** persistido en `localStorage` (`mabel_sidebar_open`) — el render inicial lee sync para no flickear collapse→open al recargar.
- **Mobile drawer**: backdrop oscuro, drawer translateX, atajo `Cmd+B` toggle vía `useKeyboardShortcuts`.
- **Hamburger flotante** solo aparece en mobile (`< 768 px`) cuando el drawer está cerrado.
- `SosPanel` y `Settings` viven aquí (no en cada page) para que la página debajo no se desmonte cuando el modal se abre.

#### `StudentSidebarV3.tsx`
Sidebar real. Soporta variante desktop (toggle expand/collapse animado 280 ms) y `mobileDrawer={true}` (siempre 268 px, sin toggle, `translateX`).

```ts
interface StudentSidebarV3Props {
  open: boolean
  onToggle: () => void
  onNewChat?: () => void
  onOpenSettings?: (tab?: TabId) => void
  onOpenCrisis?: () => void
  mobileDrawer?: boolean
}
```

Estructura: brand row (UmbAvatar 32 + "Mabel · UMB · Bienestar"), CTA "Nueva sesion", `SidebarItem` (Buscar, Conversaciones), lista de sesiones agrupada por `groupByDate` (Hoy, Ayer, Esta semana, Hace 30 dias, Anteriores), profile pill con `UserMenu` flotante hacia arriba, y un toggle flotante circular `right: -12px`.

`SessionRow` (componente local): renderiza cada sesión con título derivado de `topic_hint || \`Sesión {hora}\``, menú 3-puntos con dos acciones aprobadas por el agente ético — **"Quitar de mi barra lateral"** (`PATCH /sessions/:id/hide`, soft hide) y **"Eliminar definitivamente"** (lanza `ConfirmDeleteSessionModal`).

Consume `useChatStore` (`sessions`, `loadSessions`, `isLoadingSessions`, `saveHistoryEnabled`), `usePreferencesStore`, `useAuthStore`, `useToastStore`. Carga sesiones al mount.

Cuando `historyEnabled === false` muestra estado "Historial desactivado" con CTA hacia `openSettings`.

#### `UserMenu.tsx`
Popover anclado encima del profile pill del sidebar. Cierra con Esc, click fuera o selección.

```ts
interface UserMenuProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  onOpenSettings?: (tab?: TabId) => void
}
```

Lista hardcoded `ENTRIES`: Configuración (default tab, atajo `⌘,`), Perfil (`account`), Privacidad (`privacy`), Ayuda y soporte (disabled), divider, Cerrar sesión (color `mabel-700`). Consume `useAuthStore`. **Prop drilling intencional** de `onOpenSettings` porque el sidebar es hermano del `<Outlet />` y `useOutletContext` no llega aquí.

### Chat (`components/chat/`)

#### `Composer.tsx`
Caja de input principal del chat. Card blanca, border-ink-200 (focused mabel-300 + ring-mabel), radius 20.

```ts
interface ComposerProps {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  isRecording?: boolean
  onMicToggle?: () => Promise<void> | void
  isProcessingAudio?: boolean
  ttsEnabled?: boolean
  isMuted?: boolean
  onMuteToggle?: () => void
  placeholder?: string
  maxLength?: number      // default 2000
  showHint?: boolean
  autoFocus?: boolean
  compact?: boolean       // single-row layout para landing/Home
}
```

Detalles preservados verbatim:
- **Mic ASR pulsante** con `2px solid #DC2626` + `animate-pulse` mientras `isRecording`.
- **Mute TTS** solo si `ttsEnabled && onMuteToggle`.
- **Enter envía, Shift+Enter nueva línea**.
- Auto-grow del textarea hasta `MAX_TEXTAREA_HEIGHT = 200`.
- Char-counter inline solo cuando `value.length > maxLength - 100`.
- Variant `compact`: single-row con textarea + send circular pegado al borde derecho — el card crece vertical si el textarea wrappa.

#### `TopBar.tsx` (`ChatTopBar`)
Barra superior 48 px del chat activo. Solo "Mabel IA" (font-display itálica) + opcional `sessionInfo` + botón link "Finalizar sesión".

```ts
interface ChatTopBarProps {
  onEndSession: () => void
  sessionInfo?: string
}
```

#### `HeartRating.tsx`
Banner sobre el chat de una sesión cerrada con 1–5 corazones. Idempotente: `PUT /sessions/:id/rating` UPSERT vía UNIQUE(session_id, user_id). El estudiante puede cambiar la calificación cuantas veces quiera. Optimistic update con rollback si falla.

```ts
function HeartRating({ sessionId }: { sessionId: string })
```

Carga inicial cancellation-safe (flag `cancelled` para descartar respuestas tardías). Consume `useToastStore` (success/error).

#### `LlmStatusChip.tsx`
Píldora que muestra `LlmStatus` ('warm' | 'cold' | 'down' | 'unknown'). **Es un `<button>` toggle con popover-on-click** (fix a11y audit 2026-05-24 — antes era `<span title>` invisible en móvil/AT). El popover tiene `role="dialog"` y se cierra con Esc o click fuera.

```ts
interface LlmStatusChipProps { status: LlmStatus }
```

Animación `blink 1.6s` del dot solo en estados `cold` y `unknown`. Detail copy fija para cada estado en `PRESETS` (verde/amber/rojo/gris).

#### `StreamingIndicator.tsx`
Indicador "Mabel está pensando" con texto progresivo. Variants:
- `card` — burbuja completa con dots animados + texto (welcome view).
- `inline` — solo dots + texto, para usar dentro de otra burbuja.

```ts
interface StreamingIndicatorProps {
  elapsedSeconds: number
  hasFirstToken?: boolean
  variant?: 'card' | 'inline'
}
```

El texto viene de `streamingStatusText(elapsedSeconds, hasFirstToken)` (utils/streamingStatus.ts). El `<span>` lleva `aria-live="polite" aria-atomic="true"` para anunciar el cambio de threshold sin double-speak.

#### `ReportModal.tsx`
Modal full-screen para reportar un mensaje. Motivos: `hallucination | harmful | privacy | low_empathy | other`. Severidad opcional 1–5 con etiquetas/descripciones de `utils/severity.ts`. Details opcional 1000 chars. POST `/messages/:id/reports` — 409 = ya reportado, `onReported(messageId)` igualmente.

```ts
interface ReportModalProps {
  messageId: string
  onClose: () => void
  onReported: (messageId: string) => void
}
```

#### `CheckinContextPopover.tsx`
Botón "i" en la TopBar de chat que abre un popover 320 px con el snapshot del check-in inicial: mood (1–10), energy (1–4), stress (1–4), sleep (calidad + horas opcional), loneliness (1–4), focus (chips multi-select), focus_other libre, nota libre. Calcula "hace N min/h/día" desde `completedAt || startedAt`.

```ts
interface CheckinContextPopoverProps {
  payload?: Record<string, unknown> | null
  completedAt?: string | null
  startedAt?: string | null
}
```

Vacío (sin check-in) → invita a "Activar check-in en Ajustes" vía `openSettings('privacy')` del Outlet context. Cierra con Esc o click fuera. Catálogos compartidos con `CheckIn.tsx` / `SessionDetail.tsx` vía `constants/checkin.ts`.

#### `ConfirmDeleteSessionModal.tsx`
Modal de hard-delete (pattern del agente ético: input obligatorio "CONFIRMAR"). Auto-focus al input. Click backdrop cierra (a menos que esté submitting). Esc cierra. Botón rojo solo activo si el texto match exacto case-insensitive.

```ts
function ConfirmDeleteSessionModal({
  open, sessionTitle, onCancel, onConfirm, submitting
}: {
  open: boolean
  sessionTitle: string
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
})
```

#### `SessionSearchModal.tsx`
Spotlight estilo Claude. Atajos: ↑/↓ navegar, Enter abrir, Esc cerrar. Filtra sesiones por `topic_hint` o fecha formateada, normaliza diacritics (`día` ≈ `dia`). `MAX_RESULTS = 24`. Cada fila muestra título + bucket relativo (`Hoy`, `Ayer`, `Esta semana`, `Este mes`, fecha completa). Scroll into view de la fila activa.

```ts
interface SessionSearchModalProps {
  open: boolean
  onClose: () => void
  sessions: Session[]
}
```

#### `SuggestionChip.tsx`
Pill button blanca con icono Lucide y label, hover mabel-50 bg + mabel-300 border + mabel-700 text. Usada en el Home para los prompts sugeridos.

```ts
interface SuggestionChipProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}
```

### Voice (`components/voice/`)

#### `MabelAvatar.tsx`
Avatar 2D ilustrado. Renderiza un PNG base estático (`/avatar/mabel-figure-clean.png`, 350×649) + un SVG overlay con cejas, ojos y boca animados según `state`. Coords hardcoded para el espacio del PNG.

```ts
export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

interface MabelAvatarProps {
  state?: AvatarState
  size?: number   // sin size → ocupa 100% del padre manteniendo aspect-ratio
}
```

Estados:
- `idle` — cejas curvas, ojos redondos.
- `listening` — ojos achicados verticalmente (`ry: 2.5`).
- `thinking` — ojos arriba (`cy: 180`), cejas arriba, boca cerrada.
- `speaking` — keyframe `mouth-talk 0.32s infinite alternate`.
- `error` — filtro `grayscale(0.55) opacity(0.78)` + cejas en V.

#### `ReactiveRings.tsx`
Indicador visual encima de `MabelAvatar`. Por estado:
- `listening` → badge flotante con `Ear` pulsando + halo verde.
- `thinking` → badge con `Loader2` rotando + halo amber.
- `speaking` → 3 anillos rojos concéntricos `ring-out 1.8s infinite` con delays 0/0.6/1.2 s (efecto "ondas de voz").
- `idle`/`error` → solo halo respirando.

```ts
interface ReactiveRingsProps { state: AvatarState }
```

`AudioLines` se importa pero se usa solo como referencia para posible regresión al patrón badge en speaking.

### SOS (`components/sos/`)

#### `SosPanel.tsx` (alias `CrisisOverlay`)
Modal overlay full-screen con líneas de crisis. Único modal SOS — disparado por `SosFab`, `SosButton` del header de cada page, y `Chat.tsx` cuando hay `riskDetected`.

```ts
interface SosPanelProps {
  open: boolean
  trigger: 'manual' | 'auto'
  sessionId?: string
  onClose: () => void
}
```

Al abrir: `GET /system-config/sos` para hotlines (fallback hardcoded: ICBF 106, Línea 141), + `POST /safety-events` con `event_type=redirect_shown`, `payload.trigger`, `payload.lines_shown`, `session_id`. Las hotlines se renderean como cards con botón "Llamar" → `tel:` link. Botón "Continuar con Mabel" cierra sin finalizar la sesión.

### Admin (`components/admin/`)

#### Layout

##### `AdminLayout.tsx`
Layout admin: `AdminSidebar` fija 220 px + `<main>` con `<Outlet />`. Arranca `useAdminStore().startPolling()` en mount, lo detiene en unmount. Cierra mobile drawer al cambiar `location.pathname` y con Esc.

Detalle crítico: tanto el contenedor flex como el `<main>` llevan `min-h-0` — sin esto, en columnas flex un item con `overflow-y-auto` no clipea y el body entero se hace scrollable, lo que hace que el sidebar "se deslice fuera de la pantalla".

##### `AdminHeader.tsx`
Barra superior 64 px con:
- Hamburger mobile (display:none en desktop, mostrado por CSS @media en `<768px`).
- Breadcrumb: "Panel administrativo › {Sección} › {Detalle}" — `getBreadcrumb(pathname)` mapea cada ruta a su trail. Crumbs intermedios son botones clickables; el último es plain text con `aria-current="page"`.
- Pill de usuario con iniciales en chip `mabel-100`, display name, badge "Admin" + botón logout.

##### `AdminSidebar.tsx`
Sidebar oscura `var(--ink-900)`, 220 px fija. 3 grupos:

```
Operación: Dashboard · Safety events (badge) · Reportes (badge)
Datos:     Métricas · Calificación empatía · Usuarios
Sistema:   Configuración · Logs
```

Badges leen `pendingReports` y `activeSafetyEvents` del `useAdminStore`. Active item: `bg mabel-600`, border-left `mabel-300` 3 px, padding-left 7. Footer: profile pill con email enmascarado (`maskEmail`: `a***@dominio`).

#### Primitivos de tabla / filtros / paginación

##### `DataTable.tsx`
Tabla genérica con sort por columna (click header) y filas expandibles.

```ts
interface DataTableColumn<T> {
  key: string
  header: string
  sortable?: boolean
  accessor: (row: T) => ReactNode
  className?: string
  sortValue?: (row: T) => string | number | null | undefined
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey?: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  renderExpanded?: (row: T) => ReactNode
  loading?: boolean
  emptyMessage?: string  // default "Sin resultados"
  toolbar?: ReactNode
}
```

Sort cíclico: none → asc → desc → none. Expanded rows con caret `▸/▾`. Maneja loading + empty internamente.

##### `FilterBar.tsx`
Wrapper card para grupos de filtros. Slot `children` para los controles + opcional botón "Limpiar filtros" en el lado derecho con icono X. Tag uppercase opcional `title` arriba.

```ts
interface FilterBarProps {
  children: ReactNode
  onReset?: () => void
  title?: string
}
```

##### `Pagination.tsx`
Paginación con selector de page size (default `[10, 20, 50]`) y "Mostrando N – M de T". Botones Anterior/Siguiente disabled al borde. Maneja `total === 0` correctamente.

```ts
interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  pageSizeOptions?: number[]
}
```

##### `MetricCard.tsx`
KPI card 16 px padding, label uppercase 10 px + value grande. Soporta `threshold` (green/yellow/red, dot + value color), `trend` (up/down/neutral con SVG inline), `badge` y `hint`. `info` renderiza un `InfoHint` next to the label. Cuando `onClick` se pasa, el container es `<button>` con hover border `mabel-300` + shadow brand.

```ts
interface MetricCardProps {
  label: string
  value: string | number
  threshold?: 'green' | 'yellow' | 'red'
  trend?: 'up' | 'down' | 'neutral'
  badge?: string
  hint?: string
  info?: string
  onClick?: () => void
}
```

##### `InfoHint.tsx`
Badge "i" circular 13/16 px con tooltip on hover/focus/click. Implementado como `<span role="button">` (NO `<button>`) para evitar nesting de `<button>` cuando se monta dentro de `<MetricCard>` que ya es button. Esc dismiss. Auto-flip al borde izquierdo si overflow del viewport.

```ts
interface InfoHintProps {
  text: string
  large?: boolean
  className?: string
}
```

#### Acciones de lifecycle de usuarios

##### `BulkActionModal.tsx`
Confirma acciones multi-usuario desde `/admin/users`: `disable | enable | delete`. Calcula preview client-side de eliminables vs skipped (admins, ya en estado, must-disable-first).

```ts
interface BulkActionUser {
  id: string
  email_masked: string
  display_name?: string | null
  role: string
  disabled_at: string | null
}

interface BulkActionResponse {
  action: 'disable' | 'enable' | 'delete'
  applied: number
  skipped_admin: string[]
  skipped_already_state: string[]
  skipped_must_disable_first: string[]
  not_found: string[]
}

interface BulkActionModalProps {
  open: boolean
  action: 'disable' | 'enable' | 'delete'
  selected: BulkActionUser[]
  onClose: () => void
  onApplied: (response: BulkActionResponse) => void
}
```

Reglas:
- `disable`: requiere `reason` ≥ 10 chars. Skip admins + ya disabled.
- `enable`: reverso. Skip admins + ya activos.
- `delete`: solo en disabled. Requiere tipear `CONFIRMAR` verbatim.

Tres paletas (`PALETTES`) — disable/delete usan danger, enable usa success.

##### `DisableUserModal.tsx`
Modal individual para deshabilitar 1 usuario. `reason` 10–500 chars. PATCH `/admin/users/:id/disable`. Maneja 403 (cuenta admin protegida), 409 (ya disabled). Toast success.

```ts
interface DisableUserModalProps {
  open: boolean
  userId: string
  onClose: () => void
  onDisabled: () => void
}
```

##### `EnableUserModal.tsx`
Mismo patrón con paleta success. Sin textarea (low-risk reversal). Muestra `previousReason` read-only si se pasa.

```ts
interface EnableUserModalProps {
  open: boolean
  userId: string
  userLabel?: string
  previousReason?: string | null
  onClose: () => void
  onEnabled: () => void
}
```

##### `UserDetailDrawer.tsx`
Side panel deslizable que carga `GET /admin/users/:id` y muestra info clave inline sin sacar al admin de la tabla (preserva scroll/filtros/selección). Botón "Ver ficha completa" navega a `/admin/users/:id`. Esc cierra. Pattern de cancelación: `cancelled` flag por requestId para que clicks rápidos no muestren el user equivocado.

```ts
interface UserDetailDrawerProps {
  userId: string | null  // null = drawer cerrado
  onClose: () => void
}
```

#### Otros

##### `ExportCsvButton.tsx`
Botón "Exportar CSV". Hace `GET url` con `responseType: 'blob'`, descarga via anchor creado en DOM. `deriveFilename(url)` da `lastSegment-YYYY-MM-DD.csv` si no se pasa filename.

```ts
interface ExportCsvButtonProps {
  url: string
  params?: Record<string, string | number | boolean | undefined>
  filename?: string
  label?: string                 // default "Exportar CSV"
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  onError?: (message: string) => void
}
```

`sanitizeParams` elimina `undefined | null | ''` antes de mandar.

##### `charts/BarChartWrapper.tsx`
Wrapper Recharts BarChart. Tema centralizado en `chartTheme.ts`. Soporta multiples bars con stackId.

```ts
interface BarSpec { key: string; label?: string; color?: string; stackId?: string }

interface BarChartWrapperProps {
  data: Array<Record<string, unknown>>
  bars: BarSpec[]
  xKey: string
  yLabel?: string
  height?: number             // default 260
  formatXAsDate?: boolean
  formatY?: (v: number) => string
}
```

##### `charts/LineChartWrapper.tsx`
Wrapper Recharts LineChart. Soporta `referenceLine` horizontal (e.g. 20 s SLA).

```ts
interface LineSpec { key: string; label?: string; color?: string }

interface LineChartWrapperProps {
  data: Array<{ date: string; value?: number; [k: string]: unknown }>
  lines: LineSpec[]
  yLabel?: string
  referenceLine?: number
  referenceLabel?: string
  height?: number             // default 260
  xKey?: string               // default 'date'
  formatY?: (v: number) => string
}
```

##### `charts/MetricLineWithReference.tsx`
Wrapper de `LineChartWrapper` que **siempre** dibuja la línea de referencia. Conveniencia para gráficas con umbral fijo (p.ej. latencia ≤ 20 s).

##### `charts/DonutChartWrapper.tsx`
Wrapper Recharts Pie/Donut. Gate `mounted` post-effect para evitar el warning `width(-1) height(-1)` de Recharts en el primer render dentro de flex/grid. Acepta `centerLabel` y `centerSubLabel` para anotar el hole.

```ts
interface DonutDatum { name: string; value: number; color?: string }

interface DonutChartWrapperProps {
  data: DonutDatum[]
  height?: number             // default 260
  centerLabel?: string
  centerSubLabel?: string
}
```

##### `charts/chartTheme.ts`
Constantes compartidas (`CHART_PALETTE`, `CHART_AXIS_STROKE`, `CHART_GRID_STROKE`, `AXIS_TICK_STYLE`, `TOOLTIP_*_STYLE`) + `formatDateTick(date)`.

### Settings overlay (`components/settings/` + `primitives/`)

#### `ChangePasswordModal.tsx`
Modal con campos current/new/confirm + indicador de fuerza `getStrength` (4 reglas: 8+ chars, mayúscula, dígito, símbolo). Toast + `useAuthStore` no se desloguea (cambio in-place).

#### `ConfirmHideHistoryModal.tsx`
Modal del toggle "Guardar historial" → OFF. Copy verbatim del agente ético (Ley 1581 art. 4 lit. g + Decreto 1377 art. 5). Cuando `scope='solo_uso'` el backend hace **hard DELETE** en lugar de soft-hide y el copy lo refleja dinámicamente. Requiere tipear "OCULTAR" (o similar — ver source). Esc cierra.

```ts
interface Props {
  open: boolean
  scope: string | null
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
}
```

#### `DeleteAccountModal.tsx`
Confirmación de `DELETE /users/me`. Requiere tipear `ELIMINAR`. Tras éxito limpia `localStorage` y navega a `/`. Toast solo en error.

#### `RevokeConsentModal.tsx`
Dos rutas en un modal: **reduce-scope** (downgrade a `solo_uso`, mantiene la sesión) y **revoke** (`PATCH /consents/current action=revoke`, limpia auth y navega a `/consent-required`).

```ts
interface RevokeConsentModalProps {
  open: boolean
  onClose: () => void
  currentScope: string
}
```

#### `ArcoExportModal.tsx`
Modal de exportación ARCO (Ley 1581). `GET /users/me/export` formato JSON inline + opción de descargar JSON o CSV (separate endpoint `format=csv`, `responseType: 'blob'`).

#### Primitivos `primitives/`

- **`Card.tsx`** — contenedor 18 px padding, border `ink-200`, radius 14, bg blanco. Acepta `style` override (e.g. callout warn-50).
- **`Input.tsx`** — input para overlay Settings. Border focused `mabel-500` + ring glow. Slots `prefix`/`suffix`. Toggle ojo en type `password`. Error message `danger-600` debajo.
- **`PrimaryButton.tsx`** — CTA mabel-600 → mabel-700 hover. Icon slot left. 10×18 padding, radius 10, 13.5 px / 600.
- **`SecondaryButton.tsx`** — outline `info-600`, blanco bg.
- **`SaveBar.tsx`** — barra inferior con top border separador + un `PrimaryButton`. Label default "Guardar cambios".
- **`SectionHeader.tsx`** — title 22 px bold + desc 14 px ink-500. Margin-bottom 28.
- **`SettingsField.tsx`** — wrapper vertical label + control + hint opcional 12 px ink-500.
- **`SettingsNavItem.tsx`** — row del sidebar Settings con icon chip 34×34 (`ink-100` inactive / `mabel-100` active), title + subtitle, hover ink-100, active mabel-50/mabel-700.
- **`Toggle.tsx`** (settings variant) — row con label/hint izquierda y switch derecha 40×22 + thumb 18×18. Border-bottom ink-100. Soporta `disabled` (sale del tab order).

### Auth (`components/auth/`)

#### `AuthShell.tsx`
Wrapper split-panel para Login/Register/ForgotPassword/ResetPassword/Consent.

```ts
interface AuthShellProps {
  side: ReactNode               // hero copy izquierda
  children: ReactNode           // form derecha
  wide?: boolean                // max-w 640 (legal/onboarding) vs 420
  compactHero?: boolean         // left panel ~42% en vez de 50/50
}
```

LEFT (desktop only, hidden < md): gradient `mabel-700 → 600 → 800` con círculos decorativos, brand row arriba, `side` centrado, disclaimer lock abajo. RIGHT: bg blanco, form centrado. Mobile: el LEFT colapsa a un header strip con brand mark. `overflowX: hidden` (no `overflow: hidden`) para que el scroll vertical funcione en mobile cuando el form es más alto que el viewport.

### UI primitivos (`components/ui/`)

- **`ConfirmModal.tsx`** — modal genérico con variant `simple` o `verification` (requiere tipear `verificationText`, default `ELIMINAR`).
  ```ts
  interface ConfirmModalProps {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    variant?: 'simple' | 'verification'
    verificationText?: string
    onConfirm: () => void
    onCancel: () => void
  }
  ```
- **`ConnectionError.tsx`** — pantalla "Sin conexión" con retry automático y backoff `[3, 6, 12, 24, 30]` s + retry manual.
  ```ts
  interface ConnectionErrorProps { onRetry: () => void }
  ```
- **`EmptyState.tsx`** — empty state genérico (icon emoji string, title, description, opcional action).
  ```ts
  interface EmptyStateProps {
    icon: string
    title: string
    description: string
    action?: { label: string; onClick: () => void }
  }
  ```
- **`Field.tsx`** — wrapper label + descripción + control. `vertical` toggle entre row layout y stacked.
- **`MabelLogo.tsx`** — SVG circular "M" del prototipo. `size` (default 28), `color` (default `currentColor`).
- **`Markdown.tsx`** — micro-renderer inline-only. Soporta `**bold**`, `` `code` ``, `[label](url)` con `SAFE_URL_RE = /^(https?:\/\/|mailto:)/i`. Sin headings/listas; los párrafos se separan por `\n\n` en el wrapper que llama. (Ver source para la API completa de `MarkdownProps`.)
- **`NativeSelect.tsx`** — `<select>` nativo con chevron custom y tokens del DS. Mejor a11y y mobile UX que un select custom.
- **`Segmented.tsx`** — button group genérico con icon opcional. `T extends string`. Soporta per-option `disabled` (suprime el estilo "selected pill" para no mostrar checked+disabled).
  ```ts
  interface SegmentedOption<T extends string> {
    value: T
    label: string
    icon?: SegmentedIcon
    disabled?: boolean
  }
  ```
- **`SessionExpiredModal.tsx`** — modal de sesión expirada con icono Clock + CTA "Volver a iniciar sesión". Se dispara desde el interceptor 401 de `api/client.ts` vía `setOnSessionExpired`.
  ```ts
  interface SessionExpiredModalProps { open: boolean; onLogin: () => void }
  ```
- **`Skeleton.tsx`** — 3 helpers: `SkeletonCard`, `SkeletonChat`, `SkeletonText`.
- **`Slider.tsx`** — range slider custom con track + fill `mabel-600` + thumb circular con glow. `useId` para asociar label.
- **`SosButton.tsx`** — pill rojo "SOS" para insertar inline en headers (variant `inline`) o fixed top-right (variant `floating`) en páginas sin header. **Reemplaza** al FAB bottom-right (`SosFab` queda como legacy).
  ```ts
  interface SosButtonProps {
    onClick: () => void
    variant?: 'inline' | 'floating'
    style?: CSSProperties
  }
  ```
- **`SosFab.tsx`** — FAB legacy bottom-right 56 px blanco con borde `danger`. Se mantiene para compat; en producción debería estar reemplazado por `SosButton`.
- **`Toast.tsx`** (`ToastContainer`) — render del `useToastStore`. Posición fixed top-right, 4 tipos `success | error | info | warning` con iconos unicode y colores. Auto-dismiss tras 5 s (lógica en el store).
- **`Toggle.tsx`** — switch genérico `role="switch" aria-checked`. Track `mabel-600` / `ink-300`. Thumb 20 px desliza 22 px.
- **`UmbAvatar.tsx`** — Escudo UMB como PNG (`/brand/umb-shield.png` o `umb-shield-white.png`). Sin wrapper circular. Trade-off: bajo 28 px la palabra "UMB" del escudo se vuelve ilegible, solo la silueta sobrevive.

## Hooks personalizados (`hooks/`)

### `useAudioRecorder`

```ts
export default function useAudioRecorder(): {
  isRecording: boolean
  error: string | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob>
}
```

Wrapper de `MediaRecorder` para grabar `audio/webm;codecs=opus`. `startRecording` pide `getUserMedia`. `stopRecording` retorna el blob, libera tracks (`getTracks().forEach(t => t.stop())`) y resetea state. Sin cleanup automático en unmount.

Usado por `Chat.tsx` (mic ASR) y `Voice.tsx`. **Cuándo no**: no inicia/para automáticamente — el caller controla el ciclo.

### `useElapsedSeconds`

```ts
export default function useElapsedSeconds(active: boolean): number
```

Cuenta segundos desde que `active` se vuelve `true`. Granularidad 500 ms interval. Tiene **grace period de 600 ms**: si `active` flickea `true→false→true` dentro de la gracia (SSE reconnect breve o React 18 Strict Mode doble-invoke), preserva el `startRef` original. Sin esto el counter se reseteaba visualmente y el `streamingStatusText` retrocedía de "despertando…" a "pensando…" a mitad del wait.

Limpieza: clear interval + marca `lastDeactivateRef` en `performance.now()`.

### `useKeyboardShortcuts`

```ts
type Shortcut = 'cmd+b' | 'cmd+,' | 'esc'

export default function useKeyboardShortcuts(
  map: Partial<Record<Shortcut, () => void>>,
  options?: { allowInInputs?: boolean }
): void
```

Registra listeners `keydown` window-level. `metaKey || ctrlKey` cross-platform. Skip cuando el target es editable (`INPUT`, `TEXTAREA`, `SELECT`, `isContentEditable`), salvo `allowInInputs: true`. `e.preventDefault()` SOLO si la key está registrada. Re-bind cero: `mapRef` se actualiza por ref.

Uso: `StudentLayout` lo monta con `{ 'cmd+b': toggleSidebar }`.

### `useLlmPrewarm`

```ts
export type LlmStatus = 'unknown' | 'warm' | 'cold' | 'down'

export default function useLlmPrewarm(options?: {
  pollIntervalMs?: number
}): {
  status: LlmStatus
  checking: boolean
  recheck: () => void
}
```

Health check `GET /llm/health` al mount + polling opcional. Pensado para Modal.com scale-to-zero: el ping arranca el cold start mientras el usuario lee la pantalla.

Semántica:
- `warm` — backend 200 status warm
- `cold` — backend 200 status cold (Modal 503 Loading detrás)
- `down` — backend status down (Modal o intermedio caído, 404/500/502/503 local)
- `unknown` — 401/403, network error, sin token

Polling **solo cuando la tab está visible** (`document.visibilityState === 'visible'`). Al volver a visible dispara un `checkOnce({ silent: true })` y reanuda el interval. `checking` flag toggle SOLO en el primer check o `recheck()` manual — no en cada poll silencioso para no flickear spinners.

### `useSubtitles`

```ts
export default function useSubtitles(): {
  currentWordIndex: number
  startSubtitles: (text: string, durationMs: number) => void
  stopSubtitles: () => void
}
```

Resalta palabra-por-palabra sincronizado con audio TTS. Distribuye el `durationMs` proporcional al char-count de cada palabra (`totalChars` weight). `setInterval` 50 ms refresca el índice. Al terminar la última palabra: timeout 500 ms para mantener el highlight visible, luego clear → `-1`. `stopSubtitles` clear interval + reset.

### `useTts`

```ts
export default function useTts(): {
  playTts: (text: string, voice?: string) => Promise<number>
  stopTts: () => void
  isMuted: boolean
  toggleMute: () => void
}
```

Reproducción TTS vía backend Piper con **sentence-streaming**: `splitIntoSentences` parte el texto en `.?!` con protección de abreviaturas (`Dr.`, `Sr.`, `a.m`, `etc`, etc. con `\x00` placeholder). Cada frase se pide y reproduce en cadena → time-to-first-audio ≈ 2 s aunque el audio total dure 30+ s.

`playTts(text)` retorna la **duración real total de audio** (suma de `audio.duration` × 1000 de cada sentencia) — NO wall-clock — porque `useSubtitles` necesita la duración del audio, no la latencia HTTP, para distribuir highlights.

`sanitizeForTts` strippea markdown bold/italic/code/links, emojis (rango ampliado incluyendo ZWJ/VS/skin-tone/flags), saltos de línea → punto+espacio.

Mute persiste en `localStorage` (`mabel_tts_muted`). Al mutar, aborta el fetch en vuelo (`AbortController`) y pausa `<audio>` actual. `audioRef` **NO se exporta** — era footgun con sentence-streaming (consumidor externo podía pillar `null` entre sentencias o pausar la equivocada).

Cleanup en unmount: cancel + abort + pause.

## Stores Zustand (`stores/`)

### `authStore.ts`

```ts
interface User {
  id: string
  email: string
  display_name: string | null
  role: 'student' | 'admin'
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  initialize: () => void
}
```

Hidratación **sincrónica** desde `localStorage` durante la factory call (antes del primer render React) — crítico: sin esto, `ProtectedRoute` ve `isAuthenticated:false` por un frame en cada reload de página protegida → redirect a `/login` → `PublicRoute` rebota a `/home`. Net effect: cada reload silencioso de una página protegida acaba en `/home`.

`isValidUser` valida el shape (id/email/role/display_name?) — un blob parseable pero malformado se rechaza y se limpia `localStorage` (evita estado half-logged-in que crashea al primer `user.role`).

Persistence keys: `mabel_token`, `mabel_user`. Consumido por TODOS los guards + Header/AdminHeader + UserMenu/AdminSidebar + RoleGuard.

### `chatStore.ts`

```ts
interface ChatState {
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  isStreaming: boolean
  streamingText: string
  isLoadingSessions: boolean
  isLoadingMessages: boolean
  saveHistoryEnabled: boolean
  riskDetected: boolean

  loadSessions: () => Promise<void>
  createSession: (opts?: { topicHint?; checkinPayload? }) => Promise<CreateSessionResponse>
  loadSession: (sessionId: string) => Promise<Session>
  loadMessages: (sessionId: string) => Promise<void>
  sendMessage: (sessionId: string, content: string, opts?: { voiceMode?: boolean }) => Promise<void>
  endSession: (sessionId: string) => Promise<void>
  loadPreferences: () => Promise<void>
  clearRisk: () => void
}
```

`sendMessage` hace fetch nativo (no axios) porque consume SSE: parsea `data: {token|done|risk_detected|error}` y `set({ streamingText })` por token. Optimistic add del user message. `riskDetected` se setea ante pre-filter o post-filter risk para que la UI levante el SOS automático.

`createSession` acepta `checkinPayload` (lazy-create 2026-05-23): si hay payload nace con check-in en una transacción atómica; si no, nace limpia para que el primer `POST /messages` la pueble.

Sin persistencia. Consumido por `StudentSidebarV3`, `Chat.tsx`, `Voice.tsx`, `Home.tsx`, `SessionDetail.tsx`, `SessionEnd.tsx`.

### `preferencesStore.ts`

```ts
interface PreferencesData {
  user_id: string
  save_history: boolean
  ui_language: string
  tts_voice: string | null
  accessibility: Record<string, unknown> | null
  checkin_enabled: boolean
  preferred_chat_mode: 'chat' | 'avatar'
}

interface PreferencesState {
  preferences: PreferencesData | null
  loading: boolean
  hasPreferences: boolean
  loadPreferences: () => Promise<void>
  updatePreferences: (data: Partial<PreferencesData>) => Promise<PreferencesData>
  clear: () => void
}
```

`loadPreferences` resuelve `hasPreferences:false` ante 404 (`OnboardingGuard` lo usa para redirigir a `/onboarding`). Sin persistencia. Consumido por `OnboardingGuard`, `Settings.tsx`, `CheckIn.tsx`, `StudentSidebarV3` (`save_history`).

### `toastStore.ts`

```ts
type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}
```

Auto-dismiss tras 5 s (setTimeout dentro de `addToast`). Sin persistencia. Renderizado por `<ToastContainer />` (montado una sola vez en `App.tsx`). Consumido por cualquier componente que necesite feedback.

### `adminStore.ts`

```ts
interface AdminState {
  pendingReports: number
  activeSafetyEvents: number
  polling: boolean
  intervalId: number | null
  mobileNavOpen: boolean
  toggleMobileNav: () => void
  closeMobileNav: () => void
  fetchOnce: () => Promise<void>
  startPolling: () => void
  stopPolling: () => void
}
```

`GET /admin/dashboard` cada 60 s mientras el polling esté activo. Refleja `safety_events_active` (fallback `safety_events_24h` para backends viejos) y `reports_pending`. Errores silenciados (preservan counts previos). `mobileNavOpen` para drawer responsive del AdminLayout. Consumido por `AdminLayout`, `AdminHeader`, `AdminSidebar`.

## Guards (`guards/`)

| Guard | Valida | Redirige a |
|---|---|---|
| `ProtectedRoute` | `isAuthenticated === true` | `/login` |
| `PublicRoute` | NO autenticado | `/admin` (admin) o `/home` (student) |
| `RoleGuard` | `user.role === role` | `/admin` si admin cae en route student (mejor UX); `/403` si student cae en route admin (security boundary) |
| `ConsentGuard` | `GET /users/me/consent-status === 'ok'` | `/consent-required` |
| `OnboardingGuard` | `hasPreferences === true` | `/onboarding` (si pathname distinto) |

Orden de aplicación en `App.tsx`:

```
PublicRoute      → rutas /, /login, /register, /forgot-password, /reset-password/:token
ProtectedRoute   → /consent, /consent-required, /consent/rejected, /403
ProtectedRoute → RoleGuard("student") → ConsentGuard
                    → /onboarding (sin StudentLayout, full-screen)
                    → StudentLayout → OnboardingGuard
                          → /home, /settings (redirect a /home), /checkin/new,
                            /session/:id/{checkin,chat,voice,end,detail}
ProtectedRoute → RoleGuard("admin") → AdminLayout
                    → /admin, /admin/{users[/:id],reports,safety-events,
                                       metrics,empathy-ratings,config,logs}
```

`ConsentGuard` y `OnboardingGuard` propagan el `parentContext` del Outlet con `<Outlet context={parentContext} />` — sin esto las pages que consumen `useOutletContext<StudentOutletContext>()` (e.g. `CheckinContextPopover` → `openSettings`) verían `undefined`.

## Utils (`utils/`)

### `streamingStatus.ts`
```ts
function streamingStatusText(elapsedSeconds: number, hasFirstToken?: boolean): string
```
5 stages pre-token (0–3 / 3–10 / 10–25 / 25–60 / 60+ s) + 1 stage post-token ("Mabel está escribiendo…"). Sin la distinción `hasFirstToken`, en cold start el elapsed acumulado quedaba mostrando "despertando del descanso" mientras palabras ya aparecían en pantalla — contradicción visual (audit 2026-05-24).

### `greetings.ts`
```ts
type GreetingPeriod = 'morning' | 'afternoon' | 'evening'
function getGreetingPeriod(hour: number): GreetingPeriod
function getTimedGreeting(name: string, date?: Date): string
```
3 pools hardcoded de 10 frases cada uno. `{name}` placeholder. Random `Math.random()` (no seedeada — queremos variedad entre page loads, patrón Claude.ai). Tono guideline: género-neutral, sin clichés ni exclamaciones múltiples, máximo 1 frase corta. Late night (00–04) folda en `evening`. Browser time = source of truth.

### `severity.ts`
```ts
type SeverityLevel = 1 | 2 | 3 | 4 | 5
const SEVERITY_LABELS: { 1:'Leve', 2:'Baja', 3:'Media', 4:'Alta', 5:'Crítica' }
const SEVERITY_DESCRIPTIONS: Record<SeverityLevel, string>
function severityShort(n): string   // "3 — media"
function severityLong(n): string    // "3 — Media. Atención requerida. ..."
```
Single source of truth para el rubric 1–5 compartido por `safety_events.severity` (auto-calculado por guardrails) y `message_reports.severity` (estudiante).

### `apiError.ts`
```ts
function formatApiError(err: unknown, fallback: string): string
```
Coerciona Axios errors a string. Maneja FastAPI 422 `detail: Array<{type,loc,msg,...}>` (sin esto el array llegaba a `<p>{message}</p>` y React crasheaba con "Objects are not valid as a React child"). Usar **siempre** antes de pipear a toast/alert/React text.

### `constants/checkin.ts`
Catálogos compartidos del check-in (no es en `utils/`, ver path real). Exporta `FOCUS_OPTIONS`, `FOCUS_LABEL_MAP`, `FOCUS_COLOR_MAP`, `MOOD_LEVELS` (5 niveles caritas → escala 0-10), `SLEEP_QUALITY_LEVELS` (4 niveles categóricos), `STRESS_LEVELS`, `LONELINESS_LEVELS`, `ENERGY_LEVELS` (3 escalas 1–4). Helpers: `moodLevelFromValue(v)` (mapea 0-10 al MoodLevel más cercano), `normalizeFocus(raw)` (string legacy o array → string[]).

### `types/studentOutlet.ts`
```ts
interface StudentOutletContext {
  openCrisis: () => void
  openSettings: (tab?: TabId) => void
}
```
Tipo para `useOutletContext<StudentOutletContext>()` desde cualquier page bajo `StudentLayout`. `TabId = 'privacy' | 'accessibility' | 'voice' | 'account' | 'arco'` viene de `pages/Settings`.

## API client (`api/client.ts`)

```ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1',
  headers: { 'Content-Type': 'application/json' },
})
```

**Request interceptor**: inyecta `Authorization: Bearer <mabel_token>` desde `localStorage` si existe.

**Response interceptor** (401):
- Si la URL está en `AUTH_PATHS_WITHOUT_TOKEN = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password']` con match por boundary (exact, `?`, o `/:token`), **propaga el 401 tal cual** — ahí significa "credenciales inválidas", no "sesión expirada". Sin esta guard, login con password mala mostraba "tu sesión venció" (bug 2026-05-23).
- En otro caso: preserva el draft del chat (textarea con placeholder match `*mensaje*`) en `localStorage.mabel_draft`, limpia `mabel_token`/`mabel_user`, dispara `onSessionExpired()` (si está seteado por `App.tsx`) o redirige duro a `/login`.

```ts
export function setOnSessionExpired(cb: () => void): void
```

Callback set por `App.tsx` para mostrar `SessionExpiredModal` en lugar de redirect duro.

## Diagrama de dependencias (alto nivel)

```
                    ┌────────────────────────────────────────┐
                    │                App.tsx                 │
                    │  (BrowserRouter, ToastContainer,       │
                    │   SessionExpiredHandler)               │
                    └────────────────────┬───────────────────┘
                                         │
            ┌────────────────────────────┼────────────────────────────┐
            │                            │                            │
       PublicRoute                ProtectedRoute               (catch-all)
                                         │
                ┌────────────────────────┼─────────────────────────┐
                │                                                  │
       RoleGuard("student")                              RoleGuard("admin")
                │                                                  │
         ConsentGuard                                        AdminLayout
                │                                            │   │  │
       (Onboarding free)                              AdminSidebar HeaderOutlet
                │                                            │
         StudentLayout                                       └──> pages/admin/*
            ├── StudentSidebarV3                                    │
            │     ├── UserMenu                                      ├── DataTable
            │     ├── SessionSearchModal                            ├── FilterBar
            │     └── ConfirmDeleteSessionModal                     ├── Pagination
            ├── SosPanel                                            ├── MetricCard + InfoHint
            ├── Settings (modal)                                    ├── charts/*
            │     └── primitives/* + ChangePasswordModal,           ├── BulkActionModal
            │       ConfirmHideHistoryModal, DeleteAccountModal,    ├── DisableUserModal
            │       RevokeConsentModal, ArcoExportModal             ├── EnableUserModal
            └── <Outlet /> OnboardingGuard                          ├── UserDetailDrawer
                  └── pages/*  (Home, Chat, Voice, CheckIn, …)      └── ExportCsvButton
                        ├── Composer  ──> useAudioRecorder
                        ├── TopBar + CheckinContextPopover
                        ├── LlmStatusChip ──> useLlmPrewarm
                        ├── StreamingIndicator ──> useElapsedSeconds
                        ├── HeartRating
                        ├── MabelAvatar + ReactiveRings (Voice)
                        ├── ReportModal
                        └── SuggestionChip
                        ↓
                  useChatStore, useAuthStore, usePreferencesStore,
                  useToastStore, useTts, useSubtitles
                        ↓
                  api/client (Axios + JWT interceptor + SSE)
```

## Cambios recientes notables (post-2026-03-01)

- **LLM wait UX en 3 capas** (audit 2026-05-24):
  - `LlmStatusChip` (button con popover, no `<span title>` legacy).
  - `StreamingIndicator` (5 stages pre-token + 1 post-token).
  - `useElapsedSeconds` con grace period 600 ms anti-flicker.
- **`MabelAvatar` + `ReactiveRings`** — Voice 2D con SVG overlay sobre PNG base. Reemplazó al plan de 5 PNGs separados.
- **Admin lifecycle**: `BulkActionModal`, `UserDetailDrawer`, `DisableUserModal`, `EnableUserModal`, `ExportCsvButton`, `InfoHint`, `FilterBar`, `DataTable`, `MetricCard`, `Pagination`, `AdminHeader`, `AdminLayout`, `AdminSidebar`. Mobile drawer responsive en `<768px`.
- **Settings modal global** — `Settings` ya no es ruta sino modal triggereado vía `openSettings(tab?)` del Outlet context. `/settings` redirige a `/home`.
- **`HeartRating`** — banner post-session UPSERT idempotente.
- **`SessionSearchModal`** — spotlight Cmd-K-style con keyboard nav.
- **`ConfirmDeleteSessionModal`** — pattern del agente ético: tipear "CONFIRMAR" antes de hard-delete.
- **`SuggestionChip`** — chips del Home reskin Cap 6.3.
- **Lazy session creation** — sidebar "Nueva sesión" navega a Home sin POST. La sesión nace en el primer submit (chat) o submit del check-in.
- **`SosButton`** — pill rojo inline reemplaza al FAB bottom-right `SosFab` (este último persiste como legacy).
- **Mobile responsive**: hamburger flotante en StudentLayout, drawer 272 px con backdrop, `AdminLayout` drawer 220 px con backdrop.
- **`UmbAvatar`** sustituyó el wrapper circular previo del brand — silueta del escudo UMB directo sobre fondo del contenedor.
- **`useTts`** sentence-streaming con protección de abreviaturas y abort cancellation.

## Drift / pendientes

- **`SosFab` y `Header`** son legacy: en producción el SOS vive en `SosButton` (inline en TopBar) y el header del estudiante fue absorbido por `StudentSidebarV3`. No se removieron del bundle por compat; en una próxima limpieza pueden borrarse.
- **`ui/Toggle.tsx` vs `settings/primitives/Toggle.tsx`** — dos variantes coexisten (genérico vs settings con label+hint inline). Convivencia intencional pero documentada; cualquier nueva pantalla debe usar la primitiva apropiada al contexto.
- **`EmptyState.tsx`** acepta `icon: string` (emoji literal). Inconsistente con el resto de la app que usa lucide-react. Pendiente refactor a `LucideIcon`.
- **`ConnectionError`** no está cableada en ningún flujo activo del codebase actual — queda como primitiva disponible para fallback de red explícita.
- **`MabelLogo`** existe pero la mayor parte del branding visible usa `UmbAvatar` (escudo UMB). `MabelLogo` solo aparece en algunos contextos auth/landing legacy.
- **`Markdown.tsx`** es inline-only — no soporta headings, listas, tablas. Pendiente upgrade si el LLM empieza a emitir respuestas estructuradas.
- **`tts_voice`, `preferred_chat_mode='avatar'` y los 3 toggles de `accessibility`** en `PreferencesData` quedan declarados/persistibles pero los controles UI están **disabled** hasta que el modelo 2D animado con TTS aterrice (ver `onboarding-pending-when-voice-avatar-lands` en MEMORY.md).
- **`adminStore.fetchOnce`** silencia errores — no hay UI feedback si el polling falla. En piloto cerrado es OK; producción debería al menos togglear un indicador de "datos desactualizados".
- **`useAudioRecorder`** no tiene cleanup en unmount — si el usuario navega mientras graba, el stream sigue vivo hasta que el browser libere el mediaStream. Defensible (el caller siempre llama `stopRecording`), pero anotable.
