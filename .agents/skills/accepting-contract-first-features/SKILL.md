---
name: accepting-contract-first-features
description: Use when all planned workstreams appear complete and the feature needs a final bounded decision based on current contract revisions and verification evidence.
---

# Accepting Contract-First Features

Use fresh context for final acceptance.

## Output

**REQUIRED SUB-SKILL:** Use `verifying-task-gates` for the canonical verification report format (`references/verification-report.template.md`) when recording the final acceptance decision in `.dream/specs/<feature>/evidence/final-acceptance.md`.

## Inputs

Read:

- approved `requirements.md` and `design.md`;
- current frozen contracts in `contracts/` (when applicable);
- `tasks.md` with task status and `verified_against` revisions;
- open/closed CCRs in `changes/`;
- review findings in `evidence/workstreams/`;
- runtime integration report in `evidence/integration-verification.md` (when required);
- feature verification report in `evidence/feature-verification.md`.

## Acceptance conditions

Accept only when:

1. every required task in `tasks.md` is `completed` against current contract revisions;
2. no required task or evidence is `STALE` or `REOPENED`;
3. all blocking review findings are closed;
4. all approved CCRs are applied, re-frozen, and reverified;
5. required integration scenarios pass against the assembled system (when required by design);
6. **feature verification status is `Verified`** (every approved REQ and AC has confirmed implementation and deterministic test proof);
7. complete traceability exists from requirements to contracts, tasks, and evidence.

## Verdict

Produce a concise verdict: `ACCEPTED` or `BLOCKED`, followed by evidence references:

```markdown
# Final Acceptance Decision

**Verdict:** ACCEPTED | BLOCKED
**Feature:** <feature>
**Contract Baseline:** <contract-summary>
**Feature Verification Report:** `.dream/specs/<feature>/evidence/feature-verification.md` (Status: Verified)

## Evidence Summary
- Task Gates: All tasks completed and verified
- Workstream Reviews: All blocking findings resolved
- Runtime Integration: All required scenarios PASS
- Traceability: 100% requirements and acceptance criteria covered

## Open Items / Non-blocking Observations
- [None or listed non-blocking items]
```

Suggestions that do not map to an approved requirement, frozen contract, design invariant, security/integrity invariant, or explicitly agreed quality gate are non-blocking.

Do not begin a new improvement loop during acceptance. New desired behavior becomes a new requirement/CCR/change cycle rather than redefining completion retroactively.
