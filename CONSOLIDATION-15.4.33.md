# Aurion — consolidation on 15.4.33

## Source and strategy

- Reference source: Aurion 15.4.33 (root and backend package versions both 15.4.33).
- Consolidated source tree: 657 files, excluding Git internals, dependency folders, backend build output, environment files and logs.
- Upgrade input: `aurion-main-upgrade.zip`, a Git bundle with 14 patches originally based on the GitHub `main` lineage at 15.4.0.
- The donor bundle was not merged wholesale: its parent lineage differs from 15.4.33 and direct patch application conflicts in key routes, admin screens, package metadata and legal files.
- Changes were selectively ported into the 15.4.33 source. Historical migrations were not rewritten. The new schema change is additive migration `087_admin_guest_invite_delivery.sql`.
- Store/Play Store-specific changes were not imported. No payment-provider implementation was ported. The existing 15.4.33 platform and accounting functions remain in the source.

## Ported changes

1. Forecast provisions now use the document's HT base, excluding client-billed travel when needed, rather than TTC.
2. Volume, ticket and direct-cost samples use one six-month historical window; forecast labels now describe invoices, not repair counts.
3. Home dashboard and Treasury reuse a shared calculation for open-quote TTC and financial SAV adjustments; cancelled, refused, void and deleted quotes are excluded.
4. Historical cash projections convert financial SAV TTC adjustments to HT using the VAT rate of the linked invoice.
5. Fixed monthly costs can be recorded as a TTC cash-outflow assumption without creating a real accounting entry.
6. Admin panels load independently, keep the last successful data on failure, expose per-panel retry and preserve the withdrawal-request panel.
7. Admin statistics distinguish organizations from user accounts, count mutually-exclusive free/admin/VIP groups, and use completed trials and organization creation data for rates and trend estimates.
8. VIP invitation delivery state is recorded in migration 087; failed email delivery is reported honestly and the generated invite link can be copied from the response.
9. Time-saved metrics use completed timing sessions and follow the selected activity; the client summary no longer estimates savings for untimed records.
10. Client, dashboard and accounting displays distinguish issued, paid and remaining invoice amounts; accounting exports label cash collections, VAT received and billed mileage more accurately.
11. Cotisation estimates on document screens and document exports use the rate/basis snapshot stored with each document, with an explicit historical fallback for older documents.
12. Normal contract readiness requires current, non-draft legal documents in version 4.0; the prior 4.0 source documents were retained instead of importing the donor branch's 2.3 documents.
13. Additional contract tests were added for the ported rules and wired into `test:smoke`.

## Checks completed locally

- `npm run test:smoke`: 93/93 passed.
- `npm run test:business`: 42/42 passed.
- `npm run test:frontend`: 45 frontend files syntax-checked; relative imports/exports checked across 44 modules.
- `node --check` on changed JavaScript files: passed.
- `node --experimental-strip-types --check` on changed TypeScript files: passed.
- `git diff --check`: passed.

## Checks not completed

- Full TypeScript typecheck/build: blocked because the local dependency tree lacks type definitions for `adm-zip`, `node`, `nodemailer`, `pdfkit`, `pg` and `smtp-server`; package download did not complete in this environment.
- ESLint: not run successfully because the lint package could not be fetched in this environment.
- PostgreSQL migration execution and database-backed/browser E2E: not run; no PostgreSQL client/instance or `DATABASE_URL` was available.
- Legal publication in a live database was not performed or verified. The code enforces version 4.0 plus explicit publication approval and configured environment values; that is not evidence that live documents are published.

## Publication status

This is a locally consolidated 15.4.33 source snapshot. It has **not** been pushed to GitHub or deployed to Render. The container cannot resolve `github.com`; the GitHub connector can inspect and edit remote repository files but cannot transfer this complete local source tree as a snapshot. The current GitHub `main` is 15.4.0 at commit `88226bca01f6191249cfc0a367d66995a0670b86`. The free Render service named `aurion` (Frankfurt) is bound to `aurion/15.4.1-render-ready`, currently at commit `ac1ba7f2e586adf87bbb0e0bd244c2beaa5d513a`; auto-deploy is disabled. A separate `aurion-v2` service follows `main` and its deployed commit is `65af132`. Publishing only selected changed files to either remote branch would not produce the requested coherent 15.4.33 release, so no partial push or deployment was made. The service was not redeployed because it would still build the old branch contents.
