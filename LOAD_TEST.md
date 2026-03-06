# Load Test Regiment — Snap4Knack2

**Date:** March 6, 2026  
**Last Updated:** March 6, 2026 — Security fixes applied in commit `50344d6`; no load characteristic changes required  
**Scope:** Cloud Functions endpoints, Firebase Hosting, Firestore, Firebase Storage  
**Tooling recommended:** [k6](https://k6.io), [Artillery](https://www.artillery.io), [Locust](https://locust.io), Firebase emulator suite for safe baseline tests before hitting production  
**Environment:** Run all destructive tests against a dedicated staging Firebase project (`snap4knack2-staging`) — never against production without explicit consent.

---

## 1. Service Map & Bottleneck Theory

| Surface | Expected bottleneck |
|---------|-------------------|
| `issueWidgetToken` (onRequest) | Cold start latency + Secret Manager round-trip + `auth.createCustomToken()` |
| `submitSnap` (onRequest) | `auth.verifyIdToken()` + Firestore transaction (counter + doc write) |
| `contactForm` (onRequest) | Secret Manager + SendGrid API call |
| `onSnapCreated` (Firestore trigger) | Fan-out email via SendGrid per notification email address |
| `onCommentCreated` (Firestore trigger) | Single SendGrid call; low risk |
| Firebase Hosting (CDN) | HTML/JS/CSS — Google CDN; very high throughput |
| Firebase Storage upload | Large PNG/WebM body; throughput limited by function memory + connection |

---

## 2. Test Scenarios

### Scenario A — Widget authentication throughput (issueWidgetToken)

**Goal:** Determine max concurrent Knack users the system can authenticate without error.

**Test design:**

```javascript
// k6 script: load_issueWidgetToken.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },   // ramp up to 20 VUs
    { duration: '3m', target: 20 },   // hold
    { duration: '1m', target: 100 },  // spike to 100 VUs
    { duration: '3m', target: 100 },  // hold
    { duration: '1m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // 95th pct < 2s
    http_req_failed:   ['rate<0.01'],   // < 1% error rate
  },
};

const BASE = 'https://us-central1-snap4knack2-staging.cloudfunctions.net';

export default function () {
  const res = http.post(
    `${BASE}/issueWidgetToken`,
    JSON.stringify({
      pluginId:      'STAGING_PLUGIN_ID',
      tenantId:      'STAGING_TENANT_ID',
      knackUserId:   `user_${__VU}_${__ITER}`,
      knackUserRole: 'profile_1',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  check(res, {
    'status 200':   (r) => r.status === 200,
    'has token':    (r) => JSON.parse(r.body).token !== undefined,
    'latency < 3s': (r) => r.timings.duration < 3000,
  });
  sleep(1);
}
```

**Acceptance criteria:**
- p95 response time < 2 s at 100 concurrent users
- Error rate < 1%
- Cold start penalty (first request after idle) < 5 s

**Expected failure modes:**
- Firebase Auth `createCustomToken` throttling at >200 req/s
- Secret Manager latency spike under high parallelism (not directly used here but warms the function instance)

---

### Scenario B — Snap submission throughput (submitSnap)

**Goal:** Determine max snap submission rate before Firestore transaction contention degrades latency.

The `submitSnap` handler runs a Firestore **transaction** that reads and writes `snap_counters/{tenantId}` on every submission. This is a single-document hot key per tenant — a known Firestore contention pattern above ~1 write/second per document.

**Test design:**

```javascript
// k6 script: load_submitSnap.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 5 },
    { duration: '5m', target: 5 },    // normal load
    { duration: '2m', target: 30 },
    { duration: '5m', target: 30 },   // stress load
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<4000'],
    http_req_failed:   ['rate<0.02'],
  },
};

// Pre-acquire a valid ID token from issueWidgetToken before the test
const ID_TOKEN = __ENV.STAGING_ID_TOKEN;

export default function () {
  const res = http.post(
    `https://us-central1-snap4knack2-staging.cloudfunctions.net/submitSnap`,
    JSON.stringify({
      type:         'full_viewport',
      screenshotUrl: null,
      formData:     { category: 'Bug', description: 'load test', priority: 'low' },
      context:      { pageUrl: 'https://example.com', pageTitle: 'Test Page' },
      consoleErrors: [],
      priority:     'low',
    }),
    {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ID_TOKEN}`,
      },
    }
  );
  check(res, {
    'status 200': (r) => r.status === 200,
    'has id':     (r) => JSON.parse(r.body).id !== undefined,
  });
  sleep(2);
}
```

**Key observation — Firestore transaction hot-key:**

The `snap_counters/{tenantId}` document is written on **every** snap submission. Firestore supports ~1 write/second per document reliably before contention retries begin. Above that rate, `runTransaction` will retry automatically (up to 5 attempts), adding p99 latency without errors — but latency will degrade sharply above 5 concurrent writers targeting the same tenantId.

> 📝 **Note (commit `50344d6`):** Server-side payload caps added to `submitSnap` (M-03 fix) limit each Firestore document to ≤100 console errors, ≤50 KB annotation data, ≤50 formData keys, ≤20 context keys. This reduces peak document size and slightly decreases per-write Firestore storage bandwidth under adversarial conditions, but does not materially affect hot-key contention at normal load.

**Acceptance criteria:**
- p95 < 4 s at 30 concurrent submitters against a single tenantId
- Error rate < 2%
- At 5 concurrent submitters (realistic production load), p95 < 2 s

**Mitigation if threshold not met:** Replace the per-document counter transaction with distributed counter shards (10 shards → 10× throughput) or move `snapNumber` assignment to a debounced Firestore trigger post-write.

---

### Scenario C — Storage upload throughput

**Goal:** Determine max concurrent screenshot/recording uploads.

Uploads go directly to Firebase Storage REST API; the Cloud Function is not in this path. Bottleneck is Storage ingress bandwidth and concurrent connection limits on the client.

**Test design (Artillery):**

```yaml
# artillery-storage.yml
config:
  target: 'https://firebasestorage.googleapis.com'
  phases:
    - duration: 60
      arrivalRate: 2
      name: Warm up
    - duration: 120
      arrivalRate: 10
      name: Ramp
    - duration: 180
      arrivalRate: 20
      name: Sustained load
  variables:
    TOKEN: "{{ $env.STAGING_ID_TOKEN }}"
    BUCKET: "snap4knack2-staging.firebasestorage.app"
    TENANT: "STAGING_TENANT_ID"
scenarios:
  - name: Upload screenshot
    flow:
      - post:
          url: "/v0/b/{{ BUCKET }}/o?uploadType=media&name=snap_screenshots%2F{{ TENANT }}%2Ftest.png"
          headers:
            Content-Type: image/png
            Authorization: "Bearer {{ TOKEN }}"
          body: "{{ screenshotPayload }}"   # 200KB base64-decoded PNG
          expect:
            - statusCode: 200
```

**Acceptance criteria:**
- 20 concurrent uploads of ~200 KB PNGs complete in < 5 s (p95)
- No 503 responses from Storage

---

### Scenario D — Firestore read query performance (SnapFeed)

**Goal:** Confirm `snap_submissions` query latency under realistic document volumes.

This tests the React SPA's `onSnapshot` listener — not directly load-testable, but simulation via Admin SDK:

```typescript
// Node.js script: load_firestore_query.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import serviceAccount from './serviceAccount.json';

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function queryTenant(tenantId: string) {
  const start = Date.now();
  const snap = await db.collection('snap_submissions')
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(25)
    .get();
  return { docs: snap.size, ms: Date.now() - start };
}

// Run 50 concurrent queries
const results = await Promise.all(
  Array.from({ length: 50 }, () => queryTenant('STAGING_TENANT_ID'))
);
const latencies = results.map(r => r.ms).sort((a, b) => a - b);
const p95 = latencies[Math.floor(latencies.length * 0.95)];
console.log(`p95 Firestore query latency: ${p95}ms`);
```

**Prerequisite:** Create a composite Firestore index on `(tenantId ASC, createdAt DESC)` — already required by the query pattern; confirm it exists in `firestore.indexes.json`.

**Acceptance criteria:**
- p95 < 500 ms for 25-document page at 50 concurrent readers against a collection of 10,000+ documents

---

### Scenario E — Cold start latency measurement

Firebase Functions v2 (2nd Gen) has improved cold starts but still incurs 1–3 s on a first invocation after idle. Characterize this:

```bash
# Run curl in a loop with timing; first call after 10-minute idle
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{time_total}\n" \
    -X POST https://us-central1-snap4knack2-staging.cloudfunctions.net/issueWidgetToken \
    -H "Content-Type: application/json" \
    -d '{"pluginId":"PLUG","tenantId":"TEN","knackUserId":"u1","knackUserRole":"r1"}'
  sleep 600   # allow cold start window
done
```

**Acceptance criteria:**
- Cold start p95 < 5 s
- Subsequent (warm) calls p95 < 1 s

**Mitigation:** Set `minInstances: 1` on `issueWidgetToken` and `submitSnap` in the function config to eliminate cold starts for the two most user-facing endpoints.

> 🔴 **Open — Not yet applied:** `minInstances: 1` is still a recommendation; not set in current `functions/src/index.ts`. Scheduled for Sprint 2 performance hardening.

---

## 3. Soak Test (Endurance)

Run Scenario B at a sustained 3 req/s for 4 hours targeting `submitSnap` on a staging tenant.

**Metrics to watch:**
- Firestore document count growth (billing)
- Function memory usage (available in Cloud Monitoring)
- Firestore `snap_counters/{tenantId}.count` transaction retry rate
- Error rate trend (should be flat, not increasing)

**Rejection criteria:** If error rate climbs above 1% over the 4-hour window, the Firestore transaction hot-key issue (Section 2, Scenario B) needs to be addressed before production scaling.

---

## 4. Baseline Performance Targets

| Endpoint | p50 target | p95 target | Max error rate |
|----------|-----------|-----------|----------------|
| `issueWidgetToken` (warm) | < 400 ms | < 1.5 s | 0.5% |
| `issueWidgetToken` (cold) | < 3 s | < 5 s | 0.5% |
| `submitSnap` (warm, single tenant) | < 800 ms | < 2 s | 1% |
| `submitSnap` (warm, 30 concurrent) | < 2 s | < 4 s | 2% |
| `contactForm` | < 1 s | < 3 s | 1% |
| Storage upload (200 KB PNG) | < 2 s | < 5 s | 0.5% |
| Firebase Hosting (static assets) | < 100 ms | < 300 ms | 0% |
| Firestore `snap_submissions` query | < 200 ms | < 500 ms | 0% |

---

## 5. Infrastructure Scaling Recommendations (pre-test)

Before running high-load tests, apply these changes to avoid hitting default quotas:

1. **Function concurrency:** Firebase Functions v2 defaults to `concurrency: 80` per instance. For `submitSnap`, consider `concurrency: 10` with `maxInstances: 50` to limit per-instance Firestore transaction backpressure.
2. **Firestore index:** Confirm `(tenantId, createdAt DESC)` and `(tenantId, pluginId, createdAt DESC)` composite indexes exist.
3. **Staging quota:** Request a Firestore write quota increase for the staging project before the soak test.
4. **Cost guard:** Set a Firebase budget alert at \$20/day on the staging project to prevent runaway billing during tests.

---

## 6. Test Execution Checklist

- [ ] Staging Firebase project created and mirrors production rules
- [ ] Test data seeded (staging tenant, active plugin, 10K+ existing submissions)
- [ ] k6 and Artillery installed locally or in CI
- [ ] Staging ID token obtained via `issueWidgetToken` and exported as env var
- [ ] Cloud Monitoring dashboard open during tests
- [ ] Firebase console → Functions → Logs tailed
- [ ] Budget alert set on staging project
- [ ] Results exported to CSV / HTML report via `k6 run --out csv=results.csv`
