---
name: discovering-feature-dependencies
description: Use when a feature in an existing repository may interact with existing domain concepts, user flows, reference data, persisted relationships, or public contracts.
---

# Discovering Feature Dependencies

Perform bounded discovery of the existing system relationships that determine
whether a feature is complete and compatible.

The goal is not to understand the whole repository. Discover only direct
relationships needed to identify affected existing behavior and capabilities
required by the requested feature.

## Impact Anchors

Derive a small set of impact anchors from the feature description or approved
specification:

- domain concepts and resources;
- persisted entities and relationships;
- externally supplied IDs, codes, enums, or reference values;
- user workflows;
- public APIs, messages, schemas, or shared interfaces;
- lifecycle, authorization, or ownership boundaries when relevant.

Use these anchors to locate direct existing producers and consumers.

## Discovery

For each impact anchor, inspect directly related repository artifacts and
identify:

### Downstream Impacts

Existing supported functionality that creates, reads, updates, deletes,
displays, filters, validates, references, or otherwise depends on a concept the
feature changes.

Example:

`Category Management` may affect existing Product behavior when Product
references Category.

### Supporting Dependencies

Existing capabilities or reference data required for the requested user
workflow to work completely.

Example:

`Product Management` with `categoryId` may require a supported way to obtain
available categories for product creation and editing.

Do not assume callers somehow know internal identifiers or reference values.
Trace such inputs to a supported source unless the contract explicitly requires
the caller to provide them independently.

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

Do not require a new API or convenience capability when an existing supported
contract already satisfies the workflow.

Requirements define required observable behavior. Design determines the
technical mechanism and exact integration contract.

## Result

Return discovery findings to the calling workflow as working context, not as a
new specification artifact.

Include only material findings under:

- Impact anchors
- Downstream impacts
- Supporting dependencies
- Existing capabilities that may be reused
- Material unresolved decisions

If a category is empty, state `None`.