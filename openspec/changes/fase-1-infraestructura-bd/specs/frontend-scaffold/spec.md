## ADDED Requirements

### Requirement: Vite + React project
The frontend SHALL be a React 18+ project created with Vite in the `frontend/` directory.

#### Scenario: Development server
- **WHEN** a developer runs `npm run dev` in `frontend/`
- **THEN** the Vite dev server SHALL start on port 5173
- **THEN** a placeholder page SHALL display "Mabel IA — En construcción"

### Requirement: TailwindCSS configuration
The frontend SHALL have TailwindCSS configured with the project's design tokens.

#### Scenario: Design tokens available
- **WHEN** a developer uses TailwindCSS classes
- **THEN** the following custom colors SHALL be available: `primary` (#A51916), `accent` (#0F303A), `danger` (#DC2626), `success` (#16A34A), `warning` (#F59E0B)

### Requirement: Frontend directory structure
The frontend SHALL have an organized directory structure ready for future development.

#### Scenario: Directory layout
- **WHEN** the frontend scaffold is created
- **THEN** the following directories SHALL exist under `frontend/src/`:
  - `components/` (reusable UI components — empty for now)
  - `pages/` (route-level components — empty for now)
  - `stores/` (Zustand stores — empty for now)
  - `services/` (API client utilities — empty for now)
  - `assets/` (static assets — empty for now)

### Requirement: ESLint + Prettier configuration
The frontend SHALL have ESLint and Prettier configured for consistent code style.

#### Scenario: Lint command
- **WHEN** a developer runs `npm run lint`
- **THEN** ESLint SHALL check all `.jsx` and `.js` files with React plugin and Prettier integration

### Requirement: Zustand and React Router installed
State management and routing libraries SHALL be installed and ready for use.

#### Scenario: Dependencies available
- **WHEN** the frontend scaffold is created
- **THEN** `zustand`, `react-router-dom`, and `@tanstack/react-query` (or `axios`) SHALL be in `package.json` dependencies
