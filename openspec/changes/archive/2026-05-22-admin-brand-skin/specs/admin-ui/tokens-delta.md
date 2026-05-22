# admin-brand-skin — Tokens delta

Tokens NUEVOS que el panel admin requiere y que el estudiante no usaba (o no necesitaba en `mabel-brand-skin`).

## Resumen

**Conclusión: ningún token CSS nuevo se requiere en `index.css`.** El panel admin se construye 100 % sobre la paleta brand-skin del estudiante (`mabel-50..900`, `ink-50..900`, `gray-50..700`, semánticos `success-{50,200,600,700}`, `warn-*`, `danger-*`, `info-{50,600}`, escala tipográfica `text-xs..7xl`, escala de espaciado 4 px `space-0..13`, radios `--r-xs..3xl`, sombras incluida `--shadow-brand`, focus rings `--ring-mabel` y `--ring-danger`, motion `--ease-*` `--dur-*`).

Justificación: el contraste entre persona estudiante y persona admin se resuelve por **composición de tokens existentes**, no por nuevos colores:

- Estudiante: superficie cálida (`ink-50`), sidebar `ink-50` o tonos cálidos, header `mabel-600`, burbujas asimétricas.
- Admin: superficie cálida (`ink-50`), sidebar `ink-900` (oscuro), header blanco con `border-bottom ink-200`, densidad de tabla.

Mismos tokens, distinta receta. Esto es deseable: un solo sistema de diseño, dos personas con jerarquía visual diferenciada.

---

## Refinamientos pequeños (no son tokens nuevos, son usos)

Los siguientes patrones de uso conviene documentarlos aquí para el frontend-developer, pero **no requieren añadir nada a `index.css`**:

1. **Sidebar oscuro admin**: `bg-[var(--ink-900)]`, divisores `border-[var(--ink-800)]`, micro-caps `text-[var(--ink-400)]`, items `text-[var(--ink-300)] hover:text-white hover:bg-[var(--ink-800)]`, activo `bg-[var(--mabel-600)] text-white border-l-[3px] border-[var(--mabel-300)]`.

2. **Header limpio admin**: `bg-white border-b border-[var(--ink-200)] h-16`.

3. **Card de tabla canónica**: `bg-white border border-[var(--ink-200)] rounded-[var(--r-lg)] overflow-hidden`.

4. **Header de tabla**: `bg-[var(--ink-50)] text-[10px] uppercase tracking-[0.14em] text-[var(--ink-500)] font-semibold`.

5. **Fila tabla hover**: `hover:bg-[var(--ink-50)]/60` (con sintaxis de opacidad de Tailwind v4 sobre custom prop).

6. **Pill de filtro activo**: `bg-[var(--mabel-50)] border-[var(--mabel-600)] text-[var(--mabel-700)]`.

7. **Backdrop modal destructivo**: `bg-[rgba(26,17,16,0.45)]` (ink-900 a 45 %; ya cubierto por `--ink-900` + opacidad inline).

8. **Threshold dot** (en `MetricCard`): círculo 8 px con `bg-[var(--success-600)] / var(--warn-600) / var(--danger-600)` — usa semánticos existentes.

9. **Botón destructive primario** (`DisableUserModal`, "Deshabilitar usuario"): `bg-[var(--danger-600)] text-white hover:bg-[var(--danger-700)] focus:ring-[var(--ring-danger)]` — usa semánticos existentes.

10. **Botón export CSV** (toolbar de tabla): `bg-[var(--ink-900)] text-white hover:bg-[var(--ink-800)]` — usa neutrales existentes.

---

## Convención de utility classes opcionales

Si el frontend-developer prefiere consolidar combinaciones recurrentes, puede crear **utility classes** en `index.css` (zona `@layer components`) — esto es opcional y NO bloquea la implementación:

```
@layer components {
  .admin-table-card { /* bg-white + border ink-200 + rounded-lg + overflow-hidden */ }
  .admin-table-th   { /* bg-ink-50 + text-[10px] uppercase tracking-[0.14em] ink-500 */ }
  .admin-table-row  { /* border-b ink-100 + hover:bg-ink-50/60 + transition */ }
  .admin-pill       { /* base de pill filtro */ }
  .admin-pill-active{ /* bg-mabel-50 + border-mabel-600 + text-mabel-700 */ }
}
```

Esto es decisión del frontend-developer; el spec se cumple igual escribiendo las clases inline.

---

## Lo que NO se añade

- ❌ Nuevo color "admin teal" o equivalente. Eliminado por D-A1 + D-A5.
- ❌ Nueva familia tipográfica. Nunito + Inter cubren todos los casos.
- ❌ Nuevo radio o sombra. `--r-xs..3xl` y `--shadow-brand` (+ sombras heredadas) son suficientes.
- ❌ Nueva escala de espaciado. 4 px grid (`--space-0..13`) sobra para tablas.

---

## Validación final

`npx tsc --noEmit` + `npm run build` deben pasar sin tocar `index.css` (más allá del cleanup opcional de `--color-accent` en D-A5: dejarla apuntando a `#A51916` para compatibilidad Tailwind, pero ningún archivo admin la referencia).
