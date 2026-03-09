# HIPAA Compliance Status — Snap4Knack2

**Last reviewed:** March 9, 2026  
**Reviewer:** Engineering  
**Scope:** Technical and administrative safeguards for HIPAA-enabled plugin mode

---

## Executive Summary

Snap4Knack2 offers an opt-in **HIPAA mode** that can be enabled per plugin. When enabled, the platform applies a layered set of technical controls designed to meet the HIPAA Security Rule's requirements for systems that may handle Protected Health Information (PHI). This document audits what is implemented, what is missing, and what remains outside the platform's technical scope.

---

## ✅ Implemented — Verified in Code

### Technical Safeguards (§ 164.312)

| # | Requirement | Implementation | Code Location |
|---|-------------|----------------|---------------|
| T-01 | **Access controls** — unique user IDs, role-based access | Firebase Auth (uid-scoped), Firestore rules enforce tenant isolation, widget custom tokens scoped to `tenantId + pluginId` | `firestore.rules`, `storage.rules`, `issueWidgetToken` |
| T-02 | **Automatic logoff** | Firebase Auth ID tokens expire after 1 hour; widget tokens expire after 2 hours | Firebase platform default |
| T-03 | **Encryption in transit** | All traffic over HTTPS/TLS (Firebase Hosting enforces HTTPS; all Cloud Function endpoints are HTTPS-only) | Firebase Hosting, Cloud Functions |
| T-04 | **Encryption at rest** | Firestore and Firebase Storage are AES-256 encrypted at rest by Google | GCP platform |
| T-05 | **PHI image redaction** | `onScreenshotStaged` trigger: screenshot uploaded to private staging bucket → `dlpRedactImage()` runs OCR inspect via Cloud DLP → bounding boxes composited with "HIPAA REDACTED" overlays via `sharp` → clean image written to live path → staging file deleted | `functions/src/index.ts` L117–194, L1090+ |
| T-06 | **PHI text scrubbing on description** | `submitSnap` DLP-redacts `formData.description` via `dlpRedactText()` before writing to Firestore | `functions/src/index.ts` L553–556 |
| T-07 | **PHI text scrubbing on comments** | `onCommentCreated` DLP-redacts comment text in HIPAA mode, updates the Firestore doc (`dlpFlagged`, `dlpPending`), and writes a `dlp_scan_completed` audit event recording whether PHI was detected — without re-logging the original text | `functions/src/index.ts` L702+ |
| T-08 | **Query-string stripping from page URLs** | `submitSnap` calls `stripQueryParams(contextRaw.pageUrl)` for HIPAA plugins; query params may contain patient IDs or session tokens | `functions/src/index.ts` L559–562 |
| T-09 | **Console log capture disabled** | `submitSnap` sets `consoleErrors: []` when `hipaaEnabled` — console capture is stripped server-side even if the client sends it; widget UI hides the console capture option | `functions/src/index.ts` L536–539 |
| T-10 | **Private staging bucket** | Storage rules: `snap_screenshots_staging` is write-only from the client (`allow read: if false; allow delete: if false`) — only the Admin SDK (Cloud Function) can read/delete | `storage.rules` L25–31 |
| T-11 | **Tenant-scoped storage access** | `snap_screenshots` and `snap_recordings` require `isTenantOwner(tenantId)` to read — cross-tenant access is impossible | `storage.rules` |
| T-12 | **Sanitized email notifications** | For HIPAA snaps, notification emails omit page URLs, screenshot thumbnails, and comment text; recipients receive only a secure link to log in | `functions/src/emailTemplates.ts` (HIPAA path) |
| T-13 | **Secrets in Secret Manager** | SendGrid API key and Knack API keys stored in Google Cloud Secret Manager; never in env vars or source code | `functions/src/index.ts` `getSendGridKey()`, `getKnackApiKey()` |
| T-14 | **7-year data retention** | `retentionDays` forced to 2,555 when `hipaaEnabled === true`; stored on the snap doc at submission time | `functions/src/index.ts` L532 |
| T-15 | **Automated purge after retention window** | `purgeExpiredSnaps` Cloud Scheduler function runs nightly; hard-deletes Firestore snap docs, comments subcollection, and Storage files for any snap older than its `retentionDays` | `functions/src/index.ts` L1152–1206 |
| T-16 | **PHI warning banner in widget** | When `hipaaEnabled`, widget renders a yellow banner: "Do not include patient names, dates of birth, SSNs, medical record numbers, or any other protected health information (PHI) in this submission." | `public/widget/snap4knack.js` |
| T-17 | **DLP info types** | Scans for: PERSON_NAME, DATE_OF_BIRTH, US_SOCIAL_SECURITY_NUMBER, PHONE_NUMBER, EMAIL_ADDRESS, MEDICAL_RECORD_NUMBER, US_HEALTHCARE_NPI, STREET_ADDRESS, US_DEA_NUMBER, US_DRIVERS_LICENSE_NUMBER, PASSPORT, CREDIT_CARD_NUMBER, IP_ADDRESS, IBAN_CODE, US_BANK_ROUTING_MICR + custom RE2 regexes for phone/SSN/MRN | `functions/src/index.ts` L25–79 |
| T-18 | **Fail-closed DLP** | Both `dlpRedactText` and `dlpRedactImage` throw on error rather than returning unredacted content — snap submission fails rather than storing raw PHI | `functions/src/index.ts` L106, L194 |
| T-19 | **Firestore role-based access** | Firestore rules enforce: admin can read all, tenant can read own, clients only see plugins they are granted access to, widget tokens scoped to specific tenant+plugin | `firestore.rules` |
| T-20 | **HTML encoding in emails** | All user-supplied strings are HTML-encoded via `he()` before embedding in email bodies | `functions/src/index.ts` L218–225 |
| T-21 | **Immutable audit archive — locked Cloud Storage bucket** | `onAuditLogCreated` Firestore trigger mirrors every `audit_log` document to `gs://snap4knack2-audit-archive/audit_archive/YYYY/MM/DD/{logId}.json` immediately on creation. The bucket has a **permanently LOCKED 7-year (2,555-day) retention policy** — no object can be deleted or shortened by any actor, including administrators. Files are written once (`ifGenerationMatch: 0`). This is the tamper-evident record that survives even if the Firestore collection is wiped. | `functions/src/index.ts` `onAuditLogCreated`; GCS bucket `snap4knack2-audit-archive` |

