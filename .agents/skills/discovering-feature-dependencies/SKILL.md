---
name: discovering-feature-dependencies
description: Use when a feature in an existing repository may interact with existing behavior, state, contracts, dependencies, or consumers.
---

# Discovering Feature Dependencies

Perform bounded discovery of the existing system relationships that determine
whether a feature is complete and compatible.

The goal is not to understand the whole repository. Discover only direct
relationships needed to identify affected existing behavior and capabilities
required by the requested feature.

## Dependency Signals

Treat a feature element as a dependency signal when correct implementation
requires behavior, information, state, ownership, or a contract outside the
feature's primary boundary.

Common signals include:

- relationships to existing concepts or state;
- inputs supplied by another component or workflow;
- shared contracts or persisted formats;
- existing consumers of behavior being changed;
- lifecycle or ownership rules spanning boundaries;
- capabilities required to complete a supported workflow.

Signals guide bounded discovery; they do not automatically expand feature
scope.

## Discovery

For each dependency signal, inspect directly related repository artifacts and
identify:

### Downstream Impacts

Existing supported functionality that creates, reads, updates, deletes,
displays, filters, validates, references, or otherwise depends on behavior,
state, contracts, or concepts the feature changes.

### Supporting Dependencies

Existing capabilities, state, or shared contracts required for the requested
workflow to work completely.

Do not assume that required external inputs, state, capabilities, or contracts
will somehow be available during implementation. Trace such inputs to a supported
source unless the contract explicitly requires the caller to provide them
independently.

A feature may both depend on existing capabilities and affect existing
consumers. Check both directions.

## Dependency Classification

Classify every material direct relationship as one of:

- existing capability is sufficient;
- existing capability requires extension;
- new supporting capability is required;
- existing behavior is affected and must be preserved or intentionally changed;
- a material product decision is required;
- unrelated or unaffected.

Repository evidence may reveal compatibility requirements and missing workflow
dependencies. It must not silently invent new product behavior.

If different reasonable behaviors would produce materially different
user-visible or contract-visible results, surface the decision instead of
choosing one silently.

## Boundaries

Follow direct relationships only as far as needed to establish supported
behavior or a material integration contract.

Do not recursively inspect adjacent subsystems, search for unrelated defects,
or expand the feature merely because nearby functionality exists.

Do not create a parallel capability or duplicate source of truth when an
existing supported mechanism already satisfies the dependency.

Requirements define required observable behavior. Design determines the
technical mechanism and exact integration contract.

## Result

Return discovery findings to the calling workflow as working context, not as a
new specification artifact.

Include only material findings under:

- Dependency signals
- Downstream impacts
- Supporting dependencies
- Existing capabilities that may be reused
- Material unresolved decisions

If a section has no findings, state `None`.