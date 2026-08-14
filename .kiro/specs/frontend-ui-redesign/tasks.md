# Implementation Plan

- [ ] 1. Establish the Tailwind v4 + shadcn/ui foundation

- [ ] 1.1 Add Tailwind v4 and shadcn/ui tooling and the `cn` utility
  - **Produces:** Tailwind v4 via the `@tailwindcss/vite` plugin in `frontend/vite.config.ts`; `@/*` path alias in `vite.config.ts`, `tsconfig.json` and `tsconfig.app.json` (plus `@types/node`); `frontend/components.json` with `"tailwind": { "config": "" }`; `frontend/src/lib/utils.ts` exporting `cn` (clsx + tailwind-merge); shadcn/ui primitives installed under `frontend/src/components/ui/` for the approved set (Button, Input, Label, Badge, Card, Skeleton, Alert, Separator, Sheet) and their Radix/tailwind dependencies.
  - **Scope:** Configuration and dependency only; no page/component markup changes. Must leave the existing build and test commands functional so later tasks can migrate incrementally.
  - **Consumes:** Approved stack decision (Tailwind v4 + shadcn/ui) from `design.md`.
  - **Acceptance:** `npm run build`, `npm run lint` and `npm test` pass from `frontend/`; the alias resolves shadcn imports; no new runtime routes, API calls, or state behavior are introduced.
  - **Verification:** Run the existing frontend test suite, lint, and build unchanged; confirm the generated shadcn components compile.
  - _Requirements: 1.1, 5.1_

- [ ] 1.2 Migrate `src/index.css` to the light precision-retail token system and base styles
  - **Produces:** `frontend/src/index.css` rewritten as the Tailwind v4 entry with `@import "tailwindcss";`, `:root` semantic color tokens, `@theme`/`@theme inline` mapping to Tailwind colors (background, foreground, muted, primary, secondary, accent, destructive, border, input, ring), the approved type scale and serif/sans/monospace font roles, custom screens preserving the `900px`, `601px-767px` and `600px` contracts plus a `1440px` wide-desktop rule, shared `.page-container`, `.page-heading`, `.technical-label` and status rules, the contrast-safe focus ring, and the `prefers-reduced-motion` rule.
  - **Scope:** Styling foundation only. Existing component CSS in `index.css` may remain temporarily so earlier pages stay styled until each surface migrates, but new token/utility usage must not hard-code random colors.
  - **Consumes:** Palette, typography, technical-label treatment and responsive behavior from `design.md`.
  - **Acceptance:** Token variables are used consistently across base rules; Ink/Paper/Cloud/Signal/Mint/Alert on their intended surfaces meet the specified contrast ratios; focus ring and reduced-motion rules are in place; no page-level horizontal overflow is introduced at 320px.
  - **Verification:** Run `npm run lint`, `npm test` and `npm run build`; perform contrast calculation on the defined pairs.
  - _Requirements: 1.1, 1.2, 1.3, 4.3, 4.4_

- [ ] 2. Redesign the shared application shell

- [ ] 2.1 Redesign `SiteHeader` with search and rebuild it with the new primitives; add the new `SiteFooter`
  - **Produces:** `SiteHeader` migrated to shadcn Button/Input/Badge + Tailwind utilities, with brand, primary navigation (Home, Phones), account actions (Sign in/Register or email + Log out), cart link with item-count badge, an active-state indicator not relying on color alone, and a prominent header search that navigates to `/products?q=<query>` reusing the existing URL param. New `SiteFooter` with brand, existing navigation destinations (Home, Phones, Cart) and a simple copyright line; registered in `App.tsx`. Mobile header keeps the approved wrap behavior with no horizontal page scroll.
  - **Scope:** Presentation and the header-search navigation affordance only. All existing header destinations, cart count, auth controls, logout behavior and keyboard order remain. No new fabricated footer content (no fake support/policies).
  - **Consumes:** Task 1 tokens/primitives and the approved shell design.
  - **Acceptance:** Header search routes to `/products?q=` and restores on refresh; footer appears on all pages with only brand + existing nav + copyright; mobile header is usable at 320px without clipping or page-level horizontal scroll; existing navigation/auth interactions and tests continue to pass.
  - **Verification:** Write or update `SiteHeader`/`App` focused tests (header search, footer presence, unchanged auth/nav) before behavior-facing markup changes; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 3.1, 4.1_

- [ ] 3. Redesign product discovery

