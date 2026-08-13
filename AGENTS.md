# Repository Agent Instructions

This repository uses Kiro-style feature specifications for governed changes
and Superpowers for engineering execution.

## Instruction priority

Follow instructions in this order:

1. Direct user instructions
2. This `AGENTS.md`
3. Active `.kiro/specs/<feature>/` artifacts
4. Applicable skills
5. Default agent behavior

Load only the repository context relevant to the current task.

## Workflow routing

Classify the request before implementation.

### READ_ONLY

Explanation, inspection, and review without file changes do not require a
feature specification. Use relevant reasoning and review skills when applicable.

### TRIVIAL_CHANGE

Typos, comments, formatting, and obvious local configuration corrections with
no behavior change do not require a feature specification. Keep the change focused and run
proportional verification.

### LOCAL_CHANGE

A small, isolated behavior change may proceed without a feature specification only when all
of the following are true:

- intended behavior is explicit and unambiguous
- only one local bounded context is affected
- no public or shared contract changes
- no compatibility or migration decision is required
- no significant architecture, security, data ownership, or product decision
  is introduced

Use applicable Superpowers implementation and verification skills, including
test-driven development for behavior changes. If any condition stops being
true during implementation, stop and create a governed feature specification.

### LOCAL_BUGFIX

When intended behavior is already established and the fix does not change a
public contract or cross-boundary behavior, do not create a feature specification solely to
restate that behavior. Use systematic debugging, then test-driven development.

If investigation reveals a new product decision, public contract change, or
cross-boundary behavior change, stop implementation and create a governed
feature specification.

### GOVERNED_CHANGE

Behavior changes that do not qualify as `LOCAL_CHANGE` require an approved
feature specification before implementation. Store its canonical artifacts at:

- `.kiro/specs/<feature>/requirements.md`
- `.kiro/specs/<feature>/design.md`
- `.kiro/specs/<feature>/tasks.md`

Use `requirements-engineering`, `design-documentation`, and `task-breakdown`
through the `spec-driven-development` workflow. Requirements, design, and tasks
each require explicit approval. The complete artifact set requires independent
review before implementation.

### CONTRACT_OR_CROSS_BOUNDARY_CHANGE

An approved feature specification is mandatory for changes involving APIs, schemas, events,
compatibility guarantees, security boundaries, persistence ownership, or more
than one independently owned or externally consumed boundary. A boundary is a
service, bounded context, independently deployed application or module,
REST/gRPC API, event contract, shared schema, persistence ownership boundary,
or security boundary.

Layers such as controller, service, and repository inside one bounded context
do not constitute separate boundaries. Stabilize shared contracts before
delegating dependent implementation work.

## Specification and execution responsibilities

Kiro-style artifacts answer:

- `requirements.md`: what behavior is required and how it is accepted
- `design.md`: how the approved requirements will be implemented
- `tasks.md`: which dependency-ordered implementation units deliver the design

Superpowers answers:

- How should the implementation be reasoned about and tested?
- How should unexpected failures be debugged?
- Should the work be isolated or delegated?
- How should the change be reviewed and verified?

Superpowers owns deterministic implementation verification such as tests,
builds, linters, runtime checks, task review, and final implementation review.

The three files under `.kiro/specs/<feature>/` are the source of truth for a
governed change. Use `tasks.md` as the canonical implementation plan. Do not
create a parallel specification or plan under `docs/superpowers/`.

If implementation exposes a material gap or contradiction, update and approve
the affected specification artifact before continuing. Existing files under
`openspec/` are legacy records and do not govern new work.

## User interaction

When execution cannot continue without a material user decision, invoke
OpenCode's `question` tool so the session is explicitly waiting and the
notifier can report the event.

Use the `question` tool for:

- ambiguous requirements not resolvable from repository evidence
- mutually exclusive product or architecture decisions
- approval gates required by the active workflow
- choices with materially different behavior or compatibility impact

Do not ask when the answer can be discovered safely from code, tests, active
feature specifications,
repository instructions, or established conventions. Ordinary prose questions
are acceptable when they do not block execution.

## Delegation

Prefer a single agent for tightly coupled work. Delegate only independent work
whose interfaces and shared contracts are stable. Do not parallelize dependent
producers and consumers while they still need to negotiate schemas, events, or
error semantics.

## Verification

Completion requires fresh deterministic evidence. Run focused checks first,
then broader checks when appropriate. For a governed change, map evidence to
its requirement IDs, acceptance criteria, and completed tasks and identify
anything not verified. Keep completed specifications in `.kiro/specs/` as
durable feature documentation.


## Long-running processes

Do not run long-lived servers or watch commands in the foreground.

Commands such as:
- `npm run dev`
- `mvn spring-boot:run`
- `docker compose up`
- `tail -f`
- watch-mode test runners

must either:
1. be started using the environment's supported background/session mechanism, or
2. be bounded with an explicit timeout.

After starting a background service:
- verify readiness with a health check or bounded polling,
- capture logs to a known location,
- record the PID/session when applicable,
- stop the process when it is no longer needed.

Never wait indefinitely for a command whose expected behavior is to remain running.
