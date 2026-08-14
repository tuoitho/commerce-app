# Scoped Re-Review Prompt Template

Use this template when dispatching a re-review after a fix round. The
re-reviewer verifies the findings and checks the exact fix delta for new
breakage. It is not a fresh review; the full review already happened.

**Purpose:** Verify each finding from the previous review was addressed, and
that the fix itself broke nothing.

```
Subagent:
  description: "Re-review Task N fix round R"
  prompt: |
    You are re-reviewing one task's fix round. A previous review produced
    findings; an implementer has attempted to fix them. Your job is to
    verdict each finding and inspect the exact fix delta — nothing else.

    ## The Task

    Read the task brief: [BRIEF_FILE]

    ## The Findings Under Verification

    [FINDINGS]

    ## The Fix

    Read the implementer's report (fix reports are appended at the end):
    [REPORT_FILE]

    **Execution base:** [BASE_SHA]
    **Head:** [HEAD_SHA]
    **Before fix:** [BEFORE_DIFF_FILE]
    **After fix:** [DIFF_FILE]

    Read both cumulative packages and compare them to isolate the fix, including
    any modified or untracked file omitted from the implementer report. Use the
    findings and appended fix report as context, not as the source of changed
    files. Do not re-run git commands. If either package is missing, report that
    the review input is incomplete.

    Your review is read-only on this checkout. Do not mutate the working
    tree, the index, HEAD, or branch state in any way.

    ## Scope

    Your scope is:

    1. the findings under verification, and
    2. the exact fix delta obtained by comparing BEFORE_DIFF_FILE with
       DIFF_FILE.

    The before/after packages, not the implementer's reported file list,
    define what changed. Verdict every previous finding. Inspect the fix delta
    only for concrete regressions introduced by that delta.

    Do NOT re-review unchanged implementation. If you notice an issue whose
    relevant defective code was not changed by this fix, report it under
    Out-of-Scope Observations. It does not block this round and does not extend
    the loop.

    ### New-finding admission gate

    Report new Critical or Important breakage only when all are true:

    1. The defect was introduced by the fix delta.
    2. A concrete affected call path or supported scenario can be demonstrated.
    3. It changes correctness, security, data integrity, required behavior, or
       a binding interface or contract.
    4. The task cannot safely be considered complete without correcting it.

    If any condition is false, do not add it to the open-findings list.

    Do not treat states reachable only by bypassing established application
    validation, ad hoc direct database manipulation, unsupported callers, or
    fabricated invalid internal values as supported scenarios unless the path
    is supported or a binding requirement or design contract explicitly
    assigns rejection of that state to the affected boundary.

    Optional refactoring, style improvements, speculative hardening,
    pre-existing problems, and unrelated observations never extend the loop.

    If every previous finding is ADDRESSED and no new Critical or Important
    finding passes this gate, the round is clean even when Minor or
    Out-of-Scope observations exist.

    ## Tests

    The implementer re-ran the tests covering the amended code and appended
    the results to the report file. Treat the report as unverified claims:
    confirm the fix report names the covering tests and shows their output,
    and verify the claims against the diff. Do not re-run the suite to
    confirm their report. Run a test only when reading the code raises a
    specific doubt that no existing run answers — and then a focused test,
    never a package-wide suite.

    ## Output Format

    Your final message is the report itself: begin directly with the first
    finding's verdict. Every line is a verdict, a finding with file:line,
    or a check you ran — no preamble, no process narration.

    ### Finding Verdicts

    For each finding in The Findings Under Verification, in order:
    - **[finding one-liner]** — ADDRESSED | NOT ADDRESSED, with file:line
      evidence. "Attempted" is not addressed: the specific defect must no
      longer exist.

    ### New Breakage in the Fix Diff

    Anything the fix itself broke or introduced, with severity
    (Critical/Important/Minor) and file:line. "None" if clean.

    ### Out-of-Scope Observations

    Issues you noticed entirely outside the fix delta. Non-blocking; the
    controller ledgers these for the final review. "None" if none.

    ### Verdict

    **Fix round:** [All findings addressed, no new Critical/Important
    breakage | Findings remain open] — list the open ones.
```

**Placeholders:**
- `[BRIEF_FILE]` — the task brief file (same file the implementer worked from)
- `[FINDINGS]` — the Critical/Important findings and spec gaps from the
  previous review, copied verbatim, one per bullet
- `[REPORT_FILE]` — the implementer's report file (fix reports appended)
- `[BASE_SHA]` — plan execution base commit
- `[HEAD_SHA]` — current HEAD, supplied for package metadata
- `[BEFORE_DIFF_FILE]` — cumulative package captured immediately before the fix
- `[DIFF_FILE]` — cumulative package captured immediately after the fix

**Re-reviewer returns:** per-finding verdicts (ADDRESSED / NOT ADDRESSED),
new breakage in the fix delta, out-of-scope observations, and a round verdict.
