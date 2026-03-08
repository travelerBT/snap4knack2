import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import sgMail from "@sendgrid/mail";
import axios from "axios";
import { snapNotificationEmail, criticalSnapEmail, clientInvitationEmail, commentNotificationEmail } from "./emailTemplates";

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const secretClient = new SecretManagerServiceClient();

const PROJECT_ID = "snap4knack2";
const APP_DOMAIN = "https://snap4knack2.web.app";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM = "info@finemountainconsulting.com";

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
      if (err.code !== 6) throw e; // 6 = ALREADY_EXISTS
    }

    await secretClient.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: { data: Buffer.from(apiKey.trim()) },
    });

    return { secretName: `${parent}/secrets/${secretId}/versions/latest` };
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
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

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

    const { pluginId, tenantId, knackUserId, knackUserRole } = req.body as {
      pluginId: string; tenantId: string; knackUserId: string; knackUserRole: string;
    };
    if (!pluginId || !tenantId || !knackUserId) {
      res.status(400).json({ error: "Missing required widget params." }); return;
    }

    // Verify plugin exists and is active
    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    if (!pluginDoc.exists || pluginDoc.data()?.status !== "active") {
      res.status(404).json({ error: "Plugin not found or inactive." }); return;
    }

    // Check role is in selectedRoles. Empty array or '*' means allow all authenticated users.
    const selectedRoles: string[] = pluginDoc.data()?.selectedRoles || [];
    const allowAll = selectedRoles.length === 0 || selectedRoles.includes("*");
    if (!allowAll && !selectedRoles.includes(knackUserRole)) {
      res.status(403).json({ error: "User role not authorized for this plugin." }); return;
    }

    // Issue custom token tied to Knack user
    const widgetUid = `widget-${tenantId}-${knackUserId}`;
    const token = await auth.createCustomToken(widgetUid, {
      role: "widget",
      snap_tenantId: tenantId,
      snap_pluginId: pluginId,
      knackUserId,
      knackUserRole,
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
    if (!tenantId || !pluginId) { res.status(400).json({ error: "Token missing claims" }); return; }

    const body = req.body as Record<string, unknown>;

    // Sanitise/truncate caller-supplied fields to prevent oversized Firestore documents (M-03)
    const consoleErrors = Array.isArray(body.consoleErrors)
      ? (body.consoleErrors as unknown[]).slice(0, 100)
      : [];
    const annotationDataRaw = body.annotationData;
    const annotationData = annotationDataRaw != null &&
      JSON.stringify(annotationDataRaw).length <= 50_000
      ? annotationDataRaw
      : null;
    const formData = body.formData && typeof body.formData === "object"
      ? Object.fromEntries(
          Object.entries(body.formData as Record<string, unknown>).slice(0, 50)
        )
      : {};
    const context = body.context && typeof body.context === "object"
      ? Object.fromEntries(
          Object.entries(body.context as Record<string, unknown>).slice(0, 20)
        )
      : {};
    const ALLOWED_PRIORITIES = ["low", "medium", "high", "critical"];
    const priority = ALLOWED_PRIORITIES.includes(body.priority as string)
      ? (body.priority as string)
      : "medium";

    const submission = {
      tenantId,
      pluginId,
      knackUserId: knackUserId || null,
      knackUserRole: knackUserRole || null,
      type: body.type || "full",
      screenshotUrl: body.screenshotUrl || null,
      recordingUrl: body.recordingUrl || null,
      annotationData,
      consoleErrors,
      formData,
      context,
      priority,
      status: "new",
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

    const [pluginDoc, tenantDoc] = await Promise.all([
      db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get(),
      db.collection("tenants").doc(tenantId).get(),
    ]);

    const notifyEmails = (pluginDoc.data()?.snapSettings?.notifyEmails as string[]) || [];
    const tenantData = tenantDoc.data();
    const priority = snap.priority as string | undefined;
    const isCritical = priority === "critical";

    // If not critical and notifyOnSnap is off, skip.
    if (!isCritical && !tenantData?.notifyOnSnap) return;
    if (notifyEmails.length === 0) return;

    const key = await getSendGridKey();
    if (!key) return;
    sgMail.setApiKey(key);

    const category = ((snap.formData as Record<string, unknown>)?.category as string) || "Snap";
    const pageUrl = ((snap.context as Record<string, unknown>)?.pageUrl as string) || "";
    const snapDashboardUrl = `${APP_DOMAIN}/snap-feed/${event.params.submissionId}`;
    const pluginName = he(pluginDoc.data()?.name || "Plugin");

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
            }),
          })
        )
      );
    }
  }
);

// ── Firestore trigger: notify on new comment ─────────────────────────────────

export const onCommentCreated = functions.firestore.onDocumentCreated(
  "snap_submissions/{submissionId}/comments/{commentId}",
  async (event) => {
    const comment = event.data?.data() as Record<string, unknown> | undefined;
    if (!comment) return;

    // Only fan-out when the commenter explicitly checked "Notify".
    if (comment.notify !== true) return;

    const submissionId = event.params.submissionId;
    const submissionDoc = await db.collection("snap_submissions").doc(submissionId).get();
    if (!submissionDoc.exists) return;
    const submission = submissionDoc.data()!;
    const tenantId = submission.tenantId as string;
    const snapNumber = submission.snapNumber as number | undefined;
    const category = ((submission.formData as Record<string, unknown>)?.category as string) || "Snap";

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
    const commentText = he((comment.text as string) || "");

    await Promise.all(
      Array.from(commenterUids).map(async (uid) => {
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) return;
        const userData = userDoc.data()!;
        if (!userData.notifyOnComment) return;
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
          }),
        });
      })
    );
  }
);

// ── shareFeedWithTenant ──────────────────────────────────────────────────────

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
      (d) => d.data().grantedTenantId === granteeUid && d.data().status === "active"
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

// ── getAvailableTenants ───────────────────────────────────────────────────────

export const getAvailableTenants = functions.https.onCall(
  { enforceAppCheck: false, invoker: 'public' },
  async (request) => {
    if (!request.auth) throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");

    // Verify caller is a tenant or admin
    // Support legacy docs that have role (string) instead of roles (array)
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    const callerData = callerDoc.data() || {};
    const callerRoles: string[] = Array.isArray(callerData.roles)
      ? (callerData.roles as string[])
      : callerData.role
      ? [callerData.role as string]
      : [];
    if (!callerRoles.includes("tenant") && !callerRoles.includes("admin")) {
      throw new functions.https.HttpsError("permission-denied", "Only tenants can list other tenants.");
    }

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
