---
name: designing-contract-first-features
description: Use when approved feature requirements need architecture, responsibility boundaries, dependency impacts, and explicit identification of cross-component contract surfaces before task planning.
---

# Designing Contract-First Features

Transform approved requirements into `.dream/specs/<feature>/design.md`.

## Design owns

- architecture and component boundaries;
- responsibility and data ownership;
- relevant upstream/downstream dependencies;
- security, transaction, consistency, and failure boundaries;
- which cross-component interfaces require shared contracts;
- verification strategy and proof selection for each behavior;
- material technical decisions whose change would affect another owner.

Design does **not** own private implementation recipes such as creating a particular repository/service/controller class unless that type itself is a shared architectural interface.

## Verification Strategy & Proof Selection

Design MUST define a clear verification strategy mapping each approved requirement/behavior to its minimum sufficient deterministic proof level:

| Behavior Type | Target Proof Level | Verification Mechanism |
|---|---|---|
| Pure domain logic / invariant | `unit` | Unit test suite |
| Database query / transaction / migration | `integration-db` | Database integration test |
| API boundary / contract | `provider-contract` + `runtime-http` | Contract test + HTTP / `curl` check |
| UI state / component rendering | `component` | Component unit / render test |
| Full user flow / routing / browser integration | `browser` | Playwright automation |
| Visual-only styling / layout | `visual` | Playwright + screenshot inspection |

**Rule:** Do not prescribe browser automation or heavy end-to-end tests for behaviors that are fully verifiable through unit, database, contract, or component tests. Browser automation runs only when the proof obligation genuinely requires browser execution.

## Required output

For each affected boundary, identify:

```text
Boundary ID: <ID>
Producer / provider: <owner>
Consumer(s): <owner(s)>
Purpose: <summary>
Authentication / caller context: <context>
Material state or failure semantics: <semantics>
Contract artifact required: Yes | No
Requirement IDs traced to boundary: [REQ-...]
Verification / Proof level: [unit | integration-db | contract | component | browser | visual]
```

Do not define every request/response field here. Detailed boundary shapes, statuses, examples, and semantic rules belong to `authoring-shared-contracts` when a shared contract is required.

## Design gate

Before contract authoring or task planning, confirm:

- every approved requirement has an owning component or boundary;
- no two workstreams implicitly own the same state transition;
- personalized behavior is distinguished from intrinsic resource data;
- failure/authorization semantics have an explicit owner;
- identified boundaries are sufficient for independent consumer/provider implementation;
- verification proof levels are explicitly assigned.

If a requirement cannot be assigned without guessing product behavior, return to requirements engineering rather than encoding the guess in design.
