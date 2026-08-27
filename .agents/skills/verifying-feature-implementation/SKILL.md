---
name: verifying-feature-implementation
description: Use after all feature tasks and integration checks are complete to verify implementation and test evidence against every approved requirement before final acceptance.
---

# Verifying Feature Implementation

Verify the completed implementation against the approved `.dream/specs/<feature>/` specification.

This is a read-only verification gate; do not fix findings or edit artifacts directly during verification.

## Role in Lifecycle

```text
verifying-runtime-integration
    Evidence producer: Executes runtime HTTP/browser/DB interactions.
           ↓
verifying-feature-implementation
    Traceability & completeness verifier: Validates that every REQ / AC has proof.
           ↓
accepting-contract-first-features
    Decision gate: Issues the final ACCEPTED / BLOCKED verdict.
```

## Inputs

Read:

- `requirements.md` (with stable REQ, INV, and AC IDs)
- `design.md` (with boundaries and proof obligations)
- `contracts/` (manifest, schemas, scenarios)
- `tasks.md` (with completed status, roles, and verified revisions)
- Task evidence files under `evidence/tasks/*.md`
- Workstream review files under `evidence/workstreams/*.yaml`
- Runtime integration report under `evidence/integration-verification.md` (when required)
- Cumulative working-tree changes (committed, staged, unstaged, untracked)
- Fresh deterministic test execution output

## Checks

1. **Derive Requirement Traceability Matrix (RTM):** Map every requirement ID (`REQ-<DOMAIN>-<NUM>`) and acceptance criterion (`AC-<DOMAIN>-<NUM>-<SEQ>`) to:
   - concrete implementation files and line ranges;
   - corresponding unit, component, contract, DB, or browser test files and line ranges;
   - deterministic execution results (Pass / Fail).
2. **Confirm Task Completion:** Verify all tasks in `tasks.md` are marked `completed` and verified against current frozen contract revisions.
3. **Verify Design Compliance:** Confirm the implementation adheres to declared architecture, boundaries, invariants, and security/failure semantics.
4. **Execute Verification Commands:** Run relevant test suites and record exact commands and outcomes.
5. **Identify Gaps:** Identify any requirement or acceptance criterion lacking deterministic proof, failing tests, or violating specification invariants.

Do not infer completion from task checkboxes or prior agent claims. Inspect the code and execute fresh checks.

## Finding Gate

Before reporting a Blocking Implementation Issue, verify all of the following:

1. It maps to a specific approved requirement, invariant, or acceptance criterion.
2. Implementation or test evidence demonstrates a concrete failure.
3. The affected scenario is reachable through an approved system path or explicitly required invariant.
4. The defect is present in the current implementation.
5. Correcting it does not require inventing new product behavior.

Do not report speculative risks, style preferences, or optional hardening as blockers.

## Output

Write report to `.dream/specs/<feature>/evidence/feature-verification.md`:

```markdown
## Feature Verification

**Status:** Verified | Needs Fix | Blocked

### Requirement Traceability Matrix (RTM)
| Requirement | Invariant / AC | Implementation | Tests / Evidence | Result |
|---|---|---|---|---|
| REQ-PRODUCT-07 | INV-PRODUCT-07-01 | `internal/product/service.go:45-60` | `internal/product/service_test.go:88` | Pass |
| REQ-PRODUCT-07 | AC-PRODUCT-07-01 | `frontend/src/views/Product.tsx:32-40` | `frontend/src/views/Product.spec.tsx:55` | Pass |

### Commands Run
- `go test ./...` — PASS
- `npm run test` — PASS

### Blocking Implementation Issues
- [requirement ID] `path:line`: Concrete defect description and why the requirement is violated.

### Unverified Items
- [requirement ID]: Missing test or evidence and reason.

### Non-blocking Observations
- Observations not affecting correctness.
```

- **`Verified`:** Every approved requirement, invariant, and acceptance criterion has verifiable implementation and deterministic test evidence, and no blocking issue remains.
- **`Needs Fix`:** At least one concrete implementation or test defect prevents an approved requirement from being satisfied.
- **`Blocked`:** Verification cannot complete due to missing environment/dependency or required specification/architecture decision.