- [ ] 3.1 Redesign `ProductCard` and the product grid presentation
  - **Produces:** `ProductCard` rebuilt with shadcn Card + Tailwind utilities: consistent `aspect-square` image with `object-cover`, technical-label brand/model, name link with `line-clamp-2`, price, and stock status; cards use a flex column with actions aligned via `mt-auto` so long titles do not break alignment; subtle hover (border-color change and light shadow only). Product grid uses a responsive Tailwind grid (1–2 mobile, 2–3 tablet, 3+ desktop) with uniform spacing.
  - **Scope:** Presentation only. Props, links, alt text, price and stock logic unchanged; no nested links; each link remains a single valid tab stop.
  - **Consumes:** Task 1 primitives/tokens and existing `ProductSummary`/`ProductImage` interfaces.
  - **Acceptance:** Cards render image, labels, truncated title, price and stock; all cards in a row share height and aligned actions; hover is subtle; grid has no horizontal overflow from 320px; accessible names and card navigation unchanged.
  - **Verification:** Update `ProductCard.test.tsx` and relevant catalog/home tests before markup changes; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 9.1, 9.2, 9.3, 9.4, 10.3, 4.2_

- [ ] 3.2 Redesign `HomePage` hero and featured section
  - **Produces:** `HomePage` rebuilt with the shared page container, a hero using the serif display headline and a technical-label accent with a single primary CTA to `/products`, and a featured-products section with heading, product grid, and shared Skeleton loading, empty (with browse CTA) and error (with retry) states.
  - **Scope:** Presentation only. Featured data loading, error, empty and link behavior preserved; hero height reduced so it does not occupy nearly the full viewport.
  - **Consumes:** Task 1 tokens/primitives and Task 3.1 `ProductCard`.
  - **Acceptance:** Hero shows headline, intro and one primary CTA; hero does not dominate the viewport; featured section preserves load/retry/empty/browse flows with accessible status semantics; no horizontal overflow at 320px.
  - **Verification:** Update `HomePage.test.tsx` before behavior-facing markup changes; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 8.1, 8.2, 8.3, 14.1, 14.2, 14.3_

- [ ] 3.3 Redesign `CatalogPage` filters, result count and responsive layout
  - **Produces:** `CatalogPage` rebuilt with the shared page container and primitives: search input (highlighted), brand/price/stock filter groups with clear legends, a secondary Reset action disabled when no filter is active, live result count, shared Skeleton/empty/error states, and a product grid. On mobile the filter groups open in a shadcn Sheet toggled by a "Filters" control while search and reset remain on the page; on desktop filters render inline. All filter interactions continue to read/write the same `q`, `category_id`, `min_price`, `max_price`, `in_stock` URL params.
  - **Scope:** Presentation and the mobile filter Sheet affordance only. Filter inputs, labels, fieldset semantics, URL parameter behavior, debounced loading and reset logic are unchanged.
  - **Consumes:** Task 1 primitives/tokens, Task 3.1 grid, and `useCatalogProducts`/category interfaces.
  - **Acceptance:** Search, category, price and stock filters preserve current query-parameter behavior and restore on reload; result count is a live status; Reset is disabled with no active filters; mobile filters are reachable and operable via the Sheet with no horizontal scroll; empty/error states retain their actions.
  - **Verification:** Update `CatalogPage.test.tsx` before behavior-facing markup changes, covering URL-filter restoration and the mobile filter affordance; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 2.3, 3.1, 3.3, 5.3, 10.1, 10.2, 10.3, 14.1, 14.2, 14.3_

- [ ] 4. Redesign product detail and selection

- [ ] 4.1 Redesign `ProductDetailPage` purchase panel and `VariantSelector`
  - **Produces:** `ProductDetailPage` rebuilt with the approved desktop split layout (media left, purchase panel right; media stacked above info on mobile), grouping brand/model, title, price, stock, description, variant selector, availability feedback and the Add-to-cart action in one panel with the CTA visually dominant. `VariantSelector` keeps selected/unavailable/keyboard-operable states expressed via border/background plus the existing `aria-pressed`, not color alone. Shared Skeleton loading and error/recovery states replace text-only status.
  - **Scope:** Presentation only. Fetch, not-found, URL variant-selection serialisation, auth redirect, availability, add-to-cart and feedback logic are unchanged.
  - **Consumes:** Task 1 primitives/tokens and existing product detail/variant/cart/auth interfaces.
  - **Acceptance:** Purchase panel groups price/stock/variant/feedback/CTA with the CTA most prominent; selected and disabled variant states are distinct beyond color; product errors retain a recovery route; add-to-cart and auth-redirect outcomes are unchanged; mobile stacks media before info without clipping controls or horizontal overflow.
  - **Verification:** Update `ProductDetailPage.test.tsx` and `VariantSelector.test.tsx` before behavior-facing markup changes; cover selected/disabled variants, feedback statuses, unavailable stock, product failure and add-to-cart/auth paths; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 3.1, 3.3, 4.1, 4.2, 11.1, 11.2, 11.3, 11.4, 11.5, 14.1, 14.3, 14.4_

