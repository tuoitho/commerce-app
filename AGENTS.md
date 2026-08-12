# Repository Agent Instructions

This repository uses OpenSpec for change specification and Superpowers for
engineering execution.

## Instruction priority

Follow instructions in this order:

1. Direct user instructions
2. This `AGENTS.md`
3. Active OpenSpec artifacts
4. Applicable skills
5. Default agent behavior

Load only the repository context relevant to the current task.

## Workflow routing

Classify the request before implementation.

### READ_ONLY

Explanation, inspection, and review without file changes do not require an
OpenSpec change. Use relevant reasoning and review skills when applicable.

### TRIVIAL_CHANGE

Typos, comments, formatting, and obvious local configuration corrections with
no behavior change do not require OpenSpec. Keep the change focused and run
proportional verification.

### LOCAL_CHANGE

A small, isolated behavior change may proceed without OpenSpec only when all
of the following are true:

- intended behavior is explicit and unambiguous
- only one local bounded context is affected
- no public or shared contract changes
- no compatibility or migration decision is required
- no significant architecture, security, data ownership, or product decision
  is introduced

Use applicable Superpowers implementation and verification skills, including
test-driven development for behavior changes. If any condition stops being
true during implementation, stop and route the work through OpenSpec.

### LOCAL_BUGFIX

When intended behavior is already established and the fix does not change a
public contract or cross-boundary behavior, do not create OpenSpec solely to
restate that behavior. Use systematic debugging, then test-driven development.

If investigation reveals a new product decision, public contract change, or
cross-boundary behavior change, stop implementation and route through
OpenSpec.

### GOVERNED_CHANGE

Behavior changes that do not qualify as `LOCAL_CHANGE` require OpenSpec before
implementation. OpenSpec owns proposal, requirements, change design, tasks,
specification-compliance review, and archival. If the change is insufficiently
defined, use brainstorming to clarify it and record the durable result in
OpenSpec.

### CONTRACT_OR_CROSS_BOUNDARY_CHANGE

OpenSpec is mandatory for changes involving APIs, schemas, events,
compatibility guarantees, security boundaries, persistence ownership, or more
than one independently owned or externally consumed boundary. A boundary is a
service, bounded context, independently deployed application or module,
REST/gRPC API, event contract, shared schema, persistence ownership boundary,
or security boundary.

Layers such as controller, service, and repository inside one bounded context
do not constitute separate boundaries. Stabilize shared contracts before
delegating dependent implementation work.

## OpenSpec and Superpowers responsibilities

OpenSpec answers:

- What behavior changes?
- Why is the change needed?
- Which boundaries and contracts are affected?
- Which acceptance criteria and compatibility guarantees must hold?
- Which tasks belong to the change?

Superpowers answers:

- How should the implementation be reasoned about and tested?
- How should unexpected failures be debugged?
- Should the work be isolated or delegated?
- How should the change be reviewed and verified?

Superpowers owns deterministic implementation verification such as tests,
builds, linters, and runtime checks. OpenSpec verify reviews completeness,
correctness, and coherence against the governing change artifacts before
archive.

OpenSpec is the source of truth for a governed change. Do not create a second
Superpowers specification or implementation plan when an active OpenSpec
change already provides one. Use `openspec/changes/<change>/tasks.md` as the
canonical implementation plan.

If implementation exposes a material gap or contradiction, update the OpenSpec
artifacts before continuing.

## User interaction

When execution cannot continue without a material user decision, invoke
OpenCode's `question` tool so the session is explicitly waiting and the
notifier can report the event.

Use the `question` tool for:

- ambiguous requirements not resolvable from repository evidence
- mutually exclusive product or architecture decisions
- approval gates required by the active workflow
- choices with materially different behavior or compatibility impact

Do not ask when the answer can be discovered safely from code, tests, OpenSpec,
repository instructions, or established conventions. Ordinary prose questions
are acceptable when they do not block execution.

## Delegation

Prefer a single agent for tightly coupled work. Delegate only independent work
whose interfaces and shared contracts are stable. Do not parallelize dependent
producers and consumers while they still need to negotiate schemas, events, or
error semantics.

## Verification

Completion requires fresh deterministic evidence. Run focused checks first,
then broader checks when appropriate. For an OpenSpec change, map evidence to
its requirements and completed tasks and identify anything not verified.

Do not archive a change solely because implementation code exists.