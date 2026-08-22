# <Feature> Workstream Tasks

## Contract baseline

| Contract | Revision | Status |
|---|---:|---|
| <CONTRACT-ID> | <N> | FROZEN |

## Workstream: <owner-id>

### <TASK-ID> — <bounded observable outcome>

```yaml
owner: <owner-id>
contracts:
  <CONTRACT-ID>: <revision>
depends_on: []
risk: normal # normal | high
verification:
  - <deterministic check>
status: pending
verified_against: {}
```

**Acceptance scenarios:** `<SCENARIO-ID>`, `<SCENARIO-ID>`

**Architectural constraints:** only shared/material constraints from `design.md`.

> Private class/file decomposition is intentionally left to the workstream owner unless a shared interface is architecturally fixed.