- [ ] 5. Redesign authentication, cart and recovery surfaces

- [ ] 5.1 Redesign `LoginPage` and `RegisterPage` auth surfaces
  - **Produces:** `LoginPage` and `RegisterPage` rebuilt with a balanced shadcn Card auth surface (heading, labeled fields, inline field errors, top-level error Alert, primary submit with pending/disabled state) and consistent links between the two pages.
  - **Scope:** Presentation only. Form fields, validation, API error handling, submit/loading state, return-location behavior and cross-links are unchanged.
  - **Consumes:** Task 1 primitives/tokens and existing auth/validation interfaces.
  - **Acceptance:** Auth surfaces are visually balanced on desktop and mobile; field errors render next to their fields; validation, API errors, pending state and post-auth return location work exactly as before; no horizontal overflow at 320px.
  - **Verification:** Update `LoginPage.test.tsx` and `RegisterPage.test.tsx` before behavior-facing markup changes; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 3.1, 4.1, 13.1, 13.2, 13.3_

- [ ] 5.2 Redesign `CartPage` rows, summary and `NotFoundPage`
  - **Produces:** `CartPage` rebuilt with shadcn Card/Button + Tailwind utilities: each item row shows image, product info, selected options, unit price, line total, quantity controls and Remove with adequate hit areas and pending/disabled states; a separate summary panel shows selection count, total and the primary checkout action (disabled when nothing is selected or pending); shared empty (with continue-shopping CTA), loading and error (with retry) states; mobile stacks rows and summary without changing action order or causing horizontal scroll. `NotFoundPage` uses the shared recovery-state treatment.
  - **Scope:** Presentation only. Cart selection, select-all, quantity, remove, reload, checkout message, pending/error behavior and their accessible names are unchanged.
  - **Consumes:** Task 1 primitives/tokens and existing CartProvider page interfaces.
  - **Acceptance:** Each row and the summary remain operable with correct pending/disabled feedback; empty/error/not-found states keep their existing next actions; mobile cart rows and summary are operable without horizontal scrolling; checkout message behavior is preserved.
  - **Verification:** Update `CartPage.test.tsx` and `App.test.tsx` before behavior-facing markup changes; cover selection, quantity, remove, pending/error, empty state and recovery links; run focused tests, then `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 1.1, 1.2, 1.3, 2.2, 2.3, 3.1, 3.3, 4.1, 12.1, 12.2, 12.3, 12.4, 14.2, 14.3, 14.4_

- [ ] 6. Verify responsive and accessibility integration

- [ ] 6.1 Update and extend browser-level coverage for the redesigned storefront
  - **Produces:** Updates to the existing Playwright suite (`frontend/e2e/storefront.spec.ts`) for the redesigned markup, plus focused assertions for header search, footer presence/content, mobile filter Sheet, and the new skeleton states, at the existing viewports (`320px`, `600px`, `767px`, `900px`, `1440px`) and 200% browser zoom.
  - **Scope:** Test-only updates plus any selector/semantic fixes required by approved markup changes. Uses the existing `test:e2e` infrastructure; no new framework or external visual service. Verifies no page-level horizontal overflow at 320px, expected route/link/status behavior, keyboard focus visibility, the 601px-767px narrow-tablet detail/cart layout, and reflow at 200% zoom.
  - **Consumes:** Completed Tasks 1-5 and the approved responsive/accessibility verification contract.
  - **Acceptance:** Browser tests demonstrate the approved reflow behavior, retained navigation/routes, header search and footer presence, and keyboard-reachable controls; failures identify a concrete page/state rather than relying on manual visual judgment alone.
  - **Verification:** Run the focused Playwright suite at the specified viewports and 200% zoom, then `npm run lint`, `npm test` and `npm run build` from `frontend/`.
  - _Requirements: 1.1, 1.3, 2.1, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 5.2, 6.1, 6.2, 6.4, 7.1, 7.2, 7.3, 8.1, 10.1, 10.3, 11.4, 12.3, 14.1_