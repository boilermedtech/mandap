# Mandap

Mobile-first festival registration, sponsorships, manually verified payments, and committee finances.

## Architecture

- React + TypeScript + Vite PWA with Mantine components, a daylight-first ivory/teal workspace, accessible forms, and live financial dashboards. A labelled theme button remembers the user's light/dark choice through Mantine's built-in local preference manager. Hallmark-informed refinement keeps local system fonts, explicit focus states, tabular financial figures and a balance-first overview; it uses no external fonts, generated images or image-generation APIs.
- **Local mode (default without Supabase keys):** loopback-only Node HTTP API, disk-backed PGlite PostgreSQL, local development inbox, HTTP-only sessions, and private image storage. No Docker or cloud account required.
- **Hosted mode (optional):** Supabase PostgreSQL, Auth, private Storage, transactional SQL RPCs, and two small Edge Functions.
- One database with tenant-scoped foreign keys and default-deny grants/RLS. Private tables are not exposed through the Data API; all access goes through checked RPCs.
- Both modes use the same SQL migrations and financial/permission rules. No .NET server, Redis, paid frontend server, or native app project.
- Capacitor can package the same compiled UI later. Native permissions, secure token persistence, deep links, signing, iOS build infrastructure, and store review are separate work.

The supplied development document remains the long-term product brief. This repository implements the smaller pilot architecture agreed during planning, not every future feature in that document.

## Current verification and limitations

The frontend builds and type-checks. Database and real local HTTP API tests verify authentication, tenant isolation, concurrent request handling, payment verification/receipts, refunds, expenses, private images, and persistence across a backend restart. A real-browser test completes onboarding, configuration, registration, payment approval, receipt viewing, and expense approval, and checks mobile layouts and offline behavior. The optional hosted Edge Functions have also been type-checked.

**Local development is not production hosting.** Local login codes are displayed in the UI rather than delivered by email. This does not verify control of an email inbox. Local invitations are stored, not emailed; TOTP enrollment is available only in hosted mode. Do not enter real private donor data or expose the local API to the internet.

For production, hosted Auth/Storage integration, real email, true multi-connection PostgreSQL/load checks, encrypted backup restoration, HTTPS, and real device checks still need verification. PGlite serializes database operations in one local process; parallel HTTP requests do not prove production-scale database concurrency.

No production data, seed financial records, cloud accounts, or paid subscriptions are bundled. The UI starts empty and every record you create is persisted.

## Run the complete app locally

Node 22.23 or a compatible newer supported Node release:

