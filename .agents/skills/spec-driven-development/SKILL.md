---
name: spec-driven-development
description: Use when creating or continuing a governed feature specification through requirements, design, tasks, approval, and independent review
---

# Spec-Driven Development

Coordinate the governed planning workflow under `.kiro/specs/<feature>/`.
This workflow creates planning artifacts only and never edits implementation
code.

## Input And Location

Accept a kebab-case feature name or derive one from the user's description.
Store exactly three canonical artifacts:

```text
.kiro/specs/<feature>/requirements.md
.kiro/specs/<feature>/design.md
.kiro/specs/<feature>/tasks.md
```

If a feature directory already exists, read it and continue from the first
missing phase. Continue past an existing requirements or design gate only when
its approval is explicit in the current conversation; otherwise present that
artifact and request approval again. Never overwrite user edits without
reconciling them.

## Workflow

1. Read relevant repository instructions and any existing specification for the
   feature. Do not explore implementation code during initial requirements.
2. Load `requirements-engineering` and create an initial `requirements.md`
   directly from the user's rough idea without sequential questions first.
3. Refine requirements through targeted feedback when needed.
4. Present the requirements through the `question` tool and request explicit
   user approval. Stop and wait.
5. After approval, load `design-documentation` and create or revise `design.md`.
6. Present material design decisions through the `question` tool and request
   explicit user approval. Stop and wait.
7. After approval, load `task-breakdown` and create or revise `tasks.md`.
8. Dispatch one fresh reviewer subagent. Tell it to load
   `reviewing-feature-spec`, pass all three artifact paths, and perform the
   single broad independent specification review.
9. If the review reports blocking findings, enter the bounded specification
   repair loop. Allow at most three review rounds total, including the initial
   broad review. For each repair round:
   - preserve the previous blocking findings,
   - fix only accepted blocking findings,
   - obtain approval again if the fix changes approved requirements or a
     material design decision, and
   - dispatch a fresh reviewer in Re-review Mode.

   A re-review verifies previous blockers and contradictions directly
   introduced by the artifact edits. It is not another broad specification
   audit. Advisory findings never enter the repair loop. After each review,
   record `Spec review: round <R>/3 (<X> resolved, <Y> open)`. If blocking
   findings remain after round 3, stop autonomous repair and present the
   remaining findings, conflicting artifact text, and repair history to the
   user for adjudication.
10. After independent review is approved, present `tasks.md` through the
    `question` tool and request explicit user approval. If user feedback
    materially changes approved scope or behavior, treat it as a new
    specification revision and run one new independent review cycle.
    Automated reviewer fixes do not reset the three-round budget.
11. Stop when the user approves `tasks.md`. Report the artifact paths and that
    implementation is a separate workflow.

## Approval State

Approval is conversational state, not text embedded in artifacts. If the
current session cannot establish a prior approval, obtain fresh approval; never
infer it from file existence. Do not add approval logs, request rationale,
review commentary, or workflow history to `requirements.md`, `design.md`, or
`tasks.md`.

## Guardrails

- Requirements define what; design defines how; tasks define execution order.
- Do not skip requirements or design approval for governed changes.
- Do not skip tasks approval or combine two artifact phases in one interaction.
- Do not implement code in the same response that creates or completes the
  specification.
- Do not proceed through a material user decision without using the `question`
  tool.
- Keep each feature focused enough for one implementation lifecycle.
- Write requirements, design, and user-facing spec responses in the user's
  language when possible.
