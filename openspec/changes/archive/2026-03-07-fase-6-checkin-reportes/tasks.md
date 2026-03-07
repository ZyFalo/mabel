## Tasks

### Backend

- [x] 1. Add SafetyEventRepository dependency to ReportService constructor and _get_report_service factory in report_router.py
- [x] 2. In ReportService.create_report(), after creating the report and before commit, create a safety_event with event_type='user_report', payload={'report_id': str(report.id)}, user_id=reporter_id, session_id from the message's session
- [x] 3. Change CheckinPayload.focus type from `str | None` to `Literal["Academico", "Social", "Familiar", "Salud", "Economico", "Otro"] | None` in backend/app/schemas/chat.py

### Frontend

- [x] 4. In Chat.tsx, after loadMessages completes, iterate over assistant messages and call GET /messages/:id/reports/check for each, using Promise.allSettled. Populate reportedIds with messages where already_reported=true
- [x] 5. Extract the report check logic into a loadReportedIds helper function within Chat.tsx that takes a list of messages and returns a Set of reported message IDs
