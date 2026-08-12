---
name: brainstorming
description: Use when building or changing behavior whose requirements, scope, architecture, or compatibility are not sufficiently defined
---

# Brainstorming

## Purpose

Turn an insufficiently defined change into an approved, implementable design.
In repositories using OpenSpec, OpenSpec owns the durable specification. Do not
create a parallel Superpowers design document for an OpenSpec-backed change.

<HARD-GATE>
Do not invoke implementation skills or modify implementation code until the
design is sufficiently clear, recorded in OpenSpec, and approved where the
workflow requires approval.
</HARD-GATE>

## Checklist

Complete these in order:

1. Explore repository context and active OpenSpec changes.
2. Decide whether the behavior is already sufficiently specified.
3. Ask material clarifying questions one logical decision at a time.
4. Present two or three viable approaches with trade-offs and a recommendation.
5. Present the design in sections appropriate to its complexity.
6. Obtain approval for material decisions.
7. Create or update OpenSpec proposal, specs, design, and tasks as applicable.
8. Self-review the artifacts for placeholders, contradictions, ambiguity, and scope.
9. Ask for artifact review when the active workflow requires a user gate.
10. Hand off to planning or implementation using the OpenSpec artifacts.

## Explore first

Inspect only relevant context:

- root and local repository instructions
- active OpenSpec changes and existing specifications
- affected contracts, code, and tests
- relevant architecture or steering documents

If an active OpenSpec change already resolves the necessary product and design
decisions, stop brainstorming. Use its artifacts as the source of truth and
continue with the applicable execution workflow.

If the request contains multiple independent subsystems, decompose it before
refining details. Each independently deliverable change should have a focused
OpenSpec lifecycle.

## Clarify material decisions

Ask only questions that materially affect observable behavior, architecture,
compatibility, security, data ownership, or scope. Discover answers from the
repository whenever possible.

Ask one logical decision at a time. Prefer a recommended option with concise
alternatives and consequences.

When work cannot continue without the answer, invoke OpenCode's `question`
tool so the session is explicitly waiting. A non-blocking conversational
question may remain ordinary prose.

## Offer a visual companion only when useful

The first time a real mockup, layout comparison, or architecture diagram would
be materially clearer than prose, offer the browser-based visual companion in
its own message. Do not offer it for textual requirements or conceptual
choices. If accepted, read `visual-companion.md` before starting it.

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

## OpenSpec handoff

Record the durable result in the applicable OpenSpec change:

- `proposal.md` for motivation, scope, affected areas, and compatibility
- `specs/` for observable requirements and scenarios
- `design.md` for material architecture and migration decisions
- `tasks.md` for dependency-ordered, independently verifiable work

Do not additionally create `docs/superpowers/specs/*` for a change governed by
OpenSpec. If no OpenSpec change governs the work, follow the repository's
documented fallback workflow.

## Self-review

Before handoff:

1. Remove `TBD`, `TODO`, and incomplete sections.
2. Resolve contradictions between proposal, specs, design, and tasks.
3. Make ambiguous requirements explicit.
4. Ensure the scope is small enough for one implementation lifecycle.
5. Confirm every material requirement has a verification path.

Fix issues directly in the OpenSpec artifacts.

## Terminal state

Brainstorming succeeds when OpenSpec artifacts sufficiently define the change
without requiring an implementation agent to invent product requirements.

If implementation tasks are not ready, use writing-plans to improve the active
change's `tasks.md`. If they are ready, proceed with the applicable execution
skills.

## Red flags

- brainstorming despite a sufficient active OpenSpec change
- creating `docs/superpowers/specs/*` beside an OpenSpec change
- asking questions whose answers are discoverable from the repository
- using prose for a blocking question instead of the `question` tool
- implementing before material decisions are recorded
- allowing tests or tasks to invent requirements absent from the specification