```powershell
Set-Location Q:\Mandap\app
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. The command starts the frontend and local API together.

1. Enter an email to request a code. Read it in the clearly labelled development inbox, then verify it.
2. Create a workspace, open **Workspace settings**, publish the Mandap, and create a published festival and its poojas.
3. Use **Registrations** to register participants; use **Payments** to submit and verify a payment and view its receipt.
4. Add and approve an expense. **Overview** reflects actual confirmed collections and approved paid expenses.
5. To test a committee invitation, save it in Settings, sign out, and sign in with the invited email.

Records, sessions, and private file bytes live in `.mandap-data` at the repository root, which is git-ignored. Restarting the API retains them. Only one backend process may open that directory. Back up the entire directory while the API is stopped if you want to preserve local development work; do not copy it into a public repository.

The API listens only on `127.0.0.1:4318`; Vite proxies `/api` with same-origin cookies. You can run `npm run dev:api` and `npm run dev:frontend` separately. Use `MANDAP_DATA_DIR`, `MANDAP_API_PORT`, or `MANDAP_WEB_ORIGIN` only when intentionally changing the local runtime/test environment.

Expired/invalid codes, attempts, OTP resend throttles, expired sessions, cross-origin requests, forged RPC names, and unauthorized file/tenant access are rejected. The local inbox remains a development-only shortcut, not a production authentication provider.

To switch back to Supabase, set its URL and publishable key in `.env.local` using `.env.example`, then restart the frontend. Hosted mode never silently falls back to local after a hosted request fails. Local users/data are separate from hosted users/data; switching modes does not migrate them.

Only a publishable/anon key and public Turnstile site key belong in frontend environment variables. A service-role/secret key must never be prefixed with `VITE_`.

```powershell
npm test
npm run build
npm run test:browser
```

The browser check uses installed Windows Edge where available, otherwise Playwright Chromium (`npx playwright install chromium`). It runs the real local API against a temporary isolated database, not your workspace records. It covers the full browser workflow, six viewport widths, persistence after reload, manifest/icons, console errors, and offline navigation. It is not a substitute for hosted Supabase integration tests.

## Backend alternatives considered

| Option | Account/Docker required? | Decision |
|---|---|---|
| [PGlite](https://pglite.dev/docs/about) + a loopback Node API | No | Implemented for end-to-end local work; reuses existing PostgreSQL functions instead of rewriting finance rules |
| Self-hosted PostgreSQL with an API and production auth | No cloud account; PostgreSQL installation or container runtime needed | A future public-hosting option, but entails TLS, mail, backups, patching, and identity-provider operations |
| [PocketBase](https://pocketbase.io/docs/) | No | Convenient single binary, but needs a SQLite/schema/authorization rewrite; its docs caution against production-critical use before v1 |
| Supabase | Hosted project, or Docker for its full local stack | Still supported when an account becomes available; not a prerequisite for local development anymore |

No hosting provider removes production operations or identity requirements. The local mode costs nothing beyond the computer you already use; it is not presented as a free public financial service.

## Themes and broad mobile usability

Light mode is the default for daylight use: warm off-white surfaces, dark green text, deep teal actions, and a restrained warm accent. Dark mode uses the same semantic roles, not an inverted page. The topbar theme control works in both modes and the browser theme colour follows the selection. Mobile shows its icon with an accessible label.

Controls retain at least 44px touch targets, inputs use 16px text, mobile navigation uses short visible labels, and INR amounts retain Indian number grouping. Errors, approvals and payment states have text labels; colour is not their sole signal. Reduced-motion preferences are respected. These are inclusive usability choices, not a claim that one palette represents all Indian users.

Browser tests check both themes at 320, 360, 390, 412, 768 and 1280px, saved theme choice, keyboard focus, and token contrast: at least 4.5:1 for normal text and 3:1 for input boundaries/focus. These targeted checks do not constitute a complete WCAG audit or real-device usability study. Regional-language translations, testing with older users and low-end Android devices, and measured slow-network performance remain separate work; the current interface is English.

## Near-free public hosting assessment

Official plan limits checked on 2 November 2026. Free-tier eligibility, billing requirements, quotas and terms can change. Estimates exclude custom domains, taxes, SMS, extra email, backup storage and usage overages. No provider accounts or resources have been created.

| Route | Hosting/service starting cost | What it means for this app |
|---|---|---|
| [Cloudflare Pages Free](https://developers.cloudflare.com/pages/platform/limits/) | $0 within limits; 500 builds/month | Good static frontend host. Build from `app` using `npm run build`, output `dist`. It does **not** run the current Node/PGlite API; deploying only this frontend without a real backend is not an end-to-end deployment. |
| Pages + [Workers](https://developers.cloudflare.com/workers/platform/pricing/) + [Neon](https://neon.com/pricing) + private [R2 Standard](https://developers.cloudflare.com/r2/pricing/) | Potentially $0 within all free quotas; Workers Paid starts at $5/month | Best no-Supabase trial candidate, **not implemented**. Workers Free has 100,000 requests/day and 10ms CPU/invocation. Neon Free currently includes 100 CU-hours/project, 1GB database storage, 5GB public transfer and managed auth; compute sleeps after inactivity. R2 Standard includes 10GB-month, 1M writes and 10M reads/month. Image decoding/re-encoding must be benchmarked against the CPU ceiling; request quotas alone do not prove this workload fits. |
| Pages + [Supabase Free](https://supabase.com/pricing) | Potentially $0 within quotas | Least backend rewrite because hosted support already exists, but currently blocked by your inability to create a project. Free includes 500MB database and 1GB files; projects pause after a week of inactivity. Email and production verification still need setup. |
| Pages + Supabase Pro | From $25/month for one Micro project before extras | Lower engineering/operations effort once available; not almost free. Includes daily database backups, not file-byte backups. At an illustrative INR90/USD this is INR2,250/month before tax, email, domains or overages; not an exchange-rate quote. |
| [Render Free](https://render.com/docs/free) with the current local API | Not safe as a persistence solution | Reject as an unchanged deployment: free services sleep, cannot attach persistent disks, and lose local files on restart/redeploy. Free Render Postgres expires after 30 days. Render explicitly advises against free instances for production. |

**Recommendation:** use the free Cloudflare/Neon route only for an explicitly limited trial after implementing its production adapter. For financial production, do not trade away verified sign-in, tenant checks, durable files, recoverable backups or availability merely to hit INR0. Choose a database region close to the pilot users where available, review data-location requirements, test actual India mobile latency, set spending alerts, and size for festival-day peaks rather than monthly averages.

The no-Supabase route requires real engineering, not just changing a connection string:

1. Replace local development-inbox login with a verified managed-auth flow; validate sessions server-side and map authenticated identities to the existing PostgreSQL permission checks. Neon managed auth is not automatically compatible with Supabase's `auth.uid()`/roles.
2. Port the allowlisted API to Workers with a real PostgreSQL driver and request-scoped transactions, retaining all financial/idempotency/tenant invariants. Node filesystem locks and PGlite persistence cannot be used there.
3. Store evidence privately in R2; retain image validation, authorization on download, expiring links and invitation delivery. Update CSP to the exact approved auth/API/file origins rather than broadly allowing third parties.
4. Configure HTTPS, rate limits, email sender/domain, secrets, database and file backups, and demonstrate a restore. Re-run hosted auth, upload, permissions, concurrency and full browser tests before real use.

[Resend Free](https://resend.com/pricing) allows **100 emails/day and 3,000/month**. Your estimated 100 busy-day sign-ins could exhaust the daily allowance before invitations or retries. Use provider-approved verified OAuth where appropriate or budget for more email; do not assume SMS OTP or a sender domain is free. Free managed-auth user allowances do not imply unlimited email delivery. Managed auth/OAuth availability and configuration must be checked in the selected database region.

## Supabase setup

Install Docker and the Supabase CLI for the full local stack. From the repository root:

```powershell
supabase start
supabase db reset
```

The migration creates the schema, default-deny grants, checked functions, indexes, and the private `evidence` bucket. Use the local API URL/publishable key reported by the CLI in the frontend.

For hosting, use a new dedicated Supabase project and choose Mumbai where available. Do not apply this foundation migration to a database shared with another application. After separately approving the account and billing:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy invite
supabase functions deploy upload
```

