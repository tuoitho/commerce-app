---
name: subagent-driven-development
description: Use when executing implementation plans with independent tasks in the current session
---

# Subagent-Driven Development

Execute plan by dispatching a fresh implementer subagent per task, a task review (spec compliance + code quality) after each, and a broad whole-branch review at the end.

**Why subagents:** You delegate tasks to specialized agents with isolated context. By precisely crafting their instructions and context, you ensure they stay focused and succeed at their task. They should never inherit your session's context or history — you construct exactly what they need. This also preserves your own context for coordination work.

**Core principle:** Fresh subagent per task + task review (spec + quality) + broad final review = high quality, fast iteration

**Review invariant:** A broad review occurs once per lifecycle boundary.
Automated reviewer-requested fixes receive scoped re-review only. Start a new
broad review cycle only when a human materially changes the approved scope or
specification.

## Specification-aware delegation

When a `.kiro/specs/<feature>/` specification governs the work,
`requirements.md`, `design.md`, and `tasks.md` are the source of truth. Use
`tasks.md` as `PLAN_FILE`

Before dispatching work across independently implemented boundaries, confirm
that every material shared contract required by those work units is stable,
including, when applicable:

- API and message schemas
- function or service interfaces
- event formats and delivery expectations
- error semantics
- compatibility and migration decisions

A stable contract lets the work units be implemented correctly without
discovering or negotiating additional boundary behavior from one another's
implementation. Do not dispatch producer and consumer work independently while
the boundary still requires negotiation. Once the contract is stable, treat
producer and consumer implementation as independent unless a genuine
implementation dependency exists.

Each implementer brief contains only:

- the relevant requirement and acceptance-criterion IDs
- the relevant canonical task
- applicable repository instructions
- stable interfaces and contract references
- exact report and verification expectations

When a task consumes a stable shared contract, point the implementer to its
canonical source. Do not tell an implementer to infer that contract from
another task's implementation or from current implementation state when the
approved specification governs it. Current repository state remains
authoritative for implementation details that the specification does not fix.

Do not send unrelated change history or the entire feature specification when a
scoped artifact reference is sufficient. If implementation uncovers a material
specification gap or contradiction, stop the task and update and approve the
governing artifact before resuming delegation.

**Narration:** between tool calls, narrate at most one short line — the
ledger and the tool results carry the record.

**Kiro plan execution:** Invoking execution for a plan under `.kiro/specs/`
authorizes continuous execution of all incomplete leaf tasks. For each task,
dispatch a fresh implementer, complete the task review and bounded fix loop,
update `tasks.md`, then continue automatically. Stop only when blocked by a
material decision or unresolved load-bearing issue, the user interrupts, or the
entire plan passes final code review and feature verification.

## When to Use

```dot
digraph when_to_use {
    "Have implementation plan?" [shape=diamond];
    "Tasks mostly independent?" [shape=diamond];
    "subagent-driven-development" [shape=box];
    "Manual execution or brainstorm first" [shape=box];

    "Have implementation plan?" -> "Tasks mostly independent?" [label="yes"];
    "Have implementation plan?" -> "Manual execution or brainstorm first" [label="no"];
    "Tasks mostly independent?" -> "subagent-driven-development" [label="yes"];
    "Tasks mostly independent?" -> "Manual execution or brainstorm first" [label="no - tightly coupled"];
}
```

**Execution characteristics:**
- Same session (no context switch)
- Fresh subagent per task (no context pollution)
- Review after each task (spec compliance + code quality), broad review at the end
- Continuous progress without a human checkpoint between approved tasks

## Kiro Full-Plan Process

For `.kiro/specs/<feature>/tasks.md`:

1. Read `requirements.md`, `design.md`, and `tasks.md`.
2. Treat the user's execution request as confirmation that the three artifacts
   completed their approval and independent plan-review gates. Confirm all
   artifacts exist and run a brief consistency scan; stop only on a concrete
   plan defect.
3. Enumerate incomplete leaf tasks in dependency order and create one todo per
   leaf task.
