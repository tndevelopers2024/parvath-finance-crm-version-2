# Security review — 23 October 2026

Reviewed commit `d61c23c`, current npm advisory results, selected authentication/authorization/upload/export code, and read-only public HTTP responses from the Vercel demo. This is a scoped review, not a penetration-test certification or incident investigation. No exploit payloads, password guessing, account changes, or production data mutations were performed. No application fixes were made as part of this review.

## Findings, ordered by remediation priority

### 1. Medium: frontend responses bypass security headers

Live `/` and `/dashboard` responses have no Content-Security-Policy, X-Frame-Options, or X-Content-Type-Options. API responses do have Helmet headers. Root `vercel.json` serves the frontend directly, bypassing `apps/api/src/app.ts` middleware. This leaves the document without a CSP safety net or explicit anti-framing protection. This does not demonstrate an XSS exploit; browser cookie policy may also restrict authenticated framing in some scenarios.

Fix: configure headers for frontend responses in Vercel, including CSP `frame-ancestors`, restrictive script sources, `object-src 'none'`, `base-uri 'self'`, nosniff and a referrer policy. Validate the actual fonts/images/scripts before enforcing the policy. API CSP currently permits inline scripts and broad HTTPS connections; do not blindly copy it into the frontend policy.

### 2. Medium: old password-reset links remain valid after credential recovery

`apps/api/src/auth.ts:108` deletes other sessions after a password change but does not revoke passwordReset records. At line 172, a reset consumes only its own record. A second previously issued, unused link remains valid until its 30-minute expiry and can change the password again. This requires possession of that link; it is not an unauthenticated token-guessing bypass.

Fix: atomically revoke every outstanding reset token when changing/resetting a password, serialize concurrent recovery operations per account, and test two outstanding links plus authenticated password changes. Preserve existing session revocation.

### 3. Medium: login abuse controls are local to each function instance

The rateLimit configurations in `apps/api/src/auth.ts` and `apps/api/src/app.ts` specify no shared store. The default in-memory counters are independent across Vercel instances and disappear when instances restart. Login uses IP limits without a shared account-based limit. Scaling therefore weakens the stated 15-attempt protection.

Fix: use an atomic shared rate-limit store or platform protection, plus account and IP limits. Test behavior across two instances. No brute-force or scaling test was run against production.

### 4. Dependency advisories: seven affected package entries, one production entry

Fresh `npm audit --json`: 2 critical, 2 high, 3 moderate entries. These include dependency propagation; they are not seven independently proven exploitable bugs. `npm audit --omit=dev --json`: one moderate, zero high/critical.

| Installed package | Audit severity | Context / action |
| --- | --- | --- |
| ip-address 10.7.2 | Moderate | Production dependency through express-rate-limit; quadratic-time IPv6 zone parsing. Update to a patched release. The caller uses Node isIPv6 first; live reachability of the problematic input was not established. |
| concurrently 10.0.5 / shell-quote | Critical (two entries) | Development command tooling, one underlying command-injection advisory. Upgrade concurrently to 10.0.6 or later patched version. No path from an app request to this command tooling was found. |
| vite 8.3.0 | High | Development server/editor and filesystem advisories; npm offers 8.3.5. Vercel serves compiled static output rather than a Vite development server. |
| vitest 5.0.1 / @vitest/mocker | Moderate (two entries) | Test tooling mock registration/traversal; npm offers 5.0.5. |
| source-map-js 1.2.1 | High | Build/test dependency; malformed indexed source-map denial of service; update to 1.2.2 or later patched version. |

Update the lockfile, run build/typecheck/lint and relevant tests, and repeat both dependency scans. Avoid treating development-only findings as a confirmed compromise of the deployed server.

Sources:
- https://github.com/advisories/GHSA-rxp7-6hxx-x8q5
- https://github.com/advisories/GHSA-pqg4-j6r4-53mv
- https://github.com/advisories/GHSA-68fv-2mgg-jv7q
- https://github.com/advisories/GHSA-qxg6-89mg-rqv8
- https://github.com/advisories/GHSA-xp26-3454-mjgp
- Vite advisory identifiers from current npm output: GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-587h-7wmj-h5pm, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22, GHSA-vfpm-58rq-9qcg.

### 5. Medium hardening gap: every new member is initially an administrator

`apps/api/src/workflows.ts:75` accepts only Administrator on creation, despite supporting Adviser and Operations on later updates. An operator must remember to downgrade each new account. This is not a privilege-escalation bypass (creation already requires an administrator), but unnecessarily grants broad privileges to new demo users.

Fix: permit explicit selection of the existing supported roles during creation and default to the least privilege suitable for the user.

## Checks that passed

- Unauthenticated `/api/clients` and `/api/dashboard` returned 401.
- Live session cookie includes Secure, HttpOnly and SameSite=Lax; API responses use no-store.
- HTTPS responses include HSTS.
- Inspected code uses Argon2 password hashing, session regeneration on login, random CSRF tokens on mutations, hashed expiring reset tokens, organization-scoped ownership checks and role guards.
- Document downloads enforce ownership and quarantine status; uploads check content type and extension.
- Inspected CSV exports escape quotes and common formula prefixes.
- Only `.env.example` is tracked at HEAD. This is not a full historical secret scan.
- `/.env` and `/.git/config` returned HTML from the SPA fallback, not the expected secret-file content type; a 200 on these paths alone is not evidence of exposure.

## Current breach/advisory applicability and remaining uncertainty

React2Shell (CVE-2025-55182) concerns React Server Components. This project uses client-side React/Vite and Express, with no RSC plugin configured; the reviewed architecture does not match that vulnerability. React's advisory explicitly distinguishes apps without RSC support: https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components

MongoDB publishes current server advisories at https://www.mongodb.com/resources/products/alerts . The Node driver version is not the Atlas server version. Atlas server patch level, database users/roles, network access lists, backups and database audit logs were not inspected in this review; their status remains unverified.

No conclusion about a past breach can be drawn from dependency scans and these HTTP checks. Establishing compromise requires Vercel/Atlas/GitHub access and activity logs, secret-exposure history, and investigation of suspicious authentication/export activity. No claim that the app is breach-free is made. Authenticated cross-tenant penetration tests and the full database integration suite were not run during this review.

## Remediation follow-up

The five findings above have been addressed in the follow-up change: Vercel frontend headers and an external theme script; atomic recovery-token revocation; MongoDB-backed rate limits plus normalized-account login limits; patched dependency lockfile; and role selection with Operations as the default. Both full and production-only npm audits report zero known vulnerabilities after updating. The original observations are retained above as the audit baseline. Atlas configuration and historical breach investigation remain outside this remediation's scope.
