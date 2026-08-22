---
name: designing-contract-first-features
description: Use when approved feature requirements need architecture, responsibility boundaries, dependency impacts, and explicit identification of cross-component contract surfaces before task planning.
---

# Designing Contract-First Features

Transform approved requirements into `.kiro/specs/<feature>/design.md`.

## Design owns

- architecture and component boundaries;
- responsibility and data ownership;
- relevant upstream/downstream dependencies;
- security, transaction, consistency, and failure boundaries;
- which cross-component interfaces require executable contracts;
- material technical decisions whose change would affect another owner.

Design does **not** own private implementation recipes such as creating a particular repository/service/controller class unless that type itself is a shared architectural interface.

## Required output

For each affected boundary, identify:

```text
Boundary ID
Producer / provider
Consumer(s)
Purpose
Authentication / caller context
Material state or failure semantics
Contract artifact required
Requirement IDs traced to the boundary
```

Do not define every request/response field here. Detailed shared schemas, statuses, examples, and scenarios belong to `authoring-executable-contracts`.

## Design gate

Before contract authoring, confirm:

- every approved requirement has an owning component or boundary;
- no two workstreams implicitly own the same state transition;
- personalized behavior is distinguished from intrinsic resource data;
- failure/authorization semantics have an explicit owner;
- identified boundaries are sufficient for independent consumer/provider implementation.

If a requirement cannot be assigned without guessing product behavior, return to requirements engineering rather than encoding the guess in design.
