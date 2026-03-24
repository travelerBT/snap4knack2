import * as functions from "firebase-functions/v2";
import sharp from "sharp";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import * as admin from "firebase-admin";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { DlpServiceClient, protos as dlpProtos } from "@google-cloud/dlp";
import sgMail from "@sendgrid/mail";
import axios from "axios";
import { randomUUID } from "crypto";
import { snapNotificationEmail, criticalSnapEmail, clientInvitationEmail, commentNotificationEmail, submitterStatusUpdateEmail, newTenantWelcomeEmail, sharedFeedEmail } from "./emailTemplates";

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const secretClient = new SecretManagerServiceClient();
const dlpClient = new DlpServiceClient();

const PROJECT_ID = "snap4knack2";
const STORAGE_BUCKET = "snap4knack2.firebasestorage.app";
// Dedicated bucket with a LOCKED 7-year retention policy for the HIPAA audit archive.
// Nothing written here can be deleted or shortened — enforced at the GCS level.
const AUDIT_ARCHIVE_BUCKET = "snap4knack2-audit-archive";
const APP_DOMAIN = "https://snap4knack.com";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM = "info@finemountainconsulting.com";

// gRPC status code 6 = ALREADY_EXISTS (used when creating Secret Manager secrets)
const SECRET_ALREADY_EXISTS = 6;

// HIPAA infoTypes scanned in both text and images.
// IMPORTANT: every built-in type referenced in DLP_REPLACEMENTS below MUST appear here —
// Google DLP rejects deidentifyContent calls where a deidentifyConfig type is absent from inspectConfig.
const HIPAA_INFO_TYPES: dlpProtos.google.privacy.dlp.v2.IInfoType[] = [
  { name: "PERSON_NAME" },
  { name: "DATE_OF_BIRTH" },
  { name: "US_SOCIAL_SECURITY_NUMBER" },
  { name: "PHONE_NUMBER" },
  { name: "EMAIL_ADDRESS" },
  { name: "MEDICAL_RECORD_NUMBER" },
  { name: "US_HEALTHCARE_NPI" },
  { name: "STREET_ADDRESS" },
  { name: "US_DEA_NUMBER" },
  { name: "US_DRIVERS_LICENSE_NUMBER" },
  { name: "PASSPORT" },
  { name: "US_BANK_ROUTING_MICR" },
  { name: "IBAN_CODE" },
  { name: "CREDIT_CARD_NUMBER" },
  { name: "IP_ADDRESS" },
];

// Custom regex info types — belt-and-suspenders for common PHI formats that DLP
// may score below threshold when appearing in isolation (no surrounding context).
// Note: Google DLP regex engine uses RE2 — no lookaheads/lookbehinds.
const HIPAA_CUSTOM_INFO_TYPES: dlpProtos.google.privacy.dlp.v2.ICustomInfoType[] = [
  {
    // US phone numbers: (NNN) NNN-NNNN, NNN-NNN-NNNN, NNN.NNN.NNNN, NNN NNN NNNN
    infoType: { name: "PHONE_NUMBER_REDACTED" },
    likelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.VERY_LIKELY,
    regex: { pattern: "(\\([0-9]{3}\\)[ .-]?[0-9]{3}[.-][0-9]{4}|[0-9]{3}[ .-][0-9]{3}[ .-][0-9]{4})" },
  },
  {
    // US SSN with separators: NNN-NN-NNNN or NNN NN NNNN
    infoType: { name: "SSN_REDACTED" },
    likelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.VERY_LIKELY,
    regex: { pattern: "[0-9]{3}[-. ][0-9]{2}[-. ][0-9]{4}" },
  },
];

// Per-type replacement labels — maps each info type to a human-friendly redaction token
const DLP_REPLACEMENTS: Array<{ infoTypes: { name: string }[]; label: string }> = [
  { infoTypes: [{ name: "PHONE_NUMBER" }, { name: "PHONE_NUMBER_REDACTED" }],          label: "[PHONE_REDACTED]" },
  { infoTypes: [{ name: "US_SOCIAL_SECURITY_NUMBER" }, { name: "SSN_REDACTED" }],      label: "[SSN_REDACTED]" },
  { infoTypes: [{ name: "EMAIL_ADDRESS" }],                                             label: "[EMAIL_REDACTED]" },
  { infoTypes: [{ name: "PERSON_NAME" }],                                               label: "[NAME_REDACTED]" },
  { infoTypes: [{ name: "DATE_OF_BIRTH" }],                                             label: "[DOB_REDACTED]" },
  { infoTypes: [{ name: "STREET_ADDRESS" }],                                            label: "[ADDRESS_REDACTED]" },
  { infoTypes: [{ name: "MEDICAL_RECORD_NUMBER" }],                                     label: "[MRN_REDACTED]" },
  { infoTypes: [{ name: "US_HEALTHCARE_NPI" }],                                         label: "[NPI_REDACTED]" },
  { infoTypes: [{ name: "US_DEA_NUMBER" }],                                             label: "[DEA_REDACTED]" },
  { infoTypes: [{ name: "US_DRIVERS_LICENSE_NUMBER" }],                                 label: "[LICENSE_REDACTED]" },
  { infoTypes: [{ name: "PASSPORT" }],                                                  label: "[PASSPORT_REDACTED]" },
  { infoTypes: [{ name: "US_BANK_ROUTING_MICR" }, { name: "IBAN_CODE" }],              label: "[BANK_REDACTED]" },
  { infoTypes: [{ name: "CREDIT_CARD_NUMBER" }],                                        label: "[CARD_REDACTED]" },
  { infoTypes: [{ name: "IP_ADDRESS" }],                                                label: "[IP_REDACTED]" },
];

/** DLP text redaction — replaces PHI tokens inline with [TYPE] placeholders */
async function dlpRedactText(text: string): Promise<string> {
  if (!text || text.length < 3) return text;
  try {
    const [response] = await dlpClient.deidentifyContent({
      parent: `projects/${PROJECT_ID}/locations/global`,
      inspectConfig: {
        infoTypes: HIPAA_INFO_TYPES,
        customInfoTypes: HIPAA_CUSTOM_INFO_TYPES,
        minLikelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.POSSIBLE,
      },
      deidentifyConfig: {
        infoTypeTransformations: {
          transformations: DLP_REPLACEMENTS.map(({ infoTypes, label }) => ({
            infoTypes,
            primitiveTransformation: { replaceConfig: { newValue: { stringValue: label } } },
          })),
        },
      },
      item: { value: text },
    });
    return response.item?.value ?? text;
  } catch (e) {
    console.error("[DLP] Text redaction error:", e);
    throw e; // fail-closed: don't store unredacted PHI
  }
}

/**
 * DLP image redaction — two-step:
 * 1. inspectContent to locate PHI bounding boxes via OCR
 * 2. sharp to composite labeled "HIPAA REDACTED" overlays over each region
 * Returns the annotated PNG; throws fail-closed on any error.
 */
