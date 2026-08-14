---
name: design-documentation
description: Use when approved .kiro feature requirements need a traceable technical design before task planning
---

# Design Documentation

Transform approved `.kiro/specs/<feature>/requirements.md` into
`.kiro/specs/<feature>/design.md`.

The design owns architecture, boundaries, shared contracts, and material
technical decisions. It does not prescribe private implementation details that
a coding agent can safely decide locally.

## Preconditions

Read the approved requirements, relevant repository architecture, affected
contracts, code, tests, and established conventions.

Stop if requirements are missing, unapproved, contradictory, or materially
incomplete. Return requirement gaps to requirements engineering rather than
silently resolving them as design decisions.

Identify areas requiring research, conduct that research, and summarize
material findings in conversation with relevant links when available. Do not
create a separate research artifact. Incorporate durable findings into the
design.

## Format

```markdown
# Design Document

## Overview
[Approach and requirement IDs addressed]

## Architecture
[Affected boundaries, responsibilities, and data flow]

## Components And Interfaces
[Boundary interfaces, inputs, outputs, dependencies, and ownership]

## Data Models
[Schemas, validation, relationships, persistence, and migration]

## Error Handling
[Failure semantics, recovery, status/error contracts, and observability]

## Testing Strategy
[Required evidence and verification levels mapped to requirement IDs]

## Requirement Traceability
| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1 | ... | ... |
```

The six sections `Overview`, `Architecture`, `Components And Interfaces`,
`Data Models`, `Error Handling`, and `Testing Strategy` are mandatory.

Add diagrams, compatibility, migration, alternatives, and traceability sections
when applicable.

## Rules

- Design only what approved requirements need; apply YAGNI.
- Follow existing repository patterns unless a documented requirement or
  material design constraint makes a change necessary.
- Define boundary contracts and error semantics before dependent components.
- Record material alternatives, the selected option, and rationale when more
  than one viable architecture exists.
- Specify exact externally visible contracts, persisted data shapes, shared
  interfaces, cross-boundary protocols, and cross-task contracts that
  implementation must not invent.
- Leave private helpers, local decomposition, local variable structure,
  incidental algorithms, and other implementation details to the coding agent
  unless correctness depends on a specific design decision.
- Do not turn the design into line-level implementation instructions or
  pre-written patches.
- Address security boundaries, persistence ownership, compatibility, migration,
  consistency, and concurrency only when materially relevant.
- Define important invariants explicitly when multiple components must preserve
  them.
- Describe required testing evidence and risk coverage without duplicating
  complete test implementations unless an exact fixture or case is itself
  contractual.
- Map every requirement ID to design elements and deterministic verification.
- Do not leave placeholders or unresolved material decisions.

## Quality Gate

Review the design for:

1. requirements coverage;
2. feasibility against the repository;
3. internal consistency;
4. clear ownership and boundary contracts;
5. unresolved decisions that an implementer would otherwise have to invent;
6. unnecessary implementation prescription that should remain local to coding.

Present material architecture decisions and research findings.

Use the `question` tool to ask exactly:

"Does the design look good? If so, we can move on to the implementation plan."

After a material revision affecting architecture, contracts, data, error
semantics, compatibility, migration, or verification, rerun the affected
quality checks and ask again.

Editorial changes that do not alter the design do not require restarting the
quality gate.

Offer to return to requirements when design exposes a requirement gap.

Task planning must not begin until the user explicitly approves `design.md`.