The Edge Function gateway JWT setting is disabled because the functions validate the bearer token themselves using Supabase `getUser()`. Do not remove that validation.

Configure server-side function secrets through the Supabase dashboard or a secret-management workflow:

| Secret | Purpose |
|---|---|
| `APP_ORIGIN` | Exact web origin, e.g. `https://your-site.pages.dev`; use `http://localhost:5173` for local work |
| `RESEND_API_KEY` | Server-only invitation email delivery |
| `INVITE_FROM` | Verified sender, e.g. `Mandap <committee@your-domain.in>` |

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions. Local serving needs equivalent server-only configuration. Never put secrets into command history, repository files, screenshots, or chat.

The current origin allowlist intentionally supports one web deployment. Revisit it for preview deployments or Capacitor, rather than allowing every origin.

## Authentication and email

1. Enable email authentication and email confirmation.
2. Configure custom SMTP with Resend. Supabase's default test mail service is not suitable for real devotees.
3. Configure verified sender DNS, SPF, DKIM, and DMARC.
4. Change the Supabase email sign-in template to include `{{ .Token }}`. The app accepts an email code, not a magic-link callback.
5. Configure OTP expiry, resend/verification limits, and Supabase abuse protection before publishing signup.
6. Configure Cloudflare Turnstile for the deployed hostname, set `VITE_TURNSTILE_SITE_KEY`, and configure its secret in Supabase Auth CAPTCHA settings. The UI passes the token to Auth; the production build refuses to send login requests without it. Local development may leave CAPTCHA disabled.
7. Enroll the owner in TOTP MFA. The database refuses protected workspace operations and private downloads at AAL1 once a verified TOTP factor exists. The UI supports the next sign-in's authenticator challenge.