async function dlpRedactImage(imageBytes: Buffer): Promise<Buffer> {
  // Remove sharp's default 268MP pixel limit — screenshots can be large on retina displays
  const sharpOpts = { limitInputPixels: false };

  try {
    // Step 1: resize to a safe processing size (max 2400px wide) before sending to DLP.
    const MAX_WIDTH = 2400;
    const origMeta = await sharp(imageBytes, sharpOpts).metadata();
    const origW = origMeta.width ?? 1;
    let workingBuffer = imageBytes;
    let workingW = origW;
    let workingH = origMeta.height ?? 1;
    if (origW > MAX_WIDTH) {
      workingBuffer = await sharp(imageBytes, sharpOpts)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .png()
        .toBuffer();
      const wMeta = await sharp(workingBuffer, sharpOpts).metadata();
      workingW = wMeta.width ?? MAX_WIDTH;
      workingH = wMeta.height ?? workingH;
    }

    // Step 2: DLP inspect to locate PHI bounding boxes via OCR
    // Use IMAGE (auto-detect format) instead of IMAGE_PNG — widget may upload JPEG
    // Use VERY_UNLIKELY to cast the widest possible net on OCR'd text
    const [inspectResponse] = await dlpClient.inspectContent({
      parent: `projects/${PROJECT_ID}/locations/global`,
      inspectConfig: {
        infoTypes: HIPAA_INFO_TYPES,
        customInfoTypes: HIPAA_CUSTOM_INFO_TYPES,
        minLikelihood: dlpProtos.google.privacy.dlp.v2.Likelihood.VERY_UNLIKELY,
        includeQuote: true,
      },
      item: {
        byteItem: {
          type: dlpProtos.google.privacy.dlp.v2.ByteContentItem.BytesType.IMAGE,
          data: workingBuffer,
        },
      },
    });

    const findings = inspectResponse.result?.findings ?? [];
    console.log(`[DLP] Image inspect: ${findings.length} finding(s) — ${findings.map(f => `${f.infoType?.name}(${f.likelihood}):${f.quote ?? "?"}`).join(", ") || "none"}`);
    if (findings.length === 0) return imageBytes; // no PHI — return original (full res)

    // Step 3: composite labeled "HIPAA REDACTED" boxes over each bounding box.
    // NOTE: DLP bounding box coords for image byte items are already in PIXELS — do NOT
    // multiply by image dimensions (that was the bug causing all boxes to be skipped).
    const composites: sharp.OverlayOptions[] = [];
    for (const finding of findings) {
      for (const cl of finding.location?.contentLocations ?? []) {
        for (const box of cl.imageLocation?.boundingBoxes ?? []) {
          // Clamp to image bounds to guard against any off-by-one from DLP
          const x = Math.max(0, box.left   ?? 0);
          const y = Math.max(0, box.top    ?? 0);
          const w = Math.min(Math.max(box.width  ?? 0, 4), workingW - x);
          const h = Math.min(Math.max(box.height ?? 0, 4), workingH - y);
          if (w <= 0 || h <= 0) continue;
          // Font size: fits nicely inside the box, clamped between 7px and 14px
          const fontSize = Math.round(Math.min(Math.max(h * 0.45, 7), 14));
          const labelY = Math.round(h / 2 + fontSize * 0.35);
          const svg = [
            `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">`,
            `  <rect width="${w}" height="${h}" rx="2" fill="#1a1a2e"/>`,
            `  <text x="${Math.round(w / 2)}" y="${labelY}"`,
            `        font-family="monospace" font-size="${fontSize}" font-weight="bold"`,
            `        fill="#f87171" text-anchor="middle">HIPAA REDACTED</text>`,
            `</svg>`,
          ].join("");
          composites.push({ input: Buffer.from(svg), top: y, left: x });
        }
      }
    }

    if (composites.length === 0) return imageBytes;
    return await sharp(workingBuffer, sharpOpts).composite(composites).png().toBuffer();
  } catch (e) {
    console.error("[DLP] Image redaction error:", e);
    throw e; // fail-closed: don't publish unredacted image
  }
}

/** Strip query-string parameters from a URL (removes potential PHI in query params) */
function stripQueryParams(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url.split("?")[0];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** HTML-encode a string before embedding it in an email HTML body (C-01) */
function he(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

async function getSendGridKey(): Promise<string> {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/sendgrid-api-key/versions/latest`,
    });
    return (version.payload?.data?.toString() || SENDGRID_API_KEY).trim();
  } catch {
    return SENDGRID_API_KEY;
  }
}

async function getKnackApiKey(secretName: string): Promise<string> {
  const [version] = await secretClient.accessSecretVersion({ name: secretName });
  return (version.payload?.data?.toString() || "").trim();
}

async function getSlackWebhook(tenantId: string, pluginId: string): Promise<string | null> {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/slack-webhook-${tenantId}-${pluginId}/versions/latest`,
    });
    const url = (version.payload?.data?.toString() || "").trim();
    return url || null;
  } catch {
    return null;
  }
}

// ── storeKnackApiKey ─────────────────────────────────────────────────────────

export const storeKnackApiKey = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const { connectionId, tenantId, apiKey, appId } = request.data as {
      connectionId: string; tenantId: string; apiKey: string; appId: string;
    };
    if (!connectionId || !tenantId || !apiKey || !appId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required fields.");
    }
    if (request.auth.uid !== tenantId) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized.");
    }
    // Validate connectionId format to prevent Secret Manager path injection (pen test 4.5)
    if (!/^[a-zA-Z0-9_-]+$/.test(connectionId)) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid connectionId format.");
    }

    const secretId = `knack-${tenantId}-${connectionId}`;
    const parent = `projects/${PROJECT_ID}`;

    // Create or update secret
    try {
      await secretClient.createSecret({
        parent,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    } catch (e: unknown) {
      const err = e as { code?: number };
      if (err.code !== SECRET_ALREADY_EXISTS) throw e;
    }

    await secretClient.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: { data: Buffer.from(apiKey.trim()) },
    });

    return { secretName: `${parent}/secrets/${secretId}/versions/latest` };
  }
);

// ── saveSlackWebhook ─────────────────────────────────────────────────────────

export const saveSlackWebhook = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const tenantId = request.auth.uid;
    const { pluginId, webhookUrl } = request.data as { pluginId: string; webhookUrl: string };
    if (!pluginId || !webhookUrl) {
      throw new functions.https.HttpsError("invalid-argument", "pluginId and webhookUrl are required.");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(pluginId)) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid pluginId format.");
    }
    if (!webhookUrl.startsWith("https://hooks.slack.com/services/")) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid Slack webhook URL.");
    }
    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    if (!pluginDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Plugin not found.");
    }

    const secretId = `slack-webhook-${tenantId}-${pluginId}`;
    const parent = `projects/${PROJECT_ID}`;
    try {
      await secretClient.createSecret({
        parent,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    } catch (e: unknown) {
      const err = e as { code?: number };
      if (err.code !== SECRET_ALREADY_EXISTS) throw e;
    }
    await secretClient.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: { data: Buffer.from(webhookUrl.trim()) },
    });
    await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).update({
      "snapSettings.slackEnabled": true,
    });
    return { success: true };
  }
);

// ── removeSlackWebhook ───────────────────────────────────────────────────────

export const removeSlackWebhook = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const tenantId = request.auth.uid;
    const { pluginId } = request.data as { pluginId: string };
    if (!pluginId) {
      throw new functions.https.HttpsError("invalid-argument", "pluginId is required.");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(pluginId)) {
      throw new functions.https.HttpsError("invalid-argument", "Invalid pluginId format.");
    }
    const secretName = `projects/${PROJECT_ID}/secrets/slack-webhook-${tenantId}-${pluginId}`;
    try {
      const [versions] = await secretClient.listSecretVersions({ parent: secretName });
      await Promise.all(
        versions
          .filter((v) => v.state === "ENABLED")
          .map((v) => secretClient.disableSecretVersion({ name: v.name! }))
      );
    } catch {
      // Secret may not exist — treat as already removed
    }
    await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).update({
      "snapSettings.slackEnabled": false,
    });
    return { success: true };
  }
);

