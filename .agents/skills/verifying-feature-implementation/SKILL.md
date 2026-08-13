---
name: verifying-feature-implementation
description: Use after all .kiro feature tasks are complete to verify implementation evidence against every requirement before finishing the branch
---

# Verifying A Feature Implementation

Verify the completed implementation against one approved
`.kiro/specs/<feature>/` artifact set. This is a read-only verification gate;
do not fix findings or edit artifacts.

## Inputs

Read:

- `requirements.md`
- `design.md`
- `tasks.md`
- the cumulative working-tree review package containing committed, staged,
  unstaged, and untracked implementation changes
- relevant production code and tests
- fresh deterministic test, build, lint, and runtime evidence

## Checks

1. Map every requirement ID and acceptance criterion to implementation and test
   evidence with exact file references.
2. Confirm every task is complete and its stated outcome exists.
3. Confirm the implementation follows material design decisions, interfaces,
   ownership boundaries, error semantics, and migration strategy.
4. Run focused verification first, then the broader affected checks. Record
   exact commands and outcomes.
5. Identify behavior that is missing, incorrect, untested, incompatible, or
   outside the approved specification.

Do not infer completion from task checkboxes, reports, or prior test claims.
Inspect the implementation and obtain fresh evidence.

## Output

```markdown
## Feature Verification

**Status:** Verified | Issues Found

### Coverage
| Requirement | Implementation | Tests | Result |
|---|---|---|---|
| 1.1 | `path:line` | `test-path:line` | Pass |

### Commands
- `exact command` - Pass/Fail

### Blocking Issues
- [requirement ID] `path:line`: Issue and required correction.

### Unverified Items
- [requirement ID]: Missing evidence and why it could not be obtained.
```

Use `Verified` only when every requirement and acceptance criterion has
deterministic evidence and no blocking issue remains.
