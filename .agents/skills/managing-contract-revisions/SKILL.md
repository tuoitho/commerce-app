---
name: managing-contract-revisions
description: Use when implementation, review, or integration reveals that a frozen shared contract is missing behavior, encodes incorrect semantics, conflicts with requirements/design, or must evolve after dependent work already exists.
---

# Managing Contract Revisions

A frozen contract is immutable, not permanent. When a frozen contract is missing, wrong, ambiguous, or requires a semantic/schema change, create a Contract Change Request (CCR) using `references/contract-change-request.template.md` at `.kiro/specs/<feature>/changes/CCR-<ID>.md`.

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

## Invalidation

Trace the changed contract to tasks that `provide`, `consume`, or `verify` it. Mark only those completed tasks/evidence `STALE` or `REOPENED`; unaffected work remains complete.

Example:

```text
PRODUCT-DETAIL rev3 → rev4 (+ viewer.isLiked)
BE-03  REOPENED
FE-02  REOPENED
INT-02 INVALIDATED
BE-01  unchanged
```

After the new revision is frozen, route reopened tasks back to their persistent workstream owners, rerun their task gates, then rerun affected runtime integration scenarios.

Never rewrite a frozen revision in place, and never let implementation agents create private undocumented agreements to avoid the CCR process.
