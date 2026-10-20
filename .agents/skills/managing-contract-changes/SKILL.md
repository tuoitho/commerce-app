---
name: managing-contract-changes
description: Use when an approved .dream specification must change after tasks.md approval — an API, event, database schema, shared type, or configuration key changes, or implementation, review, or the user reveals that an approved contract is wrong or incomplete — to record a CCR and reopen exactly the tasks the change affects
---

# Managing Contract Changes

Change an approved `.dream/specs/<feature>/` specification through a Contract
Change Request (CCR), then reopen only the tasks whose completed work the
change invalidates. Tasks that do not reference a changed contract stay
complete.

This workflow edits specification artifacts and task state only. It never
edits implementation code.

## When A CCR Is Required

Use a CCR after `tasks.md` is approved when a change touches any of:

- a design contract (`#### Contract <ID> (rev <N>)` in `design.md`);
- approved requirements or acceptance criteria;
- the leaf-task set or a task's approved outcome.

A CCR is not required for private implementation details that no requirement,
design contract, or task outcome fixes. Implement those directly.

Before `tasks.md` approval, revise artifacts through `spec-driven-development`
instead.

## Contract Roles

Every leaf task lists the contracts it touches in its `Contracts` field as
`<ID>@<rev> (<role>)`:

- `provider` — implements the producing side: endpoint, handler, migration,
  event emitter, shared type or configuration definition.
- `consumer` — calls, reads, renders, or otherwise depends on the contract.
- `verifier` — integration or E2E work whose objective is proving the
  contract across boundaries.

## Compatibility Classes

- `additive` — existing consumers keep working unchanged: new optional field,
  new endpoint, new nullable column, new event type.
- `breaking` — existing consumers must change: removed or renamed field,
  changed type, new required input, removed endpoint, changed status or
  `error.code`, dropped or non-nullable column.
- `semantic` — same shape, different meaning: changed ordering, defaults,
  filtering, authorization, state transitions, or units.

Classify by effect on existing consumers, not by diff size. When unsure
between two classes, choose the stricter one.

## Workflow

1. **Read state.** Read `requirements.md`, `design.md`, `tasks.md`, and
   existing `changes/CCR-*.md`. Identify the change and its trigger (user
   request, implementation finding, review finding).
2. **Backfill contract IDs when missing.** If a changed boundary has no
   `#### Contract <ID> (rev <N>)` heading, add one around the existing
   approved definition in `design.md` as `rev 1`. For each leaf task that
   touches that contract, add a `Contracts` field. Find those tasks from their
   `Produces`, `Consumes`, and `Scope` text plus direct code consumers of the
   endpoint, table, event, or type. Backfill only contracts this CCR changes.
3. **Analyze impact.** For each changed contract, list every task that
   references it and apply the reopen rules below. Then search directly for
   code consumers of the changed contract that no task in this feature covers,
   including code owned by other features; each one needs a new leaf task.
   Follow `discovering-feature-dependencies` boundaries: direct consumers only.
4. **Draft the CCR** at `changes/CCR-<NNN>-<slug>.md` using the format below,
   `Status: PROPOSED`. `<NNN>` is the next three-digit number in that
   directory.
5. **Request approval.** Present the change, each contract's compatibility
   class, and the impact table through the `question` tool. Stop and wait. On
   rejection, set `Status: REJECTED`, revert any backfill that is not needed,
   and stop.
6. **Apply** the approved CCR to the artifacts (see Applying).
7. **Review breaking or semantic changes.** When any changed contract is
   `breaking` or `semantic`, dispatch one fresh reviewer that loads
   `reviewing-feature-spec` in Change Review Mode with the CCR path, the three
   artifact paths, and the artifact diff. Repair blocking findings with at
   most three review rounds total, as in `spec-driven-development`. If a
   repair changes approved behavior, return to step 5. `additive` CCRs skip
   this review.
8. **Record** `Status: APPLIED` and report the reopened and new tasks. Tell
   the user to resume execution on `tasks.md` with
   `single-agent-development` or `subagent-driven-development`; both execute
   only incomplete leaf tasks.

## Reopen Rules

For each task referencing a changed contract:

| Task state | Role | Compatibility | Action |
|---|---|---|---|
| complete | provider | any | reopen |
| complete | consumer | breaking, semantic | reopen |
| complete | consumer | additive | reopen only when the CCR requires this consumer to use the new element; otherwise bump the reference |
| complete | verifier | any | reopen |
| incomplete | any | any | bump the reference |

Tasks that reference no changed contract stay as they are. Reopen a task
whose approved outcome or acceptance criteria the CCR changes even when it
references no contract.

## Applying

- **Requirements:** edit changed requirements and acceptance criteria in
  place. Keep existing IDs; delete removed criteria and never reuse their IDs;
  give new criteria the next free number under their requirement.
- **Design:** update the contract definition and increment its heading
  revision: `#### Contract API-CHAT (rev 2)` → `(rev 3)`. Update other design
  sections that depend on it.
- **Database schema:** never edit a migration that has been applied to any
  database, including a local development database. The provider task adds a
  new numbered migration.
- **Tasks:** for each reopened task, change `- [x]` to `- [ ]`, update its
  `Contracts` references to the new revision, and add
  `- **Reopened:** CCR-<NNN> — <required change>`. Revise its `Acceptance`
  and `_Requirements_` when the CCR changes them. Uncheck a parent epic whose
  child is reopened. Append new leaf tasks with the next free number under the
  most relevant epic, with a complete task entry and `Contracts` field.
- **Active execution ledger:** if `.dream/sad/<feature>-tasks/progress.md` or
  `.dream/sdd/<feature>-tasks/progress.md` exists, append
  `Task <N>: reopened (CCR-<NNN>)` for each reopened task.

Keep workflow history out of `requirements.md` and `design.md`; the CCR is the
change record. The `Reopened` marker is execution state; the executing
workflow removes it when the task is complete again.

## CCR Format

```markdown
# CCR-<NNN>: <Title>

Status: PROPOSED | APPLIED | REJECTED
Trigger: <user request | Task <N> implementation | review finding>

## Change
<Observable behavior or contract change and the reason for it.>

## Contracts
| Contract | Revision | Compatibility | Change |
|---|---|---|---|
| API-CHAT | 2 → 3 | breaking | rename `orderId` to `attachedOrderId` |

## Artifact Updates
- requirements.md: <changed, added, or removed IDs, or none>
- design.md: <sections>
- tasks.md: <reopened and new tasks>

## Impact
| Task | Role | Reference | Action |
|---|---|---|---|
| 2.1 | provider | API-CHAT@2 | reopen |
| 3.2 | consumer | API-CHAT@2 | reopen |
| 3.1 | consumer | API-CHAT@2 | bump to @3 |
| 5.1 (new) | consumer | API-CHAT@3 | new task: admin inbox reads renamed field |

## Migration And Release Notes
<New migration, data backfill, or coordinated frontend/backend release; or none.>
```

## Guardrails

- Never edit an approved contract without a CCR and a revision increment.
- Never reopen tasks by intuition; every reopened task traces to a changed
  contract, requirement, or task outcome in the impact table.
- Never leave a direct code consumer of a changed contract without a task.
- Do not bundle unrelated changes into one CCR; one coherent change per CCR.
- Do not implement code in the same response that applies the CCR.