4. For each leaf task, create a brief, dispatch one fresh implementer, and run
   the task-scoped review plus bounded fix/re-review loop.
5. Mark the leaf task complete only after its gate passes. When the last child
   of a parent epic completes, mark the parent complete too.
6. Continue automatically through all remaining leaf tasks.
7. Run the final whole-branch code review and fix/re-review gate.
8. Run the single broad `verifying-feature-implementation` pass, then handle
   `Verified`, `Needs Fix`, or `Blocked` through the bounded verification gate
   defined below.
9. Preserve the verified implementation worktree and report completion. Use
   `finishing-a-development-branch` only after an explicit user request to
   commit or integrate.

## Batch Process For Non-Kiro Plans

```dot
digraph process {
    rankdir=TB;

    subgraph cluster_per_task {
        label="Per Task";
        "Dispatch implementer subagent (./implementer-prompt.md)" [shape=box];
        "Implementer asks questions?" [shape=diamond];
        "Answer questions, provide context" [shape=box];
        "Implementer implements, tests, self-reviews" [shape=box];
        "Generate review package, dispatch task reviewer (./task-reviewer-prompt.md)" [shape=box];
        "Spec ✅ and quality approved?" [shape=diamond];
        "Finding conflicts with plan text?" [shape=diamond];
        "Ask human partner which governs" [shape=box];
        "Fix round R of 3: R≤2 resume implementer; R=3 fresh implementer, more capable model" [shape=box];
        "Dispatch scoped re-review (./re-review-prompt.md)" [shape=box];
        "All findings addressed?" [shape=diamond];
        "R = 3?" [shape=diamond];
        "Adjudicate each open finding" [shape=box];
        "Any load-bearing finding?" [shape=diamond];
        "STOP: report BLOCKED to human partner" [shape=box];
        "Park findings in ledger with rulings" [shape=box];
        "Update tasks.md, append ledger completion, mark todo complete" [shape=box];
    }

    "Setup: worktree, ledger check, read plan, pre-flight review" [shape=box];
    "More tasks remain?" [shape=diamond];
    "Dispatch final code reviewer (../requesting-code-review/SKILL.md)" [shape=box];
    "Triage final findings; admitted blockers?" [shape=diamond];
    "ONE final fix wave and scoped re-review" [shape=box];
    "Broad feature verification" [shape=box];
    "Initial verification status" [shape=diamond];
    "ONE verification repair wave, scoped review, scoped re-verification" [shape=box];
    "Re-verification status" [shape=diamond];
    "Return residual Needs Fix or Blocked to human partner" [shape=box];
    "Delete this plan's workspace" [shape=box];
    "Use finishing-a-development-branch" [shape=box style=filled fillcolor=lightgreen];

    "Setup: worktree, ledger check, read plan, pre-flight review" -> "Dispatch implementer subagent (./implementer-prompt.md)";
    "Dispatch implementer subagent (./implementer-prompt.md)" -> "Implementer asks questions?";
    "Implementer asks questions?" -> "Answer questions, provide context" [label="yes"];
    "Answer questions, provide context" -> "Implementer implements, tests, self-reviews";
    "Implementer asks questions?" -> "Implementer implements, tests, self-reviews" [label="no"];
    "Implementer implements, tests, self-reviews" -> "Generate review package, dispatch task reviewer (./task-reviewer-prompt.md)";
    "Generate review package, dispatch task reviewer (./task-reviewer-prompt.md)" -> "Spec ✅ and quality approved?";
    "Spec ✅ and quality approved?" -> "Update tasks.md, append ledger completion, mark todo complete" [label="yes"];
    "Spec ✅ and quality approved?" -> "Finding conflicts with plan text?" [label="no"];
    "Finding conflicts with plan text?" -> "Ask human partner which governs" [label="yes"];
    "Ask human partner which governs" -> "Fix round R of 3: R≤2 resume implementer; R=3 fresh implementer, more capable model";
    "Finding conflicts with plan text?" -> "Fix round R of 3: R≤2 resume implementer; R=3 fresh implementer, more capable model" [label="no"];
    "Fix round R of 3: R≤2 resume implementer; R=3 fresh implementer, more capable model" -> "Dispatch scoped re-review (./re-review-prompt.md)";
    "Dispatch scoped re-review (./re-review-prompt.md)" -> "All findings addressed?";
    "All findings addressed?" -> "Update tasks.md, append ledger completion, mark todo complete" [label="yes"];
    "All findings addressed?" -> "R = 3?" [label="no"];
    "R = 3?" -> "Fix round R of 3: R≤2 resume implementer; R=3 fresh implementer, more capable model" [label="no - next round"];
    "R = 3?" -> "Adjudicate each open finding" [label="yes - breaker trips"];
    "Adjudicate each open finding" -> "Any load-bearing finding?";
    "Any load-bearing finding?" -> "STOP: report BLOCKED to human partner" [label="yes"];
    "Any load-bearing finding?" -> "Park findings in ledger with rulings" [label="no"];
    "Park findings in ledger with rulings" -> "Update tasks.md, append ledger completion, mark todo complete";
    "Update tasks.md, append ledger completion, mark todo complete" -> "More tasks remain?";
    "More tasks remain?" -> "Dispatch implementer subagent (./implementer-prompt.md)" [label="yes"];
    "More tasks remain?" -> "Dispatch final code reviewer (../requesting-code-review/SKILL.md)" [label="no"];
    "Dispatch final code reviewer (../requesting-code-review/SKILL.md)" -> "Triage final findings; admitted blockers?";
    "Triage final findings; admitted blockers?" -> "ONE final fix wave and scoped re-review" [label="yes"];
    "Triage final findings; admitted blockers?" -> "Broad feature verification" [label="no"];
    "ONE final fix wave and scoped re-review" -> "Broad feature verification";
    "Broad feature verification" -> "Initial verification status";
    "Initial verification status" -> "Delete this plan's workspace" [label="Verified"];
    "Initial verification status" -> "STOP: report BLOCKED to human partner" [label="Blocked"];
    "Initial verification status" -> "ONE verification repair wave, scoped review, scoped re-verification" [label="Needs Fix"];
    "ONE verification repair wave, scoped review, scoped re-verification" -> "Re-verification status";
    "Re-verification status" -> "Delete this plan's workspace" [label="Verified"];
    "Re-verification status" -> "Return residual Needs Fix or Blocked to human partner" [label="Needs Fix or Blocked"];
    "Delete this plan's workspace" -> "Report verified worktree";
}
```

