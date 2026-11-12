# E2E Verification Report — admin-dashboard

- **Execution mode:** Mode 2: Shape-Locked Mock E2E (`mock-e2e`, `visual`)
- **Suite:** `frontend/e2e/admin-dashboard.spec.ts` (Page Object `frontend/e2e/pages/AdminDashboardPage.ts`)
- **Contract verified:** API-ADMIN-DASHBOARD@1, replies fulfilled from `.dream/specs/admin-dashboard/contract-snapshots.json` through `mountContractRoutes`
- **Command** (from `frontend/`): `npx playwright test e2e/admin-dashboard.spec.ts`
- **Result:** 5 passed (39.4s), Chromium, viewports `1440x900`, `375x812`, `320x700`

This report covers frontend behavior against shape-locked mocks. Backend behavior is proven separately by the repository integration, use case, and handler tests.

## Mocked routes

| Route | Kind | Source |
|---|---|---|
| `GET /api/v1/admin/dashboard` | shape-locked, `auth: 'bearer'` | `get_dashboard_default_200`, `get_dashboard_today_200`, `invalid_filter_400`, `unauthenticated_401` |
| `GET /api/v1/auth/me`, `GET /api/v1/notifications` | stub | admin session shell |
| `GET /api/v1/admin/orders`, `/admin/returns`, `/admin/reviews`, `/admin/chat/conversations` | stub, empty lists | destination pages; the stub records the filter query each page sends |

Two scenarios replace the dashboard payload with an override: one checks unclipped money values, the other checks for horizontal scroll. The override carries revenue values above `Number.MAX_SAFE_INTEGER`, such as `12345678901234567`, and is shape-checked against `get_dashboard_default_200` before it is served.

## Results by criterion

| Req | Scenario | Result | Evidence |
|---|---|---|---|
| 5.3 | Click each of the 9 order-status entries: the URL is `/orders?status=<status>`, the status select shows that status (including `partially_returned`), and the orders API is called with that status. | Pass | assertions |
| 6.2 | Click each of the 6 pending-work items: the destination opens with its filter applied. Checked for orders `pending_confirmation` and `cancel_requested`, returns `pending_approval` and `received`, reviews `has_reply=no` ("Chưa phản hồi"), and chat `filter=unread` ("Chưa đọc" tab active). Each destination API receives the same filter. | Pass | assertions |
| 10.1 | **At 1440px:** the fixed sidebar is visible, there is no menu button and no horizontal scroll, and a 17-digit delivered-revenue value is not clipped (`scrollWidth <= clientWidth`). | Pass | [01-dashboard-desktop-1440.png](./imgs/01-dashboard-desktop-1440.png) |
| 10.1 | **At 320px and 375px:** `scrollWidth <= clientWidth`, and the header does not extend past the viewport. The full-bleed chat page (`/chat?filter=unread`) at 375px has no horizontal scroll and does not extend left of or above the content area. | Pass | [02-dashboard-mobile-375.png](./imgs/02-dashboard-mobile-375.png) |
| 10.4 | **At 375px:** the menu button opens the navigation drawer and sets `aria-expanded="true"`. The test asserts that the drawer contains each of the 8 navigation links. Escape closes the drawer, focus returns to the menu button, and `aria-expanded` becomes `"false"`. | Pass | [03-navigation-drawer-open-375.png](./imgs/03-navigation-drawer-open-375.png) |
| 10.2 | **Focus ring:** pressing Tab from "7 ngày" moves focus to "30 ngày". Its focus indicator (outline or ring) differs from its unfocused state. | Pass | [04-keyboard-focus-range-control.png](./imgs/04-keyboard-focus-range-control.png) |
| 10.2 | **Chart tooltips:** the first and last chart days are keyboard-focusable. Their tooltips stay inside the chart card at 1440px and inside the viewport at 375px. | Pass | [05-chart-last-day-tooltip-focus.png](./imgs/05-chart-last-day-tooltip-focus.png), [06-chart-last-day-tooltip-mobile-375.png](./imgs/06-chart-last-day-tooltip-mobile-375.png) |

## Integration defect found and fixed

**Symptom:** the first run failed the 320px no-horizontal-scroll assertion. The document `scrollWidth` was 684px at a 320px viewport.

**Root cause:** in `frontend-admin/src/components/dashboard/RevenueChart.tsx`, the accessible data table carried the `sr-only` class directly. A `<table>` ignores the 1px width from `sr-only` and sizes itself to its content (644px). Because it is absolutely positioned, it widened the page.

**Fix:**
- The table is now wrapped in a `<div className="sr-only">`, which keeps it available to screen readers and gives it no layout width.
- `RevenueChart.test.tsx` now checks the class on the wrapper.

**Re-run:** after the fix, `npx vitest run src/components/dashboard/RevenueChart.test.tsx` passed 11/11, the full frontend-admin suite passed 40 files and 301 tests, lint and build passed, and the E2E suite passed 5/5.

## Shared layout defect found in final review

**Symptom:** below 1024px the chat support page was clipped 16px at the top and left.

**Root cause:** the page uses negative margins to cancel the layout padding. After the layout's padding became `p-4 lg:p-8`, the page's fixed `-m-8` no longer matched below `lg`.

**Fix:** `frontend-admin/src/pages/ChatSupportPage.tsx` now uses `-m-4 lg:-m-8`.

**Regression check:** the 10.1/10.4 scenario now includes the chat-page offset assertion. It failed without the fix (`Received: -16`) and passes with it.
