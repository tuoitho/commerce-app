---
name: executing-persistent-workstreams
description: Use when a task DAG contains multiple related tasks owned by the same frontend, backend, domain, or subsystem workstream and implementation context should persist across those tasks.
---

# Executing Persistent Workstreams

One workstream owner retains implementation context across its related tasks.

## Session scope

At session start read the current repository state, approved requirements/design, frozen contracts owned or consumed by the workstream, and assigned tasks.

Execute tasks in DAG order. For each task:

1. establish the task's contract/scenario acceptance boundary;
2. implement using repository conventions and normal TDD discipline;
3. invoke `verifying-task-gates`;
4. checkpoint material repository decisions and task state;
5. continue to the next ready task in the same workstream.

Do not let chat/session memory become source of truth. Persist material decisions in repository artifacts; a replacement owner must be able to resume from repository + specs + task state.

## Contract rule

If implementation exposes a missing, contradictory, or incorrect frozen contract, stop that affected behavior and invoke `managing-contract-revisions`. Do not make an undocumented provider/consumer agreement inside the session.

## Context reset

Retain the owner while the workstream remains coherent. Start a fresh owner (subagent) when context has become dominated by obsolete attempts, or when the next tasks cross into a genuinely independent bounded context. A fresh owner must rediscover from repository artifacts, not inherit private reasoning transcripts.
