---
name: reviewing-feature-spec
description: Use for an independent read-only review of completed .dream requirements, design, and tasks before implementation
---

# Reviewing A Feature Specification

Perform a read-only review of one `.dream/specs/<feature>/` artifact set. Read
`requirements.md`, `design.md`, and `tasks.md` together.

Independently apply bounded feature dependency discovery to the domain concepts,
relationships, user workflows, and shared boundaries defined by the
specification.

Inspect relevant code, tests, existing specifications, and contracts to:

1. verify concrete claims made by the artifacts; and
2. identify direct downstream impacts or supporting dependencies that the
   artifacts may have omitted.

Do not perform open-ended repository inspection beyond those direct
relationships and do not search for unrelated risks, hardening opportunities,
or improvements.

## Review Discipline

Diagnose specification gaps; do not solve them.

Do not design algorithms, locking strategies, schemas, migrations, retry
mechanisms, rollback mechanisms, or architecture alternatives unless needed
only to demonstrate that a documented design is impossible.

A finding should identify:
1. what the artifacts say,
2. what concrete ambiguity or contradiction exists,
3. why implementation is blocked or may be incorrect.

Stop there.

## Independent Dependency Check

Do not assume the specification has already identified all relevant
dependencies.

Derive dependency signals from the specification and inspect their direct
existing producers, consumers, persisted relationships, and supported user
flows.

Check both directions:

### Downstream

Could the feature materially affect existing supported behavior, state, or
contracts that directly depend on what is being changed?

### Supporting

Does a required workflow depend on external inputs, state, reference data, or
capabilities for which the specification provides no supported source or
contract?

A feature may both depend on existing capabilities and affect existing
consumers. Check both directions.

Repository evidence used to establish a finding must identify a concrete
existing relationship or supported contract. Do not infer dependencies from
domain similarity alone.

## Review Criteria

Report actionable issues that could cause implementation to build the wrong
behavior, miss required behavior, rely on an unstated mutable assumption,
violate a material design decision, or get blocked.

Check:

1. Requirements are unambiguous, testable EARS statements with stable IDs and
   necessary normal, edge, failure, security, and compatibility behavior.
2. Design covers every requirement without inventing scope and defines all
   material boundaries, interfaces, data, error, and migration decisions.
3. Tasks cover every requirement and acceptance criterion with deterministic
   verification. For features that add or modify UI in `frontend/` or
   `frontend-admin/`, `design.md` and `tasks.md` must include a final E2E
   verification leaf task (`verifier` role) that executes real browser flows and
   produces `.dream/specs/<feature>/imgs/` and `.dream/specs/<feature>/report.md`.
4. Task dependencies correctly distinguish shared-contract dependencies from
   implementation dependencies.

   Shared contracts required across independently implemented boundaries are
   stabilized before dependent work is dispatched. Once stable, producers and
   consumers do not depend on one another merely to discover or negotiate the
   contract through implementation.
5. Explicitly referenced paths, interfaces, commands, and expected outcomes are
   internally consistent and compatible with the repository.
6. The artifacts contain no contradictions, placeholders, or unresolved
   product, contract, architecture, or cross-boundary decisions required for
   correct implementation.

   Do not require the specification to decide ordinary local implementation
   details when multiple choices would satisfy the documented behavior.
7. Behavioral completeness for realistic state changes.

   Consider concurrency, stale state, retries, partial failure, expiration, or
   dependency changes only when they are clearly relevant to the feature as
   described or to an existing repository behavior that the feature relies on.

   Do not systematically enumerate hypothetical race conditions, failure modes,
   distributed-systems scenarios, browser quirks, numeric extremes, or recovery
   mechanisms merely because they are theoretically possible.

   Treat a scenario as supported only when it is reachable through a documented
   system path or the specification explicitly requires the relevant invariant
   at that boundary. Do not escalate states obtainable only through ad hoc
   direct database manipulation, bypassed application validation, unsupported
   callers, or fabricated invalid internals.

   Flag an issue only when:
   - the scenario is reasonably likely in normal supported use,
   - the repository or specification provides evidence that the scenario matters,
   - different plausible implementations would produce materially different
     user-visible or contract-visible behavior, and
   - the implementer cannot resolve it from existing requirements, design,
     repository conventions, or established behavior.

   Do not design a solution during review. State only the missing behavioral
   decision.
8. Cross-phase behavioral consistency.

   Verify that requirements, design, and tasks preserve the same behavioral
   assumptions and do not silently weaken, reinterpret, or omit behavior across
   phases.
9. Shared contract and dependency integrity.

   When independently implemented work units rely on a shared boundary, verify
   that:

   - the specification identifies one canonical source for each material shared
     contract;
   - all relevant producers and consumers derive their behavior from that
     canonical contract;
   - no implementation task is treated as the source of truth for another when
     both should consume the approved contract;
   - the contract fixes all decisions required for independent implementation
     without further negotiation; and
   - task-to-task dependencies represent genuine implementation prerequisites,
     not accidental execution order.

   A shared contract may be an HTTP, GraphQL, or RPC contract; gRPC/protobuf
   schema; event or command schema; public module, package, service, or function
   interface; persisted cross-boundary format; migration contract; or another
   binding interface, invariant, or compatibility guarantee.

   Do not require a standalone or machine-readable contract artifact when the
   approved specification already defines the boundary precisely enough. Do not
   require a shared contract when the work is confined to one implementation
   boundary and no independently implemented consumer relies on it.
