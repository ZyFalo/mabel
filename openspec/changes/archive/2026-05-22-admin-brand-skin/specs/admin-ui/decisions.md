# admin-brand-skin — Decisiones de diseño

Cinco decisiones arquitectónicas que cierran el espacio de diseño antes de implementación. Cada una en formato Pro / Contra / Decisión, con el recordatorio operativo: el admin maneja densidad (tablas, filtros, métricas), no replica burbujas asimétricas del chat estudiante.

Constraints inviolables — toda decisión aquí los respeta:

- **D-03**: el admin nunca renderiza `messages.content` (la UI muestra solo `event_type`, `severity`, `status`, `latency_ms`, `created_at`, etc.).
- **D-05**: tras login, redirección por rol (estudiante → `/chat`, admin → `/admin`).
- **Email masking**: `e***@est.umb.edu.co` en cualquier vista de admin (Users, UserDetail, AuditLogs).
- **CSV anonimizado**: ids como `sha256(value)[:16]` en cualquier export.
- **Audit log**: toda mutación admin se registra (cambios de estado, disable user, edición de Config, etc.).

---

## D-A1 — Sidebar del panel admin

**Pregunta**: ¿conservamos el sidebar teal `#0F303A` (legacy v1, que ya genera tensión con `--color-accent: #A51916`) o lo reskineamos a brand-styled usando la paleta `mabel + ink`?

**Opción A — Teal legacy restaurado** (`bg: #0F303A`, texto blanco, hover `white/10`).

- Pro: contraste alto frente al header rojo del chat estudiante; rol "admin = otro modo" visualmente evidente.
- Pro: cero retrabajo: el archivo actual ya está pintado así, solo hay que blindar el token contra el cambio de `--color-accent`.
- Contra: rompe la línea de marca decidida en `mabel-brand-skin` (estudiante usa ink + mabel, no teal); fragmenta identidad.
- Contra: el sidebar del estudiante ya migró a fondo ink-50 sobre `bg-bg`, así que dos personas en la misma app convivirían con dos lenguajes visuales.

**Opción B — Brand-styled (ink + mabel)** (`bg: var(--ink-900)`, items en `ink-300`, activo en `mabel-600` + chip blanco, hover `ink-800`).

- Pro: misma familia tipográfica + paleta que el estudiante. Una sola marca Mabel, dos personas.
- Pro: header limpio (decisión D-A2) + sidebar oscuro brand = jerarquía clara sin colapso de rojos (problema del `--color-accent` desaparecido por construcción).
- Pro: badges semánticos (reportes, safety) destacan más sobre ink-900 que sobre teal.
- Contra: estudiante y admin se diferencian solo por densidad y tono (warm bg vs ink bg), no por color de marca — requiere disciplina en breadcrumbs y "user pill" para que el admin sepa siempre dónde está.

**Decisión recomendada: Opción B (brand-styled ink-900)**

Sidebar 220px, fondo `var(--ink-900)`, label "Panel administrativo · Mabel IA" en `ink-300` arriba, tres grupos lógicos con header micro-caps (Operación / Datos / Sistema), pill de perfil abajo con email masked + rol + botón "Salir". Activo: pill `mabel-600` con borde-izq `mabel-300`. Esto elimina por completo la dependencia de `--color-accent` (ver D-A5) y unifica identidad sin perder jerarquía.

---

## D-A2 — Header del panel admin

**Pregunta**: ¿mantener la barra superior roja `bg-primary` de 56px (estética v1 estudiante) o cambiar a un header limpio sobre fondo cálido con `border-bottom`?

**Opción A — Header rojo full-width** (56px, `bg: var(--mabel-600)`, título blanco).

- Pro: marca presente en todo momento.
- Contra: con sidebar también oscuro (D-A1 opción B), el contenido central queda "encajonado" entre dos bandas pesadas; resta aire a tablas densas.
- Contra: ningún elemento del header rojo aporta función operativa (no hay buscador global, no hay acciones rápidas que requieran prominencia).

**Opción B — Header limpio** (altura 64px, `bg: var(--white)`, `border-bottom: 1px solid var(--ink-200)`, breadcrumb a la izquierda, pill de usuario a la derecha).

- Pro: el contenido respira; las tablas largas (SafetyEvents, AuditLogs) no compiten con un bloque rojo.
- Pro: el breadcrumb da ubicación contextual (Panel · Datos · Safety events) — sustituye con función al "ruido" del bloque rojo.
- Pro: la marca ya está visible en el sidebar; no necesita repetirse.
- Contra: requiere que el sidebar (D-A1) sea robusto en identidad, porque el header ya no la lleva.

**Decisión recomendada: Opción B (header limpio con border-bottom)**

Header 64px, fondo blanco, `border-bottom: 1px solid var(--ink-200)`. A la izquierda: breadcrumb `Panel administrativo / {sección}` con `text-xs` + flecha `›`. A la derecha: pill compacto "Admin · {nombre} · Salir" con estilo brand (radio `--r-lg`, borde `ink-200`, hover `ink-50`, sin fondo rojo). Sin botón SOS (el SOS es prerrogativa del estudiante).

---

## D-A3 — Estilo de tablas operativas

**Pregunta**: ¿usar tablas con `bg: white` + `border: ink-200` y filas con `hover: ink-50` (estilo plano editorial), o envolverlas en `shadow-sm` cards con padding generoso?

