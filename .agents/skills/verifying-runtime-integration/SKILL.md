---
name: verifying-runtime-integration
description: Use when independently implemented workstreams have assembled and feature correctness depends on real process, network, browser, persistence, or cross-boundary behavior.
---

# Verifying Runtime Integration

Use a fresh verifier against the real assembled system. Owner-agent reports are inputs, not proof.

This step is invoked when the design's verification strategy specifies runtime HTTP, browser automation, or multi-process integration proof obligations.

## Three Mandatory Safety Rules

1. **Never test against an obsolete process:** Verification must run against the exact code in the current working tree.
2. **Never kill unidentified or external processes:** Only terminate a process holding a target port if it is definitively proven to belong to the current project. If ownership is uncertain or belongs to another application, stop immediately and report the port conflict.
3. **Always clean up started processes:** Any runtime server or background process spawned during verification must be terminated upon verification completion.

## Runtime Lifecycle Flow

```text
check port
   ↓
port free?
 ┌─┴──────────┐
yes           no
 │             ↓
 │        identify process
 │             ↓
 │        current project?
 │          /       \
 │        yes        no
 │         ↓          ↓
 │        kill      BLOCKED (report conflict)
 │         │
 └─────────┘
      ↓
start current code (background session)
      ↓
wait ready (bounded readiness check)
      ↓
run verification (HTTP / DB / Playwright)
      ↓
cleanup (terminate started process)
```

## Step-by-Step Execution Procedure

### 1. Determine Target Ports
Identify all expected runtime ports from configuration or design (e.g., backend `:8080`, frontend `:5173`).

### 2. Check Port Availability
Inspect whether target ports are currently in use (e.g., `netstat -ano | findstr :<PORT>` on Windows or `lsof -i :<PORT>` on Unix).

### 3. Resolve Port Conflicts with Ownership Guard
If a target port is occupied:
- Query process details (PID, executable path, process name, command line).
- **Match Ownership:** If the process belongs to the current repository / project runtime (e.g., a previously running server binary or dev process rooted in the workspace), terminate that process.
- **Foreign / Ambiguous Ownership:** If the process belongs to an unrelated service or cannot be verified with certainty as this project's runtime, **DO NOT KILL IT**. Abort runtime verification and report the port conflict.

### 4. Start Application in Background
Launch the required application services from the current working tree:
- For long-lived commands (e.g., `go run ./cmd/server` or `npm run dev`), launch via a non-blocking background task/process session. Do not block synchronously waiting for the command to exit.

### 5. Bounded Readiness Check
Poll the application's health endpoint or port readiness with a finite timeout (e.g., 5–15 seconds):
- Send lightweight probe requests (`curl -s -o /dev/null -w "%{http_code}" http://localhost:<PORT>/health` or TCP socket check).
- Once ready, proceed to verification. If timeout expires without readiness, capture error logs, terminate the spawned process, and fail with evidence.

### 6. Run Runtime Verification
Execute test scenarios according to the evidence hierarchy:
- **API/HTTP requests** (`curl` or automated HTTP requests) for endpoints, statuses, headers, payloads, and authentication/authorization boundaries;
- **Database/state assertions** for persistence, transaction rollbacks, and side effects;
- **Queue/event assertions** for message brokers and asynchronous events;
- **Playwright/browser automation** strictly for full user flows, routing, DOM state transitions, and browser-specific network interactions;
- **Screenshots/visual checks** only for visual styling or layout states that cannot be verified deterministically.

### 7. Teardown & Cleanup
Terminate the application process(es) started in Step 4. Ensure no orphaned background processes remain active after verification.

## Output & Evidence Format

**REQUIRED SUB-SKILL:** Use `verifying-task-gates` for the canonical verification report format (`references/verification-report.template.md`) when creating `.dream/specs/<feature>/evidence/integration-verification.md`.

Map every runtime scenario to a frozen contract revision, requirement ID, and acceptance criterion ID. Capture sufficient evidence to reproduce any failure:

```yaml
scenario: PRODUCT-DETAIL-004
requirement: REQ-PRODUCT-07
acceptance_criteria: AC-PRODUCT-07-01
contract_revision: 4
result: PASS
evidence:
  api_status: 200
  response_body: '{"viewer": {"isLiked": true}}'
  persisted_state: unchanged
```

## Failure Routing

- If actual runtime behavior violates a correct frozen contract, route the finding to the owning workstream.
- If runtime testing reveals that the contract itself is insufficient or incorrect, invoke `managing-contract-revisions`.
- Do not use screenshot/LLM visual judgment as a replacement for assertions that can be encoded deterministically. Do not launch browser automation if runtime HTTP and database assertions completely satisfy the proof obligation.
