---
name: design-documentation
description: Use when approved .dream feature requirements need a traceable technical design before task planning
---

# Design Documentation

Transform approved `.dream/specs/<feature>/requirements.md` into
`.dream/specs/<feature>/design.md`.

The design owns architecture, boundaries, shared contracts, and material
technical decisions. It does not prescribe private implementation details that
a coding agent can safely decide locally.

## Preconditions

Read the approved requirements, relevant repository architecture, affected
contracts, code, tests, and established conventions.
Load `discovering-feature-dependencies` when needed to validate or refresh the
approved feature's direct downstream impacts and supporting dependencies against
the concrete repository architecture.

Design discovery may inspect implementation structure more deeply than
requirements engineering, but remains bounded to dependencies required by the
approved behavior.

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

## Existing System Integration
[Required when the feature affects existing supported functionality or depends
on behavior, state, or contracts outside its primary boundary. Describe
downstream impacts, supporting dependencies, canonical sources, reused
contracts, and compatibility behavior.]
```

The six sections `Overview`, `Architecture`, `Components And Interfaces`,
`Data Models`, `Error Handling`, and `Testing Strategy` are mandatory.

`Existing System Integration` is additionally mandatory when bounded dependency
discovery identifies a downstream impact, supporting dependency, or
compatibility-sensitive existing contract.

Add diagrams, compatibility, migration, alternatives, and traceability sections
when applicable.

## Shared Boundaries

When multiple independently implemented components communicate through a
boundary, define the material contract at that boundary before specifying their
independent implementation.

Specify only what compatible implementation requires, such as:

- operations or messages;
- field names and types;
- required, optional, nullable, and empty semantics;
- accepted values and defaults;
- validation and error behavior;
- delivery, ordering, and idempotency semantics when materially applicable;
- versioning or compatibility guarantees when required.

Choose the representation appropriate to the system. Document a contract
directly in the design or reference an approved canonical artifact such as
OpenAPI, protobuf, GraphQL schema, event schema, or another binding interface
definition.

Do not introduce a shared contract where no cross-boundary agreement between
independently implemented work units is needed.

Give each material contract a stable ID and revision as its own heading:

```markdown
#### Contract API-CHAT-CUSTOMER (rev 1)
```

Use uppercase kebab-case IDs prefixed by kind: `API-`, `WS-`, `EVENT-`,
`DB-`, `TYPE-`, `CONFIG-`. Contracts include HTTP and WebSocket interfaces,
events, persisted schema read or written by more than one task, and shared
types or configuration keys relied on across tasks or packages. Every contract
starts at `rev 1`. Tasks reference contracts by `<ID>@<rev>`, so after
`tasks.md` is approved a contract changes only through
`managing-contract-changes`, which increments its revision.

## Feature Dependencies

For every material downstream impact or supporting dependency identified by the
approved requirements:

1. identify the owning component or domain;
2. identify the canonical existing contract or source of truth when one exists;
3. verify whether that existing capability satisfies the required workflow;
4. define the minimum contract extension or new supporting contract only when
   the existing capability is insufficient;
5. define validation and failure semantics at the consuming boundary; and
6. identify affected existing consumers whose compatibility must be preserved.

For externally supplied inputs, references, or state, define both:

- how the caller obtains or is contractually expected to supply the input; and
- how the receiving boundary validates it when used.

Do not duplicate external state or data merely to avoid an integration
dependency.

Do not introduce parallel or convenience mechanisms when an existing canonical
contract already satisfies the requirement.

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
- For features that add or modify user-facing UI, `Testing Strategy` must
  require end-to-end Playwright verification (`e2e-testing`) and explicitly
  state the E2E execution mode: defaulting to
  **`Mode 2: Contract-Verified Mock E2E (1:1 Backend Contract Lock)`** unless
  the user explicitly requests **`Mode 1: Full-Stack Live Backend E2E`**.
  Because the user approves `design.md`, the E2E mode is locked at spec approval
  time, and must capture screenshot evidence under `.dream/specs/<feature>/imgs/`
  and a summary report at `.dream/specs/<feature>/report.md`.
- Map every requirement ID to design elements and deterministic verification.
- Do not leave placeholders or unresolved material decisions.
- Trace every material supporting dependency from user workflow to its canonical
  technical source.
- Trace every material downstream impact to the design element responsible for
  preserving or intentionally changing existing behavior.
- Do not leave an implementer to invent where required cross-boundary inputs or
  reference data come from.
- Prefer reuse of an existing compatible contract over creation of a parallel
  feature-specific contract.
- If dependency analysis exposes an observable behavior not settled by approved
  requirements, stop and return the decision to requirements engineering.

## Quality Gate

Review the design for:

1. requirements coverage;
2. feasibility against the repository;
3. internal consistency;
4. clear ownership and boundary contracts;
5. complete resolution of material downstream impacts;
6. complete resolution of supporting dependencies required by user workflows;
7. supported sources and validation semantics for external inputs, references,
   state, and cross-boundary dependencies;
8. unresolved decisions that an implementer would otherwise have to invent;
9. absence of duplicate contracts, parallel mechanisms, or redundant sources
   of truth;
10. unnecessary implementation prescription that should remain local to coding.

Present material architecture decisions and research findings.

Use the platform's structured user-question tool (e.g., `question` or
`ask_question`) to ask exactly:

"Does the design look good? If so, we can move on to the implementation plan."

After a material revision affecting architecture, contracts, data, error
semantics, compatibility, migration, or verification, rerun the affected
quality checks and ask again.

Editorial changes that do not alter the design do not require restarting the
quality gate.

Offer to return to requirements when design exposes a requirement gap.

Task planning must not begin until the user explicitly approves `design.md`.
