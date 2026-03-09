# HIPAA Security Risk Assessment — Snap4Knack2

**Version:** 1.0  
**Date:** March 9, 2026  
**Author:** Fine Mountain Consulting LLC — Engineering  
**Review cycle:** Annual, or after any material change to architecture, data flows, or threat landscape  
**Classification:** Internal — Do Not Distribute

---

## 1. Executive Summary

This document constitutes the formal risk analysis required by the HIPAA Security Rule at § 164.308(a)(1)(ii)(A). It identifies the information assets within Snap4Knack2 that may hold or process Protected Health Information (PHI), enumerates reasonably anticipated threats and vulnerabilities, assigns likelihood and impact ratings, and documents the controls currently in place along with residual risk and treatment decisions.

**Overall risk posture:** Medium. The platform implements a strong technical control set for PHI processing (DLP redaction, fail-closed pipelines, private staging bucket, tenant isolation, HTTPS-only). The primary residual risks are administrative gaps (no MFA enforcement, no frontend idle timeout, annotation text not DLP-scanned) and organizational gaps (no formal workforce training program, no in-app BAA gate).

---

## 2. Scope

| In Scope | Out of Scope |
|----------|-------------|
| Snap4Knack2 application (Firebase Hosting, React SPA) | Customers' own EHR or primary systems of record |
| Cloud Functions backend (submitSnap, onScreenshotStaged, onCommentCreated, purgeExpiredSnaps, issueWidgetToken) | Physical security of GCP data centers (Google's responsibility) |
| Firestore collections: `snap_submissions`, `tenants`, `plugins`, `users`, `comments`, `history` subcollections | Patient rights obligations of Covered Entities |
| Cloud Storage buckets: `snap_screenshots_staging`, `snap_screenshots`, `snap_recordings` | Fine Mountain employee workstations and personal devices |
| Google Cloud DLP pipeline | Third-party integrations outside FMC's control (Knack) |
| SendGrid email delivery | |
| Google Cloud Secret Manager (SendGrid key, Knack API keys) | |
| Firebase Authentication | |
| Snap4Knack2 embeddable widget (`snap4knack.js`) | |

---

## 3. Information Assets

| Asset ID | Asset | Data Classification | PHI Potential | Location |
|----------|-------|-------------------|---------------|----------|
| A-01 | Snap submission documents | Sensitive | **Yes** (HIPAA plugins) | Firestore `snap_submissions/{id}` |
| A-02 | Submission screenshots | Sensitive | **Yes** (HIPAA plugins) | Cloud Storage `snap_screenshots/` |
| A-03 | Submission screenshots — staging | Sensitive | **Yes** (HIPAA plugins, pre-redaction) | Cloud Storage `snap_screenshots_staging/` |
| A-04 | Screen recordings | Sensitive | No (disabled for HIPAA plugins) | Cloud Storage `snap_recordings/` |
| A-05 | Comments and history subcollections | Sensitive | **Yes** (HIPAA plugins) | Firestore `snap_submissions/{id}/comments`, `/history` |
| A-06 | Tenant and plugin configuration | Internal | No | Firestore `tenants/`, `plugins/` |
| A-07 | User accounts | Internal | No | Firebase Authentication, Firestore `users/` |
| A-08 | SendGrid API key | Secret | N/A | GCP Secret Manager |
| A-09 | Knack API keys (per tenant) | Secret | N/A | GCP Secret Manager |
| A-10 | Widget token signing secrets | Secret | N/A | Firestore `plugins/{id}.pluginSecret` |
| A-11 | Application source code | Internal | N/A | GitHub (private repo) |
| A-12 | GCP service account credentials | Secret | N/A | GCP IAM |

---

## 4. Data Flow Summary

```
1. Browser (customer's Knack app)
   └─► Widget (snap4knack.js, served from Firebase CDN)
        └─► Cloud Function: issueWidgetToken     → returns short-lived JWT (2h)
        └─► Cloud Function: submitSnap
             ├─ Screenshot → Cloud Storage staging bucket  (A-03)
             │    └─► Cloud Function: onScreenshotStaged
             │         ├─ Cloud DLP: dlpRedactImage (OCR inspect + bounding box redaction)
             │         └─ Clean image → snap_screenshots/ (A-02)  staging file deleted
             ├─ Description text → Cloud DLP: dlpRedactText → Firestore snap_submissions (A-01)
             ├─ Comment text → Cloud DLP: dlpRedactText → Firestore comments (A-05)
             ├─ Page URL → stripQueryParams → Firestore (HIPAA)
             └─ Console logs → stripped server-side (HIPAA)

2. Firebase Hosting (React SPA)
   ├─ Admin / Tenant dashboard → Firebase Auth → reads Firestore (A-01, A-05, A-06, A-07)
   ├─ Client Portal → Firebase Auth (invited users) → reads own tenant's submissions
   └─ Status/priority changes → Firestore snap_submissions + history subcollection (A-05)

3. Cloud Function: purgeExpiredSnaps (nightly Cloud Scheduler)
   └─ Deletes Firestore docs + Storage files past retentionDays

4. Cloud Function: sendNotification (comment / status events)
   └─ SendGrid API (via Secret Manager key A-08)
        └─ Email to tenant / commenter addresses
             ├─ HIPAA: email body sanitized, link-only
             └─ Standard: includes submission summary
```

---

## 5. Threat Agents

| ID | Threat Agent | Description |
|----|-------------|-------------|
| TA-1 | External attacker | Opportunistic or targeted actor attempting unauthorized access via internet-facing endpoints |
| TA-2 | Malicious insider — FMC | FMC employee or contractor with production access misusing privileges |
| TA-3 | Malicious insider — tenant | Tenant administrator who intentionally exceeds their authorized access scope |
| TA-4 | Accidental insider | FMC employee or tenant accidentally misconfigures, exposes, or deletes data |
| TA-5 | Third-party vendor | Supply chain compromise via GCP, SendGrid, npm packages, or GitHub |
| TA-6 | Compromised customer environment | XSS or malware on the Knack app where the widget is embedded, allowing session token theft |

---

## 6. Risk Register

**Likelihood scale:** 1 = Rare, 2 = Unlikely, 3 = Possible, 4 = Likely, 5 = Almost Certain  
**Impact scale:** 1 = Negligible, 2 = Minor, 3 = Moderate, 4 = Major, 5 = Catastrophic  
**Inherent risk = Likelihood × Impact (before controls)**  
**Residual risk = Likelihood × Impact (after current controls)**

---

### R-01 — Cross-Tenant PHI Access via Firestore Rules Misconfiguration

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-1, TA-3 |
| **Asset** | A-01, A-02, A-05 |
| **Threat event** | Attacker or tenant exploits a gap in Firestore security rules to read another tenant's submissions or PHI |
| **Vulnerability** | Firestore rules are code — a logic error could expose data |
| **Inherent likelihood** | 3 |
| **Inherent impact** | 5 |
| **Inherent risk** | **15 — High** |
| **Current controls** | Firestore rules enforce `isTenantOwner(tenantId)` on all data reads; widget tokens scoped to `tenantId + pluginId`; all rules reviewed in security audit (committed) |
| **Residual likelihood** | 2 |
| **Residual impact** | 5 |
| **Residual risk** | **10 — Medium** |
| **Treatment** | Mitigate — maintain strict rule review discipline on any Firestore rules change; add automated rule testing to CI pipeline |

---

### R-02 — PHI Exposure via Compromised Widget Token

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-1, TA-6 |
| **Asset** | A-01, A-03, A-10 |
| **Threat event** | Attacker obtains a valid widget JWT and uses it to submit crafted payloads or read staging data |
| **Vulnerability** | Widget tokens grant write access to `submitSnap` and write-only to staging bucket |
| **Inherent likelihood** | 3 |
| **Inherent impact** | 4 |
| **Inherent risk** | **12 — High** |
| **Current controls** | Widget tokens expire after 2 hours; staging bucket is write-only from client (`allow read: if false`); only Admin SDK can read/delete staging; DLP runs server-side and cannot be bypassed by the client token |
| **Residual likelihood** | 2 |
| **Residual impact** | 2 |
| **Residual risk** | **4 — Low** |
| **Treatment** | Accept — token abuse is limited to writing new submissions; no PHI can be read via widget token |

---

### R-03 — DLP Pipeline Failure Resulting in PHI Stored Unredacted

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-4, TA-5 |
| **Asset** | A-01, A-02, A-05 |
| **Threat event** | Cloud DLP service outage or API error causes raw PHI to be written to Firestore or Storage |
| **Vulnerability** | External dependency on Google Cloud DLP |
| **Inherent likelihood** | 2 |
| **Inherent impact** | 5 |
| **Inherent risk** | **10 — Medium** |
| **Current controls** | Both `dlpRedactText` and `dlpRedactImage` are fail-closed — they throw on error rather than returning unredacted content; `submitSnap` and `onScreenshotStaged` will fail entirely rather than store raw PHI (T-18) |
| **Residual likelihood** | 1 |
| **Residual impact** | 2 |
| **Residual risk** | **2 — Low** |
| **Treatment** | Accept — fail-closed design limits exposure to a submission failure, not a PHI storage event |

---

### R-04 — PHI in Annotation Shape Text Not Redacted

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-4 |
| **Asset** | A-01 |
| **Threat event** | User types PHI into a freeform text annotation on a screenshot; annotation data is stored in Firestore without DLP scanning |
| **Vulnerability** | `submitSnap` does not iterate `annotationData.shapes[].text` through DLP (G-07) |
| **Inherent likelihood** | 3 |
| **Inherent impact** | 3 |
| **Inherent risk** | **9 — Medium** |
| **Current controls** | PHI warning banner in widget (T-16) instructs users not to include PHI; only authenticated tenant users can view submissions |
| **Residual likelihood** | 3 |
| **Residual impact** | 3 |
| **Residual risk** | **9 — Medium** |
| **Treatment** | **Remediate** — add DLP scrub of `annotationData.shapes[].text` in `submitSnap` when `hipaaEnabled` (G-07) |

---

### R-05 — Tenant Account Takeover (No MFA)

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-1 |
| **Asset** | A-01, A-02, A-05, A-06, A-07 |
| **Threat event** | Attacker compromises a tenant admin account via phishing or credential stuffing and gains access to all submissions for that tenant, including PHI |
| **Vulnerability** | Email/password authentication only — no MFA enforcement (G-06) |
| **Inherent likelihood** | 3 |
| **Inherent impact** | 4 |
| **Inherent risk** | **12 — High** |
| **Current controls** | Firebase Auth with email verification; HTTPS-only; no credential storage in client code |
| **Residual likelihood** | 3 |
| **Residual impact** | 4 |
| **Residual risk** | **12 — High** |
| **Treatment** | **Remediate** — enforce or strongly prompt MFA for tenants with HIPAA-enabled plugins (G-06) |

---

### R-06 — Session Left Open on Shared Workstation

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-3, TA-4 |
| **Asset** | A-01, A-02, A-05 |
| **Threat event** | Authenticated session left open on a shared or unlocked workstation allows unauthorized individual to view PHI submissions without credentials |
| **Vulnerability** | No client-side idle timeout; Firebase token expires after 1 hour but session may remain active in the browser (G-11) |
| **Inherent likelihood** | 3 |
| **Inherent impact** | 3 |
| **Inherent risk** | **9 — Medium** |
| **Current controls** | Firebase Auth 1-hour token expiry; HTTPS-only; standard browser session management |
| **Residual likelihood** | 3 |
| **Residual impact** | 3 |
| **Residual risk** | **9 — Medium** |
| **Treatment** | **Remediate** — implement 15–30 minute client-side idle timer that calls `auth.signOut()` (G-11) |

---

### R-07 — Secret / Credential Exposure

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-1, TA-2, TA-5 |
| **Asset** | A-08, A-09, A-12 |
| **Threat event** | SendGrid API key, Knack API keys, or GCP service account credentials are exposed via source code, log injection, or supply chain compromise |
| **Vulnerability** | Developer accidentally commits a secret; GCP IAM misconfiguration; malicious npm package reads environment |
| **Inherent likelihood** | 2 |
| **Inherent impact** | 4 |
| **Inherent risk** | **8 — Medium** |
| **Current controls** | All secrets stored in GCP Secret Manager (T-13); `.env` files in `.gitignore`; no secrets in source code or logs; GitHub secret scanning enabled |
| **Residual likelihood** | 1 |
| **Residual impact** | 4 |
| **Residual risk** | **4 — Low** |
| **Treatment** | Accept — Secret Manager + GitHub scanning provides strong protection; rotate secrets annually and immediately on any suspected exposure |

---

### R-08 — Supply Chain / Dependency Compromise

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-5 |
| **Asset** | A-11, all runtime assets |
| **Threat event** | A malicious or compromised npm package introduces backdoor code that exfiltrates secrets or PHI at runtime |
| **Vulnerability** | Large npm dependency graph (`node_modules`) introduces implicit trust in third-party code |
| **Inherent likelihood** | 2 |
| **Inherent impact** | 5 |
| **Inherent risk** | **10 — Medium** |
| **Current controls** | `npm audit` run regularly; Dependabot alerts on GitHub; dependencies pinned in `package-lock.json` |
| **Residual likelihood** | 2 |
| **Residual impact** | 5 |
| **Residual risk** | **10 — Medium** |
| **Treatment** | Mitigate — run `npm audit` in CI pipeline on every build; review critical alerts within 48 hours |

---

### R-09 — Legacy Storage Path Access Control Gap

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-1, TA-3 |
| **Asset** | A-02 |
| **Threat event** | Authenticated user exploits permissive legacy storage rule (`snaps/{pluginId}/{submissionId}/`) to read or delete another tenant's screenshot files |
| **Vulnerability** | Legacy path allows any authenticated user to read/delete — not scoped to tenant ownership (G-10) |
| **Inherent likelihood** | 2 |
| **Inherent impact** | 3 |
| **Inherent risk** | **6 — Medium** |
| **Current controls** | New paths enforce `isTenantOwner`; new submissions use new paths; legacy path is residual from initial development |
| **Residual likelihood** | 2 |
| **Residual impact** | 3 |
| **Residual risk** | **6 — Medium** |
| **Treatment** | **Remediate** — tighten legacy Storage rule to require tenant ownership, or migrate/delete legacy data and remove the rule (G-10) |

---

### R-10 — XSS on Host Knack Application Leads to Token Theft

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-6 |
| **Asset** | A-10, A-07 |
| **Threat event** | Cross-site scripting vulnerability on the customer's Knack application allows attacker to read the widget token from the DOM or intercept submitted form data |
| **Vulnerability** | The widget is embedded in a third-party application that FMC does not control |
| **Inherent likelihood** | 2 |
| **Inherent impact** | 3 |
| **Inherent risk** | **6 — Medium** |
| **Current controls** | Widget tokens expire after 2 hours; Content Security Policy headers configured on Firebase Hosting; widget scoped to write-only operations |
| **Residual likelihood** | 2 |
| **Residual impact** | 2 |
| **Residual risk** | **4 — Low** |
| **Treatment** | Accept — token theft enables at most unauthorized new submissions, not PHI reads |

---

### R-11 — Unauthorized PHI Read by FMC Insider

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-2 |
| **Asset** | A-01, A-02, A-05 |
| **Threat event** | FMC employee with Firebase Admin SDK access reads HIPAA tenant PHI without authorization |
| **Vulnerability** | Admin SDK bypasses Firestore security rules; limited read access logging (G-02) |
| **Inherent likelihood** | 1 |
| **Inherent impact** | 5 |
| **Inherent risk** | **5 — Medium** |
| **Current controls** | GCP Cloud Audit Logs records all Admin SDK operations at the infrastructure level; limited workforce with production access |
| **Residual likelihood** | 1 |
| **Residual impact** | 5 |
| **Residual risk** | **5 — Medium** |
| **Treatment** | Mitigate — implement application-level read logging for HIPAA snaps (G-02); enforce least-privilege GCP IAM roles; annual access reviews |

---

### R-12 — GCP / Firebase Platform Outage or Data Loss

| Field | Detail |
|-------|--------|
| **Threat agent** | TA-5 |
| **Asset** | All |
| **Threat event** | GCP regional outage, Firebase service disruption, or Firestore data loss event causes platform unavailability or data loss |
| **Vulnerability** | Dependency on a single GCP project and region |
| **Inherent likelihood** | 2 |
| **Inherent impact** | 4 |
| **Inherent risk** | **8 — Medium** |
| **Current controls** | Firestore is multi-region by default; Cloud Storage is geo-redundant; Firestore PITR provides 7-day recovery window; GCP is SOC 2 / ISO 27001 certified |
| **Residual likelihood** | 1 |
| **Residual impact** | 3 |
| **Residual risk** | **3 — Low** |
| **Treatment** | Accept — GCP platform provides sufficient redundancy; document RTO/RPO and enable Firestore PITR (G-12) |

---

## 7. Risk Summary Matrix

| Risk ID | Description | Residual Risk Score | Rating | Treatment |
|---------|-------------|-------------------|--------|-----------|
| R-04 | Annotation text PHI not DLP-scanned | 9 | **Medium** | Remediate (G-07) |
| R-05 | Account takeover — no MFA | 12 | **High** | Remediate (G-06) |
| R-06 | Session left open — no idle timeout | 9 | **Medium** | Remediate (G-11) |
| R-08 | Supply chain / npm compromise | 10 | **Medium** | Mitigate (CI audit) |
| R-09 | Legacy storage path permissive | 6 | **Medium** | Remediate (G-10) |
| R-11 | FMC insider PHI read | 5 | **Medium** | Mitigate (G-02, IAM review) |
| R-01 | Cross-tenant Firestore access | 10 | **Medium** | Mitigate (rule reviews) |
| R-07 | Credential/secret exposure | 4 | **Low** | Accept |
| R-10 | XSS token theft on host app | 4 | **Low** | Accept |
| R-02 | Compromised widget token | 4 | **Low** | Accept |
| R-12 | GCP platform outage | 3 | **Low** | Accept (enable PITR) |
| R-03 | DLP pipeline failure | 2 | **Low** | Accept (fail-closed) |

---

## 8. Accepted Risks

The following risks are accepted at their current residual levels with no further planned remediation beyond existing controls. They will be re-evaluated at each annual review:

- **R-02** — Widget token abuse is constrained to write-only operations; no PHI read is possible via widget token
- **R-03** — Fail-closed DLP design means a DLP failure causes a submission error, not PHI storage
- **R-07** — Secret Manager + GitHub scanning provides industry-standard protection
- **R-10** — Widget token scope limits impact of XSS on the host application
- **R-12** — GCP's native redundancy exceeds our RTO/RPO targets

---

## 9. Remediation Roadmap

| Priority | Risk | Gap | Owner | Target |
|----------|------|-----|-------|--------|
| 🔴 1 | R-05 — MFA | G-06 | Engineering | Q2 2026 |
| 🔴 2 | R-04 — Annotation DLP | G-07 | Engineering | Q2 2026 |
| 🟠 3 | R-06 — Idle timeout | G-11 | Engineering | Q2 2026 |
| 🟠 4 | R-09 — Legacy storage | G-10 | Engineering | Q2 2026 |
| 🟠 5 | R-11 — Read audit log | G-02 | Engineering | Q3 2026 |
| 🟡 6 | R-08 — CI npm audit | — | Engineering | Q2 2026 |
| 🟡 7 | R-01 — Firestore rule test suite | — | Engineering | Q3 2026 |

---

## 10. Review and Approval

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | March 9, 2026 | Fine Mountain Consulting LLC — Engineering | Initial assessment |

This document must be reviewed and updated:
- **Annually** — at minimum, on each anniversary of this version
- **After any reportable breach**
- **After any material change** to the application architecture, data flows, or hosting infrastructure
- **After any significant change to HIPAA regulations** or HHS guidance

---

*Retain this document for 6 years per § 164.530(j).*