The owner invites committee users by email. A verified user accepts invitations addressed to their email on sign-in; typing somebody else's phone number never claims a help-desk record.

Resend Free permits **100 emails/day and 3,000/month**, including login codes, retries, and invitations. One hundred sign-ins plus invitations can exceed the daily allowance. Confirm real peak demand with headroom before launch. In-app confirmations and printable receipts do not automatically send additional emails. If capacity does not fit, choose another provider/plan and reapprove costs first.

## Pilot workflow

1. Sign in, create a private Mandap, and set its public UPI ID.
2. Create and publish a festival. Add configurable poojas with selected dates, capacity, registration window, pricing, and eligibility notes.
3. Publish the Mandap. Share `https://your-host/?mandap=your-slug`.
4. Devotees register named participants, reserve sponsorship slots, or create donation pledges.
5. A help-desk volunteer can record an unclaimed family registration without linking it to their own account.
6. Devotees submit cash/UPI/bank payment records; a treasurer independently verifies the real transaction.
7. Confirmed payments receive numbered printable receipts. Print dialogs support saving PDF; receipts are not tax-exemption certificates.
8. Submit expenses, attach private bills, review them, and separately record settlement of approved unpaid expenses.
9. Publish only aggregate financial summaries and consented sponsor names. Internal CSV exports are permission-controlled and spreadsheet-formula-safe.

### Pricing semantics

| Mode | Calculation |
|---|---|
| `person` | Rate times selected participants, once for the selected dates |
| `person_day` | Rate times participants times selected dates |
| `family` / `fixed` | Rate once per registration |
| `family_day` | Rate times selected dates |
| `package` | Configured package rate times participants; all configured dates required |
| `custom` / `suggested` | User-selected amount, validated by the server |
| `free` | Zero |

Amounts are stored as integer paise. Accepted prices are snapshotted. Each payment belongs to one commitment; split payments against that commitment are supported. A single bank transaction split across several commitments is not yet a supported workflow.

### Financial rules

- UPI intents, QR scans, screenshots, and client messages never confirm money.
- Verification/refund/registration requests are idempotent. In-session retries reuse a pending request key.
- After an ambiguous network failure, reload records before starting over or closing the session. Do not create a second manual payment record for the same transfer.
- Confirmed non-cash transaction references are unique per Mandap and method.
- Confirmed payments cannot be overwritten/deleted; record linked refunds/reversals instead.
- Cancellation releases a booking and closes the commitment but never fabricates a refund.
- Cash balance = confirmed collections - recorded refunds - approved paid expenses.
- Approved unpaid expenses are shown separately. Outstanding commitments exclude cancelled/waived amounts.
- Self-approval is not currently prohibited by role policy; organizers needing two-person approval must enforce it operationally or add a server rule before use.

## Files and PWA

