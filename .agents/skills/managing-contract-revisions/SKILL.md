---
name: managing-contract-revisions
description: Use when implementation, review, or integration reveals that a frozen shared contract is missing behavior, encodes incorrect semantics, conflicts with requirements/design, or must evolve after dependent work already exists.
---

# Managing Contract Revisions

A frozen contract is immutable, not permanent. When a frozen contract is missing, wrong, ambiguous, or requires a semantic/schema change, create a Contract Change Request (CCR) using `references/contract-change-request.template.md` at `.dream/specs/<feature>/changes/CCR-<ID>.md`.

Do not edit the frozen contract directly.

## CCR lifecycle

`OPEN → IMPACT_ANALYSIS → APPROVED|REJECTED → APPLIED → REVERIFIED → CLOSED`

A CCR records:

- reason and evidence;
- current contract/revision;
- affected requirements/design decisions;
- proposed semantic/schema change;
- compatibility (`additive`, `breaking`, `semantic`);
- affected providers, consumers, tasks, and integration scenarios.

If the requested behavior is not supported by approved requirements, update requirements first. If it changes responsibility/architecture, update design first. Then author and review a new contract revision using the normal contract skills (`authoring-executable-contracts` and `reviewing-and-freezing-contracts`).

## Invalidation by Contract Role

Trace the changed contract to tasks matching the contract ID in `tasks.md`:

- Tasks with `role: provider` → mark `STALE` or `REOPENED` for implementation updates.
- Tasks with `role: consumer` → mark `STALE` or `REOPENED` for consumer adjustments.
- Tasks with `role: verifier` / integration tests → mark `INVALIDATED` for re-verification.
- Unaffected tasks (not referencing the changed contract) → remain `completed`.

Example:

```text
PRODUCT-DETAIL rev3 → rev4 (+ viewer.isLiked)
BE-03 (role: provider)  → REOPENED
FE-02 (role: consumer)  → REOPENED
INT-02 (role: verifier) → INVALIDATED
BE-01 (contracts: [])   → unchanged
```

After the new revision is frozen in `contracts/manifest.yaml`:
1. Route reopened tasks back to their persistent workstream owners.
2. Rerun their task gates (`verifying-task-gates`).
3. Rerun affected runtime integration scenarios (`verifying-runtime-integration`).
4. Re-verify the feature implementation (`verifying-feature-implementation`).

Never rewrite a frozen revision in place, and never let implementation agents create private undocumented agreements to avoid the CCR process.
