# Frontend Agent Instructions

## Architecture

* `src/main.tsx` mounts `App.tsx`; `App.tsx` owns the router, `AuthProvider`, shared header, and route table.
* Keep endpoint-specific calls and wire types in `src/api/`. Domain API service modules (`src/api/catalog.ts`, `auth.ts`, `cart.ts`) return direct payloads (`Promise<Category[]>`, `Promise<ProductSummary[]>`, `Promise<ProductDetail>`, `Promise<Cart>`, `Promise<User>`).
* All requests must go through `src/api/client.ts` (`apiClient` for auto-unwrapped direct data `T`, or `apiClientWithMeta` for `{ data, meta, message }`) so credentials, bearer tokens, one-time 401 refresh, and `ApiError` handling remain consistent.
* Handle errors via `ApiError`: use `err.isValidationError()` to bind `err.fields` to form inputs, and `err.isBusinessError()` / `err.message` for user-facing `sonner` toasts or alerts.
* The access token is persisted by `src/api/tokenStore.ts`; session restoration uses the httpOnly refresh cookie through `AuthProvider`.
* Styling is centralized in `src/index.css`; preserve its existing responsive breakpoints when changing layouts.

## UI Stack

Use Tailwind CSS and shadcn/ui as the primary UI foundation.

Preferred supporting libraries:

* `lucide-react` for icons.
* `motion` for purposeful transitions and micro-interactions.
* `sonner` for transient feedback.
* `recharts` only when data visualization is required.

Do not introduce another general-purpose component library such as Material UI, Ant Design, Chakra UI, or Mantine unless explicitly requested.

Prefer existing components, shadcn primitives, and project-local compositions over adding dependencies for UI that can already be expressed cleanly with the current stack.

## Design Goal

Frontend work must be both functionally correct and visually intentional.

The interface should feel:

* modern and polished
* clean but not sterile
* structured rather than decorative
* editorial rather than dashboard-like
* premium but approachable
* compact rather than oversized
* visually calm but not plain
* distinctive without appearing experimental
* designed for the actual product rather than assembled from a generic template

Do not treat visual quality as optional polish after functionality is complete.

## Design Direction

Use a clean editorial visual language with strong composition and controlled use of color.

Prefer:

* strong page-level composition
* clear information hierarchy
* asymmetric layouts when appropriate
* large structured visual surfaces
* neutral backgrounds paired with selective accent color
* intentional use of whitespace
* typography-driven hierarchy
* subtle depth
* restrained visual effects

Layouts may use patterns such as:

* split compositions
* asymmetric grids
* wide content panels
* image-led compositions
* structured colored surfaces
* contrasting neutral and accent regions

Choose these patterns only when they support the content.

Do not force a particular layout pattern onto every screen.

## Color

Use neutral white, off-white, or softly tinted surfaces as the primary foundation.

Use accent colors selectively.

A preferred visual spectrum may include:

* green
* teal
* cyan
* blue

Structured gradients are allowed and encouraged when used as a major visual surface or brand element.

Good uses include:

* section backgrounds
* prominent side panels
* large visual regions
* promotional surfaces
* brand-defining composition

Gradients should feel architectural rather than decorative.

Avoid:

* gradient blobs
* rainbow gradients
* gradients on every component
* multiple competing gradients
* excessive gradient text
* glowing neon effects without a product reason

Do not apply strong color to every component.

Strong color should communicate hierarchy, identity, interaction, or state.

## Visual Texture

Large colored surfaces may use restrained geometric texture such as:

* fine grid lines
* low-opacity line patterns
* subtle dot patterns
* simple geometric structures

Texture must remain secondary to content.

Do not sacrifice readability for decorative detail.

## Typography

Use typography as a primary design tool.

Prefer:

* clear hierarchy
* bold but controlled headings
* compact heading line-height
* readable body copy
* deliberate contrast between primary, secondary, and metadata text
* selective accent-colored text where it strengthens composition

Avoid:

* giant marketing headings without a functional reason
* excessive font-size variation
* excessive font-weight variation
* weak low-contrast text
* decorative typography that reduces readability

Use typography and spacing before adding containers, borders, badges, or effects.

## Layout

Design layouts around content hierarchy and the user's primary task.

Prefer:

* deliberate alignment
* sensible max-widths
* responsive grids
* intentional asymmetry
* natural content flow
* strong relationships between related content

Avoid:

* stretching all content across the viewport
* excessively narrow desktop layouts
* large empty areas without purpose
* dense unrelated controls
* accidental horizontal scrolling
* repetitive identical grids when content importance differs

