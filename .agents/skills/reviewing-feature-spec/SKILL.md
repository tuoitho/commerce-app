---
name: reviewing-feature-spec
description: Use when performing an independent, cross-phase review of a complete feature specification (requirements, design, frozen contracts, and tasks) before implementation starts.
---

# Reviewing Feature Specification

Perform an independent, cross-phase specification review across all planning artifacts:
- `.dream/specs/<feature>/requirements.md`
- `.dream/specs/<feature>/design.md`
- `.dream/specs/<feature>/contracts/` (when shared contracts exist)
- `.dream/specs/<feature>/tasks.md`

Use fresh reviewer context. This review checks cross-phase traceability, completeness, consistency, and execution readiness before any implementation code is written.

## Review Scope and Authority

The reviewer checks the alignment of four layers:

```text
Requirements (WHAT / INVARIANTS / AC)
       ↕
Design (HOW / BOUNDARIES / PROOF STRATEGY)
       ↕
Contracts (SHARED INTERFACES & SCENARIOS)
       ↕
Tasks DAG (OWNERSHIP / ROLES / VERIFICATION)
```

Note: Detailed low-level contract schemas are reviewed by `reviewing-and-freezing-contracts`. This skill focuses on **cross-phase integration and completeness**.

## Review Checks

### 1. Requirements Quality & Completeness
- Every requirement has a stable ID (`REQ-<DOMAIN>-<NUM>`) and testable EARS syntax.
- Invariants (`INV-<DOMAIN>-<NUM>-<SEQ>`) are defined for properties that must remain true across operations/states/boundaries.
- Acceptance criteria (`AC-<DOMAIN>-<NUM>-<SEQ>`) define clear observable proof conditions.
- Scope and Out of Scope boundaries are explicit.
- No unmeasurable terms ("fast", "intuitive", "flexible") without concrete thresholds.

### 2. Design Alignment
- Every approved requirement maps to an architectural component or boundary in `design.md`.
- Shared boundaries vs private components are clearly distinguished.
- A Verification Strategy / Proof Selection is defined (mapping behaviors to unit, DB integration, contract, component, browser, or visual checks).
- State ownership, failure semantics, and security boundaries are explicit.

### 3. Contract Alignment (when contracts exist)
- All shared boundaries requiring contracts have corresponding frozen contract definitions in `contracts/manifest.yaml`.
- Scenarios in `scenarios.yaml` cover normal and state-dependent/failure behaviors mapped to requirement IDs.

### 4. Task Breakdown & Traceability
- **Complete REQ & AC Coverage:** Every approved `REQ` and `AC` is covered by at least one implementation task.
- **Contract Role Completeness:** For every frozen contract, both provider (`role: provider`) and consumer (`role: consumer`) tasks exist (unless a consumer already exists outside feature scope).
- **Proof Level Match:** Declared task `verification` checks match the proof levels specified in the design's verification strategy.
- **DAG Integrity:** `depends_on` dependencies form a valid directed acyclic graph without circular deadlocks.
- **Bounded Tasks:** Tasks are defined by observable outcomes, not private layering recipes (`Service/Repository/Controller`).

### 5. YAGNI & Complexity Gate
- No speculative abstractions, unrequested configurability, or premature optimizations.
- Scope matches only the approved feature intent.

## Finding Categorization

Report findings under two categories:

1. **Blocking Findings:**
   - Missing requirement, invariant, or acceptance criterion for supported workflow.
   - Requirement without an owning component in design or without task coverage.
   - Shared contract missing provider or consumer task in `tasks.md`.
   - Circular dependency or impossible ordering in task DAG.
   - Contradiction between requirements, design, contracts, or tasks.
   - Verification check insufficient for declared design proof obligation.

2. **Non-blocking Suggestions:**
   - Minor naming improvements or non-critical formatting suggestions.
   - Non-blocking suggestions do not prevent approval or enter the repair loop.

## Re-review Mode

When invoked after a specification repair round:
- Verify only the previously reported blocking findings and any contradictions directly introduced by the artifact edits.
- Do not perform another broad spec audit or introduce unrelated new findings.
- Allow at most three review rounds total.

## Output Format

```markdown
## Specification Review

**Status:** APPROVED | BLOCKED

### Traceability Summary
| Requirement | Invariants | Acceptance Criteria | Design Boundary | Contract | Assigned Tasks & Roles | Proof Level |
|---|---|---|---|---|---|---|
| REQ-PRODUCT-07 | INV-PRODUCT-07-01 | AC-PRODUCT-07-01, AC-PRODUCT-07-02 | Product Detail API | PRODUCT-DETAIL@4 | BE-03 [provider], FE-02 [consumer] | contract + runtime HTTP |

### Blocking Findings
- `[ID]` `[File / Section]`: Description of defect/gap and concrete required fix.

### Non-blocking Suggestions
- Description of non-blocking observation.
```

When no blocking findings exist, report `Status: APPROVED`.
