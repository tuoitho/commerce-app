---
name: single-agent-development
description: Use when executing an approved implementation plan whose tasks are tightly coupled — shared types, handler/service/repository layers, migrations plus application code, multi-step workflows — so one implementer should keep context across every task instead of a fresh subagent per task.
---

# Single-Agent Development (SAD)

Execute a plan with exactly one implementer that keeps its context from the
first task to the last, gated by independent fresh reviewers and a final
feature verification.

**Core principle:** one implementer for context continuity; independent
reviewers for judgment. The implementer never approves its own work.

The primary agent is the controller in every mode: it owns the ledger,
`tasks.md`, and every reviewer dispatch. Templates written from a subagent's
point of view call it "the controller".

**Review invariant:** a broad review happens once per lifecycle boundary.
Reviewer-requested fixes receive scoped re-review only.

## Modes

Two parameters select the mode. Record both in the ledger header; after
compaction, resume in the recorded mode.

| Parameter | Value | Meaning |
|---|---|---|
| `implementer` | `main` | The primary agent edits the worktree itself. No implementer subagent. |
| | `persistent` | One implementer subagent, dispatched for the first task and resumed for every later task and fix. The primary agent only coordinates. |
| `review` | `per-task` | A fresh reviewer gates every task before the next begins, plus the final gates. |
| | `final-only` | Tasks close on focused tests and self-review; the final gates are the only independent review. |

If the user or the invoking command names a value, use it. Otherwise use
`implementer=main`, `review=per-task`. Choose `persistent` when the plan is
large enough that implementation detail would crowd out the primary agent's
coordination context. Choose `final-only` only when the user accepts that a
defect in an early task can propagate until the final review.

Use `subagent-driven-development` instead when tasks are genuinely
independent with stable shared contracts and fresh implementers are
preferable.

## Process

```text
Setup: worktree, workspace, ledger, read artifacts, pre-flight scan
For each incomplete leaf task in dependency order:
  Implement with TDD, focused tests, self-review, task report
  review=per-task:   fresh task reviewer -> fix loop (max 3 rounds) -> complete
  review=final-only: complete as self-verified
Final code review -> at most ONE final fix wave + scoped re-review
Feature verification -> at most ONE repair wave + scoped re-verification
Delete this plan's workspace; preserve the implementation worktree
```

## Setup

1. Load `using-git-worktrees` and work in an isolated worktree. Never start on
   `main` or `master` without the user's explicit consent.
2. Run this skill's `node scripts/sad-workspace.mjs PLAN_FILE` (resolving
   `scripts/` relative to this skill's directory). It prints this plan's
   git-ignored directory (`<repo-root>/.dream/sad/<parent>-<plan-basename>/`),
   home to every artifact of this plan: ledger, briefs, reports, review
   packages. Another plan's directory is never yours to read or write.
3. Check `<workspace>/progress.md`. If its first line names your plan file,
   a task's latest status line governs: `Task <N>: complete` is DONE — never
   redo it; `Task <N>: reopened (CCR-<NNN>)` makes it incomplete again. Resume
   at the first incomplete task. A task whose last line is a fix round is
   mid-loop: resume at the next round. If that next round's before-package
   already exists, the round was interrupted: reuse that package, finish the
   fix, and continue the round. Otherwise create the ledger:

```markdown
# SAD ledger — plan: <PLAN_FILE>
Mode: implementer=<main|persistent>, review=<per-task|final-only>
Base commit: <BASE_SHA from git rev-parse HEAD>
Implementer: <agent/session id, persistent mode only>
```

   The ledger is the recovery map. After compaction, trust its entries, the
   reports, and the current diff over your recollection.
4. For `.dream/specs/<feature>/tasks.md`, read the sibling `requirements.md`
   and `design.md`. The execution request authorizes the approved and
   independently reviewed artifact set; do not repeat plan review unless files
   are missing, contradictory, or materially changed.
5. Scan the plan once for tasks that contradict each other or the Global
   Constraints, and for anything the plan mandates that the review rubric
   treats as a defect (a test that asserts nothing, verbatim duplication of a
   logic block). Present all findings to the user as one batched prompt via the
   platform's structured user-question tool (e.g., `question` or
   `ask_question`), each beside the plan text that mandates it. A clean scan
   proceeds silently.
6. Enumerate incomplete leaf tasks in dependency order. One todo per leaf
   task; exactly one in progress.

## Implementing A Task

Before each task and each fix, capture an immutable before-package:
`node scripts/review-package.mjs PLAN_FILE BASE_SHA HEAD <workspace>/task-<N>-r<R>-before.diff`
(R=0 for the initial implementation). Never reuse a package path.

