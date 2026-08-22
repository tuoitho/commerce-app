---
name: planning-contract-workstreams
description: Use when frozen feature contracts need to be decomposed into independently verifiable work packages and assigned to persistent implementation owners.
---

# Planning Contract Workstreams

Create `.kiro/specs/<feature>/tasks.md` as an execution DAG.

## Output

Create `.kiro/specs/<feature>/tasks.md`.

Use `references/tasks.template.md` as the required structural shape.

## Task definition

A task is a bounded observable outcome, not a coding recipe. Each task MUST contain:

- `id`: unique task identifier;
- `owner`: coherent workstream owner (e.g., `backend-account`, `frontend-ui`);
- `outcome`: bounded observable outcome;
- `contracts`: map of contract IDs to their frozen revisions;
- `depends_on`: list of task IDs that must complete first;
- `risk`: `normal` or `high`;
- `verification`: list of deterministic checks (provider-contract, unit, typecheck);
- `acceptance scenarios`: declared scenario IDs from `scenarios.yaml`;
- `status`: `pending`, `in_progress`, `completed`, `stale`, or `reopened`;
- `verified_against`: map of contract revisions verified upon completion.

Example task entry:

```yaml
id: BE-03
owner: backend-account
outcome: Provide product-detail viewer like state
contracts:
  PRODUCT-DETAIL: 4
depends_on: []
risk: normal
verification:
  - provider-contract: PRODUCT-DETAIL-004
  - unit: relevant account/product tests
status: pending
verified_against: {}
```

Group related tasks under a stable `owner`. The orchestrator should reuse one persistent agent for tasks owned by the same coherent workstream.

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

Record `verified_against` contract revisions. A completed task becomes `STALE` when `managing-contract-revisions` changes a contract revision it provides, consumes, or verifies.