// ── fetchKnackRoles ──────────────────────────────────────────────────────────

export const fetchKnackRoles = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const { appId, secretName } = request.data as { appId: string; secretName: string };
    if (!appId || !secretName) {
      throw new functions.https.HttpsError("invalid-argument", "Missing appId or secretName.");
    }
    // Verify the caller owns the secret — prevents cross-tenant API key theft (pen test 4.4 / new IDOR finding)
    const expectedSecretPrefix = `projects/${PROJECT_ID}/secrets/knack-${request.auth.uid}-`;
    if (!secretName.startsWith(expectedSecretPrefix)) {
      throw new functions.https.HttpsError("permission-denied", "Secret not authorized for this account.");
    }

    const apiKey = await getKnackApiKey(secretName);

    // Fetch all objects (fields are NOT included in this response)
    const res = await axios.get(`https://api.knack.com/v1/objects`, {
      headers: { "X-Knack-Application-Id": appId, "X-Knack-REST-API-Key": apiKey },
    });

    const rawObjects: Array<{ key: string; name: string }> = res.data.objects || [];

    // Fetch fields for every object — /v1/objects doesn't include them
    const withFields = await Promise.all(
      rawObjects.map(async (obj) => {
        try {
          const fRes = await axios.get(`https://api.knack.com/v1/objects/${obj.key}/fields`, {
            headers: { "X-Knack-Application-Id": appId, "X-Knack-REST-API-Key": apiKey },
          });
          return { ...obj, fields: (fRes.data.fields || []) as Array<{ type: string }> };
        } catch {
          return { ...obj, fields: [] as Array<{ type: string }> };
        }
      })
    );

    // Role tables have a 'password' type field
    const roles = withFields
      .filter((obj) => obj.fields.some((f) => f.type === "password"))
      .map((obj) => ({ key: obj.key, name: obj.name }));

    const objects = rawObjects.map((obj) => ({ key: obj.key, name: obj.name }));
    // Fetch app name
    let appName = "";
    try {
      const appRes = await axios.get(`https://api.knack.com/v1/application`, {
        headers: { "X-Knack-Application-Id": appId, "X-Knack-REST-API-Key": apiKey },
      });
      appName = appRes.data?.application?.name || appRes.data?.name || "";
    } catch {
      // optional — not a fatal error
    }

    return { roles, objects, appName };
  }
);

// ── inviteClient ─────────────────────────────────────────────────────────────

export const inviteClient = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const tenantId = request.auth.uid;
    const { email, pluginIds } = request.data as { email: string; pluginIds: string[] };
    if (!email || !pluginIds?.length) {
      throw new functions.https.HttpsError("invalid-argument", "email and pluginIds are required.");
    }

    // Create invitation doc first — this always succeeds regardless of email
    const token = randomUUID().replace(/-/g, "");

    const invRef = await db.collection("client_invitations").add({
      email,
      tenantId,
      pluginIds,
      invitedBy: tenantId,
      token,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const inviteUrl = `${APP_DOMAIN}/accept-invite?token=${token}&id=${invRef.id}`;

    // Get tenant info for email
    const tenantDoc = await db.collection("tenants").doc(tenantId).get();
    const tenantName = tenantDoc.data()?.name || tenantDoc.data()?.companyName || "Your Team";

    // Send invite email — non-fatal: invitation is created regardless
    let emailSent = false;
    let emailError = "";
    const key = await getSendGridKey();
    if (key) {
      try {
        sgMail.setApiKey(key);
        const mailOpts = clientInvitationEmail({
          recipientEmail: email,
          tenantName,
          inviteUrl,
        });
        await sgMail.send({ from: SENDGRID_FROM, ...mailOpts });
        emailSent = true;
      } catch (err: unknown) {
        // Log the full SendGrid error details for debugging
        const sgErr = err as { code?: number; response?: { body?: unknown } };
        console.error("SendGrid error:", JSON.stringify({
          code: sgErr.code,
          body: sgErr.response?.body,
        }));
        emailError = sgErr.code === 403
          ? "Email sender not verified in SendGrid. Invitation created — share the invite link manually."
          : `Email send failed (code ${sgErr.code}). Invitation created.`;
      }
    } else {
      emailError = "SendGrid key not configured. Invitation created — share the invite link manually.";
    }

    return { invitationId: invRef.id, inviteUrl, emailSent, emailError };
  }
);

// ── acceptInvitation ─────────────────────────────────────────────────────────

export const acceptInvitation = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const { token, invitationId } = request.data as { token: string; invitationId: string };

    const invDoc = await db.collection("client_invitations").doc(invitationId).get();
    if (!invDoc.exists) throw new functions.https.HttpsError("not-found", "Invitation not found.");
    const inv = invDoc.data()!;
    if (inv.token !== token) throw new functions.https.HttpsError("invalid-argument", "Invalid token.");
    if (inv.status !== "pending") throw new functions.https.HttpsError("already-exists", "Invitation already used.");
    if (inv.expiresAt.toDate() < new Date()) throw new functions.https.HttpsError("deadline-exceeded", "Invitation expired.");

    // Verify the authenticated user's email matches the invitation
    const userEmail = request.auth.token.email || "";
    if (inv.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new functions.https.HttpsError("permission-denied", "Your email does not match this invitation.");
    }

    const uid = request.auth.uid;

    // Grant client access
    await auth.setCustomUserClaims(uid, { role: "client" });

    // Update user doc with plugin access
    const userRef = db.collection("users").doc(uid);
    await userRef.set(
      {
        role: "client",
        roles: ["client"],
        tenantId: inv.tenantId,
        clientAccess: admin.firestore.FieldValue.arrayUnion(...inv.pluginIds),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Mark invitation accepted
    await invDoc.ref.update({ status: "accepted", acceptedAt: admin.firestore.FieldValue.serverTimestamp(), acceptedBy: uid });

    return { success: true };
  }
);

// ── issueWidgetToken ─────────────────────────────────────────────────────────
// Plain onRequest (not onCall) so the unauthenticated Knack widget can call it
// without a Firebase Auth token or the onCall { data:{}  } wrapper.

export const issueWidgetToken = functions.https.onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { pluginId, tenantId, knackUserId, knackUserRole, userId, userRole } = req.body as {
      pluginId: string; tenantId: string;
      // Knack path
      knackUserId?: string; knackUserRole?: string;
      // React/Firebase path
      userId?: string; userRole?: string;
    };

    // Either knackUserId (Knack) or userId (React) must be present
    const isReact = !!userId;
    const effectiveUserId = isReact ? userId! : knackUserId;
    if (!pluginId || !tenantId || !effectiveUserId) {
      res.status(400).json({ error: "Missing required widget params." }); return;
    }

    // Verify plugin exists and is active
    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    if (!pluginDoc.exists || pluginDoc.data()?.status !== "active") {
      res.status(404).json({ error: "Plugin not found or inactive." }); return;
    }

    // Role check only applies to Knack apps — React/Firebase apps skip it entirely
    if (!isReact) {
      const selectedRoles: string[] = pluginDoc.data()?.selectedRoles || [];
      const allowAll = selectedRoles.length === 0 || selectedRoles.includes("*");
      if (!allowAll && !selectedRoles.includes(knackUserRole as string)) {
        res.status(403).json({ error: "User role not authorized for this plugin." }); return;
      }
    }

    // Issue custom token — encode source so submitSnap can store it on the doc
    const source = isReact ? "react" : "knack";
    const widgetUid = `widget-${tenantId}-${effectiveUserId}`;
    const token = await auth.createCustomToken(widgetUid, {
      role: "widget",
      snap_tenantId: tenantId,
      snap_pluginId: pluginId,
      snap_source: source,
      knackUserId: isReact ? null : knackUserId,
      knackUserRole: isReact ? null : knackUserRole,
      userId: isReact ? userId : null,
      userRole: isReact ? (userRole || "authenticated") : null,
    });

    res.json({ token });
  }
);

