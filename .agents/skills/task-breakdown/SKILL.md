---
name: task-breakdown
description: Use when approved .dream requirements and design need dependency-ordered, independently verifiable implementation tasks
---

# Task Breakdown

Create `.dream/specs/<feature>/tasks.md` from approved `requirements.md` and
`design.md`.

This file is the canonical implementation plan. It defines implementation
boundaries, dependencies, deliverables, integration work, and verification
without pre-writing private implementation.

Plan from the approved feature behavior and the existing-system integration
defined by design. Do not rediscover product behavior or architecture during
task planning.

## Task Format

Use at most two hierarchy levels.

A top-level item with children is a grouping epic. Only leaf tasks are
executable units dispatched to coding agents.

```markdown
# Implementation Plan

- [ ] 1. Core behavior

- [ ] 1.1 Implement resource retrieval
  - **Produces:** `GET /items/{id}` with the approved detail contract.
  - **Scope:** query/mapping, boundary handling, and focused tests.
  - **Consumes:** approved data and payload contracts from design.
  - **Acceptance:** valid requests return the complete projection; missing targets return the approved not-found contract; values and metadata are preserved.
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
5. Any supporting dependency it consumes already has a stable approved contract
   or is produced by an explicit prerequisite task.
6. Any existing behavior it affects is bounded clearly enough that the task does
   not require rediscovering adjacent feature scope during implementation.
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
- For every material input or dependency supplied outside the task's own
  boundary, ensure the consuming task names the approved source or contract
  that supplies it.
- When design identifies an affected existing flow, ensure the relevant leaf
  task preserves or intentionally changes that behavior and owns focused
  verification for it.
- Do not create producer work for a supporting dependency when design has
  established that an existing capability is sufficient.
- Do not let implementation tasks decide whether an existing behavior should be
  preserved, changed, rejected, detached, cascaded, migrated, or otherwise
  handled when that choice is product- or contract-visible; such decisions must
  already be settled upstream.
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

## Feature Dependency Coverage

Build the implementation plan from both:

1. feature-owned behavior; and
2. downstream impacts and supporting dependencies defined by the approved
    design.

For each material dependency, determine whether implementation work is actually
required.

### Supporting Dependencies

When a feature requires behavior, data, state, or a contract owned outside its
primary implementation boundary to complete a supported workflow:

- identify the canonical capability or contract defined by design;
- make the consuming task explicitly name that contract under `Consumes`;
- add producer-side implementation work only when the existing capability is
  insufficient;
- include integration verification proving that the consuming workflow works
  against the approved contract.

Do not assume that required external inputs, state, capabilities, or contracts
will somehow be available during implementation.

Do not create a parallel capability or duplicate source of truth when an
existing supported mechanism already satisfies the dependency.

### Downstream Impacts

When the feature changes behavior, state, contracts, or concepts relied on by
existing supported functionality:

- include implementation work for affected existing behavior when code changes
  are required;
- include focused regression verification where compatibility must be
  preserved;
- make intentional behavior changes traceable to the approved requirement and
  design decision.

Do not add tasks for unrelated neighboring functionality merely because it was
encountered during dependency discovery.

### Dependency Tasking

A dependency does not require its own leaf task merely because it crosses a
domain or component boundary.

Keep dependency work inside the behavior-oriented leaf task when it is small,
cohesive, and independently reviewable.

Create a separate leaf task when the dependency itself produces a coherent
reusable deliverable, such as:

- a new or extended shared API contract;
- a schema or migration required by multiple consumers;
- reusable generated bindings;
- a shared capability independently consumed by multiple tasks.

Tasks must not rely on implementation-time negotiation to discover material
shared contracts, ownership, semantics, compatibility behavior, or unresolved
cross-boundary decisions.

When independently executable tasks communicate through a shared boundary, the
approved contract must already be stable before those tasks are dispatched.

Once the contract is stable, producer and consumer tasks do not depend on one
another merely to discover or negotiate that contract.

## Quality Gate

First self-check:

1. requirement coverage;
2. dependency order;
3. leaf-task cohesion;
4. incremental integration;
5. coding-agent actionability;
6. absence of technical-layer fragmentation;
7. absence of mini-epics disguised as leaf tasks.
8. downstream-impact coverage;
9. supporting-dependency coverage;
10. stable sources or contracts for material dependencies outside each task's
    implementation boundary;
11. absence of implementation tasks that must invent missing shared contracts,
    ownership, semantics, or compatibility behavior;
12. absence of duplicate implementation work when an existing approved
    capability is sufficient.

## Completion
After the self-check passes, return the completed `tasks.md` to the coordinating
workflow.
Do not request implementation approval, dispatch reviewers, dispatch coding
work, or begin implementation.
When governed by `spec-driven-development`, that workflow owns independent
review, repair-round budgeting, and explicit user approval of `tasks.md`.
When invoked outside that coordinating workflow, the caller must still arrange
the governed independent specification review before implementation.