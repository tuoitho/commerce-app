---
name: accepting-contract-first-features
description: Use when all planned workstreams appear complete and the feature needs a final bounded decision based on current contract revisions and verification evidence.
---

# Accepting Contract-First Features

Use fresh context for final acceptance.

## Output

**REQUIRED SUB-SKILL:** Use `verifying-task-gates` for the canonical verification report format (`references/verification-report.template.md`) when recording the final acceptance decision in `.kiro/specs/<feature>/evidence/final-acceptance.md`.

## Inputs

Read:

- approved requirements and design;
- current frozen contract manifest;
- `tasks.md` with task status and `verified_against` revisions;
- open CCRs;
- blocking review findings;
- current runtime integration report.

## Acceptance conditions

Accept only when:

1. every required task is complete against current contract revisions;
2. no required task/evidence is `STALE`;
3. all blocking findings are closed;
4. all approved CCRs are applied and reverified;
5. required integration scenarios pass against the assembled system;
6. every approved requirement is traced to current contract/task/evidence coverage.

Produce a concise verdict: `ACCEPTED` or `BLOCKED`, followed by evidence references. Suggestions that do not map to an approved requirement, frozen contract, design invariant, security/integrity invariant, or explicitly agreed quality gate are non-blocking.

Do not begin a new improvement loop during acceptance. New desired behavior becomes a new requirement/CCR/change cycle rather than redefining completion retroactively.
