---
name: reviewing-and-freezing-contracts
description: Use when draft shared contracts must become stable implementation authority for multiple independent owners, especially before frontend/backend work proceeds in parallel.
---

# Reviewing and Freezing Contracts

Review draft contracts independently from implementation code.

## Review contract

For every contract revision verify the seven semantic questions:

1. **Shared understanding** — do provider and consumer read the same input/output shape and meaning from this contract?
2. **Success behavior** — is the success status and returned data explicit for every operation?
3. **Material failures** — is every material failure status and its error coding (`error.code`, `error.fields`) explicit?
4. **Auth / viewer / state semantics** — are caller context, viewer-dependent state, and state transitions that change a response explicit?
5. **Misinterpretation risk** — is there any behavior two agents could reasonably implement differently? Contract Examples should pin these down.
6. **Compatibility** — if this revision changes semantics, is the change and its coordinated-release requirement explicit?
7. **Traceability** — does every header requirement cover defined behavior, and is every operating behavior traceable to requirements or design authority?

**Do not block on contract tooling mechanics.** Overlay merge, OpenAPI lint, `$ref` resolution, or scenario-file shape are not review subjects unless the repository uses the machine-readable artifact as its productive source of truth (e.g. codegen). An executable rollout scenario is not a blocking requirement unless version-skew compatibility is a genuine deployment requirement of the feature.

## Findings

Classify findings as `contract_defect`, `requirement_gap`, `design_gap`, or `non_blocking_suggestion`. Do not resolve a requirement/design ambiguity by silently inventing contract behavior.

When blocking findings are resolved, update `.dream/specs/<feature>/contracts/<contract-id>.md` to mark the revision `FROZEN`:

```markdown
# <CONTRACT-ID>

Revision: 2
Status: FROZEN

Requirements:
- REQ-REVIEW-03
- REQ-REVIEW-05

Provider:
- backend

Consumers:
- frontend
```

A frozen revision is immutable during implementation. Later changes create a new revision through `managing-contract-revisions`; they do not rewrite history.
