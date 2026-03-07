## Why

Fase 3 implemento el check-in y los reportes de mensajes, pero quedan 3 gaps criticos: (1) al crear un message_report no se genera el safety_event vinculado (event_type: 'user_report'), rompiendo la conexion con el panel de triaje admin (#25), (2) el estado "Ya reportado" se pierde al refrescar la pagina porque se almacena solo en memoria local, y (3) el campo focus del check-in acepta cualquier string sin validar contra las 6 categorias definidas en la especificacion.

## What Changes

- Crear safety_event automaticamente al crear un message_report (event_type: 'user_report', payload: { report_id })
- Cargar estado de reportes previos desde el servidor al montar Chat.tsx (persistencia entre recargas)
- Validar campo focus del CheckinPayload contra las 6 categorias validas (Academico, Social, Familiar, Salud, Economico, Otro)

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `checkin-refinement`: Agregar validacion de focus categories en CheckinPayload backend
- `reports-refinement`: Crear safety_event al reportar + cargar reported status persistente en frontend

## Impact

- Backend: `report_service.py` (agregar safety_event creation), `chat.py` schema (validar focus)
- Frontend: `Chat.tsx` (cargar reported IDs al montar), `chatStore.ts` (no changes needed)
- APIs: No hay endpoints nuevos, se usan los existentes (GET /messages/:id/reports/check)
- BD: No hay cambios de schema, se usan tablas existentes (safety_events, message_reports)
