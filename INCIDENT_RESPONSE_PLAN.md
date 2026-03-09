# Incident Response & Breach Notification Plan — Snap4Knack2

**Version:** 1.0  
**Effective date:** March 9, 2026  
**Owner:** Fine Mountain Consulting LLC — Engineering / Security  
**Review cycle:** Annual, or within 30 days of a material change to the platform  
**Classification:** Internal — Do Not Distribute

---

## 1. Purpose and Scope

This plan defines the procedures Fine Mountain Consulting LLC ("FMC") follows when a security incident is detected that may affect Snap4Knack2 and its customer data. It covers:

- All environments operated by FMC (Firebase Hosting, Firestore, Cloud Storage, Cloud Functions, Cloud DLP, Secret Manager, SendGrid)
- All tenant data, including Protected Health Information (PHI) processed on behalf of HIPAA-covered customers
- All personnel with access to production systems

This plan satisfies the HIPAA Security Rule requirement at § 164.308(a)(6) — Security Incident Procedures, and the Breach Notification Rule at § 164.400–414.

---

## 2. Definitions

| Term | Definition |
|------|------------|
| **Security Incident** | Any attempted or actual unauthorized access, use, disclosure, modification, or destruction of information or systems |
| **Breach** | Under HIPAA § 164.402 — an impermissible use or disclosure of PHI that compromises the security or privacy of PHI, unless the covered entity/BA demonstrates an exception applies |
| **PHI** | Protected Health Information — individually identifiable health information stored or transmitted in any form |
| **Covered Entity (CE)** | A Snap4Knack2 tenant who is a healthcare provider, health plan, or healthcare clearinghouse |
| **Business Associate (BA)** | Fine Mountain Consulting LLC, acting as a BA when processing PHI on behalf of a CE |
| **RTO** | Recovery Time Objective — the maximum acceptable system downtime |
| **RPO** | Recovery Point Objective — the maximum acceptable data loss window |

---

## 3. Incident Severity Classification

| Level | Name | Criteria | Response SLA |
|-------|------|----------|--------------|
| **P1** | Critical | Confirmed unauthorized access to PHI; ransomware or data exfiltration; production Firestore or Storage database compromised; privileged credential (Secret Manager) exposed | Immediate — within 1 hour |
| **P2** | High | Suspected PHI exposure pending investigation; Cloud Function or DLP pipeline compromised; authentication bypass; sustained brute-force of tenant accounts | Within 4 hours |
| **P3** | Medium | Unauthorized access to non-PHI tenant data; widget token misuse; anomalous API usage patterns; single-account compromise with no PHI exposure confirmed | Within 24 hours |
| **P4** | Low | Failed intrusion attempts, port scans, routine abuse of contact forms | Within 72 hours; log and monitor |

---

## 4. Response Team

| Role | Responsibility | Contact |
|------|---------------|---------|
| **Incident Commander** | Overall coordination, external communications, HHS notification decisions | Primary engineering lead |
| **Technical Lead** | Forensic analysis, containment, remediation | Senior developer |
| **Privacy/Legal** | HIPAA breach determination, patient notification, regulatory filings | Legal counsel / Privacy Officer |
| **Customer Communication** | Tenant notification drafts, support escalations | Account management |

For a P1 incident, all four roles must be engaged within 1 hour. For P2 and below, the Incident Commander may manage coordination.

---

## 5. Incident Detection Sources

Monitor the following for anomalous activity:

| Source | What to Watch |
|--------|--------------|
| **GCP Cloud Audit Logs** | Unusual `storage.objects.get` spikes, bulk Firestore reads across tenants, Secret Manager access outside normal deploy windows |
| **Firebase Authentication logs** | Multiple failed sign-ins, new admin-role grants, sign-ins from unexpected geographies |
| **Cloud Functions logs** | DLP errors (fail-closed events), `issueWidgetToken` calls with unknown `tenantId`/`pluginId`, unusual request volumes |
| **Firestore security rule denials** | Sustained access-denied patterns on HIPAA tenant collections |
| **SendGrid activity feed** | Unexpected spike in outbound email volume; unrecognized recipient domains |
| **Customer reports** | Tenant reports unexpected data visible in their portal; client reports seeing another tenant's data |
| **Dependency alerts** | GitHub Dependabot / npm audit alerts for critical CVEs in `package.json` or `functions/package.json` |

---

## 6. Response Procedures

### 6.1 Identification and Triage (all severities)

1. Document the initial report: date/time, reporter, description, affected systems
2. Assign severity level (Section 3)
3. Open a dedicated, non-public incident tracking record (internal ticket or shared doc)
4. Engage the response team appropriate to severity
5. Do **not** use regular communication channels (Slack, email) for forensic details — use an out-of-band channel

### 6.2 Containment

**Immediate containment options (P1/P2):**

| Action | How |
|--------|-----|
| Disable a compromised tenant account | Firebase Console → Authentication → disable user |
| Revoke all widget tokens for a plugin | Update `pluginSecret` field in `plugins/{pluginId}` — all outstanding tokens become invalid immediately (token signed with `pluginSecret`) |
| Disable a Cloud Function | GCP Console → Cloud Functions → set min/max instances to 0, or deny all incoming traffic via IAM |
| Rotate a compromised secret | GCP Secret Manager → add new version → update function environment reference → redeploy |
| Enable GCP VPC firewall rules to block suspicious IPs | GCP Console → VPC Network → Firewall |
| Suspend all outbound email | SendGrid dashboard → pause sending |
| Revoke GCP service account key | GCP IAM → Service Accounts → revoke/delete compromised key |

**Do not** delete logs, audit trails, or Firestore collections prior to forensic review.

### 6.3 Eradication

