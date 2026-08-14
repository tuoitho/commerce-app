# Repository Agent Instructions

## Package Scope

- This commerce repository has two packages. Read and follow `frontend/AGENTS.md` for work under `frontend/`, and `backend/AGENTS.md` for work under `backend/`; both apply to cross-package changes.
- Run package commands from their package directories. Root `make test` runs both test suites; root `make build` runs backend `sqlc generate` and the frontend production build.
- Prefer executable configuration over README prose. The root Makefile's frontend `:3000` comment is stale; Vite uses its default port (`5173`).

## Governed Changes

- Local fixes and explicit behavior changes confined to one bounded context may proceed directly with focused tests. Any API/schema/event, compatibility, persistence/security boundary, cross-package, or materially ambiguous behavior change requires an approved Kiro specification first.
- Canonical governed artifacts are `.kiro/specs/<feature>/requirements.md`, `design.md`, and `tasks.md`; approve each stage and independently review the complete set before implementation. `tasks.md` is the implementation plan.
- If implementation contradicts an approved artifact, update and re-approve that artifact before continuing. Verify completed governed work against requirement IDs and acceptance criteria.
- Use the `question` tool for blocking product/architecture choices and approval gates that repository evidence cannot resolve.

## Process Safety

- Use systematic debugging and test-driven development for behavior fixes. Prefer one agent for coupled frontend/backend work; delegate only independent work after shared contracts are stable.
- Never run dev servers, watch tests, or other long-lived commands unbounded in the foreground. Use a background/session mechanism or an explicit timeout, verify readiness, capture logs/PID where applicable, and stop the process afterward.
