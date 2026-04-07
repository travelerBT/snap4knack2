/**
 * Snap4Knack MCP Server
 *
 * Hosted Firebase Cloud Function exposing an MCP (Model Context Protocol) endpoint.
 * AI agents authenticate with an API key (tenants/{id}/api_keys) and get access to
 * 8 tools for reading, triaging, and creating snap submissions.
 *
 * Transport: Streamable HTTP (stateless per-request — correct for Cloud Functions)
 * Auth: Bearer token → validated against api_keys collection group in Firestore
 */

import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { dlpRedactText, stripQueryParams } from "./utils";
import type { Request, Response } from "express";

const db = admin.firestore();
const storage = admin.storage();

const STORAGE_BUCKET = "snap4knack2.firebasestorage.app";
const ALLOWED_STATUSES = ["backlog", "new", "in_progress", "ready_for_testing", "resolved", "archived"] as const;
const ALLOWED_PRIORITIES = ["low", "medium", "high", "critical"] as const;

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Looks up an API key across all tenants via a collection group query.
 * Returns the owning tenantId if the key is active, null otherwise.
 */
async function validateApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey || !rawKey.startsWith("sk_")) return null;
  const snap = await db.collectionGroup("api_keys")
    .where("keyHash", "==", rawKey)
    .where("status", "==", "active")
    .limit(1)
    .get();
  if (snap.empty) return null;
  // Parent path: tenants/{tenantId}/api_keys/{keyId} → parent.parent = tenants/{tenantId}
  const tenantId = snap.docs[0].ref.parent.parent?.id;
  return tenantId ?? null;
}

// ── Screenshot upload helpers ─────────────────────────────────────────────────

/**
 * Upload a base64-encoded screenshot to Firebase Storage.
 * - Non-HIPAA: goes directly to the live path, sets a download token for a stable URL.
 * - HIPAA: goes to the staging path; `onScreenshotStaged` trigger DLP-redacts it asynchronously.
 */
async function uploadScreenshot(opts: {
  base64: string;
  tenantId: string;
  snapId: string;
  hipaa: boolean;
}): Promise<{ screenshotUrl: string | null; screenshotStatus: string | null }> {
  const { base64, tenantId, snapId, hipaa } = opts;

  // Strip data-URL prefix if present (e.g. "data:image/png;base64,...")
  const b64 = base64.replace(/^data:[^;]+;base64,/, "");
  const imageBuffer = Buffer.from(b64, "base64");

  const bucket = storage.bucket(STORAGE_BUCKET);

  if (hipaa) {
    // Upload to staging — the existing `onScreenshotStaged` trigger handles DLP redaction
    const stagingPath = `snap_screenshots_staging/${tenantId}/${snapId}.png`;
    await bucket.file(stagingPath).save(imageBuffer, {
      contentType: "image/png",
      resumable: false,
    });
    return { screenshotUrl: null, screenshotStatus: "scanning" };
  } else {
    // Upload directly to live path with a stable download token
    const livePath = `snap_screenshots/${tenantId}/${snapId}.png`;
    const liveFile = bucket.file(livePath);
    await liveFile.save(imageBuffer, { contentType: "image/png", resumable: false });
    const token = randomUUID();
    await liveFile.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    const screenshotUrl =
      `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/` +
      `${encodeURIComponent(livePath)}?alt=media&token=${token}`;
    return { screenshotUrl, screenshotStatus: null };
  }
}

// ── MCP handler (one server instance per request — stateless) ─────────────────

