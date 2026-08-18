---
name: requirements-engineering
description: Use when defining or revising testable feature requirements in .kiro/specs before technical design begins
---

# Requirements Engineering

Create `.kiro/specs/<feature>/requirements.md` from the user's rough idea. This
artifact defines externally observable behavior and contractual constraints,
not implementation.

## Preconditions

Read applicable repository instructions and any existing specification for the
feature.

Use the bounded dependency discovery supplied by the coordinating workflow. If
it is unavailable or materially incomplete, load
`discovering-feature-dependencies` before drafting requirements.

Targeted inspection of directly related existing behavior, contracts, persisted
relationships, and supporting capabilities is allowed and required when needed
to establish feature completeness or compatibility.

Do not perform open-ended repository exploration or search unrelated
functionality for possible improvements.

Draft the initial requirements from the user's idea before asking questions;
refine material ambiguity through feedback after the draft exists.

## Feature Dependency Completeness

Requirements must describe a complete supported user workflow, not merely the
primary resource operations requested by the user.

For each workflow, identify material inputs or capabilities supplied by another
domain or existing component.

Pay particular attention to:

- foreign or reference identifiers such as `categoryId`, `departmentId`,
  `roleId`, or `parentId`;
- codes, enums, reference data, and selectable values;
- relationships to existing persisted entities;
- existing functionality that consumes a concept changed by this feature.

For every material dependency, establish whether a supported existing
capability already supplies it.

Do not assume that a user or caller somehow knows an internal identifier.

If the workflow requires supporting data, express the observable capability
needed by the user without prematurely prescribing its API or implementation.

Example:

A Product creation requirement may state that the system SHALL provide
categories available for product assignment. Whether that is implemented by an
existing category endpoint, a new lookup endpoint, or another approved contract
belongs to design.

When the feature affects existing supported behavior and multiple reasonable
outcomes would be materially different, surface the decision for user approval
instead of silently selecting one.

## Format

Use stable requirement IDs so design, tasks, tests, and review can refer to them
without copying prose.

```markdown
# Requirements Document

## Introduction
[Feature summary, purpose, and affected users]

## Requirements

### Requirement 1
**User Story:** As a [role], I want [capability], so that [benefit].

#### Acceptance Criteria
1. WHEN [event] THEN [system] SHALL [observable response].
2. IF [precondition] THEN [system] SHALL [observable response].
```

## Rules

- Use EARS syntax: `WHEN ... THEN the system SHALL ...` or
  `IF ... THEN the system SHALL ...`.
- Use hierarchical numbers as stable granular references: acceptance criterion
  1 under Requirement 2 is `2.1`.
- Describe externally observable outcomes with exact values where material.
- Cover normal, empty, boundary, invalid, unauthorized, and failure behavior
  when materially relevant.
- Cover concurrency only when concurrent use is part of supported behavior or
  repository evidence shows that concurrency materially affects the feature.
  Do not invent hypothetical race-condition requirements merely because they
  are technically possible.
- Include user experience, success criteria, security, performance,
  accessibility, compatibility, and externally contractual or explicitly
  user-approved technical constraints when applicable.
- Keep repository architecture, filenames, libraries, database choices,
  algorithms, internal types, and other implementation decisions out of
  requirements unless they are themselves contractual requirements.
- Do not infer new product behavior from existing implementation details.
- Do not leave `TBD`, `TODO`, open questions, or ambiguous adjectives such as
  "fast", "easy", or "secure" without measurable meaning.
- Requirements must account for direct supporting capabilities required to
  complete each supported user workflow.
- Do not treat possession of an internal reference ID as implicit user
  knowledge unless the external contract explicitly guarantees that input.
- Existing supported behavior directly affected by the feature must be
  preserved, intentionally changed, or made an explicit product decision.
- Repository relationships may reveal affected behavior but do not themselves
  authorize new product behavior.
- Do not require a dedicated lookup API when an existing supported capability
  already provides the required observable behavior.

## Quality Gate

Before requesting approval:

1. Verify completeness, consistency, and testability.
2. Verify each acceptance criterion describes behavior or a contractual
   constraint rather than an implementation decision.
3. Check that edge and failure cases are justified by the feature rather than
   speculative completeness.
4. Verify every supported user workflow has a documented source for material
   related-domain data, selections, IDs, codes, or reference values required to
   complete it.
5. Verify direct existing behaviors identified by dependency discovery are
   preserved, intentionally changed, or explicitly excluded without ambiguity.
6. Verify no supporting dependency has been silently assumed merely because an
   implementation could technically supply it.
7. Identify any remaining material ambiguity explicitly.

Use the `question` tool to ask exactly:

"Do the requirements look good? If so, we can move on to the design."

After a material revision that changes behavior, scope, constraints, or
acceptance criteria, rerun the quality gate and ask again.

Editorial changes that do not alter meaning do not require restarting the
quality gate.

Design must not begin until the user explicitly approves `requirements.md`.
