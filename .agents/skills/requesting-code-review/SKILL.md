---
name: requesting-code-review
description: Use when completing tasks, implementing major features, or before merging to verify work meets requirements and does not introduce defects.
---

# Requesting Code Review

Dispatch a code reviewer subagent to catch issues before they cascade. The reviewer gets precisely crafted context for evaluation — never your session's history.

**Core principle:** One broad review per boundary; fixes receive scoped
re-review, not another broad audit.

## When to Request Review

**Mandatory:**
- After each task in subagent-driven development
- After completing major feature
- Before merge to main

**Optional but valuable:**
- When stuck (fresh perspective)
- Before refactoring (baseline check)
- After fixing complex bug

## How to Request

**1. Get git SHAs:**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # or origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. Dispatch code reviewer subagent:**

Dispatch a build/native subagent. Give it only the context it needs and tell it to load the `review-agent` skill as its single source of review instructions.

```
description: "Review code changes"
prompt: |
  Load the `review-agent` skill and follow it exactly for this review.

  ## What Was Implemented

  {DESCRIPTION}

  ## Requirements / Plan

  {PLAN_OR_REQUIREMENTS}

  ## Target to Review

  Base: {BASE_SHA}
  Head: {HEAD_SHA}
```

**3. Act on feedback:**
- Fix P0 issues immediately (blocker)
- Fix P1 issues before proceeding
- Address P2 issues before merge, or track them if not blocking
- P3 issues can be noted for later
- Push back if reviewer is wrong (with reasoning)

## Re-review Rule

Do not request another broad review of the same change solely because findings
were fixed.

After a repair:

- preserve the original findings,
- review only the repair delta,
- verdict the original findings, and
- admit new blockers only when introduced by the repair.

A P3 finding never triggers a repair round by itself.