Do not automatically center everything.

Do not automatically place all content inside cards.

The layout should communicate which information belongs together without relying exclusively on containers.

## Surfaces

Use cards only when content represents a meaningful bounded unit.

Alternatives include:

* whitespace
* alignment
* dividers
* background contrast
* section spacing
* typography
* layout grouping

Avoid card-inside-card compositions unless the hierarchy genuinely requires them.

Large surfaces may use moderate corner radius.

Prefer approximately:

* `16–28px` for major surfaces
* `8–14px` for normal controls

Do not make every element pill-shaped.

## Borders and Depth

Use borders and shadows with restraint.

Prefer:

* subtle borders
* low-contrast separators
* light surface outlines
* soft shadows where elevation communicates hierarchy

Avoid:

* heavy dark shadows
* glow effects
* shadow on every element
* excessive elevation
* borders around every section

The visual hierarchy should remain understandable even if shadows are removed.

## Controls

Interactive controls should feel compact, consistent, and deliberate.

Maintain consistency in:

* height
* spacing
* typography
* border radius
* icon sizing
* focus treatment
* disabled treatment
* hover and active feedback

Primary actions should be obvious without visually overwhelming the page.

Secondary actions should remain discoverable without competing with the main action.

Avoid:

* oversized controls
* unnecessary pill shapes
* decorative icons on every action
* multiple visually competing primary actions

## Icons

Use `lucide-react` as the default icon family.

Use icons to improve:

* recognition
* navigation
* status communication
* action clarity
* scanability

Do not use icons merely to fill visual space.

Do not place icons beside every heading, label, or button by default.

Keep icon sizing and stroke treatment consistent.

Icon-only controls must have an accessible name.

## Motion

Use `motion` only when animation improves:

* continuity
* state understanding
* interaction feedback
* spatial relationships

Appropriate animation should generally be subtle and short.

Prefer:

* opacity changes
* small translations
* layout interpolation
* restrained enter and exit transitions

Avoid:

* animating every element on page load
* unnecessary scroll-triggered effects
* exaggerated hover movement
* large rotations
* bouncing UI
* continuous decorative animation

Respect reduced-motion preferences.

The design should still feel complete when animation is disabled.

## Interaction States

Account for relevant interaction and data states, including:

* loading
* empty
* success
* error
* disabled
* selected
* active
* hover
* focus

Do not leave asynchronous areas blank without explanation.

Feedback should appear at the level where it is most useful.

Use:

* inline feedback for contextual problems
* `sonner` for appropriate transient feedback
* persistent messages when users need to refer back to the information

Do not expose raw backend implementation errors to users.

Preserve useful information from `ApiError` while presenting it in user-facing language.

## Responsive Design

Treat responsive behavior as part of the design rather than a final resize pass.

Layouts should adapt intentionally between desktop, tablet, and mobile.

On smaller screens:

* collapse multi-column compositions when necessary
* preserve clear hierarchy
* prevent horizontal overflow
* keep important actions reachable
* wrap toolbars deliberately
* avoid tiny interaction targets
* reduce visual complexity where appropriate without removing required functionality

Do not simply make every desktop element full-width.

Do not preserve desktop density when it harms mobile usability.

Preserve existing breakpoints in `src/index.css` unless there is a concrete reason to change them.

## Accessibility

Use semantic HTML before ARIA.

Ensure:

* keyboard accessibility
* visible focus indicators
* associated input labels
* accessible names for icon-only controls
* sufficient text/background contrast
* state is not communicated by color alone
* reduced-motion preferences are respected

Do not remove native accessibility behavior solely for visual styling.

## Avoid Generic AI-generated UI

Do not default to recognizable generic AI or template patterns.

Avoid:

* generic SaaS dashboards
* default shadcn demo layouts
* generic startup landing pages
* repetitive three-column feature grids
* giant centered hero text
* excessive badges
* excessive pills
* glassmorphism
* floating blobs
* abstract decorative shapes
* giant CTA blocks
* meaningless statistics sections
* unnecessary testimonials
* decorative logo clouds
* excessive rounded cards
* card-heavy layouts
* excessive whitespace used only to appear premium
* random gradients
* arbitrary glowing effects
* animation applied everywhere

Do not add a common marketing section merely because it is a popular website pattern.

Every visible section should have a reason to exist based on the actual content or workflow.

If a layout could belong to an unrelated product after only replacing the text and images, it is too generic.

Rework it around the actual content hierarchy and user task.