---

## ❌ Missing / Gaps — Action Required

### Critical

| # | Gap | HIPAA Rule | Risk | Recommended Fix |
|---|-----|-----------|------|-----------------|
| **G-01** | ~~**No BAA with SendGrid**~~ **✅ Resolved** | § 164.308(b)(1) | **RESOLVED** — BAA is handled via an external system outside this codebase. | — |
| **G-02** | ~~**Application-level audit log — partial**~~ **✅ Resolved** | § 164.312(b) — Audit controls | **RESOLVED** — Comprehensive audit trail covers all ePHI lifecycle events, written to the `audit_log` Firestore collection and mirrored to a locked immutable Cloud Storage archive (T-21): **snap_created** (server-side, every HIPAA submission via `submitSnap`); **snap_viewed** (client-side, tenant + client portal on page mount); **snap_comment_created** (server-side, `onCommentCreated`); **snap_status_changed** and **snap_priority_changed** (client-side, both tenant and client portals); **snap_purged** (server-side, nightly purge function after delete); **dlp_scan_completed** (server-side, every HIPAA comment scan, records flagged: true/false without re-logging PHI). Firestore rules: `allow create if actorUid == caller`, `allow read if isAdmin()`, `allow update/delete: if false`. Admin-only viewer at `/audit-log` with event-type filters, date range, actor role filter, and CSV export. | — |
| **G-03** | ~~**Screen recordings not DLP-scanned**~~ **✅ Resolved** | § 164.312(a)(2)(iv) | **RESOLVED** — Screen recording is disabled when a plugin has `hipaaEnabled: true`. No recordings are stored for HIPAA plugins. | — |
| **G-04** | ~~**No formal Risk Assessment document**~~ **✅ Resolved** | § 164.308(a)(1)(ii)(A) — Risk analysis | **RESOLVED** — Formal risk assessment documented in `RISK_ASSESSMENT.md`. Covers 12 threat scenarios with likelihood/impact ratings, current controls, residual risk, and remediation roadmap. Review annually. | — |
| **G-05** | ~~**No formal Incident Response / Breach Notification plan**~~ **✅ Resolved** | § 164.308(a)(6) — Security Incident Procedures; § 164.400–414 — Breach Notification Rule | **RESOLVED** — Full plan documented in `INCIDENT_RESPONSE_PLAN.md`. Covers incident classification (P1–P4), response team roles, containment procedures, HIPAA breach determination (4-factor test), HHS notification obligations, breach log template, post-incident review process, and customer notification template. | — |

