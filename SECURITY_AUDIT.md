# Security Audit — Snap4Knack2

**Date:** March 6, 2026  
**Last Updated:** March 6, 2026 — Fixes applied in commit `50344d6`  
**Auditor:** Internal static review  
**Scope:** Full codebase — Cloud Functions (`functions/src/index.ts`), Firestore rules, Storage rules, widget (`public/widget/snap4knack.js`), React SPA, Firebase hosting config, `cors.json`, `package.json` dependency trees

---

## Executive Summary

| Severity | Count | Fixed | Open |
|----------|-------|-------|------|
| Critical | 1     | 1     | 0    |
| High     | 6     | 2     | 4    |
| Medium   | 7     | 4     | 3    |
| Low      | 5     | 1     | 4    |
| Info     | 3     | 0     | 3    |

The application has a solid authentication spine (Firebase custom tokens, `verifyIdToken` server-side, Firestore security rules) but carries several exploitable gaps across input validation, HTTP header posture, CORS over-breadth, rate-limiting absence, and dependency CVEs.

---

## CRITICAL

### C-01 — HTML injection in `contactForm` email (unescaped user input in HTML body)

**Location:** `functions/src/index.ts` — `contactForm` function  
**Lines:** ~489–503

The `name`, `email`, `company`, and `message` fields from the request body are interpolated **verbatim** into an HTML string that is sent to internal recipients via SendGrid:

```typescript
<tr><td ...>Name</td><td style="padding:8px">${name}</td></tr>
<tr><td ...>Email</td><td style="padding:8px"><a href="mailto:${email}">${email}</a></td></tr>
```

An attacker can craft a payload like:

```
name: </td></tr></table><script>alert(1)</script>
email: attacker@evil.com" onmouseover="document.cookie
```

If any recipient opens the email in an HTML-capable client that renders raw HTML (e.g., a browser-based email client), this becomes a stored XSS in the email inbox. More practically, a `href="mailto:${email}"` injection can produce a `javascript:` URI or `data:` URL in older clients.

**Fix:** HTML-encode all user-supplied values before interpolation. Add a minimal helper:
```typescript
function he(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```
Then use `${he(name)}`, `${he(email)}`, `href="mailto:${he(email)}"`, etc.

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** `he()` helper added to `functions/src/index.ts`; all four `contactForm` fields (`name`, `email`, `company`, `message`) are now HTML-encoded before interpolation into the SendGrid HTML body.

---

## HIGH

### H-01 — No rate limiting on unauthenticated Cloud Functions

> 🔴 **Open — Backlog:** Requires App Check + Cloud Armor or Firestore token bucket; scheduled for Sprint 2.

**Location:** `issueWidgetToken`, `submitSnap`, `contactForm`

All three are `onRequest` functions with `cors: true` and no throttle, quota, or token-bucket guard. An adversary can:

- Hammer `issueWidgetToken` with valid `pluginId`+`tenantId` pairs to drain Firebase Auth quota or probe for valid plugin IDs.
- Submit thousands of snaps per second to `submitSnap` from a single valid token, filling Firestore for a target tenant.
- Flood `contactForm` to send email spam through the SendGrid account, potentially exhausting the daily send quota and blocking legitimate transactional mail.

**Fix:**
- Enable **Firebase App Check** (currently `enforceAppCheck: false` on all `onCall` functions; extend to `onRequest` functions via manual verification).
- Add Cloud Armor or a 2nd Gen Cloud Function `maxInstances` + `minInstances` budget, or a lightweight Firestore-backed token bucket.
- For `contactForm`, add an invisible reCAPTCHA v3 or a honeypot field.

---

### H-02 — Firebase App Check not enforced

> 🔴 **Open — Backlog:** Requires reCAPTCHA Enterprise registration; scheduled for Sprint 3.

**Location:** `functions/src/index.ts` — all `onCall` exports

```typescript
{ enforceAppCheck: false }
```