**Opción A — Tablas planas blanco + borders** (sin sombra, header `bg: ink-50/70` + uppercase `text-xs ink-500`, filas separadas por `border-bottom ink-100`, hover fila `ink-50`).

- Pro: máxima densidad sin pérdida de claridad — un admin que escanea 50 safety events los lee de una pasada.
- Pro: combina con paginación inline y filtros tipo pill en la cabecera del card-wrapper.
- Pro: cero efecto "tarjeta dentro de tarjeta" si el page-shell ya tiene su padding.

**Opción B — Cards con `shadow-sm` + padding 24px**.

- Pro: cada fila parece más "tarjeta" y elegante.
- Contra: rompe densidad; con 25 filas el scroll se vuelve doble (la página y el card).
- Contra: las sombras múltiples saturan visualmente en pantallas con 4+ filtros + 1 tabla.

**Decisión recomendada: Opción A (tablas planas)**

Wrapper tabla: `bg-white` + `border: 1px solid var(--ink-200)` + `border-radius: var(--r-lg)` + `overflow: hidden`. Header tabla: `bg: var(--ink-50)`, `text-[10px] uppercase tracking-[0.14em] text-ink-500 font-semibold`. Filas: `border-b var(--ink-100)`, hover `bg: var(--ink-50)/60`, padding `py-2.5 px-4`. Badges semánticos con paleta brand (`success-50/600`, `warn-50/600`, `danger-50/600`, `info-50/600`). Filtros: pills sobre el wrapper, no dentro de la tabla. Paginación: pie del wrapper, `border-top ink-100`.

---

## D-A4 — Layout de `MetricCard` (Dashboard ejecutivo)

**Pregunta**: ¿conservar el layout actual (label arriba, value grande en medio, hint/badge abajo) o adoptar un layout nuevo tipo "stat editorial" (label inline + value display 36px + delta a la derecha)?

**Opción A — Layout actual (label top / value middle / hint bottom)**.

- Pro: ya funciona y los 7 KPIs encajan en grid 2/3/4/7 sin reordenar contenido.
- Pro: thresholds (`green`, `yellow`, `red`) se aplican al value sin reglas adicionales.
- Contra: el label en `uppercase tracking-[0.14em]` puede competir con el sidebar si ambos usan tipografía similar — pero queda resuelto bajando tamaño label a `text-[10px]` y subiendo value a `--text-3xl` display.

**Opción B — Layout editorial (label + value inline con delta lateral)**.

- Pro: aprovecha mejor el ancho cuando la card es ancha.
- Contra: con 7 KPIs comprimidos en `grid-cols-7 xl` cada card queda ~180px; un layout inline aprieta value y delta hasta perder legibilidad.
- Contra: rompe la convención existente de la app, exige rediseñar threshold visual.

**Decisión recomendada: Opción A (label top / value middle / hint bottom, refinado con tokens brand)**

Card: `bg: var(--white)`, `border: 1px solid var(--ink-200)`, `border-radius: var(--r-lg)`, `padding: 16px`, `shadow: var(--shadow-brand)` solo en hover. Label: `text-[10px] uppercase tracking-[0.14em] text-ink-500 font-semibold`. Value: `text-3xl font-bold text-ink-900 font-display tabular-nums`. Hint: `text-xs text-ink-500 mt-1`. Threshold: indicador pequeño (punto 8px) junto al value — verde `--success-600`, amarillo `--warn-600`, rojo `--danger-600`. Badge "+N esta semana": chip `--success-50/600` arriba a la derecha.

---

## D-A5 — Token `--color-accent`

**Pregunta**: ¿restaurar `--color-accent: #0F303A` (teal) solo para legacy, o eliminar la dependencia y refactor a tokens `mabel`/`ink`?

**Opción A — Restaurar `--color-accent: #0F303A`** y dejarlo para componentes legacy del admin.

- Pro: arregla la regresión visual hoy (el problema reportado en `proposal.md`: header+sidebar ambos rojos por culpa del cambio en `mabel-brand-skin`).
- Contra: deja una "puerta trasera" — cualquier nueva clase `bg-accent` pintará teal en lugares donde luego habría que migrar.
- Contra: el sidebar admin pasa a depender de un token que ya no aparece en la guía brand-skin.

**Opción B — Eliminar dependencia, migrar a `var(--ink-900)`**.

- Pro: una sola fuente de verdad (tokens brand-skin). Cero conflictos futuros.
- Pro: el sidebar admin (D-A1 opción B) ya usa `--ink-900`, no necesita `accent`.
- Pro: si alguna vez vuelve un componente teal, se reintroduce como `--admin-accent` o similar, semántico.
- Contra: requiere grep + refactor de cualquier `bg-accent`/`text-accent`/`border-accent` en código admin.

**Decisión recomendada: Opción B (eliminar dependencia, refactor a `ink-900` + tokens brand)**

`AdminSidebar.tsx` migra `bg-accent` → `bg-[var(--ink-900)]`. Cualquier otro uso de `accent` en código admin se sustituye por el token brand equivalente (`ink-900` para fondos oscuros, `mabel-600` para acentos brand). En `index.css`, `--color-accent` queda con el valor actual `#A51916` (igual a `primary`, por compatibilidad Tailwind con clases `bg-accent` que existan fuera del admin) pero ningún archivo admin la referencia. Tarea 2.1 de `tasks.md` se actualiza: en lugar de "Restore `--color-accent: #0F303A`", queda "Auditar y eliminar dependencia de `--color-accent` en código admin".
