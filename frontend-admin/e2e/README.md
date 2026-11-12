# Frontend Admin E2E Verification

The Playwright End-to-End test suite for cross-application flows between Admin Portal (`:15174`) and Storefront (`:15173`) is unified under `frontend/e2e/product-referral-posts.spec.ts`.

## Execution

From the repository root or `frontend/`:

```bash
cd frontend
npx playwright test e2e/product-referral-posts.spec.ts
```

This suite launches both `:15173` (Storefront) and `:15174` (Admin Portal) dev servers via Playwright's `webServer` configuration and performs 1:1 Contract-Verified Mock E2E (Mode 2) validation across both applications.