Every callable function (`storeKnackApiKey`, `fetchKnackRoles`, `inviteClient`, `acceptInvitation`, `revokeClientAccess`) disables App Check enforcement. Although `onCall` functions do check Firebase Auth (`request.auth`), App Check provides a second layer that prevents scripted abuse from clients that obtained valid tokens but are not the real app.

**Fix:** Set `enforceAppCheck: true` on all `onCall` functions and register the web app in the Firebase console with reCAPTCHA Enterprise attestation.

---

### H-03 — Firestore rule: `snap_submissions` `create` allows any authenticated user

**Location:** `firestore.rules` lines ~68–72

```js
allow create: if isAuthenticated();
```

Any Firebase-authenticated UID — including a widget token scoped to **tenant A** — can create a document with `tenantId: "tenant-B"`. There is no rule check that `request.resource.data.tenantId` matches the authenticated user's claims. Effectively a widget token or a compromised client session can poison another tenant's snap feed.

**Fix:**
```js
allow create: if isAuthenticated() && (
  // Tenant direct upload (staff)
  request.resource.data.tenantId == request.auth.uid ||
  // Widget upload — tenantId must match claim
  (request.auth.token.get('role', '') == 'widget' &&
   request.resource.data.tenantId == request.auth.token.get('snap_tenantId', '') &&
   request.resource.data.pluginId  == request.auth.token.get('snap_pluginId',  ''))
);
```

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** `firestore.rules` `snap_submissions` create rule now enforces `request.resource.data.tenantId == request.auth.uid` for tenant direct uploads, or widget token claims (`snap_tenantId` + `snap_pluginId`) must match for widget uploads. Also added an explicit `allow read, write: if false` rule on `snap_counters/{tenantId}`.

---

### H-04 — `knackUserRole` is fully client-supplied and unverified

**Location:** `public/widget/snap4knack.js` lines ~1228, 1238; `issueWidgetToken`

The widget reads `knackUserRole` from `Knack.getUserAttributes()` or `Knack.getUser()` on the client side and sends it untouched to `issueWidgetToken`. The function uses this value to check `selectedRoles` and embeds it in the custom token claims (`knackUserRole: knackUserRole`). A sophisticated attacker running a Knack session with developer tools can override the role to match any value in `selectedRoles`, gaining a token with a higher-privilege role claim.

**Fix:** Cross-verify the role server-side via the Knack REST API (`GET /v1/objects/{object}/records/{userId}`) using a server-side API key stored in Secret Manager, rather than trusting the widget-reported role.

> 🔴 **Open — Backlog:** Server-side Knack API call required; complexity estimated 4 hrs; scheduled for Sprint 3.

---

### H-05 — Hardcoded Firebase API key in public widget

**Location:** `public/widget/snap4knack.js` line ~205

```javascript
var apiKey = 'AIzaSyC6J5VNpybrQUnD-pbnaQkXjcAeVAUZZKo';
```

While Firebase web API keys are by design public and restricted to registered origins, this key is hardcoded in a file served with `Access-Control-Allow-Origin: *` with no referrer or domain restriction visible in the audit. If the key is not restricted in the Google Cloud Console (API key restrictions → HTTP referrers), an attacker can make Identity Toolkit calls from any origin using that key, e.g., enumerate valid UIDs via `signInWithCustomToken` probing.

**Fix:** In Google Cloud Console → Credentials, add HTTP referrer restrictions to this API key (allow only `*.snap4knack2.web.app` and `*.knack.com` patterns). Also restrict the key to the Identity Toolkit API only.

> 🔴 **Open — Manual task:** Requires GCP Console API key restriction; no code change needed. Assigned to DevOps.

---

### H-06 — npm audit: 18 frontend vulnerabilities (6 high) + 17 functions vulnerabilities (9 high)

**Frontend:** `firebase@10.7.2` depends on `undici` versions with a known **CVE-2025-47921** (HTTP/1.1 response header injection) and related bugs. 12 moderate + 6 high findings.

**Functions:** `@typescript-eslint/*` packages depend on `minimatch@9.0.3` — three ReDoS CVEs:
- [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26)
- [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj)
- [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74)

