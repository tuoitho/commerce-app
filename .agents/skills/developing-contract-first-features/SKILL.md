---
name: developing-contract-first-features
description: Use when executing an approved feature specification across workstreams with persistent owners, deterministic gates, and evidence-based acceptance.
---

# Developing Contract-First Features

Execute an approved feature specification (`requirements.md`, `design.md`, frozen contracts, and `tasks.md`).

This skill coordinates implementation execution. Planning and specification governance are owned by `spec-driven-development`.

## Core Principle

Shared behavior is frozen before parallel implementation. Implementation context persists by workstream owner; proof comes from deterministic task gates, selective reviews, runtime verification, and complete requirement traceability before final acceptance.

## Preconditions

Require an approved planning baseline under `.dream/specs/<feature>/`:
- Approved `requirements.md` (with stable REQ, INV, AC IDs)
- Approved `design.md` (with verification proof strategy)
- Frozen contracts in `contracts/` (when shared boundaries exist)
- Approved `tasks.md` DAG
- Passed specification review (`reviewing-feature-spec`)

If the specification is incomplete, contradictory, or unapproved, return control to `spec-driven-development`.

## Execution Workflow

```text
               approved planning baseline
                           │
                           ▼
             persistent workstream owners
             (executing-persistent-workstreams)
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
             Backend              Frontend
            workstream           workstream
                 │                   │
           task gate           task gate
         (verifying-task-gates) (verifying-task-gates)
                 │                   │
             selective           selective
              review              review
         (reviewing-workstreams)(reviewing-workstreams)
                 └─────────┬─────────┘
                           ▼
                    assembled system
                           │
             verifying-runtime-integration
                 (when required by design)
                           │
             verifying-feature-implementation
             (traceability & completeness verification)
                           │
             accepting-contract-first-features
                     (decision gate)
                           │
                 ACCEPTED / BLOCKED
```

1. **Load Baseline:** Load the approved specification artifacts and task DAG.
2. **Dispatch Persistent Owners:** Dispatch one persistent implementation agent per coherent workstream (`executing-persistent-workstreams`).
3. **Execute Tasks with TDD:** Each workstream owner executes assigned tasks in DAG order following `test-driven-development`.
4. **Task Verification Gates:** After completing each task, run `verifying-task-gates`. Record task verification evidence in `.dream/specs/<feature>/evidence/tasks/<TASK-ID>.md`.
5. **Selective Workstream Review:** At high-risk task boundaries or meaningful batch milestones, invoke `reviewing-workstreams` with fresh context. Record review findings in `.dream/specs/<feature>/evidence/workstreams/<owner>-review-<seq>.yaml`.
6. **Runtime Integration Verification (when required):** When workstreams are assembled, invoke `verifying-runtime-integration` against the real system for scenarios requiring runtime HTTP, browser, or multi-process proof as defined by the design's verification strategy. Record evidence in `.dream/specs/<feature>/evidence/integration-verification.md`.
7. **Feature Implementation Verification:** Invoke `verifying-feature-implementation` to derive the Requirement Traceability Matrix (RTM) and verify that every approved `REQ` and `AC` has concrete implementation and passing test proof. Record in `.dream/specs/<feature>/evidence/feature-verification.md`.
8. **Final Acceptance Decision:** Invoke `accepting-contract-first-features` with fresh context. Ensure feature verification status is `Verified` and all tasks are completed against current contract revisions. Record the verdict in `.dream/specs/<feature>/evidence/final-acceptance.md`.
9. **Branch Integration:** Use `finishing-a-development-branch` to prepare the changes for integration.

## Distinct Roles of Final Gates

To avoid duplicate work, the final gates have distinct, complementary responsibilities:

- **`verifying-runtime-integration` (Evidence Producer):** Executes real cross-boundary HTTP, database, and browser interactions on the assembled system to generate runtime proof.
- **`verifying-feature-implementation` (Traceability & Completeness Verifier):** Verifies that 100% of approved requirements, invariants, and acceptance criteria have corresponding implementation lines and deterministic test evidence.
- **`accepting-contract-first-features` (Decision Gate):** Evaluates all collected evidence, open CCRs, and verification reports to issue the final `ACCEPTED` or `BLOCKED` verdict.

## Contract Revision Handling

At any phase, if a discovered contract defect, missing boundary behavior, or schema mismatch is identified:
1. Invoke `managing-contract-revisions` to create a CCR (`.dream/specs/<feature>/changes/CCR-<ID>.md`).
2. Update requirements or design if needed (with required approvals).
3. Re-freeze the updated contract revision.
4. Invalidate only the affected tasks (based on `role: provider`, `role: consumer`, `role: verifier`) and route them back to their persistent owners for re-execution.

## Agent Topology & Safety

- Default to one persistent implementation agent per workstream, not per task.
- Fresh context is preferred for spec reviewers, workstream reviewers, runtime verifiers, feature verifiers, and acceptance reviewers.
- Implementation agents never silently alter frozen contracts without a CCR.
- Objective findings close by deterministic re-verification, not subjective LLM debate.
