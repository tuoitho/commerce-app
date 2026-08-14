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

Do not perform broad code exploration during this phase. Inspect existing code
or contracts only when needed to confirm externally visible compatibility
behavior or constraints.

Draft the initial requirements from the user's idea before asking questions;
refine material ambiguity through feedback after the draft exists.

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

## Quality Gate

Before requesting approval:

1. Verify completeness, consistency, and testability.
2. Verify each acceptance criterion describes behavior or a contractual
   constraint rather than an implementation decision.
3. Check that edge and failure cases are justified by the feature rather than
   speculative completeness.
4. Identify any remaining material ambiguity explicitly.

Use the `question` tool to ask exactly:

"Do the requirements look good? If so, we can move on to the design."

After a material revision that changes behavior, scope, constraints, or
acceptance criteria, rerun the quality gate and ask again.

Editorial changes that do not alter meaning do not require restarting the
quality gate.

Design must not begin until the user explicitly approves `requirements.md`.
