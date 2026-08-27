---
name: requirements-engineering
description: Use when defining or revising testable feature requirements in .dream/specs before technical design begins
---

# Requirements Engineering

Create `.dream/specs/<feature>/requirements.md` from the user's rough idea. This artifact defines externally observable behavior, domain definitions, invariants, and contractual constraints, not internal implementation details.

## Preconditions

Read applicable repository instructions and any existing specification for the feature.

Use the bounded dependency discovery supplied by the coordinating workflow (`spec-driven-development`). If it is unavailable or materially incomplete, load `discovering-feature-dependencies` before drafting requirements.

Targeted inspection of directly related existing behavior, contracts, persisted relationships, and supporting capabilities is allowed and required when needed to establish feature completeness or compatibility.

Do not perform open-ended repository exploration or search unrelated functionality for possible improvements.

Draft the initial requirements directly from the user's idea and bounded dependency context before asking questions; refine material ambiguity through feedback or brainstorming after the draft exists.

## Feature Dependency Completeness

Requirements must describe a complete supported user or caller workflow, not merely isolated resource operations.

For each workflow, identify material inputs, state, or capabilities supplied outside the primary feature boundary.

Pay particular attention to:

- external inputs, identifiers, state, or context supplied across boundaries;
- relationships to existing persisted entities, records, or resources;
- shared formats, schemas, policies, or contracts;
- existing functionality that consumes behavior, state, or concepts changed by this feature.

For every material dependency, establish whether a supported existing capability already supplies it.

Do not assume that a user or caller somehow possesses required external inputs, state, or context unless that is an explicit contractual prerequisite.

If the workflow requires supporting data or capabilities, express the observable behavior needed by the user or caller without prematurely prescribing the underlying API, lookup mechanism, or technical realization.

When the feature affects existing supported behavior and multiple reasonable outcomes would be materially different, surface the decision for user approval instead of silently selecting one.

## Format and Structure

Use `references/requirements.template.md` as the structural reference.

All requirements, invariants, and acceptance criteria MUST use stable granular identifiers:

- Requirements: `REQ-<DOMAIN>-<NUM>` (e.g., `REQ-PRODUCT-07`)
- Invariants: `INV-<DOMAIN>-<NUM>-<SEQ>` (e.g., `INV-PRODUCT-07-01`)
- Acceptance Criteria: `AC-<DOMAIN>-<NUM>-<SEQ>` (e.g., `AC-PRODUCT-07-01`)

```markdown
# <Feature> Requirements

## Context
[Feature purpose, background, and supported users or callers]

## Domain Definitions
- **<Term>**: [Clear definition of domain concept or entity]

## Scope
### In Scope
- [Supported capability or workflow]

### Out of Scope
- [Explicitly excluded capability or integration]

## Requirements

### REQ-<DOMAIN>-<NUM> — <Short Descriptive Title>

**User Story** *(optional)*
As a [role], I want [capability], so that [benefit].

#### Behavioral Requirement
When [event / trigger], the system shall [observable behavior].

#### Invariants
- `INV-<DOMAIN>-<NUM>-01` — [Property that must remain true across states, operations, or boundaries]

#### Failure / State-dependent Behavior
If [error condition], the system shall [error response / fallback].

#### Acceptance Criteria
**AC-<DOMAIN>-<NUM>-01**
Given [precondition], when [trigger], then [observable outcome].
```

## Rules

- **EARS Syntax:** Use standard EARS patterns for normative behavioral requirements:
  - *Event-driven:* `When <event>, the system shall <behavior>.`
  - *State-driven:* `While <state>, the system shall <behavior>.`
  - *Unwanted behavior:* `If <undesired condition>, the system shall <response>.`
  - *Ubiquitous:* `The system shall <behavior>.`
  - *Optional:* `Where <feature applies>, the system shall <behavior>.`
  *(Do not label pattern names in the prose; write the requirement directly).*
- **User Stories are Optional:** Include user stories when helpful for user-facing features. Omit or keep optional for non-user-facing requirements (e.g., idempotency, events, migrations, auth boundaries, rate limiting).
- **Invariants when Needed:** Include invariants only when correctness depends on a property that must remain true across operations, states, requests, or boundaries. Do not invent artificial invariants when not applicable.
- **Stable References:** Use hierarchical stable IDs (`REQ-X-N`, `INV-X-N-M`, `AC-X-N-M`) so design, contracts, tasks, evidence, and review can refer to them unambiguously.
- **Observable Outcomes:** Describe externally observable outcomes with exact values where material.
- **Failure and Edge Cases:** Cover normal, empty, boundary, invalid, unauthorized, and failure behavior when materially relevant.
- **No Implementation Prescriptions:** Keep repository architecture, filenames, libraries, database tables, internal types, and implementation details out of requirements unless they are explicit contractual constraints.
- **No Unmeasurable Ambiguity:** Do not leave `TBD`, `TODO`, open questions, or ambiguous adjectives such as "fast", "easy", or "secure" without measurable criteria.

## Quality Gate

Before requesting approval:

1. Verify completeness, consistency, and testability.
2. Verify each acceptance criterion describes an observable outcome or contractual constraint rather than an internal implementation step.
3. Check that edge and failure cases are justified by the feature rather than speculative completeness.
4. Verify every supported user workflow has a documented source or contract for material external inputs, state, capabilities, or reference data required to complete it.
5. Verify direct existing behaviors identified by dependency discovery are preserved, intentionally changed, or explicitly excluded without ambiguity.
6. Verify no supporting dependency has been silently assumed merely because an implementation could technically supply it.
7. Identify any remaining material ambiguity explicitly.

Use the `question` tool to ask:

"Do the requirements look good? If so, we can move on to the design."

After a material revision that changes behavior, scope, constraints, or acceptance criteria, rerun the quality gate and ask again.

Design must not begin until the user explicitly approves `requirements.md`.
