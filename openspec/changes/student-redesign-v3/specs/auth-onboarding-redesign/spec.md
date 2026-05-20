## ADDED Requirements

### Requirement: Auth pages restyled

The pages `Landing.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx` SHALL be restyled using:
- Background `bg-[var(--bg)]` (cream calido en light, warm brown dark)
- Centered card `bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-sm`
- Card padding `px-6 py-8 md:px-10 md:py-10`, `max-w-md` centrado vertical y horizontalmente
- Title in Fraunces italic (`text-[28px]`), subtitle `text-[var(--text-muted)] text-[14px]`
- Form inputs use the new `TextInput` primitive (under the hood the same `<input>` but styled with `--bg-elevated`, `--border`, focus `--accent`)
- Primary buttons: `bg-[var(--accent)] text-white rounded-lg px-5 py-2.5`
- Secondary links: `text-[var(--accent)]/80 hover:underline`
- Entry animation: `fade-in` on the card

ALL existing form logic, validations, error handling, and routing SHALL be preserved.

#### Scenario: Login form submits unchanged

Given a user enters valid credentials
When they click "Iniciar sesion"
Then the existing `POST /auth/login` flow SHALL fire AND redirect by role (student → /home, admin → /admin)

#### Scenario: Card animates on mount

Given Login.tsx mounts
When the card renders
Then it SHALL have class `fade-in` animating opacity 0 → 1 over 200ms

### Requirement: Consent flow restyled

The pages `Consent.tsx`, `ConsentRejected.tsx`, `ConsentRequired.tsx` SHALL be restyled with the same card pattern as auth pages, but with wider `max-w-2xl` to accommodate the legal text body. The consent body text SHALL render with `prose prose-sm` styling (preserving readability of legal content).

The three variants (no consent / revoked / new version required) SHALL preserve their existing routing and decision logic.

#### Scenario: Accept consent fires existing endpoint

Given the user is on Consent.tsx and clicks "Acepto"
When the click fires
Then the existing `POST /consents` with the active version SHALL fire unchanged
And the user SHALL navigate to the next step (onboarding) per existing flow

### Requirement: Onboarding 3 steps restyled

The page `Onboarding.tsx` SHALL render three steps (Privacidad → Accesibilidad → Voz) with:
- Step indicator at top: `1 / 3`, `2 / 3`, `3 / 3` with progress bar fill `bg-[var(--accent)]`
- Each step in a card layout consistent with auth pages
- Controls use the new primitives (Toggle, Segmented)
- Navigation: "Siguiente" / "Anterior" / "Finalizar" buttons preserved
- Entry animation: `fade-in` on step change

ALL existing logic (setPreference calls, advance/back, finalize → /home) SHALL be preserved.

#### Scenario: Step advances

Given the user is on step 1
When they click "Siguiente"
Then step 2 SHALL render with `fade-in` animation
And the progress bar SHALL fill to 2/3

#### Scenario: Finalize navigates to home

Given the user is on step 3 and clicks "Finalizar"
When the click fires
Then existing logic SHALL persist preferences AND navigate to `/home`

### Requirement: Existing modals restyled

Modals across the student flow (`ChangePasswordModal`, `RevokeConsentModal`, `DeleteAccountModal`, `ArcoExportModal`, `ConfirmModal`, `SessionExpiredModal`, `ReportModal`) SHALL adopt:
- Backdrop `bg-black/40` with backdrop-blur-sm
- Modal card `bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-lg`
- Entry animation `scale-in` (`scale 0.96 → 1.0 over 220ms cubic-bezier(0.16, 1, 0.3, 1)`)
- Title in Fraunces italic for emphasis
- Buttons styled consistently with auth (primary `--accent`, secondary outline)

ALL existing modal logic (form fields, validation, API calls, props) SHALL be preserved.

#### Scenario: ChangePasswordModal animates in

Given the user clicks "Cambiar contrasena" in Settings
When the modal opens
Then the modal card SHALL apply `scale-in` (opacity 0 → 1, scale 0.96 → 1.0 over 220ms)

#### Scenario: Modal logic unchanged

Given the user submits a password change with old + new + confirm fields
When the form submits
Then the existing endpoint (`PUT /auth/change-password`) SHALL fire with unchanged payload shape
