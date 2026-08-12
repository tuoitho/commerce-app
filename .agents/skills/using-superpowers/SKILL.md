---
name: using-superpowers
description: Use when starting any conversation to determine which repository workflow and skills apply
---

# Using Superpowers

<SUBAGENT-STOP>
If dispatched as a subagent for a specific task, follow the task brief and its
explicitly required skills instead of rerunning repository-wide routing.
</SUBAGENT-STOP>

## Core rule

Check for applicable repository instructions, OpenSpec artifacts, and skills
before responding or acting. Invoke every applicable skill before taking the
action it governs.

User instructions override repository instructions. Repository instructions
override active OpenSpec artifacts, which override skills and default behavior.

## Route before invoking process skills

Read the root `AGENTS.md` and classify the request.

### Existing OpenSpec change

When an active OpenSpec change sufficiently defines the requested behavior:

1. Read its proposal, specs, design, and tasks as relevant.
2. Treat those artifacts as the source of truth.
3. Do not restart brainstorming or create another specification or plan.
4. Invoke the execution skills required by its tasks.

Typical execution skills include test-driven-development,
systematic-debugging, subagent-driven-development, requesting-code-review,
and verification-before-completion.

### New or insufficiently specified behavior

Use brainstorming when observable behavior, scope, architecture, or
compatibility is not sufficiently defined. In repositories using OpenSpec, the
durable result of brainstorming becomes or updates OpenSpec artifacts; it is
not a parallel Superpowers specification.

### Established bug

When expected behavior is already established and no contract or product
decision is required, use systematic-debugging and test-driven-development.
Do not create an OpenSpec change solely to restate existing behavior.

If investigation reveals a new behavior or contract decision, stop and route
the work through OpenSpec.

### Small local behavior change

When behavior is explicit and unambiguous, affects one bounded context, and
introduces no public/shared contract, compatibility, migration, architecture,
security, data ownership, or significant product decision, follow the
repository's `LOCAL_CHANGE` route. Use test-driven-development and proportional
verification without creating OpenSpec artifacts.

If any local-change condition stops being true, stop implementation and route
the work through OpenSpec.

### Read-only and trivial work

Do not require OpenSpec for explanation, inspection, review, formatting, or an
obvious local correction with no behavior change. Applicable review,
debugging, or verification skills still apply.

## Blocking user interaction

When execution cannot continue without a material user decision, invoke
OpenCode's `question` tool. Do not simulate a blocking question by ending a
normal response with a question.

Do not ask when the answer can be discovered from source code, tests,
repository instructions, active OpenSpec artifacts, or established
conventions.

## Platform adaptation

When platform-specific mechanics matter, read the matching reference:

- Codex: `references/codex-tools.md`
- Pi: `references/pi-tools.md`
- Antigravity: `references/antigravity-tools.md`

## Red flags

Stop and reroute if any of these occur:

- starting implementation before checking for an active OpenSpec change
- invoking brainstorming merely because implementation is about to begin
- creating a Superpowers spec or plan beside a sufficient OpenSpec change
- creating an OpenSpec change for work that satisfies every `LOCAL_CHANGE` condition
- fixing an established bug without systematic debugging and TDD
- asking a blocking question without the `question` tool
- asking the user for an answer the repository can provide
