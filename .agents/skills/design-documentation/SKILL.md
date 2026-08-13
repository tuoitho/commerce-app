---
name: design-documentation
description: Use when approved .kiro feature requirements need a traceable technical design before task planning
---

# Design Documentation

Transform approved `.kiro/specs/<feature>/requirements.md` into
`.kiro/specs/<feature>/design.md`.

## Preconditions

Read the approved requirements, relevant repository architecture, affected
contracts, code, tests, and established conventions. Stop if requirements are
missing, unapproved, contradictory, or materially incomplete.

Identify areas requiring research, conduct that research, and summarize the key
findings in conversation with relevant links when available. Do not create a
separate research artifact. Incorporate findings into the design.

## Format

```markdown
# Design Document

## Overview
[Approach and requirement IDs addressed]

## Architecture
[Affected boundaries, responsibilities, and data flow]

## Components And Interfaces
[Exact interfaces, inputs, outputs, dependencies, and ownership]

## Data Models
[Schemas, validation, relationships, persistence, and migration]

## Error Handling
[Failure semantics, recovery, status/error contracts, and observability]

## Testing Strategy
[Unit, integration, end-to-end, security, and performance evidence mapped to IDs]

## Requirement Traceability
| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1 | ... | ... |
```

The six sections `Overview`, `Architecture`, `Components and Interfaces`, `Data
Models`, `Error Handling`, and `Testing Strategy` are mandatory. Add diagrams,
compatibility, migration, and traceability sections when applicable.

## Rules

- Design only what approved requirements need; apply YAGNI.
- Follow existing repository patterns unless a documented requirement makes a
  change necessary.
- Define boundary contracts and error semantics before dependent components.
- Record material alternatives, the selected option, and rationale when more
  than one viable architecture exists.
- Specify exact interfaces and data shapes that implementation must not invent.
- Address security, persistence ownership, compatibility, and migration when
  relevant.
- Map every requirement ID to design elements and deterministic verification.
- Do not leave placeholders or unresolved material decisions.

## Quality Gate

Review the design for completeness, feasibility, internal consistency, and
requirements coverage. Present material architecture decisions and research
findings. Use the `question` tool to ask exactly: "Does the design look good?
If so, we can move on to the implementation plan." Revise and ask again after
every change. Offer to return to requirements when design exposes a gap. Task
planning must not begin until the user explicitly approves `design.md`.