## Setup

Ensure the work happens in an isolated workspace: use
`using-git-worktrees` to create one or verify the existing one.
Never start implementation on a main/master branch without your human
partner's explicit consent.

Conversation memory does not survive compaction. In real sessions,
controllers that lost their place have re-dispatched entire completed task
sequences — the single most expensive failure observed. Track progress in
a ledger file, not only in todos.

- Each plan owns a workspace: at skill start, run this skill's
  ` scripts/sdd-workspace PLAN_FILE` — it prints the plan's git-ignored
  directory (`<repo-root>/.superpowers/sdd/<parent>-<plan-basename>/`), home to
  every artifact for THIS plan: ledger, briefs, reports, review packages.
  Another plan's directory is never yours to read or write.
- Check for this plan's ledger at `<workspace>/progress.md`. If its first
  line names your plan file, tasks with a `Task <N>: complete` line are DONE
  — do not re-dispatch them; resume at the first task without one. A task
  whose last line is a fix round is mid-loop: resume the loop at the next
  round. A ledger whose first line names a different plan file — or a stray
  ledger at the old flat path `.superpowers/sdd/progress.md` — is another
  plan's progress: leave it in place and start your own, fresh.
- Create the ledger with its identity as the first line:
  `# SDD ledger — plan: <plan file path>`.