- JPEG/PNG/WebP input is resized in-browser and converted to PNG; the upload function checks dimensions, decodes, and re-encodes it server-side.
- Maximum input size: 5 MB; processed dimensions: 1600 pixels per side. Private files use short-lived authorized links.
- No direct client insert/update/delete permission exists on the evidence bucket. Financial evidence is not replaced.
- No antivirus scanner or arbitrary PDF/document upload is claimed.
- Service worker caches same-origin hashed assets and a safe offline notice only. It never caches Supabase responses, financial records, receipt views, or personal data.
- Offline submission queues and persistent personal-data drafts are intentionally absent.

## Hosting and costs

Cloudflare Pages: build command `npm run build`, root directory `app`, output `dist`. Set the three public frontend environment variables. The included headers apply CSP, frame restrictions, MIME protection, and limited device permissions.

Mantine uses runtime CSS variables/style attributes; the static-host CSP permits inline **styles**, not inline scripts. Cloudflare Pages alone does not run the local API: public hosting still requires a configured hosted backend.

Plan for one Supabase Pro Micro project, starting at **USD 25/month**, with the included compute credit. At an illustrative INR 90/USD this is INR 2,250 before tax, or INR 2,655 with illustrative 18% tax. Exchange rate, taxes, card fees, usage, backup storage, and runner charges vary; INR 3,000 is a target, not a guarantee.

Do not enable additional paid projects, compute upgrades, custom backend domains, PITR, or paid email plans without revisiting the budget. Domain registration, SMS, payment fees, and app-store accounts are outside this figure.

## Independent encrypted backups

Supabase Pro has seven days of daily database backups, **not Storage object backups** and **not point-in-time recovery**.

The backup script streams `pg_dump` through `age` into a private R2 bucket, then copies and encrypts the evidence objects and a checksum manifest. It never writes an unencrypted dump to disk. A successful encrypted manifest is the recovery-set completion marker.

Prerequisites: a compatible PostgreSQL 17-or-newer client, `age`, AWS CLI, a private R2 Standard bucket, a separately controlled age decryption key, a trusted runner, and permission to export the database and read evidence.

The scheduled GitHub workflow is disabled until repository variable `BACKUPS_ENABLED=true` is set. Configure an approved `production` environment and its secrets:

`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AGE_RECIPIENT`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.

Use the direct/session database connection suitable for `pg_dump`, never the transaction pooler. Restrict R2 credentials to the recovery bucket; keep the age private key out of CI. Configure an R2 lifecycle rule retaining at least seven daily sets and verify total usage against the free allowance.

Backups include the necessary Auth and Storage metadata schemas as well as application data. Restoring managed Supabase schemas requires the official backup/migration procedure and the appropriate database role; do not blindly run a full restore over a live project.

Before enabling the schedule:

1. Run it manually and confirm both encrypted database and file copies plus the final manifest exist.
2. Decrypt into an isolated recovery environment; verify the dump and each file checksum.
3. Restore using the official Supabase restore procedure, preserving user IDs, private records, evidence object paths, grants, RLS, and functions. Restore actual object bytes, not just Storage metadata.
4. Compare registrations, receipt numbers, collections/refunds, expenses, audit records, and balances; test private downloads as an ordinary user.
5. Remove the temporary recovery environment, document results, and enable failure notifications.
6. An operator checks the last successful backup before each active festival day. A scheduled workflow is not an SLA and missed runs may not generate failure notifications.

## Remaining release gates

- Configure and test the production Turnstile CAPTCHA flow and email rate/attempt controls.
- Test actual Supabase Auth/MFA, invitation delivery, service credentials, private uploads, and signed downloads.
- Verify true two-client capacity/receipt/payment concurrency on PostgreSQL, not only sequential embedded tests.
- Run the pilot load gate and measure from the intended region.
- Execute and restore an encrypted recovery set; validate billing/runner quotas and alert delivery.
- Test iOS Safari and Android Chrome on real devices, installability, keyboard/screen-reader behavior, and zoom.
- Review consent, retention, support/account recovery, and account-deletion operations with the organizer.
- Get explicit deployment/account approval before purchasing or publishing services.