## Composition Discipline

Before implementing or substantially changing a screen:

1. Identify the primary user task.
2. Identify the information hierarchy.
3. Determine which content deserves the strongest visual emphasis.
4. Group related content logically.
5. Choose a composition appropriate to that hierarchy.
6. Use a small number of consistent visual motifs.
7. Add decoration only after the structure already works.

A screen should usually have one dominant visual idea.

Do not combine several unrelated design motifs merely to make the interface appear richer.

Prefer clarity and intentional composition over visual novelty.

## Visual Reference Discipline

When a visual reference is provided, use it to infer design language rather than copying it literally.

Extract characteristics such as:

* composition
* hierarchy
* density
* spacing
* typography
* color behavior
* surface treatment
* border radius
* shadow depth
* visual rhythm
* background treatment

Adapt those characteristics to the current product and content.

Do not copy:

* logos
* brand identity
* proprietary imagery
* exact text
* exact content structure when it does not fit the current workflow

A reference establishes direction, not a requirement for pixel-for-pixel reproduction.

## Consistency

Reuse existing visual patterns where they are already good.

When introducing a new visual treatment, ensure it is compatible with the surrounding application.

Do not create a new design language for every feature.

Prefer a limited set of reusable decisions for:

* spacing
* radius
* typography
* color
* surfaces
* controls
* interaction feedback

Consistency should come from shared visual principles rather than making every screen structurally identical.

## Scope Discipline

Professional polish does not justify unrelated redesign.

For a scoped frontend change:

1. implement the requested behavior
2. make the affected interface visually complete
3. maintain coherence with nearby UI
4. correct directly related presentation issues
5. avoid unrelated refactors

Do not:

* replace the design system without explicit instruction
* restructure routing for aesthetic reasons
* rewrite API architecture for UI convenience
* redesign unrelated screens
* expand a local visual change across the application without a requirement

If broader visual consistency work is needed, identify it separately.

## Implementation Discipline

Prefer simple and maintainable UI implementations.

Reuse existing components before creating new ones.

Extract reusable components when a meaningful pattern repeats.

Do not abstract trivial markup solely to reduce line count.

Do not introduce complexity purely for visual effects.

Avoid large one-off CSS structures when the same result can be expressed cleanly through existing Tailwind conventions.

Preserve established project conventions unless there is a concrete reason to change them.

## Commands

Run these from `frontend/`:

* Install exactly from the committed lockfile: `npm ci`.
* Start Vite: `npm run dev`.
* `/api` is proxied to `http://localhost:${HTTP_PORT:-18080}`.
* Run one test file: `npm test -- src/pages/CatalogPage.test.tsx`.
* Run tests once: `npm test` (`vitest run`, jsdom, setup in `src/test/setup.ts`).
* Tests are colocated as `*.test.ts` / `*.test.tsx`; no backend is required when fetch/API modules are mocked.
* Lint: `npm run lint` (Oxlint, not ESLint).
* Typecheck and production build: `npm run build` (`tsc -b && vite build`).
* `npm run build` does not run lint or tests.
* Run one Playwright suite: `npx playwright test e2e/<name>.spec.ts`. Playwright starts both Vite dev servers itself.
* Mocked-backend Playwright specs declare every `/api/v1` route through `mountContractRoutes` in `e2e/fixtures/contract.ts`; do not call `page.route` or `context.route` on an API path in a spec. `e2e/contract-fixture.spec.ts` tests that helper.

## Verification

Before finishing a frontend behavior change:

1. Run focused tests for the changed behavior.
2. Run `npm run lint`.
3. Run `npm test`.
4. Run `npm run build`.
5. Check visually affected layouts at representative desktop and mobile widths.
6. Verify relevant loading, empty, error, disabled, and success states.
7. Verify keyboard interaction for new interactive controls.
8. Check that new UI follows the established visual language rather than introducing a generic template pattern.

Do not claim completion when required verification has not passed.

If a required verification step cannot be run, state which step was not completed and why.

## Runtime

* `VITE_API_BASE_URL` defaults in code to `/api/v1`; `.env.example` sets the same value.
* API wrappers therefore receive paths such as `/products`, not `/api/v1/products`.
* Vite's proxy target reads shell variable `HTTP_PORT`, not a Vite-prefixed variable.
* Keep `HTTP_PORT` aligned with the backend port when it is not `18080`.
* This is a browser-routed SPA.
* New pages must be registered in `App.tsx`.
* Route tests should use `MemoryRouter` rather than requiring a running dev server.