- The ledger is your recovery map. After compaction, trust its completed-task
  entries, reports, and current diff over your own recollection.
- `git clean -fdx` will destroy the workspace (it's git-ignored scratch); if
  that happens, recover from `git log`.

Read `PLAN_FILE` once, then read its sibling `requirements.md` and `design.md`.
Resolve the requested task and its granular requirement references. Create one
todo for that task. The implementer may read all three context artifacts; Kiro
tasks assume requirements and design remain available during implementation.

For Kiro plans, the explicit execution request authorizes the approved and
independently reviewed artifact set. Do not repeat plan review unless files are
missing, contradictory, or materially changed during implementation.

Before dispatching Task 1, scan the plan once for conflicts:

- tasks that contradict each other or the plan's Global Constraints
- anything the plan explicitly mandates that the review rubric treats as a
  defect (a test that asserts nothing, verbatim duplication of a logic block)

Present everything you find to your human partner as one batched question —
each finding beside the plan text that mandates it, asking which governs —
before execution begins, not one interrupt per discovery mid-plan. If the
scan is clean, proceed without comment. The review loop remains the net for
conflicts that only emerge from implementation.

## Model Selection

Use the least powerful model that can handle each role to conserve cost and increase speed.

**Mechanical implementation tasks** (isolated functions, clear specs, 1-2 files): use a fast, cheap model. Most implementation tasks are mechanical when the plan is well-specified.

**Integration and judgment tasks** (multi-file coordination, pattern matching, debugging): use a standard model.

**Architecture and design tasks**: use the most capable available model.
The final whole-branch review is one of these — dispatch it on the most
capable available model, not the session default.

**Review tasks**: choose the model with the same judgment, scaled to the
diff's size, complexity, and risk. A small mechanical diff does not need the
most capable model; a subtle concurrency change does. Scoped re-reviews of
small fix scopes take a cheap-to-mid tier.

**Fix-loop escalation (round 3)**: use a model at least one tier above
the implementer that got stuck.

**Always specify the model explicitly when dispatching a subagent.** An
omitted model inherits your session's model — often the most capable and
most expensive — which silently defeats this section.

**Turn count beats token price.** Wall-clock and context cost scale with how
many turns a subagent takes, and the cheapest models routinely take 2-3× the
turns on multi-step work — costing more overall. Use a mid-tier model as the
floor for reviewers and for implementers working from prose descriptions.
When the task's plan text contains the complete code to write, the
implementation is transcription plus testing: use the cheapest tier for
that implementer. Single-file mechanical fixes also take the cheapest tier.

**Task complexity signals (implementation tasks):**
- Touches 1-2 files with a complete spec → cheap model
- Touches multiple files with integration concerns → standard model
- Requires design judgment or broad codebase understanding → most capable model

## The Task Loop

Everything you paste into a dispatch prompt — and everything a subagent
prints back — stays resident in your context for the rest of the session
and is re-read on every later turn. Hand artifacts over as files.

### 1. Dispatch the implementer

Record the plan execution BASE (`git rev-parse HEAD`) before Task 1. Review
packages compare that base with the current working tree, including untracked
files, so implementation does not require per-task commits.

- **Before snapshot:** immediately before dispatching each task or fix, run
  ` scripts/review-package PLAN_FILE BASE HEAD <unique-before-path>`. The
  path must include the task ID and review round. Never reuse or overwrite it.

- **Task artifacts:** before dispatching an implementer, run this skill's
  `scripts/task-brief PLAN_FILE N`. It extracts the task's full text and prints
  absolute `BRIEF_FILE=...` and `REPORT_FILE=...` values. Copy both printed
  values verbatim into the dispatch; never construct, shorten, or relocate the
  report path. Compose the dispatch so the
  brief stays the single source of
  requirements. Your dispatch should contain: (1) one line on where this
  task fits in the project; (2) the brief path, introduced as "read this
  first — it is your requirements, with the exact values to use verbatim";
  (3) interfaces and decisions from earlier tasks that the brief cannot
  know; (4) your resolution of any ambiguity you noticed in the brief;
  (5) the report-file path and report contract. Exact values (numbers,
  magic strings, signatures, test cases) appear only in the brief. Never
  make a subagent read the whole plan file.
- **Report file:** use the exact `REPORT_FILE` printed by `task-brief` in the
  dispatch prompt. The implementer writes the full report there and
  returns only status, changed files, a one-line test summary, and concerns.
- A dispatch prompt describes one task, not the session's history. Do not
  paste accumulated prior-task summaries ("state after Tasks 1-3") into
  later dispatches — a real session's dispatch hit 42k chars of which 99%
  was pasted history. A fresh subagent needs its task, the interfaces it
  touches, and the global constraints. Nothing else.
- If an earlier task parked a finding in the area this task touches, carry
  a pointer to that ledger entry in the dispatch.
- Record the implementer's agent identity from the dispatch result —
  fix-loop rounds 1-2 resume this agent.
- Never dispatch multiple implementation subagents in parallel (conflicts).

Template: [implementer-prompt.md](implementer-prompt.md)

### 2. Handle the report

Implementer subagents report one of four statuses. Handle each appropriately:

**DONE:** Generate the immutable `after` package with
` scripts/review-package PLAN_FILE BASE HEAD <unique-after-path>`. Dispatch
the task reviewer with the matching `before` and `after` paths.

**DONE_WITH_CONCERNS:** The implementer completed the work but flagged doubts. Read the concerns before proceeding. If the concerns are about correctness or scope, address them before review. If they're observations (e.g., "this file is getting large"), note them and proceed to review.

**NEEDS_CONTEXT:** The implementer needs information that wasn't provided. Provide the missing context and re-dispatch.

**BLOCKED:** The implementer cannot complete the task. Assess the blocker:
1. If it's a context problem, provide more context and re-dispatch with the same model
2. If the task requires more reasoning, re-dispatch with a more capable model
3. If the task is too large, break it into smaller pieces
4. If the plan itself is wrong, escalate to the human

**Never** ignore an escalation or force the same model to retry without changes. If the implementer said it's stuck, something needs to change.

If the implementer asks questions — before starting or mid-task — answer
clearly and completely, provide additional context if needed, and don't
rush it into implementation.

### 3. Review the task

Per-task reviews are task-scoped gates. The broad review happens once, at the
final whole-branch review. Never skip the task review, and never accept a
report missing either verdict — spec compliance AND task quality are both
required. Implementer self-review never replaces the task review; both are
needed.

- Hand the reviewer the cumulative `before` and `after` package files generated
  with ` scripts/review-package PLAN_FILE BASE HEAD OUTFILE`. Comparing the
  snapshots isolates the current task and catches unreported changed files.
  Never dispatch a task reviewer without both files.
- **Reviewer inputs:** the task reviewer gets four paths — the same brief file,
  the report file, and both review packages — plus the global
  constraints that bind the task.
- The global-constraints block you hand the reviewer is its attention
  lens. Copy the binding requirements verbatim from the plan's Global
  Constraints section or the spec: exact values, exact formats, and the
  stated relationships between components ("same layout as X", "matches
  Y"). The reviewer's template already carries the process rules (YAGNI,
  test hygiene, review method) — the constraints block is for what THIS
  project's spec demands.
- Do not add open-ended directives like "check all uses" or "run race tests
  if useful" without a concrete, task-specific reason
- Do not ask a reviewer to re-run tests the implementer already ran on the
  same code — the implementer's report carries the test evidence
- Do not pre-judge findings for the reviewer — never instruct a reviewer to
  ignore or not flag a specific issue. If you believe a finding would be a
  false positive, let the reviewer raise it and adjudicate it in the review
  loop. If the prompt you are writing contains "do not flag," "don't treat X
  as a defect," "at most Minor," or "the plan chose" — stop: you are
  pre-judging, usually to spare yourself a review loop.
The task reviewer may report "⚠️ Cannot verify from diff" items — requirements
that live in unchanged code or span tasks. These do not block the rest of the
review, but you must resolve each one yourself before marking the task
complete: you hold the plan and cross-task context the reviewer
lacks. If you confirm an item is a real gap, treat it as a failed spec
review — it enters the fix loop with the other findings.

Template: [task-reviewer-prompt.md](task-reviewer-prompt.md)

### 4. The fix loop

Evidence Gaps do not enter the implementation fix loop by themselves. Perform
at most one evidence-recovery action:

- obtain existing evidence from the implementer or report, or
- run focused verification sufficient to establish current behavior.

If historical process evidence still cannot be established, record that fact
in the ledger and adjudicate it according to repository policy. Do not cycle
implementation and review solely to recreate historical evidence.

The loop triggers when the review reports spec ❌, any Critical or Important
finding, or a ⚠️ item you confirmed as a real gap.

Before the loop starts, two routes leave it immediately:

- Record Minor findings in the progress ledger as you go
  (`Task <N>: minor (deferred): <one-liner>`), and point the final
  whole-branch review at that list so it can triage which must be fixed
  before merge. A roll-up nobody reads is a silent discard. Minor findings
  never enter the loop.
- A finding labeled plan-mandated — or any finding that conflicts with
  what the plan's text requires — is the human's decision, like any plan
  contradiction: present the finding and the plan text, ask which governs.
  Do not dismiss the finding because the plan mandates it, and do not
  dispatch a fix that contradicts the plan without asking.
Everything else enters the loop. A fix round is one fix dispatch plus one
scoped re-review. Three rounds maximum per task:

**Rounds 1-2 — resume the original implementer.** Send it the open findings
verbatim. Its context is intact: it knows the task, the code, and its own
choices. If your harness cannot send another message to a live subagent,
dispatch a fresh implementer carrying the brief path, the report-file path,
and the findings — the report file is the persistent memory either way.

**Round 3 — dispatch a fresh implementer on a more capable model** (per
Model Selection), with the brief path, the report-file path, the open
findings, and this framing: "A prior implementer attempted this task
[N] times; you own it now. Read the report file for what was tried." A loop
that survives two resumes usually means the implementer cannot see its
own problem — fresh eyes and a capability bump in one move.

**Every round, either way:** the implementer fixes, re-runs the tests
covering the amended code, appends its fix report to the same report file,
and returns the short contract. Before re-dispatching the reviewer, confirm
the fix report contains the covering tests, the command run, and the
output; dispatch the re-review once all three are present. Name the
covering test files in the fix message — a one-line fix does not need the
whole suite.

**The re-review is finding-scoped.** Regenerate the cumulative working-tree
package and dispatch
[re-review-prompt.md](re-review-prompt.md) with the findings list, the
brief, the report file, and the printed diff path. The re-reviewer verdicts
each finding ADDRESSED or NOT ADDRESSED and flags new breakage caused by the
fix delta. New Critical/Important breakage that passes the prompt's admission
gate joins the open
findings list. Out-of-scope observations go to the ledger as deferred
minors — they never extend the loop.

**After each round,** append to the ledger:
`Task <N>: fix round <R>/3 (<X> addressed, <Y> open — <finding one-liners>)`

Never fix findings yourself in the controller session — your context stays
clean for coordination, and controller fixes skip review.

**The breaker.** When round 3's re-review still leaves findings open, stop
dispatching. Adjudicate each open finding yourself — you hold the plan and
the cross-task context the reviewer lacks:

- **The reviewer is wrong, or the point is contestable:** park it —
  `Task <N>: parked — <finding> — ruling: <why the code stands>`. The final
  review sees both sides.
- **Real, but nothing downstream builds on it:** park it the same way, with
  a ruling that says it's real and deferred.
- **Real and load-bearing** — a later task builds on it, or it reveals a
  plan defect: STOP. Append `Task <N>: BLOCKED — <reason>` and report to
  your human partner with the finding, the plan text it collides with, and
  the fix history. Parking a structural failure lets every dependent task
  build on it and hands the final review a problem it cannot fix either.

Adjudicate only at the cap. Adjudicating earlier to end a loop is
pre-judging with a different name. Every adjudication is a ledger entry —
a silent discard is forbidden.

### 5. Complete the task

When the review comes back clean — or every open finding is parked with a
ruling at the cap — append the completion line to the ledger in the same
message as your other bookkeeping:

- `Task <N>: complete (review clean)`
- `Task <N>: complete (<K> parked)` after a
  tripped breaker

Then mark the completed task from `- [ ]` to `- [x]` in canonical `tasks.md`
and mark the todo complete. Do not mark an item complete without corresponding
implementation and verification evidence. Never complete a parent checkbox
while any child checkbox remains incomplete; mark it automatically when its
last child passes review. Continue to the next leaf task. Do not proceed while
the review has open Critical/Important issues that are neither fixed nor
parked-with-ruling at the cap.

## Final Review

The final whole-branch review gets a package too: run
` scripts/review-package PLAN_FILE MERGE_BASE HEAD OUTFILE` (MERGE_BASE = the commit the
branch started from, e.g. `git merge-base main HEAD`) and include the
printed path in the final review dispatch, so the final reviewer reads
one file instead of re-deriving the branch diff with git commands. Dispatch
on the most capable available model (see Model Selection), using
`requesting-code-review`'s
`review-agent` skill. Point it at
the ledger's deferred-minor and parked lines so it can triage which must be
fixed before merge.

Before dispatching a final fix wave, triage findings:

- P0 is blocking; include it in the fix wave.
- P1 is blocking; include it in the fix wave.
- P2 enters the fix wave only when it violates an approved requirement or
  contract, or represents a concrete correctness, security, data-integrity,
  compatibility, or merge-safety defect. Otherwise defer it with a ledger
  ruling.
- P3 is non-blocking. Record it for later; it never triggers a fix wave by
  itself.

Dispatch the single final fix wave only when at least one admitted blocking
finding remains. Include every admitted blocking finding in that one dispatch,
then run exactly one scoped re-review of the fix wave using a before/after
review package and [re-review-prompt.md](re-review-prompt.md). There is no
second final fix wave.

Adjudicate residual findings as in the task loop's breaker: park false,
contestable, or non-required findings with written rulings; stop on a real
load-bearing finding. A residual load-bearing finding must not reach feature
verification or integration choices.

## Feature Verification Gate

After the final code review gate, dispatch one fresh verifier subagent and tell
it to load `verifying-feature-implementation`. Pass the feature's three
artifact paths, the cumulative working-tree review package, and the repository
verification context. This is the only broad feature verification.

Handle its status as follows:

- `Verified` — finish the verification gate.
- `Blocked` — stop and report the blocking evidence or decision to the human
  partner. Do not dispatch an implementation fixer.
- `Needs Fix` — enter the bounded verification repair loop.

Allow exactly one verification repair wave when the broad verification returns
`Needs Fix`. The wave consists of:

1. one fix dispatch containing the complete open verification findings,
2. one scoped code re-review of that repair diff, and
3. one feature re-verification in Re-verification Mode.

Pass the previous verification report, still-open requirement IDs, repair
diff, and repair test evidence to the re-verifier. Do not perform another broad
feature audit. After the wave append:

`Feature verification: repair wave 1/1 (<X> resolved, <Y> open)`

After scoped re-verification:

- `Verified` — finish the verification gate.
- `Needs Fix` — stop autonomous repair, report the remaining concrete defects
  and evidence, and return control to the human partner.
- `Blocked` — stop and report the specification, architecture, environment,
  dependency, or user decision required.

Do not dispatch a second verification repair wave. The final verification gate
detects residual defects; it is not an unbounded implementation engine.

## Finish

When the final whole-branch review gate passes and feature verification status
is `Verified`, delete this plan's scratch workspace. Preserve the
implementation worktree and report that the full plan is complete with
uncommitted changes.

Do not commit, merge, push, create a PR, or clean the implementation worktree
unless the user explicitly asks. If the implementation is already committed or
the user asks to commit/integrate, use `finishing-a-development-branch`.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Close enough on spec compliance" | Reviewer found spec gaps = not done. Fix or hit the cap and adjudicate — those are the only exits. |
| "I'll fix it myself, dispatching is overhead" | Controller fixes pollute your context and skip review. Resume the implementer. |
| "One more round will converge" | Past the cap, rounds don't converge — the failure is structural. Adjudicate and route. |
| "The reviewer will just find something new anyway" | Scoped re-reviews verify fixes; they cannot wander. New findings on untouched code go to the ledger, not the loop. |
| "This finding is obviously wrong, I'll drop it" | You adjudicate only at the cap, and every ruling is a ledger entry. Silent discards are forbidden. |
| "The fix was small, skip the re-review" | Unreviewed fixes are how regressions land. Every round ends with a scoped re-review. |
| "Reviews slow the loop down" | The loop without reviews is just unverified churn. Reviews are the loop's brakes and steering. |
| "Ledger bookkeeping is overhead" | The ledger is what survives compaction. Controllers without one have re-dispatched entire completed task sequences. |

## Batch Example For Non-Kiro Plans

```
You: I'm using Subagent-Driven Development to execute this plan.

[Setup: worktree verified]
[Read canonical plan file once: PLAN_FILE]
[Resolve workspace: scripts/sdd-workspace PLAN_FILE — no ledger inside, fresh start]
[Create todos for all tasks]

Task 1: Hook installation script

[Run task-brief for Task 1; copy its BRIEF_FILE and REPORT_FILE values verbatim into the implementer dispatch]

Implementer: "Before I begin - should the hook be installed at user or system level?"

You: "User level (~/.config/superpowers/hooks/)"

Implementer: [Later]
  - Implemented install-hook command
  - Added tests, 5/5 passing
  - Self-review: Found I missed --force flag, added it
  - Reported changed files and test evidence

[Run review-package PLAN_FILE BASE HEAD; dispatch task reviewer with the printed path]
Task reviewer: Spec ✅ - all requirements met, nothing extra.
  Strengths: Good test coverage, clean. Issues: None. Task quality: Approved.

[Ledger: Task 1: complete (review clean)]

Task 2: Recovery modes

[Run task-brief for Task 2; copy its BRIEF_FILE and REPORT_FILE values verbatim into the implementer dispatch]

Implementer: [No questions]
  - Added verify/repair modes
  - 8/8 tests passing
  - Reported changed files and test evidence

[Run review-package PLAN_FILE BASE HEAD; dispatch task reviewer with the printed path]
Task reviewer: Spec ❌:
  - Missing: Progress reporting (spec says "report every 100 items")
  Issues (Important): Magic number (100)

[Fix round 1: resume the implementer with both findings]
Implementer: Added progress reporting, extracted PROGRESS_INTERVAL constant.
  Re-ran test/recovery.test.js — 10/10 passing. Fix report appended.

[Regenerate review-package PLAN_FILE BASE HEAD; dispatch scoped re-review]
Re-reviewer: Missing progress reporting — ADDRESSED (src/recovery.js:41).
  Magic number — ADDRESSED (src/recovery.js:7). New breakage: none.
  Verdict: all findings addressed.

[Ledger: Task 2: fix round 1/3 (2 addressed, 0 open)]
[Ledger: Task 2: complete (review clean)]

...

[After all tasks]
[Run review-package PLAN_FILE MERGE_BASE HEAD; dispatch final code-reviewer, most capable model]
Final reviewer: All requirements met. Deferred minors triaged: none block merge.

[Dispatch verifier with requirements.md, design.md, tasks.md, working-tree package, and fresh checks]
Verifier: Verified. Every acceptance criterion has implementation and test evidence.

[Delete this plan's workspace — the record now lives in git]

Done! Full plan verified; implementation worktree preserved for user review.
```
