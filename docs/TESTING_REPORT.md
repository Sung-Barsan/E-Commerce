# Testing report

## Actual local results — 14 November 2026

| Check | Result |
|---|---|
| `npm ci` / dependency installation | Dependencies installed; lockfile supplied |
| `npm run build` | Passed; all browser modules and Tailwind CSS bundled |
| `npm run lint` | Passed JavaScript/EJS syntax checks |
| `npx vitest run tests/policies.test.js tests/templates.test.js` | **29 passed**: 6 policy/pricing cases + 23 EJS/escaping cases |
| `npm audit --omit=dev --audit-level=high` | Reported **0 vulnerabilities** at execution time; not a security certification |
| Full `npm test` | **Blocked**: integration suite's MongoDB process cannot start in this workspace; 18 integration cases did not run |
| Browser visual/layout QA | **Blocked**: Chromium failed creating a process-singleton socket with `Operation not permitted`; no desktop/mobile screenshot verification claimed |

MongoDB 8.2.3 initially aborted in allocator CPU detection. The compatible 7.0.24 test binary then exited during initialization with `open: Operation not permitted`. The default disposable test/demo version is 7.0.24 and can be overridden through `MONGOMS_VERSION`. No security controls were bypassed to run these processes.

The EJS tests use explicit fixture documents; they prove template rendering and escaping, **not MongoDB connectivity or end-to-end behavior**. Source inspection found and corrected Mongoose 9's required `updatePipeline` option and `ordered: true` for multi-document `create` within a session. These fixes still require real database execution.

## Written integration cases

- Database-backed public pages, search and every dashboard/module page.
- Guest/private boundaries and cross-role dashboard denial.
- CSRF rejection and elevated public-registration rejection.
- Seller ownership checks, foreign image upload denial and spoofed image content rejection.
- Admin role assignment denial and superadmin protection.
- Foreign-customer order denial and new-seller approval workflow.
- Cart/wishlist, server-priced checkout and sequential idempotent retries.
- Failed/cancelled simulated payment preserves inventory/cart.
- Seller fulfillment with persistent notifications.
- Review denial without a delivered purchase.
- Two buyers competing for one stock unit.
- Concurrent duplicate checkout, one order/one deduction.
- Concurrent cancellation, one stock restoration.
- Unauthenticated Socket.IO rejection and server-owned personal room membership.

## CI

`.github/workflows/ci.yml` runs install, syntax validation, build and the complete suite on an Ubuntu runner. A workflow definition does not establish a successful run. Inspect GitHub Actions results and resolve any failure before describing the project as fully verified.

## Manual acceptance checklist still pending

Start the documented local replica set, seed, then demonstrate customer → checkout → seller fulfillment → notification → review/return. Repeat at 320, 375, 768 and 1440 px widths; inspect keyboard focus, phone menu, theme contrast and reduced-motion fallback. Validate upload replacement, local password-reset CLI, all role dashboards and browser console output. No Lighthouse, WCAG compliance or penetration-test score is claimed.
