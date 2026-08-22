---
name: verifying-task-gates
description: Use whenever an implementation task is about to be marked complete or handed to the next task, especially when correctness can be checked by tests, schemas, compilers, static checks, or contract assertions.
---

# Verifying Task Gates

Every task completes through evidence, not self-assessment.

## Output

Use `references/verification-report.template.md` as the canonical verification report format when writing `.kiro/specs/<feature>/evidence/task-verification.md`.

## Gate

Run the task's declared verification plus cheap relevant regression checks. Typical evidence includes:

- unit/component tests;
- consumer/provider contract tests;
- compile/typecheck/lint/static analysis;
- migration/schema validation;
- focused state assertions.

Record command/check, expected result, actual result, and contract revision where applicable.

```yaml
task: BE-03
status: PASS
verified_against:
  PRODUCT-DETAIL: 4
checks:
  - name: PRODUCT-DETAIL-004
    result: PASS
```

If any blocking check fails, return to the same workstream owner for correction and rerun the failing/relevant checks. Do not spawn an LLM reviewer merely to confirm an objective pass/fail.

## Review escalation

A normal-risk task that passes its deterministic gate can proceed without task-level LLM review. Use `reviewing-workstreams` immediately only when the task is marked high-risk or the verification reveals a semantic/architectural concern that cannot be decided objectively.

Never mark a task complete based only on code inspection, implementation-agent confidence, or tests that do not exercise its declared acceptance boundary.
