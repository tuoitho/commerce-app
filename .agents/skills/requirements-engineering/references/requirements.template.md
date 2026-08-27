# <Feature> Requirements

## Context

[Feature purpose, background, and supported users or callers]

## Domain Definitions

- **<Term>**: [Clear definition of domain concept or entity]
- **<Term>**: [Clear definition of domain concept or entity]

## Scope

### In Scope

- [Supported capability or workflow]
- [Supported capability or workflow]

### Out of Scope

- [Explicitly excluded capability, edge case, or integration]
- [Explicitly excluded capability, edge case, or integration]

## Requirements

### REQ-<DOMAIN>-<NUM> — <Short Descriptive Title>

**User Story** *(optional)*

As a [role],
I want [capability],
so that [benefit].

#### Behavioral Requirement

When [event / trigger / caller action],
the system shall [observable behavior / response].

#### Invariants

- `INV-<DOMAIN>-<NUM>-01` — [Property or constraint that must remain true across states, requests, or boundaries]
- `INV-<DOMAIN>-<NUM>-02` — [Property or constraint that must remain true across states, requests, or boundaries]

#### Failure / State-dependent Behavior

If [undesired condition / error / invalid state],
the system shall [error response / fallback / preserved behavior].

While [state condition],
the system shall [state-dependent behavior].

#### Acceptance Criteria

**AC-<DOMAIN>-<NUM>-01**

Given [initial state or preconditions],
when [trigger / caller action],
then [observable response and verified state].

**AC-<DOMAIN>-<NUM>-02**

Given [initial state or preconditions],
when [trigger / caller action],
then [observable response and verified state].
