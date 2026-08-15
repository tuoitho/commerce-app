---
name: task-breakdown
description: Use when approved .kiro requirements and design need dependency-ordered, independently verifiable implementation tasks
---

# Task Breakdown

Create `.kiro/specs/<feature>/tasks.md` from approved `requirements.md` and
`design.md`.

This file is the canonical implementation plan. It defines implementation
boundaries, dependencies, deliverables, and verification without pre-writing
private implementation.

## Task Format

Use at most two hierarchy levels.

A top-level item with children is a grouping epic. Only leaf tasks are
executable units dispatched to coding agents.

```markdown
# Implementation Plan

- [ ] 1. Catalog backend

- [ ] 1.1 Implement product-detail retrieval
  - **Produces:** `GET /products/{id}` with the approved detail contract.
  - **Scope:** catalog use case, persistence/query mapping, HTTP boundary, and focused tests.
  - **Consumes:** approved product and money contracts from design.
  - **Acceptance:** existing products return the complete projection; missing products return the approved not-found contract; timestamps and prices are preserved.
  - **Verification:** focused automated tests proving the behavior.
  - _Requirements: 3.8, 7.1, 8.6_
```

Parent epic checkboxes represent aggregate progress only. Do not dispatch,
implement, or review an epic separately from its leaf tasks.

## Leaf Task Right-Sizing

A leaf task is the smallest implementation unit that produces a coherent,
independently testable deliverable and is worth an independent reviewer gate.

Prefer behavior-oriented or contract-oriented slices over technical-layer
slices.

A leaf task may cross controllers, services, repositories, mappers, schemas,
and tests when those changes are all required to deliver one behavior
end-to-end. Crossing layers alone is not a reason to split.

Do not split one behavior mechanically into tasks such as:

- add a DTO;
- add a mapper;
- add a repository method;
- add a service method;
- update its test.

Merge such work when none of those pieces has a useful independently testable
outcome.

Split a candidate leaf task when it combines independently reviewable concerns
or several distinct systems that an implementer would need to reason about
simultaneously, such as:

- persistence behavior plus a separate concurrency protocol;
- feature-state lifecycle plus an independent authentication lifecycle;
- implementation behavior plus broad repository regression verification;
- reusable test infrastructure plus a large cross-feature E2E matrix.

Split only where a reviewer could meaningfully approve one resulting task while
rejecting another.

Keep setup, scaffolding, configuration, code generation, and behavior-specific
tests inside the leaf task whose deliverable requires them unless they form an
independently reusable prerequisite.

Each behavior-changing leaf task owns the tests for that behavior. Do not
create a later test-only task merely to make implementation appear smaller.

Cross-boundary integration or E2E verification may be a separate leaf task when
it validates several already-completed behaviors and has a bounded verification
objective.

## Complexity Check

Before accepting a leaf task, verify:

1. It has one primary behavioral or contractual objective.
2. Its correctness can be summarized by a small set of related invariants.
3. One reviewer can evaluate it without effectively reviewing the whole
   feature.
4. A likely review failure can be corrected mostly within the task's scope.

If these conditions do not hold, split or restructure the task.

Do not impose arbitrary limits on file count, line count, or test count.
Cohesion and reviewability govern task size.

## Planning Rules

- Map every granular acceptance criterion to at least one leaf task using
  `_Requirements: 1.1, 2.3_`.
- Order tasks by genuine implementation dependency. Stabilize material shared
  contracts before work units that consume them are dispatched.
- Prefer incremental vertical slices that leave the repository in a coherent,
  testable state.
- Include concrete files, components, or bounded areas when known, but treat
  them as scope guidance rather than mandatory line-level edits unless the
  approved design requires exact placement.
- State important `Consumes` and `Produces` contracts and implementation
  prerequisites.
- Include enough implementation direction to execute without inventing
  architecture, but do not duplicate design detail.
- Do not prescribe private helper structure, local algorithms, exact line
  edits, or implementation bodies unless explicitly fixed by approved design.
- Keep TDD inside each behavior-changing leaf task.
- Include only code, configuration required by code, automated tests, and
  bounded integration infrastructure.
- Exclude deployment, user testing, manual runtime checks, metrics gathering,
  training, process, marketing, and documentation-only work.
- Do not create a leaf task whose objective is "run all tests", "run all
  verification", or "fix whatever remains". Broad regression verification
  belongs to the final verification gate after implementation.
- Do not invent behavior or architecture absent from approved artifacts.
- Do not leave placeholders, vague instructions, unresolved interfaces, or
  open design decisions.

## Shared Contracts And Task Dependencies

A task dependency must represent a real execution dependency, not merely an
implementation order.

When independently implemented work units communicate through or rely on a
shared boundary, identify the canonical contract that governs that boundary.
Shared contracts may include, when applicable:

- HTTP, GraphQL, or RPC request/response contracts;
- gRPC/protobuf services and messages;
- events, commands, schemas, and delivery semantics;
- public module, package, service, or function interfaces;
- persisted formats, schemas, or migration contracts relied on across
  independently implemented boundaries;
- other cross-boundary formats, invariants, or compatibility guarantees.

When the approved design already fixes a shared contract:

- make producer and consumer tasks consume that canonical contract;
- do not make one implementation task the source of truth for another merely
  because it executes first;
- do not serialize otherwise independent work solely so a later task can
  discover the contract from earlier implementation.

Use a task-to-task dependency only when the earlier task produces concrete
implementation state required by the later task, such as generated bindings,
schema migrations, reusable infrastructure, or an implemented internal
component that the later task genuinely requires.

Do not invent shared contracts for work confined to one implementation
boundary with no independently implemented consumer.

## Quality Gate

First self-check:

1. requirement coverage;
2. dependency order;
3. leaf-task cohesion;
4. incremental integration;
5. coding-agent actionability;
6. absence of technical-layer fragmentation;
7. absence of mini-epics disguised as leaf tasks.

Then dispatch one independent broad review using `reviewing-feature-spec`.

If blocking findings are accepted:

1. revise only the affected tasks or upstream artifact;
2. preserve the original finding set;
3. perform a scoped re-review limited to:

   - whether those findings were resolved; and
   - regressions directly introduced by those revisions.

A new observation outside the changed scope does not reopen the repair loop
merely because the reviewer discovered it later. Treat it as advisory unless it
demonstrates a load-bearing requirement, design, dependency, or correctness
gap.

Allow at most two repair rounds for task planning. If a material blocker or
reviewer disagreement remains after that, stop and present it to the user for
adjudication rather than continuing autonomous review.

After the review gate is stable, use the `question` tool to ask exactly:

"Do the tasks look good?"

If the user requests a material change, revise the affected scope and rerun the
relevant checks. Run another broad review only when the change materially
alters task boundaries, shared contracts, dependencies, or requirements
coverage.

The workflow is not complete until the user explicitly approves `tasks.md`.
