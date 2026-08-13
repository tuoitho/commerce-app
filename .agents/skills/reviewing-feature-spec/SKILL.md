---
name: reviewing-feature-spec
description: Use for an independent read-only review of completed .kiro requirements, design, and tasks before implementation
---

# Reviewing A Feature Specification

Perform a read-only review of one `.kiro/specs/<feature>/` artifact set. Read
`requirements.md`, `design.md`, and `tasks.md` together. Inspect relevant code
and tests only as needed to validate buildability and repository fit.

## Review Criteria

Report actionable issues that could cause implementation to build the wrong
behavior, miss required behavior, violate a material design decision, or get
blocked.

Check:

1. Requirements are unambiguous, testable EARS statements with stable IDs and
   necessary normal, edge, failure, security, and compatibility behavior.
2. Design covers every requirement without inventing scope and defines all
   material boundaries, interfaces, data, error, and migration decisions.
3. Tasks cover every requirement and acceptance criterion with deterministic
   verification.
4. Task order respects dependencies and stabilizes contracts before dependent
   work.
5. Paths, interfaces, commands, and expected outcomes are internally
   consistent and plausible for the repository.
6. The artifacts contain no contradictions, placeholders, or decisions that an
   implementer would have to invent.

Do not flag wording preferences, formatting, or optional enhancements.

## Output

```markdown
## Feature Specification Review

**Status:** Approved | Issues Found

### Blocking Issues
- [artifact:section]: Issue and why it blocks correct implementation.

### Advisory Notes
- [artifact:section]: Non-blocking risk or clarification.
```

Use `Approved` only when there are no blocking issues. If there are no
findings, state that explicitly. Do not edit files.