Note: `minimatch` ReDoS is in the build-time toolchain (ESLint), not the deployed function runtime — risk is limited to CI/CD but still warrants upgrade.

**Fix:**
```bash
# Frontend
npm audit fix

# Functions
cd functions && npm audit fix
```

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** `npm audit fix --force` + `@typescript-eslint` upgrades applied. Result: **0 frontend CVEs**, **8 low functions CVEs** (all in `@tootallnate/once` — transitive dep of firebase-admin 12; only fixable by downgrading to firebase-admin 10, which is a worse regression; accepted as low risk).

---

## MEDIUM

### M-01 — Missing HTTP security headers on hosting

**Location:** `firebase.json` — `hosting.headers`

No security headers are set for the SPA (`/`). The hosting config only sets `Cache-Control` and `Access-Control-Allow-Origin` for widget files. Missing headers:

| Header | Value to add |
|--------|--------------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://*.firebaseapp.com; connect-src 'self' https://*.googleapis.com https://*.cloudfunctions.net; img-src * data: blob:; frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(self), camera=(self)` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |

**Fix:** Add a `"source": "**"` headers block to `firebase.json` with the above values.

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** Global `"source": "**"` headers block added to `firebase.json` with all six headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and a full `Content-Security-Policy`.

---

### M-02 — Storage CORS allows all origins with all HTTP methods

**Location:** `cors.json`

```json
{ "origin": ["*"], "method": ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"] }
```

This allows any web page to read public Storage objects across origins and to issue write/delete requests (with a valid bearer token). While Storage rules enforce auth, the wildcard CORS origin means the storage bucket can be embedded or hotlinked from arbitrary sites.

**Fix:** Restrict `origin` to `["https://snap4knack2.web.app", "https://app.knack.com", "*.knack.com"]`. Remove `DELETE` and `PUT` from `method` if unused by the app.

> 🔴 **Open — Backlog:** `cors.json` not yet updated; the wildcard origin is intentional for the embeddable widget but PUT/DELETE restriction is valid. Scheduled for Sprint 3.

---

### M-03 — `submitSnap` does not validate payload size or field types

**Location:** `functions/src/index.ts` — `submitSnap`

Fields accepted verbatim:
- `body.consoleErrors` — no length limit (widget caps at 100 but the function does not)
- `body.annotationData` — arbitrary object; no schema validation
- `body.formData` — arbitrary key-value map written directly to Firestore
- `body.context` — arbitrary object

A valid widget token holder can POST a document with `consoleErrors` containing thousands of entries or `annotationData` with megabytes of base64 data, inflating Firestore document size (max 1 MB) and billing.

**Fix:** Validate and truncate server-side:
```typescript
const consoleErrors = Array.isArray(body.consoleErrors)
  ? (body.consoleErrors as unknown[]).slice(0, 100)
  : [];
const annotationData = body.annotationData
  ? JSON.stringify(body.annotationData).length < 50_000 ? body.annotationData : null
  : null;
```
And add `maxInstances` + request body size limit to the function.

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** Server-side payload caps added to `submitSnap` in `functions/src/index.ts`: `consoleErrors` truncated to 100 entries, `annotationData` rejected if JSON serialization exceeds 50 KB, `formData` capped at 50 keys, `context` capped at 20 keys, `priority` validated against an explicit allowlist `['low','medium','high','critical']`.

---

### M-04 — Console capture logs may contain PII or credentials

**Location:** `public/widget/snap4knack.js` lines 61–75

The widget intercepts all five console levels (`log`, `info`, `warn`, `error`, `debug`) plus `unhandledrejection` and `window.error`. Knack applications routinely log authentication tokens, user PII (names, emails), or form values to the browser console during development. When "Include Console" is checked (or historically when the Console mode was top-level), all of this is captured and stored in Firestore in `snap_submissions.consoleErrors`.

