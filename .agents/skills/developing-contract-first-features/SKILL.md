---
name: developing-contract-first-features
description: Use when an approved feature spans multiple implementation boundaries or agents and needs traceable delivery without reviewer-driven implementation loops.
---

# Developing Contract-First Features

## Core principle

Shared behavior is decided before parallel implementation. Implementation context persists by workstream; proof comes from deterministic gates and fresh boundary reviewers.

## Preconditions

Require approved `.kiro/specs/<feature>/requirements.md`. If requirements are contradictory or materially incomplete, stop at requirements engineering.

## Workflow

1. **REQUIRED SUB-SKILL:** Use `designing-contract-first-features`.
2. **REQUIRED SUB-SKILL:** Use `authoring-executable-contracts`.
3. **REQUIRED SUB-SKILL:** Use `reviewing-and-freezing-contracts` before parallel implementation.
4. **REQUIRED SUB-SKILL:** Use `planning-contract-workstreams` to create `tasks.md`.
5. Dispatch one persistent owner per coherent workstream and use `executing-persistent-workstreams`.
6. After every task, apply `verifying-task-gates`.
7. At high-risk task boundaries or when a workstream reaches a meaningful batch boundary, use `reviewing-workstreams` with fresh context.
8. When all required workstreams are ready, use `verifying-runtime-integration` against the real assembled system.
9. Use `accepting-contract-first-features` for final evidence-based acceptance.

At any phase, a discovered contract defect or missing boundary behavior invokes `managing-contract-revisions`; after re-freeze, reopen only affected work.

## Agent topology

Default to one persistent implementation agent per workstream, not per task. Split a workstream only when tasks are contract-independent and do not materially share domain models, abstractions, or files.

Fresh context is preferred for workstream reviewers, integration verifiers, and final acceptance reviewers.

## Non-negotiable boundaries

- Implementation agents do not silently edit frozen contracts.
- Reviewers do not redefine accepted contract semantics as implementation findings.
- Task completion requires its declared verification gate.
- Objective findings close by deterministic re-verification; do not require another LLM opinion.
- Semantic or architectural findings may receive targeted re-review. After two unsuccessful fix/re-review cycles for the same finding, escalate instead of looping.
