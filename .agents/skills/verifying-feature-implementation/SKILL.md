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

## Finding Gate

Before reporting a Blocking Implementation Issue, verify all of the following:

1. It maps to a specific approved requirement or acceptance criterion.
2. Implementation or test evidence demonstrates a concrete failure.
3. The affected scenario is required or supported behavior.
4. The defect is present in the implementation under verification.
5. Correcting it does not require inventing new product or design behavior.

If any condition is false, do not report it as a blocking implementation
issue.

Do not report optional hardening, speculative risks, unrelated pre-existing
problems, style preferences, or alternative implementations as blockers.

## Re-verification Mode

When invoked after a verification repair round, perform a scoped
re-verification, not a new broad feature audit.

Require these inputs:

- the previous verification report
- the open requirement IDs
- the repair diff
- the tests run for the repair

Re-verify only:

1. previously failing or unverified requirement IDs,
2. requirements whose implementation is directly changed by the repair, and
3. concrete regressions introduced by the repair diff.

Keep requirements previously verified as Pass unless the repair changed code
or contracts they directly depend on. Do not search unchanged implementation
for new issues.

Admit a new blocking finding into the repair loop only when it is a concrete
regression introduced by the repair or is necessary to evaluate an open
requirement ID. Treat out-of-scope observations as non-blocking; they never
extend the verification repair loop.

## Output

```markdown
## Feature Verification

**Status:** Verified | Needs Fix | Blocked

### Coverage
| Requirement | Implementation | Tests | Result |
|---|---|---|---|
| 1.1 | `path:line` | `test-path:line` | Pass |

### Commands
- `exact command` - Pass/Fail

### Blocking Implementation Issues
- [requirement ID] `path:line`: Concrete implementation defect and why the
  approved requirement is not satisfied.

### Unverified Items
- [requirement ID]: Missing evidence and why it could not be obtained.

### Out-of-Scope Observations
- Non-blocking observations not required to establish feature correctness.
```

Use `Verified` only when every requirement and acceptance criterion has
deterministic evidence and no blocking issue remains.

Use `Needs Fix` only when at least one concrete implementation or test defect
prevents an approved requirement from being satisfied and that defect can be
corrected without changing the approved specification.

Use `Blocked` when verification cannot complete because required evidence
cannot be obtained, the environment or a dependency prevents verification, or
resolution requires a product, specification, architecture, or user decision.

An Unverified Item is not automatically an implementation defect. Do not
convert inability to obtain evidence into `Needs Fix`.
