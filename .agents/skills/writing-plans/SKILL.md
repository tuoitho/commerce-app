---
name: writing-plans
description: Use when a sufficiently specified multi-step change needs executable implementation tasks before code changes begin
---

# Writing Plans

## Overview

Turn an approved specification into dependency-ordered, independently
verifiable implementation tasks. In a repository with an active OpenSpec
change, `openspec/changes/<change>/tasks.md` is the canonical plan.

Do not create a duplicate plan under `docs/superpowers/plans/` when an active
OpenSpec change governs the work. That path is a fallback only when the
repository has no governing OpenSpec change.

**Announce at start:** "I'm using the writing-plans skill to create the
implementation plan."

## Inputs

Read:

- repository instructions
- the active OpenSpec proposal and specifications
- the change design when present
- existing `tasks.md`
- affected repository structure, contracts, code, and tests

If material requirements are missing or contradictory, stop planning and
update the OpenSpec artifacts. A plan must not invent product behavior.

## Scope check

If the specification contains independent subsystems that cannot deliver a
coherent result together, decompose them into focused changes before writing
tasks. Each change must produce a working, testable outcome.

## Map files and interfaces

Before decomposing tasks, identify:

- files or modules created and modified
- the single responsibility of each unit
- interfaces consumed and produced
- shared contracts that must stabilize first
- deterministic commands that verify each behavior

Follow existing repository patterns. Include only targeted refactoring needed
to make the governed change safe and maintainable.

## Task contract

Each task in `openspec/changes/<change>/tasks.md` must contain:

```markdown
## N. Task name

**Outcome:** Observable result produced by this task.

**Files:**
- Create: `exact/path`
- Modify: `exact/path`
- Test: `exact/path`

**Interfaces:**
- Consumes: exact contracts or signatures from earlier tasks
- Produces: exact contracts or signatures used by later tasks

- [ ] Write the smallest failing test for the specified behavior.
- [ ] Run the focused test and confirm it fails for the expected reason.
- [ ] Implement the minimum change that makes the test pass.
- [ ] Run the focused test and confirm it passes.
- [ ] Refactor while keeping the focused test green.
- [ ] Run the broader affected verification command.
```

Use exact file paths, names, signatures, commands, and expected outcomes. The
implementer should not need to invent requirements or interfaces.

## Task boundaries

A task is the smallest unit that has its own test cycle and can be reviewed
independently. Fold setup and documentation into the deliverable that needs
them. Split work only where a reviewer could meaningfully accept one task and
reject the next.

Order tasks by dependency. A typical contract change order is:

```text
shared contract
-> provider behavior
-> consumer behavior
-> integration
-> complete verification
```

Do not plan parallel execution before shared contracts, error semantics, and
compatibility decisions are stable.

## TDD granularity

Within each task, use explicit red-green-refactor steps:

1. write one failing behavioral test
2. run it and confirm the expected failure
3. write minimal implementation
4. run it and confirm success
5. refactor while green
6. run the affected verification suite

Configuration-only or generated-code exceptions require explicit user
approval as defined by test-driven-development.

## No placeholders

Plans must not contain:

- `TBD`, `TODO`, or deferred implementation details
- "add appropriate error handling" without exact behavior
- "write tests" without a concrete test and command
- "same as another task" instead of the required details
- types, functions, or contracts not defined in the specification or a task

## Self-review

Before handoff:

1. Map every OpenSpec requirement to at least one task and verification step.
2. Remove placeholders and vague instructions.
3. Check signatures and property names across task interfaces.
4. Confirm dependency order and contract stability.
5. Confirm an implementation agent can execute without making product choices.

Fix issues directly in the canonical `tasks.md`.

## Execution handoff

After saving the plan, offer the execution modes supported by the environment:

- subagent-driven-development for independent tasks in the current session
- executing-plans for inline execution with checkpoints

Do not offer parallel delegation for coupled tasks or unstable contracts.

## Red flags

- writing `docs/superpowers/plans/*` beside an active OpenSpec change
- tasks that restate goals without exact verification
- product requirements invented by the plan
- consumers scheduled before their shared contract stabilizes
- a completed requirement with no task or evidence path
