---
name: authoring-executable-contracts
description: Use when an approved design identifies APIs, events, UI-provider boundaries, or other shared interfaces that independent implementation owners must consume or provide.
---

# Authoring Executable Contracts

Create `.kiro/specs/<feature>/contracts/` from approved requirements and design.

## Required Artifacts

Use:
- `references/contract-manifest.template.yaml`
- `references/scenarios.template.yaml`

Create:

```text
.kiro/specs/<feature>/contracts/
├── manifest.yaml
├── api.openapi.yaml        # when applicable (OpenAPI, protobuf, GraphQL, or typed schema)
└── scenarios.yaml
```

## Contract contents

For each boundary, define the exact observable agreement needed for independent implementation:

- identifier and revision;
- producer/provider and consumers;
- request/input shape and caller context;
- success status/result shape;
- each material failure status/result shape;
- semantic rules not expressible by schema alone;
- concrete Given/When/Then examples (follow `references/scenarios.template.yaml`);
- requirement IDs;
- compatibility classification for later changes.

Use OpenAPI, event schemas, or typed interface schemas where appropriate, plus scenarios for stateful/semantic behavior. Schema alone is insufficient when the same shape can carry different meaning.

## Example scenario

```yaml
- id: PRODUCT-DETAIL-004
  requirement: REQ-PRODUCT-07
  given: authenticated user has liked product P1
  when: GET /products/P1
  then:
    status: 200
    body.viewer.isLiked: true
```

Specify anonymous behavior explicitly when response fields depend on current-user context.

## Boundary rule

Only contract behavior that another owner or observable client depends on. Do not contract private class names, helper methods, or internal persistence structure.

Set new contracts to `DRAFT` in `manifest.yaml` (following `references/contract-manifest.template.yaml`). They are not implementation authority until `reviewing-and-freezing-contracts` marks a revision `FROZEN`.
