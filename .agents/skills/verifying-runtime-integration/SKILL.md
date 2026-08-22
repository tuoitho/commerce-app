---
name: verifying-runtime-integration
description: Use when independently implemented workstreams have assembled and feature correctness depends on real process, network, browser, persistence, or cross-boundary behavior.
---

# Verifying Runtime Integration

Use a fresh verifier against the real assembled system. Owner-agent reports are inputs, not proof.

## Output

**REQUIRED SUB-SKILL:** Use `verifying-task-gates` for the canonical verification report format (`references/verification-report.template.md`) when creating `.kiro/specs/<feature>/evidence/integration-verification.md`.

## Evidence hierarchy

Prefer executable checks:

- API/HTTP requests (`curl` or equivalent) for statuses, headers, payloads, and auth behavior;
- Playwright/browser automation for user flows, routing, DOM state, and network behavior;
- database/state assertions for persistence and side effects;
- queue/event assertions where applicable;
- screenshots only for visual states that are not adequately captured by deterministic assertions.

Map every runtime scenario to a frozen contract revision and requirement. Capture enough evidence to reproduce a failure.

```yaml
scenario: PRODUCT-DETAIL-004
contract_revision: 4
result: PASS
evidence:
  api_status: 200
  browser_assertion: viewer-like-control-active
  persisted_state: unchanged
```

If actual runtime behavior violates a correct frozen contract, route the finding to the owning workstream. If runtime testing reveals that the contract itself is insufficient or incorrect, invoke `managing-contract-revisions`.

Do not use screenshot/LLM visual judgment as a replacement for assertions that can be encoded deterministically.