1. Identify and remove the root cause (malicious code, leaked credential, misconfigured rule)
2. Patch or update affected dependencies
3. Review and tighten Firestore and Storage security rules if a misconfiguration contributed
4. Rotate all secrets that may have been in scope, even if not confirmed compromised
5. Re-run `npx tsc --noEmit` and `npm run build` to confirm no malicious code changes remain

### 6.4 Recovery

1. Restore service to the last known good state
2. For data loss: Firestore Point-in-Time Recovery (PITR) can restore to any point within the last 7 days — initiate via GCP Console
3. For Storage file loss: Cloud Storage versioning provides previous object versions
4. Re-enable suspended services in reverse order (Functions → Authentication → Hosting)
5. Monitor closely for 48 hours post-recovery
6. Validate DLP pipeline is functioning by submitting a test snap through a HIPAA plugin

**RTO target:** 4 hours for HIPAA-enabled tenants; 24 hours for standard tenants  
**RPO target:** 24 hours (Firestore PITR provides up to 7-day lookback)

---

## 7. HIPAA Breach Determination

For any incident involving PHI, perform the four-factor risk assessment required by § 164.402(2) to determine whether a reportable "breach" has occurred:

| Factor | Questions to Assess |
|--------|-------------------|
| **1. Nature and extent of PHI involved** | What types of PHI (demographics, diagnoses, financial)? How many individuals? |
| **2. Who accessed or could have accessed the PHI** | External attacker? Insider? Another tenant? Unknown? |
| **3. Whether PHI was actually acquired or viewed** | Do logs confirm access? Is exfiltration confirmed (e.g., egress traffic spike)? |
| **4. Extent to which risk has been mitigated** | Were credentials immediately rotated? Was the attacker's access window limited? |

**Exceptions to breach (§ 164.402(1)) — document if any apply:**
- The PHI was unintentionally accessed by a workforce member acting in good faith and within their scope of authority, and the information was not further used or disclosed
- The inadvertent disclosure was between two authorized persons within the same organization
- FMC has a good-faith belief that the unauthorized recipient could not have retained the information

If **no exception** applies, treat as a reportable breach and proceed to Section 8.

Document the breach determination with supporting evidence and rationale in the incident record. The Privacy Officer must sign off.

---

## 8. Breach Notification Obligations

### 8.1 Notification to the Covered Entity (Customer)

- **Timeline:** Within **10 business days** of completing the breach determination (to give the CE time to meet their 60-day HHS deadline)
- **Method:** Written notice to the tenant's primary account email and any designated privacy contact
- **Required content (per § 164.410):**
  - Brief description of the breach (date, date of discovery)
  - Description of the PHI involved (types, not content)
  - Steps individuals should take to protect themselves
  - What FMC is doing to investigate, mitigate, and prevent future incidents
  - Contact information for questions: `info@finemountainconsulting.com`

Use the template in Appendix A.

### 8.2 Notification to HHS (by the Covered Entity)

- The Covered Entity — not FMC — files with HHS
- FMC must cooperate fully with the CE's HHS notification process
- For breaches affecting **≥ 500 individuals**: HHS must be notified within 60 days of discovering the breach (CE obligation)
- For breaches affecting **< 500 individuals**: CE may maintain a breach log and submit annually to HHS (by March 1 of the following calendar year)
- FMC must provide the CE with all information needed for the HHS submission within the 10-business-day window above

### 8.3 Media Notification

If a breach affects ≥ 500 residents of a single U.S. state, the **Covered Entity** is required to notify prominent media outlets in that state. Coordinate with the CE if this threshold is reached.

---

## 9. Post-Incident Review

Within **2 weeks** of closing a P1 or P2 incident, conduct a post-mortem:

1. What happened (timeline of events)
2. Root cause analysis
3. Was detection timely? What would have caught it sooner?
4. Were containment actions effective?
5. What process or technical controls would prevent recurrence?
6. Action items with owners and due dates
7. Update this plan and the Risk Assessment if new threat scenarios were uncovered

---

## 10. Breach Log

All incidents, including those determined **not** to be breaches after assessment, must be logged:

| Field | Description |
|-------|-------------|
| Incident ID | Sequential (INC-001, INC-002, …) |
| Date discovered | |
| Date of breach (if known) | |
| Date determination made | |
| Description | |
| PHI types involved | |
| Estimated individuals affected | |
| Breach determination (Yes / No / Undetermined) | |
| Exception applied (if No) | |
| CE notified | Date |
| HHS filed by CE | Date (for FMC records) |
| Resolution | |
| Post-mortem completed | Yes / No |

Maintain this log in a private, access-controlled location. Retain for **6 years** per § 164.530(j).

---

## Appendix A — Breach Notification Template (FMC → Customer)

> **Subject:** Security Incident Notification — Snap4Knack2
>
> Dear [Tenant Name],
>
> We are writing to inform you of a security incident involving Snap4Knack2 that may have affected Protected Health Information (PHI) submitted through your account.
>
> **What happened:** [Brief factual description — e.g., "On [date], we discovered that an unauthorized party briefly gained read access to the `snap_submissions` collection for your tenant."]  
>
> **When it happened:** The incident occurred on approximately [date]. We became aware of it on [date].
>
> **Information involved:** The following types of PHI may have been accessed: [list types — e.g., names, dates of service, descriptions]. The estimated number of individuals affected is [n].
>
> **What we have done:** [Describe containment actions — e.g., "We immediately revoked the compromised credential, rotated all affected secrets, and confirmed no further unauthorized access occurred."]
>
> **What you should do:** [Guidance relevant to the breach — e.g., "We recommend reviewing your HHS breach notification obligations. Please contact us if you need assistance."]
>
> For questions, please contact us at **info@finemountainconsulting.com**.
>
> Sincerely,  
> Fine Mountain Consulting LLC
