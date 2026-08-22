---
name: reviewing-and-freezing-contracts
description: Use when draft shared contracts must become stable implementation authority for multiple independent owners, especially before frontend/backend work proceeds in parallel.
---

# Reviewing and Freezing Contracts

Review draft contracts independently from implementation code.

## Review contract

For every contract revision verify:

1. Traceability — every scenario maps to approved requirements; every boundary requirement has contract coverage.
2. Completeness — success, material failures, auth/caller context, and state-dependent behavior are explicit.
3. Consistency — schema, examples, statuses, names, and semantics agree.
4. Independence — consumer and provider could implement without reading each other's code.
5. Compatibility — assumptions about unknown fields, optionality, defaults, and versioning are explicit.
6. Testability — scenarios can become consumer/provider/integration assertions.

## Canonical Reference

**REQUIRED SUB-SKILL:** Use `authoring-executable-contracts` for the canonical contract manifest format (`references/contract-manifest.template.yaml`) and scenarios format (`references/scenarios.template.yaml`).

## Findings

Classify findings as `contract_defect`, `requirement_gap`, `design_gap`, or `non_blocking_suggestion`. Do not resolve a requirement/design ambiguity by silently inventing contract behavior.

When blocking findings are resolved, update the manifest entry in `.kiro/specs/<feature>/contracts/manifest.yaml` to mark the contract `FROZEN`:

```yaml
id: PRODUCT-DETAIL
revision: 3
status: FROZEN
requirements: [REQ-PRODUCT-01, REQ-PRODUCT-07]
providers: [backend-product]
consumers: [frontend-product-detail]
```

A frozen revision is immutable during implementation. Later changes create a new revision through `managing-contract-revisions`; they do not rewrite history.