Run `node scripts/task-brief.mjs PLAN_FILE N`. It prints absolute `BRIEF_FILE=`
and `REPORT_FILE=` values; use them verbatim.

**`implementer=main`:** implement directly in the current session and follow
the Your Job, Self-Review, and Report Format sections of
`implementer-prompt.md` yourself, writing the report to `REPORT_FILE`.

**`implementer=persistent`:** for the first task, dispatch
`implementer-prompt.md` and record the agent/session id in the ledger. For
every later task, resume that same session with a new dispatch message. Each
dispatch message contains exactly:

1. one line on where this task fits;
2. the brief path, introduced as "read this first — it is your requirements";
3. stable interfaces and decisions from earlier tasks that the brief cannot
   know, or a pointer to the canonical contract source;
4. your resolution of any ambiguity you noticed in the brief;
5. the report path and the report contract;
6. pointers to ledger entries for findings parked in the area this task
   touches.

Hand artifacts over as files. Everything pasted into a dispatch, and every
reply, stays resident in your context for the rest of the session.

Handle the implementer status:

- `DONE` — proceed to the task gate.
- `DONE_WITH_CONCERNS` — read the concerns; resolve correctness or scope
  concerns before the gate, note observations and proceed.
- `NEEDS_CONTEXT` — supply the missing context and resume.
- `BLOCKED` — supply context, split the task, or escalate a plan defect to
  the user. Never resume with an unchanged request.

Replace the persistent implementer only when its session is unavailable or
it is blocked by capability; the replacement reads the brief and report
files. Record the replacement in the ledger.

In either implementer mode, stop and report `BLOCKED` or `NEEDS_CONTEXT` on a
missing decision, a contradictory plan, or a missing dependency. If
implementation reveals a material specification gap, or that an approved
contract is wrong or incomplete, stop and run `managing-contract-changes`.
After the CCR is applied, re-enumerate incomplete leaf tasks in dependency
order and continue; reopened tasks are ordinary incomplete tasks, and their
`Reopened` line tells the implementer what must change.

## Task Gate

Capture the after-package with
`node scripts/review-package.mjs PLAN_FILE BASE_SHA HEAD <workspace>/task-<N>-r<R>-after.diff`.

### `review=final-only`

Confirm the report contains the focused test command and output, and TDD
evidence for behavior changes. Append `Task <N>: complete (self-verified)` and
continue. Nothing else closes a task in this mode.

### `review=per-task`

Dispatch a fresh read-only reviewer with `task-reviewer-prompt.md`: the brief,
the report, both packages, and the binding global constraints copied verbatim
from the plan or specification. A task reviewer is never reused. Implementer
self-review never replaces this gate, and a report missing either verdict
(spec compliance AND task quality) is incomplete.

Never pre-judge findings for the reviewer. If the prompt you are writing
contains "do not flag", "at most Minor", or "the plan chose", you are
pre-judging to avoid a review loop — remove it.

Resolve each `⚠️ Cannot verify from diff` item yourself using the plan and
concrete evidence. A confirmed gap enters the fix loop; a verified
cross-task dependency is recorded in the ledger.

An Evidence Gap alone does not enter the fix loop. Take at most one recovery
action — obtain existing evidence or run a focused check — and record the
outcome in the ledger.

## Task Fix Loop (`review=per-task`)

Spec ❌, Critical or Important findings, and confirmed ⚠️ gaps enter the loop.
Two routes leave it immediately:

- Minor findings: append `Task <N>: minor (deferred): <one-liner>`. The final
  review triages this list.
- A finding labeled plan-mandated, or conflicting with the plan text: show the
  user the finding and the plan text and ask which governs. Never dismiss it
  and never fix against the plan without asking.

One round = one fix + one scoped re-review. At most three rounds per task:

1. Capture `task-<N>-r<R>-before.diff`.
2. Fix the exact admitted findings: in `main` mode edit directly; in
   `persistent` mode resume the implementer with the findings verbatim. Never
   fix in the controller session while in `persistent` mode.
3. Re-run the covering tests and append the fix, command, and output to the
   report. Do not dispatch the re-review until all three are present.
4. Capture `task-<N>-r<R>-after.diff` and dispatch a fresh reviewer with
   `re-review-prompt.md`.
5. Append `Task <N>: fix round <R>/3 (<X> addressed, <Y> open — <one-liners>)`.

**Breaker.** If findings remain after round 3, adjudicate each one — only at
the cap, never earlier:

- Reviewer wrong or point contestable → `Task <N>: parked — <finding> — ruling: <why the code stands>`.
- Real but nothing downstream builds on it → park with a ruling that says so.
- Real and load-bearing, or reveals a plan defect → append
  `Task <N>: BLOCKED — <reason>` and report the finding, the plan text, and
  the fix history to the user. This stops the plan: start no later task until
  the user resolves it.

On a clean review append `Task <N>: complete (review clean)`, or
`Task <N>: complete (<K> parked)` after the breaker.

## Completing A Task

After the ledger line, mark the task `- [x]` in `tasks.md` and remove its
`Reopened` line if present; mark a parent only when its last child completes. The primary agent owns the ledger and
`tasks.md` in every mode. Mark the todo complete and continue to the next leaf
task.

## Final Code Review

After every task is complete:

1. Run `node scripts/review-package.mjs PLAN_FILE BASE_SHA HEAD <workspace>/final-before.diff`.
2. Dispatch a fresh reviewer on the most capable available model using
   `requesting-code-review` with the `review-agent` skill. Provide the
   requirements, design, tasks, the package path, the reports, and the
   ledger's deferred, parked, and self-verified lines.
3. Triage:
   - P0 and P1 are blocking.
   - P2 is blocking only when it violates an approved requirement or contract,
     or is a concrete correctness, security, data-integrity, compatibility, or
     merge-safety defect; otherwise defer it with a ledger ruling.
   - P3 is recorded and never triggers a fix.
4. If any admitted blocking finding remains, run exactly ONE final fix wave
   containing all of them (by `implementer` mode, as in the task fix loop),
   with fix evidence written to `<workspace>/final-fix-report.md`. Capture
   `final-after.diff` and run exactly one scoped re-review with
   `re-review-prompt.md`. There is no second final fix wave.
5. Adjudicate residual findings as at the task breaker. A residual
   load-bearing finding stops the plan before feature verification.

## Feature Verification

Dispatch one fresh verifier that loads `verifying-feature-implementation`,
with the three artifact paths, a fresh cumulative package, and the
repository verification context. This is the only broad feature verification.

- `Verified` — finish.
- `Blocked` — report the evidence or decision needed to the user.
- `Needs Fix` — exactly one repair wave: one fix containing every open
  verification finding, with evidence written to
  `<workspace>/verification-repair-report.md` and before/after packages
  around it, one scoped code re-review of the repair diff, and one
  re-verification in Re-verification Mode with the previous report, the
  still-open requirement IDs, the repair diff, and the test evidence. Append
  `Feature verification: repair wave 1/1 (<X> resolved, <Y> open)`. A
  remaining `Needs Fix` or `Blocked` returns control to the user.

## Finish

On `Verified`, delete this plan's workspace directory, preserve the
implementation worktree, and report completion with the verified evidence. Do
not commit, merge, push, create a PR, or remove the worktree unless the user
explicitly asks; then use `finishing-a-development-branch`.

## Model Selection

Always name the model when dispatching a subagent; an omitted model inherits
the session's most expensive one.

- Persistent implementer: at least a standard tier — it spans integration work
  across every task.
- Task reviewers: scale with the diff's size and risk; mid tier is the floor.
- Scoped re-reviews of small fixes: cheap-to-mid tier.
- Final code reviewer: most capable available model.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "I implemented it, so my self-review is enough" | Self-review never closes a gate the mode requires. Dispatch the reviewer. |
| "The fix was small, skip the re-review" | Every fix round ends with a scoped re-review. Unreviewed fixes are how regressions land. |
| "One more round will converge" | Past the cap the failure is structural. Adjudicate and route. |
| "This finding is obviously wrong, drop it" | Adjudicate only at the cap, and every ruling is a ledger entry. |
| "I'll fix it myself, resuming is overhead" | In `persistent` mode controller fixes skip review and pollute coordination context. |
| "Final review found more; one more wave" | There is exactly one final fix wave. Residuals are adjudicated. |
| "Ledger bookkeeping is overhead" | The ledger is what survives compaction. Without it, completed tasks get redone. |

## Ledger Example

```markdown
# SAD ledger — plan: .dream/specs/order-flow/tasks.md
Mode: implementer=main, review=per-task
Base commit: abc1234

Task 1: complete (review clean)
Task 2: fix round 1/3 (2 addressed, 0 open — missing rollback; unchecked error)
Task 2: complete (review clean)
Task 3: minor (deferred): service naming consistency
Task 3: complete (review clean)
Final review: 1 P1 admitted; final fix wave 1/1 (1 addressed, 0 open)
Feature verification: Verified
Status: READY_FOR_USER_REVIEW
```
