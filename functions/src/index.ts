import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import * as sgMail from "@sendgrid/mail";
import axios from "axios";
import { snapNotificationEmail, clientInvitationEmail, commentNotificationEmail } from "./emailTemplates";

admin.initializeApp();
const db = admin.firestore();
const auth = admin.auth();
const secretClient = new SecretManagerServiceClient();

const PROJECT_ID = "snap4knack2";
const APP_DOMAIN = "https://snap4knack2.web.app";
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
const SENDGRID_FROM = "noreply@finemountain.com";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSendGridKey(): Promise<string> {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${PROJECT_ID}/secrets/SENDGRID_API_KEY/versions/latest`,
    });
    return version.payload?.data?.toString() || SENDGRID_API_KEY;
  } catch {
    return SENDGRID_API_KEY;
  }
}

async function getKnackApiKey(secretName: string): Promise<string> {
  const [version] = await secretClient.accessSecretVersion({ name: secretName });
  return version.payload?.data?.toString() || "";
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
      payload: { data: Buffer.from(apiKey) },
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

    const apiKey = await getKnackApiKey(secretName);

    // Fetch all objects from Knack API
    const res = await axios.get(`https://api.knack.com/v1/objects`, {
      headers: { "X-Knack-Application-Id": appId, "X-Knack-REST-API-Key": apiKey },
    });

    const objects: Array<{
      key: string; name: string;
      fields: Array<{ key: string; name: string; type: string }>;
    }> = res.data.objects || [];

    // Role objects are those with at least one 'password' type field
    const roles = objects
      .filter((obj) => obj.fields?.some((f) => f.type === "password"))
      .map((obj) => ({ key: obj.key, name: obj.name }));

    return { roles };
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

    // Create invitation doc
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

    // Get tenant info for email
    const tenantDoc = await db.collection("tenants").doc(tenantId).get();
    const tenantName = tenantDoc.data()?.name || "Your Team";

    // Send invite email
    const key = await getSendGridKey();
    if (key) {
      sgMail.setApiKey(key);
      const mailOpts = clientInvitationEmail({
        recipientEmail: email,
        tenantName,
        inviteUrl: `${APP_DOMAIN}/accept-invite?token=${token}&id=${invRef.id}`,
      });
      await sgMail.send({ from: SENDGRID_FROM, ...mailOpts });
    }

    return { invitationId: invRef.id };
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

    const uid = request.auth.uid;

    // Grant client access
    await auth.setCustomUserClaims(uid, { role: "client" });

    // Update user doc with plugin access
    const userRef = db.collection("users").doc(uid);
    await userRef.set(
      {
        role: "client",
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

export const issueWidgetToken = functions.https.onCall(
  { enforceAppCheck: false },
  async (request) => {
    const { pluginId, tenantId, knackUserId, knackUserRole } = request.data as {
      pluginId: string; tenantId: string; knackUserId: string; knackUserRole: string;
    };
    if (!pluginId || !tenantId || !knackUserId) {
      throw new functions.https.HttpsError("invalid-argument", "Missing required widget params.");
    }

    // Verify plugin exists and is active
    const pluginDoc = await db.collection("tenants").doc(tenantId).collection("snapPlugins").doc(pluginId).get();
    if (!pluginDoc.exists || pluginDoc.data()?.status !== "active") {
      throw new functions.https.HttpsError("not-found", "Plugin not found or inactive.");
    }

    // Check role is in selectedRoles
    const selectedRoles: string[] = pluginDoc.data()?.selectedRoles || [];
    if (!selectedRoles.includes(knackUserRole)) {
      throw new functions.https.HttpsError("permission-denied", "User role not authorized for this plugin.");
    }

    // Issue anonymous custom token tied to Knack user
    const widgetUid = `widget-${tenantId}-${knackUserId}`;
    const token = await auth.createCustomToken(widgetUid, {
      role: "widget",
      tenantId,
      pluginId,
      knackUserId,
      knackUserRole,
    });

    return { token };
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
    if (!tenantData?.notifyOnSnap) return;
    if (notifyEmails.length === 0) return;

    const key = await getSendGridKey();
    if (!key) return;
    sgMail.setApiKey(key);

    const category = ((snap.formData as Record<string, unknown>)?.category as string) || "Snap";
    const pageUrl = ((snap.context as Record<string, unknown>)?.pageUrl as string) || "";

    await Promise.all(
      notifyEmails.map((email) =>
        sgMail.send({
          from: SENDGRID_FROM,
          ...snapNotificationEmail({
            recipientEmail: email,
            pluginName: pluginDoc.data()?.name || "Plugin",
            category,
            pageUrl,
            dashboardUrl: `${APP_DOMAIN}/snap-feed/${event.params.submissionId}`,
          }),
        })
      )
    );
  }
);

// ── Firestore trigger: notify on new comment ─────────────────────────────────

export const onCommentCreated = functions.firestore.onDocumentCreated(
  "snap_submissions/{submissionId}/comments/{commentId}",
  async (event) => {
    const comment = event.data?.data() as Record<string, unknown> | undefined;
    if (!comment) return;

    const submissionDoc = await db.collection("snap_submissions").doc(event.params.submissionId).get();
    if (!submissionDoc.exists) return;
    const submission = submissionDoc.data()!;
    const tenantId = submission.tenantId as string;

    const userDoc = await db.collection("users").doc(tenantId).get();
    if (!userDoc.data()?.notifyOnComment) return;
    const tenantEmail = userDoc.data()?.email as string;
    if (!tenantEmail) return;

    const key = await getSendGridKey();
    if (!key) return;
    sgMail.setApiKey(key);

    await sgMail.send({
      from: SENDGRID_FROM,
      ...commentNotificationEmail({
        recipientEmail: tenantEmail,
        authorName: (comment.authorName as string) || "Someone",
        commentText: (comment.text as string) || "",
        dashboardUrl: `${APP_DOMAIN}/snap-feed/${event.params.submissionId}`,
      }),
    });
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

    // Remove plugin access from client user doc
    if (inv.acceptedBy) {
      await db.collection("users").doc(inv.acceptedBy).update({
        clientAccess: admin.firestore.FieldValue.arrayRemove(...inv.pluginIds),
      });
    }

    return { success: true };
  }
);
