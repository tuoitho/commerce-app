---
name: brainstorming
description: Use when building or changing behavior whose requirements, scope, architecture, or compatibility are not sufficiently defined
---

# Brainstorming

## Purpose

Turn an insufficiently defined change into approved decisions that a governed
feature specification can capture.

<HARD-GATE>
Do not invoke implementation skills or modify implementation code until the
design is sufficiently clear and the governing workflow's approvals are met.
</HARD-GATE>

## Checklist

Complete these in order:

1. Explore repository context and active `.dream/specs/` features.
2. Decide whether the behavior is already sufficiently specified.
3. Ask material clarifying questions one logical decision at a time.
4. Present two or three viable approaches with trade-offs and a recommendation.
5. Present the design in sections appropriate to its complexity.
6. Obtain approval for material decisions.
7. Hand approved decisions back to the `spec-driven-development` workflow.

For initial dream spec creation, do not run this checklist before the first
requirements draft. `requirements-engineering` drafts from the rough idea
first; use brainstorming only afterward when targeted clarification or design
trade-offs remain.

## Explore first

Inspect only relevant context:

- root and local repository instructions
- active `.dream/specs/` features and existing specifications
- affected contracts, code, and tests
- relevant architecture or steering documents

If an active feature specification already resolves the necessary product and
design decisions, stop brainstorming. Use its artifacts as the source of truth and
continue with the applicable execution workflow.

If the request contains multiple independent subsystems, decompose it before
refining details. Each independently deliverable change should have a focused
feature specification.

## Clarify material decisions

Ask only questions that materially affect observable behavior, architecture,
compatibility, security, data ownership, or scope. Discover answers from the
repository whenever possible.

Ask one logical decision at a time. Prefer a recommended option with concise
alternatives and consequences.

When work cannot continue without the answer, invoke OpenCode's `question`
tool so the session is explicitly waiting. A non-blocking conversational
question may remain ordinary prose.

## Explore alternatives

For a non-trivial decision:

- present two or three viable approaches
- lead with the recommended approach and explain why
- describe meaningful trade-offs
- remove unnecessary complexity

Do not present cosmetic variations as distinct approaches.

## Present the design

Scale sections to the change. Cover only relevant topics:

- affected areas and boundaries
- contracts and observable behavior
- data flow and ownership
- failure and edge-case behavior
- compatibility and migration
- testing and deterministic verification

Each unit should have a clear responsibility, interface, and dependency set.
Ask for approval after a coherent design section when proceeding without that
approval would risk rework.

## Specification handoff

Return the clarified scope, observable behavior, alternatives, approved
decisions, compatibility constraints, and unresolved non-material assumptions
to `spec-driven-development`. That workflow records the durable result in:

- `.dream/specs/<feature>/requirements.md`
- `.dream/specs/<feature>/design.md`
- `.dream/specs/<feature>/tasks.md`

## Self-review

Before handoff:

1. Resolve contradictions between approved decisions.
2. Make ambiguous behavior explicit.
3. Ensure the scope is small enough for one implementation lifecycle.
4. Confirm each material behavior can become a testable requirement.

## Terminal state

Brainstorming succeeds when the decisions are clear enough for
`requirements-engineering` to write testable requirements without inventing
product behavior. Return control to `spec-driven-development`; do not begin
implementation.

## Red flags

- brainstorming despite a sufficient active feature specification
- asking questions whose answers are discoverable from the repository
- using prose for a blocking question instead of the `question` tool
- implementing before material decisions are recorded
- implementing before requirements and design approvals
