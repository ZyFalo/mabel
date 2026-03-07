## Design Decisions

### D-01: Safety event creation inside ReportService

**Decision:** Inyectar SafetyEventRepository en ReportService y crear el safety_event dentro de la misma transaccion que el message_report.

**Rationale:** El safety_event debe crearse atomicamente con el report. Si se hace en un paso separado, podria quedar un report sin su evento vinculado. Usar la misma sesion DB garantiza atomicidad.

**Implementation:** ReportService recibe SafetyEventRepository via constructor. Despues de crear el report, crea el safety_event con event_type='user_report' y payload={'report_id': str(report.id)}. El session_id se obtiene del message.session_id.

### D-02: Batch check de reportes en frontend

**Decision:** Al montar Chat.tsx, iterar sobre mensajes del asistente y llamar GET /messages/:id/reports/check para cada uno, usando Promise.allSettled.

**Rationale:** No se justifica crear un endpoint batch nuevo para este caso. El numero de mensajes por sesion es bajo (tipicamente <50). Promise.allSettled evita que un error individual bloquee los demas checks. Se ejecuta despues de loadMessages para tener la lista de IDs.

**Alternative considered:** Endpoint batch POST /messages/reports/check-batch. Descartado por over-engineering: agrega un endpoint, schema y ruta solo para un caso de uso de baja cardinalidad.

### D-03: Focus category validation via Literal type

**Decision:** Cambiar CheckinPayload.focus de `str | None` a `Literal["Academico", "Social", "Familiar", "Salud", "Economico", "Otro"] | None`.

**Rationale:** Pydantic valida automaticamente Literal types contra los valores permitidos. Cero codigo custom, maximo type safety. Los valores coinciden exactamente con los definidos en el frontend (FOCUS_CATEGORIES array en CheckIn.tsx).
