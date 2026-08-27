---
name: verifying-runtime-integration
description: Use when independently implemented workstreams have assembled and feature correctness depends on real process, network, browser, persistence, or cross-boundary behavior.
---

# Verifying Runtime Integration

Use a fresh verifier against the real assembled system. Owner-agent reports are inputs, not proof.

This step is invoked when the design's verification strategy specifies runtime HTTP, browser automation, or multi-process integration proof obligations.

## Output

**REQUIRED SUB-SKILL:** Use `verifying-task-gates` for the canonical verification report format (`references/verification-report.template.md`) when creating `.dream/specs/<feature>/evidence/integration-verification.md`.

## Evidence hierarchy & Proof Selection

Apply the proof level declared in the approved `design.md`:

- **API/HTTP requests** (`curl` or automated HTTP requests) for endpoints, statuses, headers, payloads, and authentication/authorization boundaries;
- **Database/state assertions** for persistence, transaction rollbacks, and side effects;
- **Queue/event assertions** for message brokers and asynchronous events;
- **Playwright/browser automation** strictly for full user flows, routing, DOM state transitions, and browser-specific network interactions;
- **Screenshots/visual checks** only for visual styling or layout states that cannot be verified deterministically.

Map every runtime scenario to a frozen contract revision, requirement ID, and acceptance criterion ID. Capture sufficient evidence to reproduce any failure.

```yaml
scenario: PRODUCT-DETAIL-004
requirement: REQ-PRODUCT-07
acceptance_criteria: AC-PRODUCT-07-01
contract_revision: 4
result: PASS
evidence:
  api_status: 200
  response_body: '{"viewer": {"isLiked": true}}'
  persisted_state: unchanged
```

If actual runtime behavior violates a correct frozen contract, route the finding to the owning workstream. If runtime testing reveals that the contract itself is insufficient or incorrect, invoke `managing-contract-revisions`.

Do not use screenshot/LLM visual judgment as a replacement for assertions that can be encoded deterministically. Do not launch browser automation if runtime HTTP and database assertions completely satisfy the proof obligation.
