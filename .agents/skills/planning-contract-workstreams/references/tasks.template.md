# <Feature> Workstream Tasks

## Contract baseline

| Contract | Revision | Status |
|---|---:|---|
| <CONTRACT-ID> | <N> | FROZEN |

*(Leave empty or note "N/A" if no shared contracts are required for this feature)*

## Workstream: <owner-id>

### <TASK-ID> — <bounded observable outcome>

```yaml
id: <TASK-ID>
owner: <owner-id>
outcome: <bounded observable outcome>
requirements:
  - <REQ-ID>
acceptance_criteria:
  - <AC-ID>
  - <AC-ID>
contracts:
  - id: <CONTRACT-ID>
    revision: <revision>
    role: provider # provider | consumer | verifier
depends_on: []
risk: normal # normal | high
verification:
  - type: provider-contract # provider-contract | consumer-contract | unit | integration-db | component | typecheck
    scenario: <SCENARIO-ID>
    scope: <scope-or-command>
status: pending
verified_against: {}
```

**Acceptance scenarios:** `<SCENARIO-ID>`, `<SCENARIO-ID>`

**Architectural constraints:** only shared/material constraints from `design.md`.

> Private class/file decomposition is intentionally left to the workstream owner unless a shared interface is architecturally fixed.