### High

| # | Gap | HIPAA Rule | Risk | Recommended Fix |
|---|-----|-----------|------|-----------------|
| **G-06** | **No MFA enforcement for tenant accounts** | § 164.312(d) — Person or entity authentication | **MEDIUM-HIGH** — Tenant accounts protect HIPAA snap dashboards. Email/password alone is a single factor. | Enforce MFA via Firebase Auth's multi-factor authentication (TOTP or SMS) for tenants with HIPAA-enabled plugins. At minimum, surface a warning in the Snap Plugin Details page prompting HIPAA tenants to enable MFA. |
| **G-07** | **Annotation shape data not DLP-scanned** | § 164.312(a)(2)(iv) | **MEDIUM** — Users can draw freeform text annotations on screenshots (`annotationData.shapes` with `tool: 'text'`). This string data is stored in Firestore but is never DLP-scanned. | In `submitSnap`, when `hipaaEnabled`, iterate `annotationData.shapes` and DLP-scrub any `shape.text` strings before writing to Firestore. |
| **G-08** | **No workforce training documentation** | § 164.308(a)(5) — Security Awareness and Training | **MEDIUM** — HIPAA requires documented security awareness training for all workforce members. | Document training program and maintain training records. Out of scope for the codebase itself, but required at the organizational level. |
| **G-09** | **BAA process for customers — partial** | § 164.308(b)(1) | **LOW-MEDIUM** — The published Terms of Service (March 9, 2026) now explicitly requires covered entities to contact Fine Mountain Consulting LLC at `info@finemountainconsulting.com` to execute a BAA before enabling HIPAA Mode. This satisfies the disclosure obligation. **Still missing:** an in-app BAA request flow and a `baaAcceptedAt` field on the tenant record to programmatically gate HIPAA Mode activation. | Add a "Request BAA" button in HIPAA plugin settings that triggers an email/CRM workflow. Store BAA acceptance status in `tenants/{tenantId}` document and require it before `hipaaEnabled` can be set to `true`. |
| **G-10** | **Legacy storage path `snaps/{pluginId}/{submissionId}/` has permissive rules** | § 164.312(a)(1) — Access Control | **MEDIUM** — The legacy path allows any authenticated user to read/delete, not just the owning tenant. | Tighten the legacy rule to require tenant ownership, or migrate all remaining data to the new paths and remove the legacy rule. |

### Medium