// ── submitSnap ────────────────────────────────────────────────────────────────
// Plain onRequest so the widget (which holds a Firebase ID token, not an SDK
// session) can POST snaps directly.

export const submitSnap = functions.https.onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    // Verify the Firebase ID token sent in the Authorization header
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!idToken) { res.status(401).json({ error: "Missing auth token" }); return; }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch {
      res.status(401).json({ error: "Invalid auth token" }); return;
    }

    const claims = decoded as Record<string, unknown>;
    // Support both new (snap_tenantId) and legacy (tenantId) claim names during transition
    const tenantId = (claims.snap_tenantId || claims.tenantId) as string | undefined;
    const pluginId = (claims.snap_pluginId || claims.pluginId) as string | undefined;
    const knackUserId = claims.knackUserId as string | undefined;
    const knackUserRole = claims.knackUserRole as string | undefined;
    const source = (claims.snap_source as string | undefined) || "knack"; // 'knack' | 'react'
    if (!tenantId || !pluginId) { res.status(400).json({ error: "Token missing claims" }); return; }

    const body = req.body as Record<string, unknown>;

    // Fetch plugin doc to check hipaaEnabled
    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    const hipaaEnabled = pluginDoc.data()?.hipaaEnabled === true;
    const retentionDays: number = hipaaEnabled ? 2555 : ((pluginDoc.data()?.retentionDays as number) ?? 365);

    // Sanitise/truncate caller-supplied fields to prevent oversized Firestore documents (M-03)
    // For HIPAA: strip console errors entirely and scrub pageUrl query params
    const consoleErrors = hipaaEnabled
      ? []
      : Array.isArray(body.consoleErrors)
        ? (body.consoleErrors as unknown[]).slice(0, 100)
        : [];

    const annotationDataRaw = body.annotationData;
    const annotationData = annotationDataRaw != null &&
      JSON.stringify(annotationDataRaw).length <= 50_000
      ? annotationDataRaw
      : null;
    const formDataRaw = body.formData && typeof body.formData === "object"
      ? Object.fromEntries(
          Object.entries(body.formData as Record<string, unknown>).slice(0, 50)
        )
      : {};

    // HIPAA: DLP-redact description field and cap at 500 chars
    if (hipaaEnabled && typeof formDataRaw.description === "string") {
      formDataRaw.description = await dlpRedactText(formDataRaw.description.slice(0, 500));
    }
    const formData = formDataRaw;

    const contextRaw = body.context && typeof body.context === "object"
      ? Object.fromEntries(
          Object.entries(body.context as Record<string, unknown>).slice(0, 20)
        )
      : {};
    // HIPAA: strip query params from pageUrl
    if (hipaaEnabled && typeof contextRaw.pageUrl === "string") {
      contextRaw.pageUrl = stripQueryParams(contextRaw.pageUrl);
    }
    const context = contextRaw;

    const ALLOWED_PRIORITIES = ["low", "medium", "high", "critical"];
    const priority = ALLOWED_PRIORITIES.includes(body.priority as string)
      ? (body.priority as string)
      : "medium";

    // For HIPAA snaps submitted with a screenshot, the widget sends hipaaScreenshot=true
    // and NO screenshotUrl; the screenshot is uploaded to the staging path after this response.
    const hipaaScreenshot = hipaaEnabled && body.hipaaScreenshot === true;

    const submission: Record<string, unknown> = {
      tenantId,
      pluginId,
      knackUserId: knackUserId || null,
      knackUserRole: knackUserRole || null,
      type: body.type || "full",
      screenshotUrl: hipaaScreenshot ? null : (body.screenshotUrl || null),
      screenshotStatus: hipaaScreenshot ? "scanning" : null,
      recordingUrl: body.recordingUrl || null,
      annotationData,
      consoleErrors,
      formData,
      context,
      priority,
      status: "new",
      hipaaEnabled,
      retentionDays,
      source, // 'knack' | 'react'
      notifySubmitter: body.notifySubmitter !== false, // submitter's preference; default true
      submitterEmail: (() => {
        const ctx = (body.context as Record<string, unknown>) || {};
        const email = (ctx.userEmail as string) ||
          (ctx.knackUserEmail as string) ||
          (typeof ctx.knackUserId === "string" && ctx.knackUserId.includes("@") ? ctx.knackUserId : "");
        return email || null;
      })(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Assign a sequential snap number per tenant using a transaction
    const newDocRef = db.collection("snap_submissions").doc();
    await db.runTransaction(async (tx) => {
      const counterRef = db.collection("snap_counters").doc(tenantId);
      const counterDoc = await tx.get(counterRef);
      const snapNumber = (counterDoc.exists ? (counterDoc.data()?.count ?? 0) : 0) + 1;
      tx.set(counterRef, { count: snapNumber }, { merge: true });
      tx.set(newDocRef, { ...submission, snapNumber });
    });

    res.json({ id: newDocRef.id });

    // HIPAA § 164.312(b): log PHI entry into the system (non-blocking, server-side guaranteed)
    if (hipaaEnabled) {
      db.collection("audit_log").add({
        eventType: "snap_created",
        snapId: newDocRef.id,
        tenantId,
        pluginId,
        actorUid: null,  // widget user — no Firebase Auth session
        actorName: knackUserId ? `Knack user ${knackUserId}` : "Widget user",
        actorEmail: "",
        actorRole: "widget",
        detail: `category: ${(formData as Record<string, unknown>)?.category ?? "—"}; priority: ${priority}`,
        eventAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});  // best-effort — must not block the HTTP response
    }
  }
);

// ── Firestore trigger: notify on new snap ────────────────────────────────────

