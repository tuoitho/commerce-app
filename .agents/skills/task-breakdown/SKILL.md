---
name: task-breakdown
description: Use when approved .kiro requirements and design need dependency-ordered, independently verifiable implementation tasks
---

# Task Breakdown

Create `.kiro/specs/<feature>/tasks.md` from approved `requirements.md` and
`design.md`. This file is the canonical implementation plan.

## Task Format

```markdown
# Implementation Plan

- [ ] 1. Implement a coding objective
  - Create or modify specific files and components
  - Write automated tests and integrate the result
  - _Requirements: 1.1, 2.3_

- [ ] 2. Implement a larger coding objective
- [ ] 2.1 Implement its first coding subtask
  - Concrete code and automated-test scope
  - _Requirements: 3.1_
```

## Rules

- Use a numbered checkbox list with at most two hierarchy levels. Use top-level
  epics only when needed and decimal notation for subtasks.
- Map every granular acceptance criterion to at least one task using
  `_Requirements: 1.1, 2.3_` references.
- Order tasks by dependency. Stabilize shared contracts before providers,
  consumers, and integration work.
- Make each item a discrete, manageable prompt for a coding agent and ensure it
  builds incrementally on previous items, ending with integration.
- Include concrete files or components and enough implementation direction to
  execute without clarification, but do not duplicate excessive design detail.
- Keep TDD inside each behavior-changing task rather than creating detached
  test-only tasks.
- Include only writing, modifying, or testing code. Exclude user testing,
  deployment, manual runtime checks, metrics gathering, training, process,
  marketing, and documentation-only work. Automated end-to-end tests are valid.
- Do not invent behavior or architecture absent from approved artifacts.
- Do not leave placeholders, vague instructions, or unresolved interfaces.

## Quality Gate

Self-check requirements coverage, dependency order, incremental integration,
and coding-agent actionability. Dispatch an independent reviewer using
`reviewing-feature-spec`, fix blocking findings, and repeat review. Then use the
`question` tool to ask exactly: "Do the tasks look good?" Revise, independently
review, and ask again after every change. The workflow is not complete until
the user explicitly approves `tasks.md`.
