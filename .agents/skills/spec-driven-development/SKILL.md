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
   feature.

   Load `discovering-feature-dependencies` and perform an initial bounded
   dependency discovery from the user's requested feature.

   Discover direct downstream impacts, supporting dependencies, reusable
   existing capabilities, and material compatibility constraints before
   drafting requirements.

   Do not perform broad repository exploration. The discovery exists only to
   establish the existing system context required for complete feature
   requirements.
2. Load `requirements-engineering` and create an initial `requirements.md`
   directly from the user's rough idea and the bounded dependency discovery
   context without sequential questions first.

   Existing repository behavior may establish compatibility constraints or
   reveal capabilities required by the requested workflow, but must not silently
   define new product behavior.
3. If the first requirements draft still leaves material behavior, scope,
   dependency behavior, architecture, or compatibility unclear, or if design
   trade-offs remain, load the `brainstorming` skill to clarify each material
   decision and obtain explicit approval. After `brainstorming` hands back approved decisions,
   update `requirements.md` to match. If no such ambiguity remains, refine
   requirements through targeted feedback only.
4. Present the requirements through the `question` tool and request explicit
   user approval. Stop and wait.
5. After approval, load `design-documentation` and create or revise `design.md`.

   During design, inspect the concrete repository architecture and contracts
   needed to resolve the approved feature's downstream impacts and supporting
   dependencies.

   If this exposes a missing product behavior or changes an approved
   requirement, return to requirements engineering and obtain approval again.
   Purely technical resolution of an already approved behavior remains a design
   decision.
6. Present material design decisions through the `question` tool and request
   explicit user approval. Stop and wait.
7. After approval, load `task-breakdown` and create or revise `tasks.md`.
8. Dispatch one fresh reviewer subagent. Tell it to load
   `reviewing-feature-spec`, pass all three artifact paths, and perform the
   single broad independent specification review.

   The reviewer must independently perform bounded feature dependency discovery
   from the specification's domain concepts and shared boundaries. It must not
   rely solely on dependencies already named by the specification.
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
- When independently implemented work crosses a shared boundary, require the
  design to stabilize every material shared contract before tasks treat those
  work units as independently executable.
- Do not require a separate shared-contract artifact for single-boundary work
  or when the approved design already defines the boundary precisely enough.
- Keep each feature focused enough for one implementation lifecycle.
- Write requirements, design, and user-facing spec responses in the user's
  language when possible.
- Feature completeness includes both feature-owned behavior and direct
  capabilities required for supported user workflows to function.
- Do not assume callers already know internal IDs, codes, reference values, or
  related-domain data unless that is an explicit supported contract.
- Existing functionality affected by a new feature must be preserved,
  intentionally changed, or surfaced as a material decision; it must not remain
  accidentally unspecified.
- Dependency discovery is bounded. Direct relationships may be inspected;
  unrelated neighboring functionality must not expand feature scope.
- Reuse an existing supported capability when it satisfies a dependency. Do not
  require a duplicate API, model, or source of truth merely to make the new
  feature self-contained.