export const onSnapCreated = functions.firestore.onDocumentCreated(
  "snap_submissions/{submissionId}",
  async (event) => {
    const snap = event.data?.data() as Record<string, unknown> | undefined;
    if (!snap) return;

    const tenantId = snap.tenantId as string;
    const pluginId = snap.pluginId as string;

    const [pluginDoc] = await Promise.all([
      db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get(),
      db.collection("tenants").doc(tenantId).get(),
    ]);

    const pluginData = pluginDoc.data();
    const notifyEmails = (pluginData?.snapSettings?.notifyEmails as string[]) || [];
    const priority = snap.priority as string | undefined;
    const isCritical = priority === "critical";
    const hipaaMode = pluginData?.hipaaEnabled === true;
    const slackEnabled = pluginData?.snapSettings?.slackEnabled === true;

    const category = ((snap.formData as Record<string, unknown>)?.category as string) || "Snap";
    const rawPageUrl = ((snap.context as Record<string, unknown>)?.pageUrl as string) || "";
    const pageUrl = hipaaMode ? "" : rawPageUrl;
    const snapDashboardUrl = `${APP_DOMAIN}/snap-feed/${event.params.submissionId}`;
    const pluginName = he(pluginData?.name || "Plugin");

    // ── Email notifications ───────────────────────────────────────────────────
    const notificationsEnabled = pluginData?.snapSettings?.notificationsEnabled !== false;
    if (notifyEmails.length > 0 && notificationsEnabled) {
      const key = await getSendGridKey();
      if (key) {
        sgMail.setApiKey(key);
        if (isCritical) {
          await Promise.all(
            notifyEmails.map((email) =>
              sgMail.send({
                from: SENDGRID_FROM,
                ...criticalSnapEmail({
                  recipientEmail: email,
                  pluginName,
                  category: he(category),
                  pageUrl: he(pageUrl),
                  dashboardUrl: snapDashboardUrl,
                  hipaaMode,
                }),
              })
            )
          );
        } else {
          await Promise.all(
            notifyEmails.map((email) =>
              sgMail.send({
                from: SENDGRID_FROM,
                ...snapNotificationEmail({
                  recipientEmail: email,
                  pluginName,
                  category: he(category),
                  pageUrl: he(pageUrl),
                  dashboardUrl: snapDashboardUrl,
                  hipaaMode,
                }),
              })
            )
          );
        }
      }
    }

    // ── Slack notification ────────────────────────────────────────────────────
    if (slackEnabled) {
      try {
        const webhookUrl = await getSlackWebhook(tenantId, pluginId);
        if (webhookUrl) {
          const snapNumber = snap.snapNumber as number | undefined;
          const status = (snap.status as string) || "new";
          const rawDescription = ((snap.formData as Record<string, unknown>)?.description as string) || "";
          const description = hipaaMode ? "[Redacted for HIPAA]" : rawDescription;
          const reporter =
            ((snap.context as Record<string, unknown>)?.knackUserName as string) ||
            ((snap.context as Record<string, unknown>)?.knackUserId as string) ||
            "Unknown";
          const screenshotUrl = hipaaMode ? null : ((snap.screenshotUrl as string | null) ?? null);

          const priorityLabel: Record<string, string> = {
            low: "\uD83D\uDFE2 Low", medium: "\uD83D\uDFE1 Medium", high: "\uD83D\uDFE0 High", critical: "\uD83D\uDD34 Critical",
          };
          const statusLabel: Record<string, string> = {
            new: "New", in_progress: "In Progress", ready_for_testing: "Ready for Testing",
            resolved: "Resolved", archived: "Archived",
          };

          const headerText = snapNumber
            ? `New Snap #${snapNumber} \u2014 ${pluginName}`
            : `New Snap \u2014 ${pluginName}`;

          const blocks: unknown[] = [
            { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Category*\n${category}` },
                { type: "mrkdwn", text: `*Priority*\n${priorityLabel[priority ?? ""] || priority || "\u2014"}` },
                { type: "mrkdwn", text: `*Status*\n${statusLabel[status] || status}` },
                { type: "mrkdwn", text: `*Reporter*\n${reporter}` },
              ],
            },
          ];

          if (description) {
            blocks.push({
              type: "section",
              text: { type: "mrkdwn", text: `*Description*\n${description}` },
            });
          }

          if (pageUrl) {
            blocks.push({
              type: "section",
              text: { type: "mrkdwn", text: `*Page*\n${pageUrl}` },
            });
          }

          if (screenshotUrl) {
            blocks.push({ type: "image", image_url: screenshotUrl, alt_text: "Snap screenshot" });
          }

          blocks.push({
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Snap \u2192", emoji: true },
                url: snapDashboardUrl,
                style: "primary",
              },
            ],
          });

          await axios.post(webhookUrl, { blocks });
        }
      } catch (e) {
        console.error("[Slack] Failed to post snap notification:", e);
      }
    }
  }
);

// ── Firestore trigger: notify on new comment ─────────────────────────────────

export const onCommentCreated = functions.firestore.onDocumentCreated(
  "snap_submissions/{submissionId}/comments/{commentId}",
  async (event) => {
    const comment = event.data?.data() as Record<string, unknown> | undefined;
    if (!comment) return;

    const submissionId = event.params.submissionId;
    const submissionDoc = await db.collection("snap_submissions").doc(submissionId).get();
    if (!submissionDoc.exists) return;
    const submission = submissionDoc.data()!;
    const tenantId = submission.tenantId as string;
    const pluginId = submission.pluginId as string;
    const snapNumber = submission.snapNumber as number | undefined;
    const category = ((submission.formData as Record<string, unknown>)?.category as string) || "Snap";

    // Check HIPAA mode: plugin flag is authoritative; fall back to the snap doc's own hipaaEnabled
    // so that snaps created with hipaaEnabled:true (e.g. via API or test scripts) also get redacted.
    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    const hipaaMode = pluginDoc.data()?.hipaaEnabled === true || submission.hipaaEnabled === true;
    console.log(`[HIPAA] comment on submission ${submissionId}, plugin ${pluginId}, hipaaMode=${hipaaMode}`);

    // HIPAA: DLP-redact comment text and update the doc — always, regardless of notify flag
    const rawCommentText = (comment.text as string) || "";
    let commentText = he(rawCommentText);
    const commentRef = db.collection("snap_submissions").doc(submissionId)
      .collection("comments").doc(event.params.commentId);
    let dlpFlagged = false;
    if (hipaaMode && rawCommentText) {
      const redacted = await dlpRedactText(rawCommentText);
      dlpFlagged = redacted !== rawCommentText;
      await commentRef.update({ text: redacted, dlpFlagged, dlpPending: false });
      commentText = he(redacted);

      // Audit the DLP scan result — log that a scan ran and whether PHI was detected/redacted.
      // We intentionally do NOT log the original or redacted text (that would re-introduce PHI).
      db.collection("audit_log").add({
        eventType: "dlp_scan_completed",
        snapId: submissionId,
        tenantId,
        pluginId,
        actorUid: null,
        actorName: "System (DLP)",
        actorEmail: "",
        actorRole: "system",
        detail: `commentId: ${event.params.commentId}; flagged: ${dlpFlagged}`,
        eventAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    } else {
      // Always clear the pending flag even when HIPAA is off
      await commentRef.update({ dlpPending: false });
    }

    // HIPAA § 164.312(b): log comment creation on PHI snap (regardless of notify flag)
    if (hipaaMode) {
      db.collection("audit_log").add({
        eventType: "snap_comment_created",
        snapId: submissionId,
        tenantId,
        pluginId,
        actorUid: ((comment.authorUid || comment.authorId) as string) || null,
        actorName: (comment.authorName as string) || "Unknown",
        actorEmail: (comment.authorEmail as string) || "",
        actorRole: (comment.authorRole as string) || "tenant",
        detail: "",
        eventAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }

    // Only fan-out email when the commenter explicitly checked "Notify".
    if (comment.notify !== true) return;

    const authorUid = (comment.authorUid || comment.authorId) as string | undefined;

    // Collect all prior commenters on this snap (excluding the current author).
    const existingCommentsSnap = await db
      .collection("snap_submissions")
      .doc(submissionId)
      .collection("comments")
      .get();

    const commenterUids = new Set<string>();
    for (const doc of existingCommentsSnap.docs) {
      if (doc.id === event.params.commentId) continue; // skip the just-created comment
      const d = doc.data();
      const uid = (d.authorUid || d.authorId) as string | undefined;
      if (uid && uid !== authorUid) commenterUids.add(uid);
    }
    // Always include the tenant owner (unless they are the author).
    if (tenantId && tenantId !== authorUid) commenterUids.add(tenantId);

    if (commenterUids.size === 0) return;

    const key = await getSendGridKey();
    if (!key) return;
    sgMail.setApiKey(key);

    const authorName = he((comment.authorName as string) || "Someone");
    // commentText already set above (DLP-redacted if HIPAA)

    await Promise.all(
      Array.from(commenterUids).map(async (uid) => {
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data()!;
        if (userData.notifyOnComment === false) return;
        const recipientEmail = userData.email as string;
        if (!recipientEmail) return;

        // Role-aware deep-link: tenant gets /snap-feed/, clients get /client-portal/snap/
        const snapUrl = uid === tenantId
          ? `${APP_DOMAIN}/snap-feed/${submissionId}`
          : `${APP_DOMAIN}/client-portal/snap/${submissionId}`;

        await sgMail.send({
          from: SENDGRID_FROM,
          ...commentNotificationEmail({
            recipientEmail,
            authorName,
            commentText,
            snapNumber,
            snapCategory: he(category),
            dashboardUrl: snapUrl,
            hipaaMode,
          }),
        });
      })
    );
  }
);

// ── Firestore trigger: notify submitter on status change ─────────────────────

export const onSnapHistoryCreated = functions.firestore.onDocumentCreated(
  "snap_submissions/{submissionId}/history/{historyId}",
  async (event) => {
    const entry = event.data?.data() as Record<string, unknown> | undefined;
    if (!entry || entry.changeType !== "status") return;

    const submissionId = event.params.submissionId;
    const submissionDoc = await db.collection("snap_submissions").doc(submissionId).get();
    if (!submissionDoc.exists) return;
    const submission = submissionDoc.data()!;

    // Respect the per-snap toggle (default: true when email is present)
    if (submission.notifySubmitter === false) return;

    // Never email submitters on HIPAA snaps
    if (submission.hipaaEnabled === true) return;

    // Resolve submitter email: React apps store userEmail; Knack apps may store email as knackUserId
    const ctx = (submission.context as Record<string, unknown>) || {};
    const rawEmail = (submission.submitterEmail as string) ||
      (ctx.userEmail as string) ||
      (ctx.knackUserEmail as string) ||
      (typeof ctx.knackUserId === "string" && ctx.knackUserId.includes("@") ? ctx.knackUserId : "");
    if (!rawEmail) return;

    const tenantId = submission.tenantId as string;
    const pluginId = submission.pluginId as string;
    const snapNumber = submission.snapNumber as number | undefined;
    const category = ((submission.formData as Record<string, unknown>)?.category as string) || "Snap";
    const pageUrl = (ctx.pageUrl as string) || "";

    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    const pluginName = he(pluginDoc.data()?.name || "Plugin");

    const key = await getSendGridKey();
    if (!key) return;
    sgMail.setApiKey(key);

    await sgMail.send({
      from: SENDGRID_FROM,
      ...submitterStatusUpdateEmail({
        recipientEmail: rawEmail,
        pluginName,
        snapNumber,
        category: he(category),
        newStatus: (entry.toValue as string) || "unknown",
        pageUrl: he(pageUrl),
      }),
    });
  }
);

// ── shareFeedWithTenant ────────────────────────────────────────────────────────

export const shareFeedWithTenant = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const ownerTenantId = request.auth.uid;
    const { email, pluginId } = request.data as { email: string; pluginId: string };
    if (!email || !pluginId) {
      throw new functions.https.HttpsError("invalid-argument", "email and pluginId are required.");
    }

    // Look up grantee by email in Firebase Auth — must have an existing account
    let granteeAuthUser: admin.auth.UserRecord;
    try {
      granteeAuthUser = await auth.getUserByEmail(email);
    } catch {
      throw new functions.https.HttpsError("not-found", "No Snap4Knack account found for that email address.");
    }
    const granteeUid = granteeAuthUser.uid;

    if (granteeUid === ownerTenantId) {
      throw new functions.https.HttpsError("invalid-argument", "You cannot share a feed with yourself.");
    }

    // Verify grantee is a tenant (not a client-only account)
    const granteeUserDoc = await db.collection("users").doc(granteeUid).get();
    if (!granteeUserDoc.exists) {
      throw new functions.https.HttpsError("not-found", "No Snap4Knack account found for that email address.");
    }
    const granteeData = granteeUserDoc.data()!;
    const granteeRoles: string[] = granteeData.roles || ([granteeData.role].filter(Boolean) as string[]);
    if (!granteeRoles.includes("tenant") && !granteeRoles.includes("admin")) {
      throw new functions.https.HttpsError("permission-denied", "That account is not a Snap4Knack tenant account and cannot be granted feed access.");
    }

    // Verify caller owns the plugin
    const pluginDoc = await db.collection("tenants").doc(ownerTenantId).collection("snapPlugins").doc(pluginId).get();
    if (!pluginDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Plugin not found.");
    }
    const pluginName = (pluginDoc.data()?.name as string) || "Plugin";

    // Check for an existing active share to prevent duplicates (filter client-side to avoid composite index)
    const existingSnap = await db.collection("tenant_shares")
      .where("ownerTenantId", "==", ownerTenantId)
      .where("pluginId", "==", pluginId)
      .get();
    const alreadyActive = existingSnap.docs.some(
      (d) => d.data()?.grantedTenantId === granteeUid && d.data()?.status === "active"
    );
    if (alreadyActive) {
      throw new functions.https.HttpsError("already-exists", "This plugin is already shared with that account.");
    }

    // Get company names for display context
    const ownerTenantDoc = await db.collection("tenants").doc(ownerTenantId).get();
    const ownerCompanyName = (ownerTenantDoc.data()?.companyName as string) || "Unknown";

    const granteeTenantDoc = await db.collection("tenants").doc(granteeUid).get();
    const grantedCompanyName = granteeTenantDoc.exists
      ? ((granteeTenantDoc.data()?.companyName as string) || (granteeData.displayName as string) || email)
      : ((granteeData.displayName as string) || email);

    // Write tenant_shares doc
    const shareRef = await db.collection("tenant_shares").add({
      ownerTenantId,
      ownerCompanyName,
      grantedTenantId: granteeUid,
      grantedEmail: email,
      grantedCompanyName,
      pluginId,
      pluginName,
      status: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Grant access: arrayUnion pluginId onto grantee's sharedPluginAccess
    await db.collection("users").doc(granteeUid).update({
      sharedPluginAccess: admin.firestore.FieldValue.arrayUnion(pluginId),
    });

    // Notify the grantee by email — non-fatal
    try {
      const key = await getSendGridKey();
      if (key) {
        sgMail.setApiKey(key);
        await sgMail.send({
          from: SENDGRID_FROM,
          ...sharedFeedEmail({
            recipientEmail: email,
            ownerCompanyName,
            pluginName,
            feedUrl: `${APP_DOMAIN}/snap-feed`,
          }),
        });
      }
    } catch {
      // Email failure is non-fatal — share was already granted
    }

    return { shareId: shareRef.id, grantedEmail: email, grantedCompanyName, pluginName };
  }
);

// ── revokeTenantShare ─────────────────────────────────────────────────────────

export const revokeTenantShare = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const { shareId } = request.data as { shareId: string };

    const shareDoc = await db.collection("tenant_shares").doc(shareId).get();
    if (!shareDoc.exists) throw new functions.https.HttpsError("not-found", "Share not found.");
    const share = shareDoc.data()!;

    if (share.ownerTenantId !== request.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized.");
    }

    await shareDoc.ref.update({
      status: "revoked",
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Remove plugin access from grantee's sharedPluginAccess
    await db.collection("users").doc(share.grantedTenantId).update({
      sharedPluginAccess: admin.firestore.FieldValue.arrayRemove(share.pluginId),
    });

    return { success: true };
  }
);

// ── createTenant ──────────────────────────────────────────────────────────────

export const createTenant = functions.https.onCall(
  { enforceAppCheck: false, invoker: "public" },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");

    // Verify caller is admin
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerRoles: string[] = (callerDoc.data()?.roles as string[]) || [];
    if (!callerRoles.includes("admin")) {
      throw new functions.https.HttpsError("permission-denied", "Only admins can create tenants.");
    }

    const { email, companyName, displayName } = request.data as {
      email: string;
      companyName: string;
      displayName?: string;
    };
    if (!email?.trim() || !companyName?.trim()) {
      throw new functions.https.HttpsError("invalid-argument", "Email and company name are required.");
    }

    // Check if user already exists
    try {
      await auth.getUserByEmail(email.trim());
      throw new functions.https.HttpsError("already-exists", "A user with this email already exists.");
    } catch (err: unknown) {
      const fbErr = err as { code?: string };
      if (fbErr.code !== "auth/user-not-found") throw err;
    }

    // Create auth user with a temp password — immediately generate a reset link
    const tempPassword = `Tmp_${Math.random().toString(36).slice(2, 10)}!`;
    const effectiveName = displayName?.trim() || companyName.trim();
    const userRecord = await auth.createUser({
      email: email.trim(),
      password: tempPassword,
      displayName: effectiveName,
    });
    const uid = userRecord.uid;

    // Create user doc
    await db.collection("users").doc(uid).set({
      id: uid,
      uid,
      email: email.trim(),
      displayName: effectiveName,
      role: "tenant",
      roles: ["tenant"],
      tenantId: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Create tenant doc
    await db.collection("tenants").doc(uid).set({
      ownerId: uid,
      companyName: companyName.trim(),
      email: email.trim(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Generate password-reset link so user sets their own password on first login
    const resetLink = await auth.generatePasswordResetLink(email.trim());

    // Send welcome email
    const sgKey = await getSendGridKey();
    sgMail.setApiKey(sgKey);
    const msg = newTenantWelcomeEmail({
      recipientEmail: email.trim(),
      companyName: companyName.trim(),
      displayName: effectiveName,
      loginUrl: resetLink,
    });
    await sgMail.send({ from: SENDGRID_FROM, to: msg.to, subject: msg.subject, html: msg.html });

    return { uid, email: email.trim(), companyName: companyName.trim() };
  }
);

// ── getAvailableTenants ───────────────────────────────────────────────────────

export const getAvailableTenants = functions.https.onCall(
  { enforceAppCheck: false, invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");

    const snapshot = await db.collection("users").where("roles", "array-contains", "tenant").get();
    return snapshot.docs
      .filter((d) => d.id !== request.auth!.uid)
      .map((d) => ({
        uid: d.id,
        email: (d.data().email as string) || "",
        displayName:
          (d.data().displayName as string) ||
          (d.data().companyName as string) ||
          (d.data().email as string) ||
          d.id,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
);

// ── revokeClientAccess ────────────────────────────────────────────────────────

export const revokeClientAccess = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const { invitationId } = request.data as { invitationId: string };

    const invDoc = await db.collection("client_invitations").doc(invitationId).get();
    if (!invDoc.exists) throw new functions.https.HttpsError("not-found", "Invitation not found.");
    const inv = invDoc.data()!;

    if (inv.tenantId !== request.auth.uid) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized.");
    }

    await invDoc.ref.update({ status: "revoked" });

    // Remove plugin access from client user doc and revoke Firebase refresh tokens
    // so existing ID tokens cannot be renewed after revocation (pen test 5.1)
    if (inv.acceptedBy) {
      await Promise.all([
        db.collection("users").doc(inv.acceptedBy).update({
          clientAccess: admin.firestore.FieldValue.arrayRemove(...inv.pluginIds),
        }),
        auth.revokeRefreshTokens(inv.acceptedBy),
      ]);
    }

    return { success: true };
  }
);

// ── contactForm ───────────────────────────────────────────────────────────────
export const contactForm = functions.https.onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

    const { name, email, company, message } = req.body as {
      name?: string; email?: string; company?: string; message?: string;
    };

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      res.status(400).json({ error: "name, email and message are required" });
      return;
    }

    const key = await getSendGridKey();
    if (!key) {
      res.status(500).json({ error: "Email not configured" });
      return;
    }

    sgMail.setApiKey(key);

    // HTML-encode all user-supplied values before embedding in email body (C-01)
    const safeName    = he(name!.trim());
    const safeEmail   = he(email!.trim());
    const safeCompany = company ? he(company.trim()) : "";
    const safeMessage = he(message!.trim());

    const subject = `Snap4Knack Contact Form — ${safeName}`;
    const html = `
      <h2>New Contact Form Submission</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px">
        <tr><td style="padding:8px;font-weight:bold;color:#555">Name</td><td style="padding:8px">${safeName}</td></tr>
        <tr><td style="padding:8px;font-weight:bold;color:#555">Email</td><td style="padding:8px"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
        ${safeCompany ? `<tr><td style="padding:8px;font-weight:bold;color:#555">Company</td><td style="padding:8px">${safeCompany}</td></tr>` : ""}
        <tr><td style="padding:8px;font-weight:bold;color:#555;vertical-align:top">Message</td><td style="padding:8px;white-space:pre-wrap">${safeMessage}</td></tr>
      </table>
    `;

    const recipients = ["info@finemountainconsulting.com", "rich@finemountainconsulting.com"];

    await sgMail.send({
      from: SENDGRID_FROM,
      to: recipients,
      replyTo: email!.trim(),
      subject,
      html,
    });

    res.json({ success: true });
  }
);

// ── onScreenshotStaged ────────────────────────────────────────────────────────
// Storage trigger: fires when the widget uploads a HIPAA screenshot to the
// staging bucket. Downloads the file, runs DLP image redaction, writes the
// redacted PNG to the live path, updates the Firestore snap doc, then deletes
// the staging file.

export const onScreenshotStaged = onObjectFinalized(
  { bucket: STORAGE_BUCKET },
  async (event) => {
    const filePath = event.data.name; // e.g. "snap_screenshots_staging/{tenantId}/{snapId}.png"
    if (!filePath || !filePath.startsWith("snap_screenshots_staging/")) return;

    const parts = filePath.split("/");
    if (parts.length !== 3) return;
    const tenantId = parts[1];
    const fileName = parts[2]; // "{snapId}.png"
    const snapId = fileName.replace(/\.png$/i, "");
    if (!snapId) return;

    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    const stagingFile = bucket.file(filePath);

    try {
      // Download staged image
      const [imageBytes] = await stagingFile.download();

      // DLP image redaction
      const redactedBytes = await dlpRedactImage(imageBytes);

      // Upload to live path
      const livePath = `snap_screenshots/${tenantId}/${fileName}`;
      const liveFile = bucket.file(livePath);
      await liveFile.save(redactedBytes, { contentType: "image/png", resumable: false });

      // Set a download token so the URL is stable (same pattern as the widget)
      const token = randomUUID();
      await liveFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });

      const screenshotUrl =
        `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/` +
        `${encodeURIComponent(livePath)}?alt=media&token=${token}`;

      // Update Firestore snap doc
      await db.collection("snap_submissions").doc(snapId).update({
        screenshotUrl,
        screenshotStatus: "ready",
      });

      // Delete staging file
      await stagingFile.delete();
    } catch (e) {
      console.error(`[onScreenshotStaged] Error processing ${filePath}:`, e);
      // Mark scan failed so UI shows a clear error state
      await db.collection("snap_submissions").doc(snapId).update({
        screenshotStatus: "scan_failed",
        scanError: e instanceof Error ? e.message : String(e),
      }).catch(() => {});
    }
  }
);

// ── purgeExpiredSnaps ─────────────────────────────────────────────────────────
// Nightly scheduled function: hard-deletes snap_submissions (+ comments subcollection
// + Storage files) older than the plugin's retentionDays.
// Non-HIPAA default: 365 days. HIPAA: 2555 days (7 years).

export const purgeExpiredSnaps = onSchedule(
  { schedule: "every 24 hours", timeZone: "America/Chicago" },
  async () => {
    const now = Date.now();
    const minCutoff = admin.firestore.Timestamp.fromDate(
      new Date(now - 365 * 24 * 60 * 60 * 1000)
    );

    // Only fetch docs older than the minimum retention window (365 days)
    const snapshot = await db.collection("snap_submissions")
      .where("createdAt", "<", minCutoff)
      .get();

    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    let purged = 0;

    for (const snapDoc of snapshot.docs) {
      const data = snapDoc.data();
      const retention: number = (data.retentionDays as number) ?? 365;
      const createdAt = (data.createdAt as admin.firestore.Timestamp).toDate();
      const ageMs = now - createdAt.getTime();
      const retentionMs = retention * 24 * 60 * 60 * 1000;
      if (ageMs <= retentionMs) continue; // not yet expired

      const snapId = snapDoc.id;
      const tenantId = data.tenantId as string;

      try {
        // Delete comments subcollection
        const commentsSnap = await db.collection("snap_submissions").doc(snapId).collection("comments").get();
        const batch = db.batch();
        commentsSnap.docs.forEach((c) => batch.delete(c.ref));
        batch.delete(snapDoc.ref);
        await batch.commit();

        // HIPAA § 164.312(b) + § 164.310(d)(2)(i): log PHI deletion for HIPAA snaps
        if (data.hipaaEnabled === true) {
          await db.collection("audit_log").add({
            eventType: "snap_purged",
            snapId,
            tenantId,
            pluginId: (data.pluginId as string) || "",
            actorUid: null,
            actorName: "System (scheduled purge)",
            actorEmail: "",
            actorRole: "system",
            detail: `retentionDays: ${retention}`,
            eventAt: admin.firestore.FieldValue.serverTimestamp(),
          }).catch(() => {});
        }

        // Delete Storage files (best-effort)
        const filesToDelete = [
          `snap_screenshots/${tenantId}/${snapId}.png`,
          `snap_recordings/${tenantId}/${snapId}.webm`,
          `snap_recordings/${tenantId}/${snapId}.mp4`,
        ];
        await Promise.allSettled(
          filesToDelete.map((p) => bucket.file(p).delete())
        );
        purged++;
      } catch (e) {
        console.error(`[purgeExpiredSnaps] Failed to purge snap ${snapId}:`, e);
      }
    }
    console.log(`[purgeExpiredSnaps] Purged ${purged} expired snap(s).`);
  }
);

// ── deleteSnapPlugin ─────────────────────────────────────────────────────────
// Deletes a snap plugin and ALL associated snap_submissions (+ their comment
// subcollections and Storage screenshots). Runs in paginated batches of 400
// so it never exceeds the Firestore 500-operation batch limit.

export const deleteSnapPlugin = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
    const { pluginId, tenantId } = request.data as { pluginId: string; tenantId: string };

    if (!pluginId || !tenantId) {
      throw new functions.https.HttpsError("invalid-argument", "pluginId and tenantId are required.");
    }
    if (request.auth.uid !== tenantId) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized.");
    }

    // Verify plugin belongs to this tenant
    const pluginRef = db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId);
    const pluginDoc = await pluginRef.get();
    if (!pluginDoc.exists) throw new functions.https.HttpsError("not-found", "Plugin not found.");
    if (pluginDoc.data()?.tenantId !== tenantId) {
      throw new functions.https.HttpsError("permission-denied", "Not authorized.");
    }

    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    let deletedSnaps = 0;

    // Paginated delete of snap_submissions for this plugin
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let q = db.collection("snap_submissions")
        .where("tenantId", "==", tenantId)
        .where("pluginId", "==", pluginId)
        .limit(400);
      if (lastDoc) q = q.startAfter(lastDoc);

      const snap = await q.get();
      if (snap.empty) break;

      const batch = db.batch();
      for (const snapDoc of snap.docs) {
        const snapId = snapDoc.id;

        // Delete comment subcollection
        const commentsSnap = await db.collection("snap_submissions").doc(snapId).collection("comments").get();
        for (const commentDoc of commentsSnap.docs) {
          batch.delete(commentDoc.ref);
        }

        // Delete screenshot from Storage (best-effort — don't fail if missing)
        try {
          await bucket.file(`snap_screenshots/${tenantId}/${snapId}.png`).delete();
        } catch {
          // file may not exist (e.g. text-only snap)
        }

        batch.delete(snapDoc.ref);
        deletedSnaps++;
      }
      await batch.commit();

      if (snap.size < 400) break;
      lastDoc = snap.docs[snap.docs.length - 1];
    }

    // Finally delete the plugin document itself
    await pluginRef.delete();

    console.log(`[deleteSnapPlugin] Deleted plugin ${pluginId} and ${deletedSnaps} snap(s) for tenant ${tenantId}`);
    return { success: true, deletedSnaps };
  }
);

// ── onAuditLogCreated ────────────────────────────────────────────────────────────
// Immutable audit archive — mirrors every audit_log Firestore document to Cloud Storage
// as a write-once JSON file at audit_archive/{YYYY}/{MM}/{DD}/{logId}.json.
//
// Rationale: Firestore rules block client deletes, but Admin SDK / Firebase console
// access could still remove documents. The Storage copy is independent and can be
// separately protected with a bucket Retention Policy or Object Lock.
// HIPAA § 164.312(b) requires that audit records be retained and not modifiable.

export const onAuditLogCreated = functions.firestore.onDocumentCreated(
  "audit_log/{logId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const logId = event.params.logId;

    // Resolve the timestamp: server timestamps are a Firestore Timestamp object
    const ts: admin.firestore.Timestamp | undefined = data.eventAt as admin.firestore.Timestamp | undefined;
    const date = ts ? ts.toDate() : new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(date.getUTCDate()).padStart(2, "0");

    const path = `audit_archive/${yyyy}/${mm}/${dd}/${logId}.json`;
    const bucket = admin.storage().bucket(AUDIT_ARCHIVE_BUCKET);
    const file = bucket.file(path);

    const payload = JSON.stringify({
      ...data,
      // Convert Firestore Timestamp to ISO string for portability
      eventAt: ts ? ts.toDate().toISOString() : null,
      _archivedAt: new Date().toISOString(),
    }, null, 2);

    await file.save(payload, {
      contentType: "application/json",
      metadata: {
        // Prevent accidental overwrites
        ifGenerationMatch: 0,
        metadata: {
          logId,
          eventType: (data.eventType as string) ?? "",
          snapId: (data.snapId as string) ?? "",
          tenantId: (data.tenantId as string) ?? "",
        },
      },
    });

    console.log(`[onAuditLogCreated] Archived ${logId} → gs://${AUDIT_ARCHIVE_BUCKET}/${path}`);
  }
);