**Fix:**
- Add a client-side redaction pass: strip strings matching patterns for email addresses, JWT patterns (`ey`…), API keys (40-char hex strings).
- Display a clear data-capture disclosure in the widget UI.
- Ensure `snap_submissions` Firestore documents are scoped and not accessible to clients beyond their tenantId.

> 🔴 **Open — Backlog:** Widget-side PII redaction not yet implemented; Firestore scoping is enforced by rules. Scheduled for Sprint 3.

---

### M-05 — `client_invitations` write rule uses `resource.data` on create

**Location:** `firestore.rules` lines ~93–95

```js
match /client_invitations/{inviteId} {
  allow read: if isAdmin() || resource.data.tenantId == request.auth.uid;
  allow write: if isAdmin() || resource.data.tenantId == request.auth.uid;
}
```

On a `create` operation, `resource.data` is `null` (the document doesn't exist yet), so `resource.data.tenantId` throws and the rule defaults to `false`. Invitations are created server-side via the `inviteClient` Cloud Function (correct), but if a direct Firestore write is ever attempted it would silently fail. More importantly, on `update` and `delete` this is the right check, but for `read` it blocks unauthenticated access to pending invites (good), yet doesn't prevent a tenant from reading another tenant's invites if `tenantId` fields match.

**Fix:** Separate `create`, `update`, `delete` into explicit rules:
```js
allow create: if isAdmin();
allow read, update, delete: if isAdmin() || resource.data.tenantId == request.auth.uid;
```

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** `firestore.rules` `client_invitations` split into `allow create: if isAdmin()` and `allow read, update, delete: if isAdmin() || resource.data.tenantId == request.auth.uid`.

---

### M-06 — `contactForm` has no spam / abuse protection

**Location:** `functions/src/index.ts` — `contactForm`

The endpoint is publicly accessible, requires no authentication, and sends email to two recipients for every request. There is no CAPTCHA, IP rate limit, or request deduplication. Abuse can exhaust the SendGrid daily limit and create noise for recipients.

**Fix:** Add reCAPTCHA v3 verification server-side, or require a `X-Recaptcha-Token` header; alternatively gate behind a shared HMAC token set at build time.

> 🔴 **Open — Backlog:** Depends on H-01 rate limiting work; scheduled for Sprint 2.

---

### M-07 — Widget `req()` function does not enforce HTTPS

**Location:** `public/widget/snap4knack.js` lines ~114–130

The `req()` helper accepts any URL string. If `FUNCTIONS_BASE` were ever tampered with (e.g., by a man-in-the-middle on an HTTP page), tokens would be sent to an attacker's endpoint. In practice the widget always generates `https://us-central1-...` URLs, but Knack app pages may be served over HTTP on custom domains.

**Fix:** Add an assertion at the top of `req()`:
```javascript
if (url.indexOf('https://') !== 0) {
  return Promise.reject(new Error('Only HTTPS requests allowed'));
}
```

> ✅ **Fixed in commit `50344d6` (March 6, 2026):** HTTPS assertion added at the top of `req()` in `public/widget/snap4knack.js`; any non-`https://` URL now immediately rejects with an error.

---

## LOW

### L-01 — Invitation token is 128-bit random hex — adequate but verify CSPRNG

`Array.from(crypto.getRandomValues(new Uint8Array(16)))` in Node.js Cloud Functions refers to the Web Crypto API available in Node 19+ / V8. Firebase Functions Node 22 runtime has it. The entropy is sufficient (128-bit). No issue beyond confirming the runtime guarantees; currently correct.

---

### L-02 — `firebase.json` serves widget with `Cache-Control: public, max-age=300`

**Location:** `firebase.json`

The widget file (`snap4knack.js`) is cached for 5 minutes. If a critical security fix is deployed, users may continue running the old version for up to 5 minutes. Consider `no-cache` with ETag validation to force re-validation, or use content-hashed filenames.

---

### L-03 — `snap_submissions` comments: any authenticated user can `create`

**Location:** `firestore.rules`

```js
allow create: if isAuthenticated();
```

Same pattern as the parent collection: there's no constraint that the commenter must have access to the parent submission. A widget token from tenant A can add a comment to a submission belonging to tenant B.

**Fix:** Add `get()` check: `allow create: if isAuthenticated() && (... tenantId check via parent doc ...)`.
> ✅ **Fixed in commit `50344d6` (March 6, 2026):** `firestore.rules` comments `allow create` rule now requires the commenter to have submission read access (tenant owner or client with plugin access via `clientHasPluginAccess`).
---

### L-04 — Realtime Database rules are fully closed but database may not be used

`database.rules.json` blocks all reads and writes. Good. However if the database is not used, consider disabling it entirely in the Firebase console to reduce attack surface.

---

### L-05 — `SENDGRID_API_KEY` falls back to `process.env` if Secret Manager fails

**Location:** `functions/src/index.ts` line ~15

```typescript
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
```

If Secret Manager is unreachable, the function silently falls back to an environment variable. If that variable is set (e.g. in a `.env` file accidentally committed), a secret leaks. If it's empty, email silently fails. Neither is ideal.

**Fix:** Remove the env-var fallback; throw on Secret Manager failure so the error is visible in function logs rather than silently degrading.

> 🔴 **Open — Backlog:** `process.env` fallback still present; removing it risks a silent failure during Secret Manager outage; requires error-handling improvement. Scheduled for Sprint 3.

---

## INFORMATIONAL

### I-01 — `enforceAppCheck: false` comment implies future intent

Explicitly noted as known technical debt. No action beyond H-02 above.

---

### I-02 — Firebase project ID and bucket name are exposed in widget

`snap4knack2` and `snap4knack2.firebasestorage.app` are visible in the minified widget. This is expected and unavoidable for a client-side Firebase integration. Security depends on rules, not obscurity. Noted for completeness.

---

### I-03 — `ARCHITECTURE.md` exists in repository root

The architecture doc may expose internal design decisions if the repository is ever made public. Verify it does not contain secrets or internal system names before any open-sourcing.

---

## Recommended Fix Priority

| Priority | Issue | Effort | Status |
|----------|-------|--------|--------|
| 1 (this sprint) | C-01 HTML injection in email | 30 min | ✅ Fixed `50344d6` |
| 1 (this sprint) | H-03 Firestore create rule for submissions | 30 min | ✅ Fixed `50344d6` |
| 1 (this sprint) | H-06 npm audit fix | 15 min | ✅ Fixed `50344d6` |
| 2 (next sprint) | M-01 Security headers in firebase.json | 1 hr | ✅ Fixed `50344d6` |
| 2 (next sprint) | M-03 Payload size validation in submitSnap | 1 hr | ✅ Fixed `50344d6` |
| 2 (next sprint) | M-05 `client_invitations` create rule | 30 min | ✅ Fixed `50344d6` |
| 2 (next sprint) | M-07 Widget HTTPS assertion | 30 min | ✅ Fixed `50344d6` |
| 2 (next sprint) | L-03 Comments create rule | 30 min | ✅ Fixed `50344d6` |
| 2 (next sprint) | H-01 Rate limiting (App Check + contactForm CAPTCHA) | 3 hrs | 🔴 Open — Sprint 2 |
| 3 (backlog) | H-02 App Check enforcement | 2 hrs | 🔴 Open — Sprint 3 |
| 3 (backlog) | H-04 Server-side role verification | 4 hrs | 🔴 Open — Sprint 3 |
| 3 (backlog) | M-02 Storage CORS tightening | 30 min | 🔴 Open — Sprint 3 |
| 3 (backlog) | H-05 API key restriction in GCP console | 30 min | 🔴 Open — Manual |
| 3 (backlog) | M-04 Console PII redaction | 2 hrs | 🔴 Open — Sprint 3 |
| 3 (backlog) | M-06 contactForm CAPTCHA | 2 hrs | 🔴 Open — Sprint 2 |
| 3 (backlog) | L-05 SENDGRID_API_KEY env fallback | 30 min | 🔴 Open — Sprint 3 |
