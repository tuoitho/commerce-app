# <CONTRACT-ID>

Revision: 1
Status: DRAFT  # DRAFT | FROZEN

Requirements:
- REQ-<DOMAIN>-<NUM>

Provider:
- <owner-id>

Consumers:
- <owner-id>

Compatibility:
- none (first revision)

## <Boundary or endpoint>

### Success — <status>

Response data:

- <field>: <exact meaning>

### <Material failure> — <status>

- error.code = `<code>`
- error.fields.<field> is present (validation errors only)

### Rules

- <semantic rule both sides must interpret identically>

## <Next boundary or endpoint>

...

## Compatibility

<Describe how this revision differs from the previous revision and what a consumer must do. For breaking semantics state the coordinated-release constraint explicitly, e.g. "Backend and frontend implementing this revision must be released together.">

## Contract Examples

### <Example title>

Given <precondition>,

when <action/request>,

then <observable outcome>.