---
name: planning-contract-workstreams
description: Use when frozen feature contracts need to be decomposed into independently verifiable work packages and assigned to persistent implementation owners.
---

# Planning Contract Workstreams

Create `.dream/specs/<feature>/tasks.md` as an execution DAG.

## Output

Create `.dream/specs/<feature>/tasks.md`.

Use `references/tasks.template.md` as the required structural shape.

## Task definition

A task is a bounded observable outcome, not a coding recipe. Each task MUST contain:

- `id`: unique task identifier (e.g., `BE-03`, `FE-02`);
- `owner`: coherent workstream owner (e.g., `backend-product`, `frontend-ui`);
- `outcome`: bounded observable outcome;
- `requirements`: list of stable requirement IDs (e.g., `REQ-PRODUCT-07`);
- `acceptance_criteria`: list of stable acceptance criteria IDs (e.g., `AC-PRODUCT-07-01`);
- `contracts`: list of contract references with role (`provider`, `consumer`, `verifier`), or `[]` if no shared contract applies;
- `depends_on`: list of task IDs that must complete first;
- `risk`: `normal` or `high`;
- `verification`: list of deterministic checks matching the design's proof strategy (`scenario` references a covered contract example in `contracts/<contract-id>.md` or a REQ/AC mapping);
- `status`: `pending`, `in_progress`, `completed`, `stale`, or `reopened`;
- `verified_against`: map of contract revisions verified upon completion.

### Example Task Entries

**Provider Task:**
```yaml
id: BE-03
owner: backend-product
outcome: Provide viewer-aware product detail
requirements:
  - REQ-PRODUCT-07
acceptance_criteria:
  - AC-PRODUCT-07-01
  - AC-PRODUCT-07-02
contracts:
  - id: PRODUCT-DETAIL
    revision: 4
    role: provider
depends_on: []
risk: normal
verification:
  - type: provider-contract
    scenario: PRODUCT-DETAIL-004
  - type: unit
    scope: viewer-like-state
status: pending
verified_against: {}
```

**Consumer Task:**
```yaml
id: FE-02
owner: frontend-product
outcome: Render viewer like state in product detail view
requirements:
  - REQ-PRODUCT-07
acceptance_criteria:
  - AC-PRODUCT-07-01
  - AC-PRODUCT-07-02
contracts:
  - id: PRODUCT-DETAIL
    revision: 4
    role: consumer
depends_on: []
risk: normal
verification:
  - type: component
    scope: ProductDetailView.spec.tsx
status: pending
verified_against: {}
```

**Internal Domain Task (No shared contract):**
```yaml
id: BE-01
owner: backend-product
outcome: Apply product inventory reservation invariants
requirements:
  - REQ-PRODUCT-02
acceptance_criteria:
  - AC-PRODUCT-02-01
contracts: []
depends_on: []
risk: normal
verification:
  - type: unit
    scope: inventory-reservation
status: pending
verified_against: {}
```

Group related tasks under a stable `owner`. The orchestrator reuses one persistent agent for tasks owned by the same coherent workstream.

## Do not decompose by private layers

Avoid tasks such as:

```text
Create ProductRepository.java
Create ProductService.java
Create ProductController.java
```

Prefer:

```text
BE-03 — Provide product detail according to PRODUCT-DETAIL rev 4
```

A file/type may be prescribed only when design declares it a shared architectural boundary.

## Parallelism rule

Tasks can run under different agents concurrently when their contracts are independent and they do not materially share mutable domain abstractions/files. Otherwise keep them in one workstream session even if they are separate tasks.

## Completion semantics

Record `verified_against` contract revisions upon completion. A completed task becomes `STALE` or `REOPENED` when `managing-contract-revisions` changes a contract revision it provides, consumes, or verifies.