10. Feature dependency completeness.

    For each concept, persisted relationship, public contract, or
    cross-boundary dependency materially involved in the feature, verify both:

    **Downstream impact**
    - directly affected existing supported behavior, state, and contracts are
      accounted for;
    - compatibility is preserved or an intentional behavior change is defined.

    **Supporting dependency**
    - every material external input, state, or capability required by a
      supported workflow has a documented supported source or contract;
    - the design identifies the canonical existing capability or defines the
      required contract when none exists;
    - tasks cover required integration work.

    Flag a blocking issue only when:

    - repository or specification evidence establishes the direct relationship;
    - the relationship affects required user-visible or contract-visible
      behavior;
    - the specification does not resolve it;
    - different reasonable implementations could produce materially different
      behavior; and
    - the implementer cannot resolve it through an ordinary local implementation
      choice.

    Do not require a parallel capability or new API when an existing supported
    capability already satisfies the dependency.

Do not flag wording preferences, formatting, or optional enhancements.

An implementation or schema domain that is broader than approved product
behavior does not expand the specification by itself.

## Finding Gate

Before reporting a blocking finding, verify all of the following:

1. It originates from a concrete statement, omission, or contradiction in the
   specification artifacts.
2. It affects required behavior or a documented repository contract.
3. The issue cannot be resolved by an ordinary implementation choice.
4. Resolving it requires changing or clarifying the specification.

An omission may be established by concrete directly relevant repository
evidence discovered during the bounded dependency check.

When a finding depends on repository evidence, identify the relevant path,
interface, schema, relationship, or supported flow in the finding so the caller
can verify why the omitted dependency is material.

If any condition is false, it is not a blocking finding.

Advisory notes must still be concrete and specification-relevant. Do not use
them for speculative risks, optional hardening, or ordinary implementation
choices.

## Stop Condition

Stop once:

1. all three specification artifacts have been checked for cross-phase
   consistency;
2. direct producers and consumers of the feature's material impact anchors have
   been checked;
3. required supporting dependencies for documented user workflows have been
   checked;
4. directly relevant repository contracts have been checked; and
5. all candidate blocking findings have passed the Finding Gate.

Do not continue outward into adjacent dependencies once these direct
relationships are resolved.

Do not search for additional edge cases, hardening opportunities,
implementation risks, unrelated defects, or alternative designs.

## Re-review Mode

When the caller supplies previous blocking findings and identifies artifact
changes made to address them, perform a scoped re-review instead of another
broad review.

For each previous blocking finding, return:

- `ADDRESSED` when the concrete ambiguity or contradiction no longer exists.
- `NOT ADDRESSED` when the original blocking condition still exists.

Inspect changed sections and their directly linked requirements, design
decisions, and tasks for contradictions introduced by the repair. Do not
reopen previously reviewed untouched sections.

Admit a new blocking finding only when it was introduced by the current
specification repair, passes the normal Finding Gate, and materially prevents
correct implementation. Unrelated observations and optional improvements are
non-blocking and do not extend the repair loop.

Do not repeat broad dependency discovery during Re-review Mode.

Reinspect only:

- dependencies involved in previous blocking findings;
- dependencies directly touched by the repaired artifact sections; and
- contradictions introduced into directly linked requirements, design
  decisions, or tasks.

A dependency unrelated to the repair cannot become a new blocking finding in
Re-review Mode.

Use this output in Re-review Mode:

```markdown
## Feature Specification Re-review

### Previous Findings
- [finding]: ADDRESSED | NOT ADDRESSED — evidence

### New Blocking Regressions From Repair
- [artifact:section]: Issue
- None

### Advisory Notes
- Non-blocking observation

**Status:** Approved | Issues Remain
```

## Change Review Mode

When the caller supplies a CCR from `managing-contract-changes`, the artifact
paths, and the artifact diff, review only that change. Do not repeat the broad
specification review.

Check:

1. The CCR, `design.md` contract headings, and `tasks.md` references agree on
   every changed contract's new revision.
2. Each compatibility class is correct for existing consumers. A change that
   requires any existing consumer to change is not `additive`.
3. The impact table follows the reopen rules: every task referencing a changed
   contract appears, and each action matches its role and compatibility class.
4. Every direct code consumer of a changed contract is covered by a reopened
   or new task. Establish consumers with bounded repository evidence, as in
   the Independent Dependency Check.
5. Changed requirements, design sections, and tasks are consistent with each
   other and with untouched sections that directly depend on the changed
   contracts.
6. Schema changes add a new migration instead of editing an applied one.

Apply the normal Finding Gate. Later repair rounds use Re-review Mode.

```markdown
## Contract Change Review: CCR-<NNN>

**Status:** Approved | Issues Found

### Blocking Issues
- [artifact:section]: Issue and why it blocks correct implementation.

### Advisory Notes
- [artifact:section]: Non-blocking risk or clarification.
```

## Output

```markdown
## Feature Specification Review

**Status:** Approved | Issues Found

### Blocking Issues
- [artifact:section]: Issue and why it blocks correct implementation.

### Advisory Notes
- [artifact:section]: Non-blocking risk or clarification.
```

Use `Approved` only when there are no blocking issues. If there are no
findings, state that explicitly. Do not edit files.