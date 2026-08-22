---
name: reviewing-workstreams
description: Use when a high-risk task or meaningful batch of related implementation work needs independent semantic, architectural, security, or cross-task review beyond deterministic verification.
---

# Reviewing Workstreams

Use a fresh reviewer context. Supply relevant requirements, design, frozen contract revisions, scoped diff, and verification evidence. Do not supply implementation-agent reasoning unless needed as evidence.

## Output

Record findings in `.kiro/specs/<feature>/evidence/workstream-review.md` using `references/review-findings.template.yaml` as the structured findings format.

## Reviewer authority

Report only findings that map to one of:

- `contract_violation`;
- `requirement_violation`;
- `architecture_violation`;
- `security_or_integrity_violation`;
- `contract_gap`;
- `non_blocking_suggestion`.

Every blocking finding must include a stable ID, scope/task, authority (requirement/design/contract/invariant), expected behavior, actual evidence, remediation owner, and closure mechanism.

A reviewer may identify that a frozen contract is wrong or incomplete, but must classify it `contract_gap` and route it to `managing-contract-revisions`. The reviewer must not redefine the contract and then fault implementation for obeying the previous revision.

## Closing findings

For objective findings, route the fix to the persistent owner and close by deterministic re-verification. Do not ask another reviewer for an opinion when expected and actual values are mechanically checkable.

For semantic/architectural findings, allow targeted fresh re-review of that finding. After two unsuccessful fix/re-review cycles for the same finding, escalate to design/contract ownership instead of continuing an open-ended loop.