async function handleMcpRequest(tenantId: string, req: Request, res: Response) {
  const server = new McpServer({
    name: "snap4knack",
    version: "1.0.0",
  });

  // ── Tool: list_snaps ──────────────────────────────────────────────────────
  server.registerTool("list_snaps", {
    title: "List Snap Submissions",
    description: "List snap submissions for your account. Filter by status, priority, source, or plugin. Returns newest first.",
    inputSchema: {
      status: z.enum(ALLOWED_STATUSES).optional().describe("Filter by workflow status"),
      priority: z.enum(ALLOWED_PRIORITIES).optional().describe("Filter by priority"),
      source: z.enum(["knack", "react", "ai_agent"]).optional().describe("Filter by submission source"),
      pluginId: z.string().optional().describe("Filter by snap plugin ID"),
      limit: z.number().int().min(1).max(100).optional().default(20).describe("Number of results (default 20, max 100)"),
    },
  }, async (args) => {
    let q = db.collection("snap_submissions")
      .where("tenantId", "==", tenantId)
      .orderBy("createdAt", "desc")
      .limit(args.limit ?? 20) as FirebaseFirestore.Query;

    if (args.status) q = q.where("status", "==", args.status);
    if (args.priority) q = q.where("priority", "==", args.priority);
    if (args.source) q = q.where("source", "==", args.source);
    if (args.pluginId) q = q.where("pluginId", "==", args.pluginId);

    const snap = await q.get();
    const results = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        snapNumber: data.snapNumber ?? null,
        status: data.status,
        priority: data.priority,
        source: data.source,
        type: data.type,
        pluginId: data.pluginId,
        category: data.formData?.category ?? null,
        description: data.formData?.description ?? null,
        pageUrl: data.context?.pageUrl ?? null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
        assignedToName: data.assignedToName ?? null,
        hipaaEnabled: data.hipaaEnabled ?? false,
        screenshotUrl: data.screenshotUrl ?? null,
      };
    });

    return {
      content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
    };
  });

  // ── Tool: get_snap ────────────────────────────────────────────────────────
  server.registerTool("get_snap", {
    title: "Get Snap Detail",
    description: "Get the full details of a single snap submission by ID.",
    inputSchema: {
      snapId: z.string().describe("The snap submission document ID"),
    },
  }, async (args) => {
    const doc = await db.collection("snap_submissions").doc(args.snapId).get();
    if (!doc.exists) {
      return { isError: true, content: [{ type: "text" as const, text: `Snap ${args.snapId} not found` }] };
    }
    const data = doc.data()!;
    if (data.tenantId !== tenantId) {
      return { isError: true, content: [{ type: "text" as const, text: "Access denied" }] };
    }
    const result = {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    };
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Tool: list_plugins ────────────────────────────────────────────────────
  server.registerTool("list_plugins", {
    title: "List Snap Plugins",
    description: "List all snap plugins for your account. Use pluginId values with create_snap or list_snaps.",
    inputSchema: {},
  }, async () => {
    const snap = await db.collection("tenants").doc(tenantId).collection("snapPlugins").get();
    const results = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        status: data.status,
        connectionId: data.connectionId ?? null,
        appType: data.appType ?? null,
        hipaaEnabled: data.hipaaEnabled ?? false,
      };
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
  });

  // ── Tool: list_connections ────────────────────────────────────────────────
  server.registerTool("list_connections", {
    title: "List Knack Connections",
    description: "List all Knack app connections for your account.",
    inputSchema: {},
  }, async () => {
    const snap = await db.collection("tenants").doc(tenantId).collection("connections").get();
    const results = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name,
        appName: data.appName ?? null,
        appId: data.appId,
        status: data.status,
      };
    });
    return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
  });

  // ── Tool: update_snap_status ──────────────────────────────────────────────
  server.registerTool("update_snap_status", {
    title: "Update Snap Status",
    description: "Change the workflow status of a snap submission. Also writes a history entry.",
    inputSchema: {
      snapId: z.string().describe("The snap submission document ID"),
      status: z.enum(ALLOWED_STATUSES).describe("New status value"),
      changedByName: z.string().optional().default("AI Agent").describe("Display name for the history entry"),
    },
  }, async (args) => {
    const docRef = db.collection("snap_submissions").doc(args.snapId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { isError: true, content: [{ type: "text" as const, text: `Snap ${args.snapId} not found` }] };
    }
    const data = doc.data()!;
    if (data.tenantId !== tenantId) {
      return { isError: true, content: [{ type: "text" as const, text: "Access denied" }] };
    }
    const fromValue = data.status;
    if (fromValue === args.status) {
      return { content: [{ type: "text" as const, text: `Status is already ${args.status}` }] };
    }
    await docRef.update({ status: args.status });
    await docRef.collection("history").add({
      changedBy: `api_agent_${tenantId}`,
      changedByName: args.changedByName ?? "AI Agent",
      changeType: "status",
      fromValue,
      toValue: args.status,
      changedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { content: [{ type: "text" as const, text: `Status updated from "${fromValue}" to "${args.status}"` }] };
  });

  // ── Tool: update_snap_priority ────────────────────────────────────────────
  server.registerTool("update_snap_priority", {
    title: "Update Snap Priority",
    description: "Change the priority of a snap submission.",
    inputSchema: {
      snapId: z.string().describe("The snap submission document ID"),
      priority: z.enum(ALLOWED_PRIORITIES).describe("New priority value"),
    },
  }, async (args) => {
    const docRef = db.collection("snap_submissions").doc(args.snapId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { isError: true, content: [{ type: "text" as const, text: `Snap ${args.snapId} not found` }] };
    }
    if (doc.data()!.tenantId !== tenantId) {
      return { isError: true, content: [{ type: "text" as const, text: "Access denied" }] };
    }
    await docRef.update({ priority: args.priority });
    return { content: [{ type: "text" as const, text: `Priority updated to "${args.priority}"` }] };
  });

  // ── Tool: add_comment ─────────────────────────────────────────────────────
  server.registerTool("add_comment", {
    title: "Add Comment",
    description: "Add a comment to a snap submission. The comment appears in the snap detail view and triggers comment notifications.",
    inputSchema: {
      snapId: z.string().describe("The snap submission document ID"),
      text: z.string().min(1).max(5000).describe("Comment text"),
      authorName: z.string().optional().default("AI Agent").describe("Display name for the comment author"),
    },
  }, async (args) => {
    const docRef = db.collection("snap_submissions").doc(args.snapId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { isError: true, content: [{ type: "text" as const, text: `Snap ${args.snapId} not found` }] };
    }
    if (doc.data()!.tenantId !== tenantId) {
      return { isError: true, content: [{ type: "text" as const, text: "Access denied" }] };
    }
    const commentRef = await docRef.collection("comments").add({
      text: args.text,
      authorName: args.authorName ?? "AI Agent",
      authorUid: `api_agent_${tenantId}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      notify: true,
    });
    return { content: [{ type: "text" as const, text: `Comment added with ID ${commentRef.id}` }] };
  });

  // ── Tool: create_snap ─────────────────────────────────────────────────────
  server.registerTool("create_snap", {
    title: "Create Snap",
    description: [
      "Submit a new snap on behalf of an AI monitoring agent. Full parity with the widget — supports screenshots, console errors, log entries, and HIPAA mode.",
      "Use this when a monitoring agent detects an issue in a monitored application (e.g. docgen4knack HIPAA error) and needs to file it as a development task.",
      "HIPAA-enabled plugins: description is DLP-redacted, screenshots go through the staging DLP pipeline, console errors and logs are stripped.",
    ].join(" "),
    inputSchema: {
      pluginId: z.string().describe("The snap plugin ID to submit to. Use list_plugins to find available plugin IDs."),
      description: z.string().min(1).max(5000).describe("Description of the issue. Will be DLP-redacted on HIPAA plugins."),
      category: z.string().optional().default("Other").describe("Issue category (e.g. Bug, Feature Request, Question, Other)"),
      priority: z.enum(ALLOWED_PRIORITIES).optional().default("medium").describe("Issue priority"),
      type: z.string().optional().default("ai_submission").describe("Capture type — use ai_submission for AI-originated snaps"),
      pageUrl: z.string().optional().describe("URL of the page where the issue was detected. Query params stripped on HIPAA plugins."),
      screenshotBase64: z.string().optional().describe("Base64-encoded PNG or JPEG screenshot. Data-URL prefix (data:image/png;base64,...) is accepted and stripped automatically."),
      consoleErrors: z.array(z.object({
        level: z.string(),
        message: z.string(),
        timestamp: z.number().optional(),
      })).optional().default([]).describe("Console error/log entries captured from the monitored application. Stripped on HIPAA plugins."),
      logEntries: z.array(z.string()).optional().default([]).describe("Free-form log lines (e.g. server logs, stack traces). Stripped on HIPAA plugins."),
      customFields: z.record(z.string(), z.unknown()).optional().default({}).describe("Additional metadata key/value pairs to attach to the snap."),
    },
  }, async (args) => {
    // 1. Verify pluginId belongs to this tenant
    const pluginDoc = await db.collection("tenants").doc(tenantId)
      .collection("snapPlugins").doc(args.pluginId).get();
    if (!pluginDoc.exists) {
      return { isError: true, content: [{ type: "text" as const, text: `Plugin ${args.pluginId} not found or not accessible` }] };
    }
    const pluginData = pluginDoc.data()!;
    const hipaaEnabled = pluginData.hipaaEnabled === true;
    const retentionDays: number = hipaaEnabled ? 2555 : ((pluginData.retentionDays as number) ?? 365);

    // 2. Sanitise inputs — HIPAA mode strips or redacts PHI
    let description = args.description.slice(0, 5000);
    if (hipaaEnabled) {
      description = await dlpRedactText(description);
    }

    let pageUrl = args.pageUrl ?? null;
    if (hipaaEnabled && pageUrl) {
      pageUrl = stripQueryParams(pageUrl);
    }

    const consoleErrors = hipaaEnabled ? [] : (args.consoleErrors ?? []).slice(0, 100);
    const logEntries = hipaaEnabled ? [] : (args.logEntries ?? []).slice(0, 200);

    const formData: Record<string, unknown> = {
      description,
      category: args.category ?? "Other",
      ...(args.customFields ?? {}),
    };

    const context: Record<string, unknown> = {
      pageUrl,
      submittedVia: "mcp_agent",
    };

    // 3. Create the Firestore doc ref first (needed for staging path before write)
    const newDocRef = db.collection("snap_submissions").doc();
    const snapId = newDocRef.id;

    // 4. Handle screenshot upload
    let screenshotUrl: string | null = null;
    let screenshotStatus: string | null = null;

    if (args.screenshotBase64) {
      try {
        const uploadResult = await uploadScreenshot({
          base64: args.screenshotBase64,
          tenantId,
          snapId,
          hipaa: hipaaEnabled,
        });
        screenshotUrl = uploadResult.screenshotUrl;
        screenshotStatus = uploadResult.screenshotStatus;
      } catch (e) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Screenshot upload failed: ${e instanceof Error ? e.message : String(e)}` }],
        };
      }
    }

    // 5. Build submission document (mirrors submitSnap in index.ts)
    const submission: Record<string, unknown> = {
      tenantId,
      pluginId: args.pluginId,
      type: args.type ?? "ai_submission",
      source: "ai_agent",
      screenshotUrl,
      screenshotStatus,
      recordingUrl: null,
      annotationData: null,
      consoleErrors,
      logEntries,
      formData,
      context,
      priority: args.priority ?? "medium",
      status: "new",
      hipaaEnabled,
      retentionDays,
      notifySubmitter: false,
      submitterEmail: null,
      assignedToUid: tenantId,
      assignedToName: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 6. Atomic snap counter transaction (sequential snapNumber per tenant)
    let snapNumber: number;
    await db.runTransaction(async (tx) => {
      const counterRef = db.collection("snap_counters").doc(tenantId);
      const counterDoc = await tx.get(counterRef);
      snapNumber = (counterDoc.exists ? (counterDoc.data()?.count ?? 0) : 0) + 1;
      tx.set(counterRef, { count: snapNumber }, { merge: true });
      tx.set(newDocRef, { ...submission, snapNumber });
    });

    // 7. HIPAA audit log (best-effort, non-blocking)
    if (hipaaEnabled) {
      db.collection("audit_log").add({
        eventType: "snap_created",
        snapId,
        tenantId,
        pluginId: args.pluginId,
        actorUid: null,
        actorName: "AI Agent (MCP)",
        actorEmail: "",
        actorRole: "ai_agent",
        detail: `category: ${args.category ?? "Other"}; priority: ${args.priority ?? "medium"}`,
        eventAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          id: snapId,
          snapNumber: snapNumber!,
          status: "new",
          hipaaEnabled,
          screenshotStatus: screenshotStatus ?? (args.screenshotBase64 ? "ready" : null),
          message: hipaaEnabled
            ? "Snap created. Description was DLP-redacted. Screenshot queued for DLP scanning."
            : "Snap created successfully.",
        }, null, 2),
      }],
    };
  });

  // ── Connect transport and handle request ──────────────────────────────────
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session state between Cloud Function invocations
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// ── Cloud Function export ─────────────────────────────────────────────────────

export const mcp = functions.https.onRequest(
  { cors: true, timeoutSeconds: 120 },
  async (req: Request, res: Response) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    // Validate API key from Authorization header
    const authHeader = (req.headers.authorization as string) || "";
    const rawKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!rawKey) {
      res.status(401).json({ error: "Missing Authorization header. Expected: Bearer sk_..." });
      return;
    }

    const tenantId = await validateApiKey(rawKey);
    if (!tenantId) {
      res.status(401).json({ error: "Invalid or revoked API key" });
      return;
    }

    try {
      await handleMcpRequest(tenantId, req, res);
    } catch (e) {
      console.error("[MCP] Unhandled error:", e);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  }
);
