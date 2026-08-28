---
name: authoring-shared-contracts
description: Use when an approved design identifies APIs, events, UI-provider boundaries, or other shared interfaces that independent implementation owners must consume or provide.
---

# Authoring Shared Contracts

Author `.dream/specs/<feature>/contracts/<contract-id>.md` from approved requirements and design.

## Core principle

A contract must be precise enough for the provider and consumer to implement independently. **Machine readability is optional.**

## Default artifact

Create one plain Markdown contract per shared boundary:

```text
.dream/specs/<feature>/
├── requirements.md
├── design.md
├── contracts/
│   └── <contract-id>.md
└── tasks.md
```

Use `references/shared-contract.template.md` as the structural starting point.

## Contract header

Every contract file carries the governance that implementation and later revisions depend on:

- Contract ID (the Markdown H1 title);
- `Revision`;
- `Status`: `DRAFT` | `FROZEN`;
- `Requirements`: approved REQ IDs the contract serves;
- `Provider`: owner who produces the boundary;
- `Consumers`: owners who consume the boundary;
- `Compatibility`: classification (`none` for the first revision, otherwise `additive`, `breaking`, or `semantic`).

## Contract body

For each boundary/operation define the exact observable agreement needed for independent implementation:

- success status and returned data shape, with exact field meanings;
- each material failure status and its `error.code` / `error.fields`;
- auth / caller / viewer-state semantics;
- semantic rules not visible from the shape alone (e.g. "a successful edit consumes the single allowed edit");
- concrete **Contract Examples** in Given/When/Then form.

Plain-text precision beats schema precision. Write examples that leave no room for the two sides to interpret state differently. Shape alone is insufficient when the same shape can carry different meaning.

## When machine-readable artifacts are worth it

Keep contracts in plain Markdown unless the repository actually uses a machine-readable interface as a productive source of truth:

- OpenAPI generating HTTP clients/stubs or driving a gateway;
- protobuf generating Go/TS bindings;
- GraphQL schema feeding codegen;
- AsyncAPI / schema registry enabling real event governance.

In those cases the machine-readable artifact is the contract and delivers real codegen value. Otherwise do not maintain a second machine representation of a contract that implementation agents will hand-write anyway: that is duplicated ceremony without benefit.

## Boundary rule

Only contract behavior that another owner or observable client depends on. Do not contract private class names, helper methods, or internal persistence structure.

Set new contracts to `Status: DRAFT`. They are not implementation authority until `reviewing-and-freezing-contracts` marks a revision `FROZEN`.

## Contract revisions

Frozen revisions are immutable during implementation. Content changes create a new revision through `managing-contract-revisions`; they do not rewrite history. For a semantic compatibility change that requires coordinated release, record the constraint in the contract's `Compatibility` section (e.g. "backend and frontend implementing this revision must be released together"). Do not invent executable deployment scenarios unless version-skew compatibility is a genuine deployment requirement of the feature.