| # | Gap | HIPAA Rule | Risk | Recommended Fix |
|---|-----|-----------|------|-----------------|
| **G-11** | **No session inactivity timeout in the frontend** | § 164.312(a)(2)(iii) — Automatic logoff | **LOW-MEDIUM** — Firebase tokens expire after 1 hour, but the SPA doesn't force a re-auth prompt on inactivity. A HIPAA dashboard left open on a shared workstation poses risk. | Implement a client-side idle timer (e.g., 15–30 min) that calls `auth.signOut()` and redirects to login. |
| **G-12** | **No backup / disaster recovery documentation** | § 164.308(a)(7) — Contingency Plan | **LOW** — Firebase/GCP provides automated geo-redundant storage, but there is no documented RTO/RPO, backup schedule, or restore procedure. | Document the GCP-provided backup capabilities (Firestore PITR, Cloud Storage versioning) and define RTO/RPO targets. Enable Firestore PITR (Point-in-Time Recovery) in the Firebase console if not already on. |
| **G-13** | **`storeKnackApiKey` does not log PHI-adjacent key accesses** | § 164.312(b) — Audit controls | **LOW** — Knack API key storage/retrieval is not audit-logged at the application level. | Log key access events to the audit log (G-02 resolution covers this if implemented broadly). |

---

## ⚪ Out of Scope / Handled Externally

| Item | Notes |
|------|-------|
| **GCP HIPAA BAA** | Google Cloud Platform (Firebase, Firestore, Cloud Storage, Cloud Functions, Cloud DLP, Secret Manager) is covered under Google's HIPAA BAA. Must be executed in Google Cloud Console under your account before going live with HIPAA data. |
| **Physical safeguards** | § 164.310 — Facility access, workstation use, device controls. Fully owned by the covered entity (your customers) and Fine Mountain Consulting as the BA. GCP data centers are SOC 2 / ISO 27001 certified. |
| **Patient rights** | HIPAA Privacy Rule (§ 164.500+) — access, amendment, accounting of disclosures. Snap4Knack is a workflow tool for internal support teams; it does not hold the medical record. The covered entity's primary EHR/system of record handles patient rights. |
| **HIPAA Privacy Officer appointment** | Administrative requirement for the covered entity and the BA organization — not a code concern. |
| **Workforce sanctions policy** | Administrative safeguard — internal HR/legal matter. |

---

## Full HIPAA Safeguard Checklist

### Administrative Safeguards (§ 164.308)

- [x] Security Management Process — risk management controls implemented (DLP, retention, access controls)
- [x] **Risk Analysis documented** — ✅ G-04 resolved (`RISK_ASSESSMENT.md`)
- [x] **Risk Management Plan documented** — ✅ G-04 resolved (`RISK_ASSESSMENT.md`)
- [x] Assigned Security Responsibility — engineering owns technical controls
- [x] Workforce Access Management — role-based access (admin/tenant/client/widget)
- [x] **Information Access Management — BAA with SendGrid** — ✅ G-01 resolved (external)
- [ ] **Security Awareness Training documentation** — ❌ G-08
- [x] **Security Incident Response procedures documented** — ✅ G-05 resolved (`INCIDENT_RESPONSE_PLAN.md`)
- [x] Contingency Plan — GCP automated backups, nightly purge function
- [ ] **Contingency Plan documented (RTO/RPO)** — ❌ G-12
- [x] Evaluation — This document serves as the periodic evaluation artifact
- [x] **Customer BAA process — partial** (TOS requires BAA contact; in-app gate still needed) — ⚠️ G-09

### Technical Safeguards (§ 164.312)

