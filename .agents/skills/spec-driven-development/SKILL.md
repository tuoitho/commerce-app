---
name: spec-driven-development
description: Use when creating or continuing a governed feature specification through requirements, design, contracts, tasks, approval, and independent specification review
---

# Spec-Driven Development

Coordinate the governed planning workflow under `.dream/specs/<feature>/`.
This workflow creates planning artifacts only and never edits implementation code.

## Input And Location

Accept a kebab-case feature name or derive one from the user's description.
Governed artifacts are organized as follows:

```text
Three canonical planning documents:
.dream/specs/<feature>/requirements.md
.dream/specs/<feature>/design.md
.dream/specs/<feature>/tasks.md

Additional governed artifacts when applicable:
.dream/specs/<feature>/contracts/
└── <contract-id>.md
.dream/specs/<feature>/changes/
└── CCR-<ID>.md
.dream/specs/<feature>/evidence/
```

If a feature directory already exists, read it and continue from the first missing phase. Continue past an existing requirements or design gate only when its approval is explicit in the current conversation; otherwise present that artifact and request approval again. Never overwrite user edits without reconciling them.

## Workflow

```text
                    Feature intent
                         │
                         ▼
          discovering-feature-dependencies
                         │
                         ▼
             requirements-engineering
                         │
                         ▼
             requirements approval
                         │
                         ▼
        designing-contract-first-features
                         │
                         ▼
                  design approval
                         │
                         ▼
              shared boundary needed?
                   /           \
                 yes            no
                  │              │
                  ▼              │
       authoring-shared-         │
             contracts           │
                  │              │
                  ▼              │
       reviewing-and-freezing-   │
             contracts           │
                  │              │
                  └──────┬───────┘
                         ▼
          planning-contract-workstreams
                         │
                         ▼
             reviewing-feature-spec
                         │
                         ▼
                 tasks approval
                         │
                         ▼
                       STOP
                 planning complete
```

1. **Dependency Discovery:** Read relevant repository instructions and any existing specification for the feature.
   Load `discovering-feature-dependencies` and perform an initial bounded dependency discovery from the requested feature.
   Discover direct downstream impacts, supporting dependencies, reusable existing capabilities, and compatibility constraints before drafting requirements.
   Do not perform broad repository exploration.

2. **Requirements Engineering:** Load `requirements-engineering` and create an initial `requirements.md` directly from the rough idea and the bounded dependency context without sequential questions first.

3. **Clarify Material Ambiguity (if needed):** If the first draft leaves material behavior, scope, dependency behavior, architecture, or compatibility unclear, or if design trade-offs remain, load `brainstorming` to clarify each material decision and obtain explicit approval. Update `requirements.md` to match.

4. **Requirements Approval Gate:** Present the requirements through the `question` tool and request explicit user approval:
   *"Do the requirements look good? If so, we can move on to the design."*
   Stop and wait.

5. **Design Documentation:** After requirements approval, load `designing-contract-first-features` and create `design.md`.
   Design defines architecture, component boundaries, responsibility, failure boundaries, verification/proof strategy, and explicitly identifies cross-component contract boundaries.
   If design exposes missing product behavior or changes an approved requirement, return to requirements engineering and obtain approval again.

6. **Design Approval Gate:** Present material design decisions through the `question` tool and request explicit user approval. Stop and wait.

7. **Contract Authoring & Freezing (when shared boundaries exist):**
   - If the approved design identifies shared boundaries (e.g. cross-workstream, frontend-backend, service-to-service, public interfaces):
     1. Load `authoring-shared-contracts` to author Markdown shared contracts in `contracts/`.
     2. Load `reviewing-and-freezing-contracts` to review draft contracts and freeze them (`FROZEN`).
   - If no shared boundary is required (e.g., internal domain feature, single-component refactor): do NOT author artificial contract files. Proceed directly to task planning.

8. **Task Breakdown:** Load `planning-contract-workstreams` and create `tasks.md` as an execution DAG.
   Every task must specify its `outcome`, mapped `requirements` (REQ IDs), `acceptance_criteria` (AC IDs), `contracts` with explicit roles (`provider`, `consumer`, `verifier`), `depends_on`, `risk`, and deterministic `verification` checks aligned with the design's proof strategy.

9. **Independent Specification Review:** Dispatch one fresh reviewer subagent. Tell it to load `reviewing-feature-spec`, pass all spec artifact paths (`requirements.md`, `design.md`, frozen contracts if any, `tasks.md`), and perform a single broad independent specification review.

10. **Spec Repair Loop:** If the review reports blocking findings, enter the bounded specification repair loop (at most 3 rounds total).
    - Fix only accepted blocking findings.
    - Obtain user approval again if the fix changes approved requirements or material design decisions.
    - Dispatch a fresh reviewer in Re-review Mode.
    - If blocking findings remain after round 3, stop autonomous repair and present the remaining findings and conflicting text to the user for adjudication.

11. **Tasks Approval Gate:** After independent review is approved, present `tasks.md` through the `question` tool and request explicit user approval.

12. **Planning Complete:** Stop when the user approves `tasks.md`. Report the artifact paths and inform the user that planning is complete. Implementation is executed as a separate workflow via `developing-contract-first-features`.

## Approval State

Approval is conversational state, not text embedded in artifacts. If the current session cannot establish a prior approval, obtain fresh approval; never infer it from file existence. Do not add approval logs, request rationale, review commentary, or workflow history to `requirements.md`, `design.md`, or `tasks.md`.

## Guardrails

- Requirements define **WHAT**; Design defines **HOW** and proof obligations; Contracts define **SHARED BOUNDARIES**; Tasks define **EXECUTION ORDER & OWNERSHIP**.
- Do not skip requirements or design approval for governed changes.
- Do not skip tasks approval or combine multiple artifact approval gates in one interaction.
- Do not implement code in the same response or session that creates or completes the specification.
- Do not proceed through a material user decision without using the `question` tool.
- When independently implemented work crosses a shared boundary, require the design to stabilize every material shared contract before tasks treat those work units as independently executable.
- Do not require a separate shared-contract artifact for single-boundary work or when the approved design already defines the boundary precisely enough.
- Write requirements, design, and user-facing spec responses in the user's preferred language.
