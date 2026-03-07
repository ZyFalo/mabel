## MODIFIED Requirements

### Requirement: Safety event creation on message report

The ReportService SHALL create a safety_event record when a message_report is successfully created. The safety_event SHALL have event_type='user_report' and payload containing the report_id as a string UUID. The session_id SHALL be obtained from the reported message's session. The safety_event creation SHALL occur within the same database transaction as the message_report creation to guarantee atomicity.

#### Scenario: Safety event created with report

Given a student reports an assistant message
When the ReportService creates the message_report successfully
Then a safety_event SHALL be created with event_type='user_report' and payload={'report_id': '<uuid>'}
And the safety_event session_id SHALL match the message's session_id
And both records SHALL be committed in the same transaction

### Requirement: Persistent reported status in Chat frontend

The Chat page SHALL load the reported status for all assistant messages from the server when the message list is loaded. The frontend SHALL call GET /api/v1/messages/:id/reports/check for each assistant message and populate the reportedIds set with messages that return already_reported=true. This MUST survive page refreshes. The check SHALL use Promise.allSettled to avoid blocking on individual failures.

#### Scenario: Reported status loaded on page mount

Given a student opens a chat session with 3 assistant messages, 1 of which was previously reported
When the Chat page loads and fetches messages
Then the frontend SHALL check reported status for all 3 assistant messages
And the previously reported message SHALL show the "Ya reportado" badge

#### Scenario: Report status survives page refresh

Given a student has reported a message and refreshes the page
When the Chat page reloads
Then the reported message SHALL still show the "Ya reportado" badge