- [x] Unique user identification (Firebase Auth uid, widget custom tokens)
- [x] Emergency access procedure (admin role bypass)
- [x] Automatic logoff (Firebase Auth 1-hour token expiry)
- [ ] **MFA enforcement for HIPAA tenant accounts** — ❌ G-06
- [ ] **Frontend idle session timeout** — ❌ G-11
- [x] Audit controls — GCP Cloud Audit Logs at infrastructure level
- [x] **Application-level audit log** — ✅ G-02 resolved (snap_created, snap_viewed, snap_comment_created, snap_status_changed, snap_priority_changed, snap_purged, dlp_scan_completed — all written to `audit_log` + mirrored to locked Storage archive)
- [x] Integrity controls — Firestore atomic writes, DLP fail-closed
- [x] Person authentication — Firebase Auth email/password
- [x] Transmission security — HTTPS/TLS enforced by Firebase Hosting and Cloud Functions
- [x] Encryption at rest — GCP AES-256
- [x] PHI image redaction — DLP OCR + sharp compositing
- [x] PHI text scrubbing — DLP deidentifyContent on description + comments
- [ ] **PHI text scrubbing — annotation shape text** — ❌ G-07
- [x] **Immutable audit archive** — ✅ T-21 (`gs://snap4knack2-audit-archive`, locked 7-year retention policy, cannot be shortened or deleted by any actor)
- [x] **Screen recording redaction or disable** — ✅ G-03 resolved (recording disabled in HIPAA mode)
- [x] Query-string stripping from page URLs
- [x] Console log capture disabled for HIPAA plugins
- [x] Private staging bucket (write-only client-side)
- [x] Tenant-scoped storage access rules
- [x] Sanitized email notifications (no PHI in transit to SendGrid)
- [x] 7-year retention enforced (2,555 days)
- [x] Automated purge after retention window expires
- [ ] **Legacy storage path access controls tightened** — ❌ G-10

### Physical Safeguards (§ 164.310)

- [x] Facility access controls — GCP data centers (Google responsibility under shared model)
- [x] Workstation use policy — covered entity responsibility
- [x] Device and media controls — GCP handles storage device disposal

---

## Priority Order for Remediation

| Priority | Item | Effort | Status |
|----------|------|--------|--------|
| ✅ — | **G-01** — SendGrid BAA | — | Resolved (external) |
| ✅ — | **G-03** — Disable screen recording for HIPAA plugins | — | Resolved |
| ✅ — | **G-04** — Document Risk Assessment | — | Resolved (`RISK_ASSESSMENT.md`) |
| ✅ — | **G-05** — Document Incident Response / Breach Notification Plan | — | Resolved (`INCIDENT_RESPONSE_PLAN.md`) |
| 🔴 1 | **G-06** — MFA enforcement / prompt for HIPAA tenants | Medium (Firebase MFA or in-app warning) | Open |
| ✅ — | **G-02** — Full audit trail (snap_created/viewed/commented/status/priority/purged/dlp) + locked Storage archive (T-21) | — | Resolved |
| 🟠 3 | **G-09** — In-app BAA gate (`baaAcceptedAt` on tenant + UI flow) | Medium (UI + email trigger) | Partial (TOS discloses requirement) |
| 🟡 4 | **G-07** — DLP scan annotation shape text | Low (add loop in submitSnap) | Open |
| 🟡 5 | **G-10** — Tighten legacy storage path rules | Low (1-line storage rule change) | Open |
| 🟡 6 | **G-11** — Frontend idle session timeout | Low–Medium (idle timer component) | Open |
| 🟢 7 | **G-08** — Workforce training documentation | Low (internal doc) | Open |
| 🟢 8 | **G-12** — Backup / DR documentation + enable Firestore PITR | Low | Open |
| 🟢 9 | **G-13** — Audit log for API key access | Low (extends G-02) | Open |

---

## Notes

- **GCP HIPAA BAA must be active** in your Google Cloud Console account before any live PHI enters the system. This is a contractual prerequisite — confirm it is signed.
- The **SendGrid BAA (G-01)** is the single highest-risk gap from a legal standpoint because it is a direct statutory requirement under § 164.308(b)(1), independent of whether PHI actually reaches SendGrid.
- Items G-04, G-05, G-08, G-12 are **administrative/documentation** items — no code changes — but are equally auditable and required for HIPAA compliance programs.
- The **HIPAA-compliant** designation on the marketing page (`/hipaa`) is accurate for the technical controls that are implemented, but should be paired with clear language that customers must execute their own BAA with Fine Mountain Consulting and ensure their own HIPAA program requirements are met.
