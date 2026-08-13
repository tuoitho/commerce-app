---
name: requirements-engineering
description: Use when defining or revising testable feature requirements in .kiro/specs before technical design begins
---

# Requirements Engineering

Create `.kiro/specs/<feature>/requirements.md` from the user's rough idea. This
artifact defines observable behavior, not implementation.

## Preconditions

Read applicable repository instructions and any existing specification for the
feature. Do not focus on code exploration in this phase. Draft the initial
requirements from the user's idea before asking questions; refine ambiguity
through feedback after the draft exists.

## Format

Use stable requirement IDs so design, tasks, tests, and review can refer to
them without copying prose.

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
- Cover normal, empty, boundary, invalid, unauthorized, failure, and concurrent
  cases when applicable.
- Include user experience, technical constraints, success criteria, security,
  performance, accessibility, and compatibility when applicable.
- Avoid architecture, filenames, libraries, database choices, and other
  implementation details unless they are externally contractual.
- Do not leave `TBD`, `TODO`, open questions, or ambiguous adjectives such as
  "fast", "easy", or "secure" without measurable meaning.

## Quality Gate

Before requesting approval, verify completeness, consistency, and testability.
Suggest specific areas that may need clarification. Use the `question` tool to
ask exactly: "Do the requirements look good? If so, we can move on to the
design." Revise and ask again after every change. Design must not begin until
the user explicitly approves `requirements.md`.
