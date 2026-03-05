import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import cors from "cors";
import type { Request, Response } from "express";

const db = admin.firestore();
const corsMiddleware = cors({ origin: true });

// ── POST /api/v1/snaps ────────────────────────────────────────────────────────
// Widget submits snaps via this endpoint using a Firebase ID token for auth.

export const submitSnap = functions.https.onRequest(
  { cors: ["*"] },
  async (req: Request, res: Response) => {
    corsMiddleware(req, res, async () => {
      if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }

      // Verify Firebase ID token (issued by issueWidgetToken cloud fn)
      const authHeader = req.headers.authorization || "";
      if (!authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const idToken = authHeader.split("Bearer ")[1];

      let decoded: admin.auth.DecodedIdToken;
      try {
        decoded = await admin.auth().verifyIdToken(idToken);
      } catch {
        res.status(401).json({ error: "Invalid token" });
        return;
      }

      const { pluginId, tenantId, knackUserId, knackUserRole } = decoded as Record<string, string> & admin.auth.DecodedIdToken;
      if (!pluginId || !tenantId) {
        res.status(401).json({ error: "Token missing plugin claims" });
        return;
      }

      const body = req.body as {
        type?: string;
        screenshotUrl?: string;
        recordingUrl?: string;
        annotationData?: unknown;
        consoleErrors?: unknown[];
        formData?: Record<string, unknown>;
        context?: Record<string, unknown>;
        priority?: string;
      };

      const snap = {
        pluginId,
        tenantId,
        submittedBy: decoded.uid,
        type: body.type || "full_viewport",
        screenshotUrl: body.screenshotUrl || null,
        recordingUrl: body.recordingUrl || null,
        annotationData: body.annotationData || null,
        consoleErrors: body.consoleErrors || [],
        formData: body.formData || {},
        context: {
          ...(body.context || {}),
          knackUserId: knackUserId || null,
          knackRole: knackUserRole || null,
        },
        status: "new",
        priority: body.priority || "medium",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const ref = await db.collection("snap_submissions").add(snap);
      res.status(201).json({ id: ref.id });
    });
  }
);

// ── GET /api/v1/health ────────────────────────────────────────────────────────

export const healthCheck = functions.https.onRequest(
  { cors: ["*"] },
  (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  }
);
