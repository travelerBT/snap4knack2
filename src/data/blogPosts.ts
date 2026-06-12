export interface BlogPost {
  slug: string;
  title: string;
  date: string;           // ISO date string
  tags: string[];
  summary: string;
  content: BlogSection[]; // structured sections → rendered by BlogPost.tsx
}

export interface BlogSection {
  type: 'paragraph' | 'h2' | 'h3' | 'ul' | 'ol' | 'callout' | 'divider';
  text?: string;
  items?: string[];       // for ul / ol
  variant?: 'info' | 'success' | 'warning'; // for callout
}

export const ALL_TAGS = ['Release Notes', 'Product', 'Engineering', 'HIPAA', 'AI Agent'] as const;

export const blogPosts: BlogPost[] = [
  {
    slug: 'security-hardening-june-2026',
    title: 'Security Hardening — Tenant Isolation for AI Agents & Client Invitations',
    date: '2026-06-12',
    tags: ['Release Notes', 'HIPAA', 'Engineering', 'AI Agent'],
    summary:
      'A proactive internal security review surfaced two cross-tenant access-control gaps — one in the AI-agent (MCP) endpoint and one in client invitations. Both are now patched and deployed. Tenants using AI-agent API keys should rotate them as a precaution.',
    content: [
      {
        type: 'paragraph',
        text: 'Keeping each tenant\'s data — especially PHI on HIPAA-enabled plugins — strictly isolated is the most important promise Snap4Knack makes. During a routine internal security review we identified two places where that isolation was not enforced as tightly as it should have been. We have fixed both, deployed the fixes to production, and are documenting them here in the interest of transparency.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🤖 AI Agent (MCP) Endpoint Now Requires Authentication' },
      {
        type: 'paragraph',
        text: 'The MCP endpoint that lets AI agents read and triage your snaps is designed to authenticate with a per-tenant API key (the keys you create on the API Keys page). A refactor had inadvertently changed that endpoint to identify the tenant from a request parameter instead of validating the API key — which meant the key was not actually being checked.',
      },
      {
        type: 'ul',
        items: [
          'The endpoint now requires a valid, active API key in the Authorization header (Authorization: Bearer sk_…) on every request, exactly as the API Keys page documents.',
          'The tenant is derived from the key itself and can never be supplied or overridden by the caller, so an agent can only ever reach the account that owns its key.',
          'Requests with a missing, malformed, or revoked key are rejected with a 401 before any data is touched.',
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        text: 'As a precaution, we recommend that any tenant using AI-agent API keys revoke and regenerate them on the API Keys page. Revoking a key takes effect immediately.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🔐 Client Invitations Scoped to Plugins You Own' },
      {
        type: 'paragraph',
        text: 'When inviting a client to a plugin, the server now verifies that every plugin in the invitation actually belongs to the inviting account before the invitation is created. Previously the list of plugins was accepted without that ownership check, which — because feed access is granted by plugin — could have been used to grant visibility into a plugin owned by a different tenant.',
      },
      {
        type: 'ul',
        items: [
          'Invitations referencing any plugin you do not own are now rejected outright with a clear permission error.',
          'Existing client access and the invitation-acceptance flow are unchanged for legitimate invitations — there is no action required for clients you have already invited.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Both fixes are enforced server-side in Cloud Functions. There are no changes to how you use the product day to day.',
      },
    ],
  },
  {
    slug: 'release-notes-june-8-2026',
    title: 'Release Notes — Required Descriptions & Console Logs On by Default',
    date: '2026-06-08',
    tags: ['Release Notes', 'Product', 'Engineering'],
    summary:
      'Snap submissions now require a description before they can be sent, ensuring every ticket arrives with the context your team needs. Console logs are also captured by default on every submission so developers always have the browser output on hand.',
    content: [
      {
        type: 'paragraph',
        text: 'Two small but high-impact quality-of-life improvements ship today. Both were driven by the same observation: snaps were arriving without enough context to act on. A required description field and always-on console capture close that gap.',
      },
      { type: 'divider' },

      { type: 'h2', text: '✏️ Description Is Now Required' },
      {
        type: 'paragraph',
        text: 'The Description field in the snap submission form is now mandatory. Clicking "Send Snap" without filling it in highlights the textarea with a red border and focuses it — no snap is sent until a description is provided.',
      },
      {
        type: 'ul',
        items: [
          'Client-side: the submit button handler validates the field and blocks submission if it is empty.',
          'Server-side: the submitSnap Cloud Function returns a 400 Bad Request if description is missing or blank, providing a second layer of enforcement.',
          'No changes to the Firestore data model — description was already stored as part of formData.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Existing snaps without a description are unaffected. The requirement applies only to new submissions going forward.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🖥️ Console Logs Included by Default' },
      {
        type: 'paragraph',
        text: 'The "Include Console" checkbox in the submission form is now checked by default. Every snap automatically includes the browser\'s captured console output — logs, warnings, errors, and unhandled promise rejections — unless the submitter explicitly unchecks it.',
      },
      {
        type: 'ul',
        items: [
          'The widget already captured all console levels (log, info, warn, error, debug) in the background — this change simply ensures that data is attached to every snap by default.',
          'Submitters can still uncheck "Include Console" if they prefer not to send it.',
          'HIPAA plugins are unaffected: console entries continue to be stripped server-side regardless of the checkbox state.',
          'Up to 100 console entries are included per submission, oldest entries dropped first when the buffer fills.',
        ],
      },
      {
        type: 'callout',
        variant: 'success',
        text: 'With both changes in place, every new snap your team receives will have a written description and the full browser console output — meaning less back-and-forth asking submitters for more detail.',
      },

      { type: 'divider' },

      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'Widget (snap4knack.js): submit handler now validates description before proceeding; sets border to red and focuses field on failure.',
          'Widget (snap4knack.js): "Include Console" checkbox initialised with checked = true.',
          'Cloud Function submitSnap (api.ts): returns 400 if formData.description is absent or whitespace-only.',
          'firebase.json: removed unused Realtime Database configuration block that was preventing clean deploys.',
        ],
      },
    ],
  },
  {
    slug: 'release-notes-june-2026',
    title: 'Release Notes — HIPAA Email Notifications, DLP Toggle & Bug Fixes',
    date: '2026-06-04',
    tags: ['Release Notes', 'Product', 'Engineering', 'HIPAA'],
    summary:
      'Knack submitters can now receive confirmation, comment, and status-change emails — all HIPAA-safe. A new per-plugin DLP toggle lets you disable PHI scanning when needed. Plus three bug fixes: status emails were silently failing, comment notifications never reached Knack submitters, and the submission detail view was hiding email addresses.',
    content: [
      {
        type: 'paragraph',
        text: 'This release closes the feedback loop for Knack-embedded widget users: from the moment they submit a snap to every status change and comment that follows, they can now receive timely, HIPAA-compliant email notifications. It also adds a new operational control for HIPAA plugins and patches three bugs that were silently dropping emails.',
      },
      { type: 'divider' },

      { type: 'h2', text: '📧 New: Confirmation Email on Submission' },
      {
        type: 'paragraph',
        text: 'When a Knack user submits a snap and the widget detects a valid email address on their account, a new checkbox appears: "Send me a confirmation email." If checked, the submitter immediately receives a receipt acknowledging that their snap was received.',
      },
      {
        type: 'ul',
        items: [
          'The email includes the plugin name, snap number, and category — no PHI, no page URL.',
          'A HIPAA compliance footer is always appended to confirmation emails.',
          'The checkbox defaults to unchecked and is entirely opt-in.',
          'Works for both Classic Knack (V2, synchronous user attributes) and Next-Gen Knack (V3, Promise-based).',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Confirmation emails are sent asynchronously after the snap is written to Firestore — they do not affect submission latency.',
      },

      { type: 'divider' },

      { type: 'h2', text: '📧 New: Comment Notification for Knack Submitters' },
      {
        type: 'paragraph',
        text: 'Previously, comment notifications were sent only to other dashboard users who had commented on a snap — Knack submitters were excluded because they have no Firebase account and therefore no UID in the commenter set. That gap is now closed.',
      },
      {
        type: 'ul',
        items: [
          'When a new comment is posted, the system reads the submitterEmail stored on the snap document and sends a notification directly to the Knack submitter regardless of whether they have a Firebase account.',
          'For HIPAA-enabled plugins, the email body is intentionally minimal: "A new comment has been added. Log in to view it securely." No snap details, no page URL, no PHI.',
          'For standard plugins, the existing comment notification template is used.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '📧 New: Status Change Email for Knack Submitters' },
      {
        type: 'paragraph',
        text: 'Submitters who check "Notify me when status changes" at submission time will now receive an email each time a team member updates their snap\'s status — for example, from Open to In Progress, or In Progress to Resolved.',
      },
      {
        type: 'ul',
        items: [
          'The checkbox defaults to checked in the widget and is shown whenever the submitter\'s email is available.',
          'For HIPAA plugins, the notification omits the page URL and includes the HIPAA compliance footer.',
          'The submitterEmail and notifySubmitter preference are stored as top-level fields on the snap document at write time.',
        ],
      },
      {
        type: 'callout',
        variant: 'success',
        text: 'These three notification types together mean that a Knack user who submits a bug report gets an immediate receipt, learns when the team picks it up, and knows when it is resolved — without ever needing to log into Snap4Knack.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🔒 New: Per-Plugin DLP PHI Scanning Toggle' },
      {
        type: 'paragraph',
        text: 'Google Cloud DLP scans screenshots and text descriptions for Protected Health Information before writing to Firestore. For most HIPAA use cases this is exactly right — but some workflows involve data that is already de-identified, or plugins where the performance overhead of DLP is not justified.',
      },
      {
        type: 'paragraph',
        text: 'A new PHI Scanning toggle in Plugin Details → HIPAA section lets administrators disable DLP on a per-plugin basis.',
      },
      {
        type: 'ul',
        items: [
          'PHI Scanning defaults to ON for all plugins. Disabling it requires confirming an explicit acknowledgment modal.',
          'When scanning is off, an amber warning banner is shown persistently on the plugin settings page as a continuous reminder.',
          'When scanning is off, the snap document records dlpSkipped: true so the audit trail reflects the change.',
          'The dlpEnabled field is stored on the plugin document in Firestore. All four scan entry points — submitSnap, onScreenshotStaged, onCommentCreated, and onSnapStatusUpdated — read this flag before invoking DLP.',
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        text: 'Disabling PHI Scanning means sensitive health information may be stored unredacted. Only disable this setting if you have verified that submissions from this plugin will not contain PHI.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🐛 Fix: Status Change Emails Were Silently Failing' },
      {
        type: 'paragraph',
        text: 'The onSnapStatusUpdated Cloud Function was calling sgMail.send() without first calling sgMail.setApiKey(). Every attempted send threw a "SendGrid API key not set" error that was caught by the surrounding try/catch and logged — but only to Cloud Functions logs, which are not monitored in real time. From the outside it appeared as if the feature simply did not exist.',
      },
      {
        type: 'ul',
        items: [
          'Fixed: the function now fetches the SendGrid API key from Secret Manager and calls sgMail.setApiKey() before each send, consistent with every other email-sending function in the codebase.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🐛 Fix: Comment Notifications Never Reached Knack Submitters' },
      {
        type: 'paragraph',
        text: 'The onCommentCreated function built a set of Firebase UIDs to notify and returned early if the set was empty. Since Knack submitters have no Firebase UID, the set was always empty for snaps submitted via the widget — and the function exited before the submitter notification path was ever reached.',
      },
      {
        type: 'ul',
        items: [
          'Fixed: the early-return guard now checks both paths — it only exits early if there are zero Firebase commenters to notify AND the submitter should not be notified.',
          'The submitter notification now runs independently of whether there are Firebase commenters.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🐛 Fix: Email Address Hidden in Submission Detail View' },
      {
        type: 'paragraph',
        text: 'The Snap Detail page showed "Submitted By" as a fallback chain: if a Knack name was present, the email address was never displayed. For submitters who have both a name and an email on their Knack profile, the email was stored in Firestore but invisible in the UI.',
      },
      {
        type: 'ul',
        items: [
          'Fixed: the submission info panel now shows "Submitted By" (name) and "Email" (address) as two separate fields when both are present.',
          'If only an email is available and no name, the email continues to appear in the "Submitted By" field as before.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'Widget (snap4knack.js): "Send me a confirmation" checkbox added; sendConfirmation field included in submission payload.',
          'Widget: context.knackUserEmail now populated from Knack user attributes and sent in the payload for both Classic and Next-Gen Knack.',
          'Widget: Console capture mode button restored to the mode selection step for all plugin types.',
          'Cloud Function submitSnap: reads dlpEnabled from plugin doc; gates all DLP calls on this flag; reads sendConfirmation and submitterEmail from payload; sends confirmation email asynchronously.',
          'Cloud Function onSnapStatusUpdated: getSendGridKey() now called before sgMail.send().',
          'Cloud Function onCommentCreated: reads submitterEmail from snap doc and sends notification independently of Firebase commenter set; respects dlpEnabled flag.',
          'Cloud Function onScreenshotStaged: reads dlpEnabled from plugin doc; sets dlpSkipped: true on snap doc when DLP is off.',
          'SnapDetail.tsx: Email shown as dedicated row alongside "Submitted By" name.',
          'SnapPlugin type: dlpEnabled?: boolean added to TypeScript interface.',
          'SnapPlugins.tsx: dlpEnabled: true included in addDoc payload for new plugins.',
        ],
      },
    ],
  },
  {
    slug: 'release-notes-may-2026',
    title: 'Release Notes — HIPAA Widget Fixes & Persistent Snap Feed Filters',
    date: '2026-05-31',
    tags: ['Release Notes', 'Product', 'Engineering', 'HIPAA'],
    summary:
      'Three widget bugs affecting HIPAA plugins are resolved: console errors now capture and DLP-redact correctly, submitters can opt in to status-change notifications, and the textarea focus issue is fixed. Snap Feed filters now persist across navigation.',
    content: [
      {
        type: 'paragraph',
        text: 'This release fixes three bugs that specifically affected HIPAA-enabled plugins, and adds a quality-of-life improvement to the Snap Feed filter bar.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🐛 Fix: Textarea Not Focusable in Widget (Intermittent)' },
      {
        type: 'paragraph',
        text: 'Some users reported that clicking into the Description textarea in the snap submission form would not focus the field, making it impossible to type. This was intermittent and harder to reproduce on slower machines.',
      },
      {
        type: 'paragraph',
        text: 'Root cause: a global pointerdown listener (capture phase) used to detect clicks on the FAB button was calling e.preventDefault() on every pointer event whose coordinates fell within the FAB\'s bounding rect. Because the FAB sits at the bottom-right corner and the drawer also occupies the right side of the screen, the coordinates could overlap — and preventDefault() on pointerdown suppresses the browser\'s default focus-assignment behavior.',
      },
      {
        type: 'ul',
        items: [
          'Fix: the pointerdown handler now returns immediately if the drawer is already open. The FAB is not actionable while the drawer is visible, so there is nothing to intercept.',
          'The fix applies to all capture modes and all plugin types — HIPAA and non-HIPAA alike.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🐛 Fix: HIPAA Plugins Not Capturing Console Errors' },
      {
        type: 'paragraph',
        text: 'The "Include Console" checkbox was hidden for HIPAA-enabled plugins, and the server was stripping all console error data from HIPAA submissions before writing to Firestore. This meant HIPAA users had no way to attach console output to a snap — even when it contained no PHI.',
      },
      {
        type: 'paragraph',
        text: 'Console logs can be invaluable for bug reports. The restriction was overly broad: the right control is DLP redaction, not omission.',
      },
      {
        type: 'ul',
        items: [
          'The "Include Console" checkbox is now shown for HIPAA plugins alongside all other plugin types.',
          'When the checkbox is checked on a HIPAA submission, the server DLP-redacts each console entry\'s message field using the same Google Cloud DLP pipeline already applied to the description field — scanning for names, SSNs, medical record numbers, dates of birth, and other HIPAA infoTypes.',
          'Entries that contain no PHI pass through unchanged. Entries with PHI have the sensitive spans replaced with [REDACTED] before being written to Firestore.',
          'The server-side strip (consoleErrors = hipaaEnabled ? [] : ...) has been removed.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Console errors are always captured in the browser from the moment the widget mounts — this change only affects whether they are attached to a submission and whether they survive the server write.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🐛 Fix: HIPAA Plugins Not Allowing Submitter Notifications' },
      {
        type: 'paragraph',
        text: 'The "Notify me when status changes" checkbox was hidden for HIPAA plugin submissions, and even when notifySubmitter: true arrived in the payload the server discarded it. Submitters using HIPAA plugins had no way to receive status-change emails.',
      },
      {
        type: 'ul',
        items: [
          'The "Notify me when status changes" checkbox is now shown for HIPAA plugin submissions when the submitter\'s email is available.',
          'notifySubmitter and submitterEmail are now stored as top-level fields on the snap document at write time.',
          'A new onSnapStatusUpdated Cloud Function trigger fires whenever a snap\'s status field changes. If the snap has notifySubmitter: true and a submitterEmail, it dispatches a status-update email to the submitter using the existing email template.',
          'The old onSnapHistoryCreated trigger (which was never wired up to send HIPAA emails) has been removed and replaced by this trigger.',
        ],
      },
      {
        type: 'callout',
        variant: 'success',
        text: 'HIPAA notice emails include a footer reminding the recipient that the notification does not contain patient health information, in line with the existing HIPAA email template pattern.',
      },

      { type: 'divider' },

      { type: 'h2', text: '💾 Snap Feed Filter Persistence' },
      {
        type: 'paragraph',
        text: 'Previously, navigating away from the Snap Feed and returning would reset all filters — Connection, Status, Type, Priority, Source, and "Assigned to Me" — back to their defaults. This was friction for anyone who works with a consistent filter combination.',
      },
      {
        type: 'ul',
        items: [
          'All seven filter values are now saved to localStorage as you change them.',
          'When you return to the Snap Feed, the filters are restored exactly as you left them.',
          'The view toggle (list vs. kanban) was already persistent — this release extends the same pattern to the full filter bar.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'Widget (snap4knack.js): global pointerdown guard now short-circuits on state.open.',
          'Widget: "Include Console" checkbox condition changed from captureType !== MODES.CONSOLE && !hipaaEnabled to captureType !== MODES.CONSOLE.',
          'Widget: attachConsole read directly from the checkbox element for all plugin types; the hipaaEnabled branch is removed.',
          'Widget: "Notify me" checkbox condition changed from submitterEmail && !hipaaEnabled to submitterEmail.',
          'Cloud Function submitSnap: console entries DLP-redacted per-message when hipaaEnabled instead of stripped; notifySubmitter and submitterEmail stored on the snap document.',
          'New Cloud Function onSnapStatusUpdated: Firestore onDocumentUpdated trigger on snap_submissions/{snapId}, sends submitter email on status change.',
          'Missing MCP SDK dependencies (@modelcontextprotocol/sdk, zod) installed in functions/ — these were causing the TypeScript build to fail silently on deploy.',
          'SnapFeed.tsx: filter state initialized from localStorage via lazy useState initializers; seven useEffect hooks sync each value back on change.',
        ],
      },
    ],
  },
  {
    slug: 'release-notes-april-2026',
    title: 'Release Notes — Unified Shared Feed, Google Sign-In & Security Hardening',
    date: '2026-04-13',
    tags: ['Release Notes', 'Product', 'Engineering'],
    summary:
      'Shared plugins now appear directly in the Snap Feed alongside your own — no separate tab. Google Sign-In is live for existing accounts, and two high-severity security vulnerabilities have been patched.',
    content: [
      {
        type: 'paragraph',
        text: 'This release is focused on reducing friction for users who work across multiple accounts, improving sign-in options, and closing security gaps identified during an internal audit.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🔗 Unified Shared Feed' },
      {
        type: 'paragraph',
        text: 'Previously, snaps shared with you by another tenant lived behind a separate "Shared Feeds" tab — a second place to check, with its own filter bar. That separation is gone. Shared plugins now show up directly in the main Snap Feed alongside everything else.',
      },
      {
        type: 'ul',
        items: [
          'The Connections dropdown now groups plugins into "My Plugins" and "Shared with me". Each shared plugin is labelled with the owning company name — for example, "Bug Tracker · Acme Corp".',
          'Selecting a shared plugin from the dropdown filters the feed to that plugin\'s snaps, exactly like selecting one of your own.',
          'When "All Connections" is selected, a "Shared with me" section appears below your own snaps, respecting the same status, type, priority, and search filters from the single filter bar.',
          'Status, priority, and kanban controls work identically on shared snaps — no capability differences.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Sharing is still managed on the Connections page. Nothing changes there — the improvement is purely on the receiving end.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🔐 Google Sign-In' },
      {
        type: 'paragraph',
        text: 'The login page now includes a "Sign in with Google" button. This is available to any existing Snap4Knack account whose email matches a Google account.',
      },
      {
        type: 'ul',
        items: [
          'Google Sign-In only works for existing accounts — it cannot be used to create a new Snap4Knack account. New accounts must be provisioned by an administrator.',
          'If you attempt to sign in with a Google account that has no linked Snap4Knack account, the sign-in is rejected immediately with a clear error message and the Google session is revoked.',
          'Closing the Google sign-in popup is handled silently — no error message is shown.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'To use Google Sign-In, the email on your Snap4Knack account must exactly match your Google account email.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🛡️ Security Fixes' },
      {
        type: 'paragraph',
        text: 'Two high-severity issues identified during an internal security audit have been patched and are live in production.',
      },
      { type: 'h3', text: 'Privilege escalation via user document self-write (H-1)' },
      {
        type: 'paragraph',
        text: 'Any authenticated user was previously able to overwrite their own Firestore user document in its entirety — including the roles, clientAccess, sharedPluginAccess, and tenantId fields. A malicious user could have escalated their own account to admin or tenant status with a direct Firestore write.',
      },
      {
        type: 'paragraph',
        text: 'The fix splits the write permission into explicit rules. Admins retain full write access. All other users are now restricted to updating only five safe fields: displayName, notifyOnSnap, notifyOnComment, lastLogin, and tosAcceptedAt. All role and access changes continue to flow exclusively through Cloud Functions using the Firebase Admin SDK.',
      },
      { type: 'h3', text: 'Legacy storage path world-readable and writable (H-2)' },
      {
        type: 'paragraph',
        text: 'An early development Storage path had no tenant ownership check. Any signed-in user could read, upload to, or delete files on that path — including files belonging to other tenants. The path is no longer used in production; all screenshots and recordings now live under tenant-scoped paths. The legacy path has been fully blocked.',
      },
      {
        type: 'callout',
        variant: 'success',
        text: 'Both fixes are live. No action is required from tenants or users.',
      },

      { type: 'divider' },

      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'SnapFeed now loads tenant_shares in the same meta effect as plugins and connections — one round trip instead of two separate component trees.',
          'Shared plugin queries use where(\'pluginId\', \'==\', ...) without a tenantId constraint, which is required because the snaps belong to the owning tenant\'s account.',
          'Content Security Policy updated to allow apis.google.com and accounts.google.com, required for the Google Sign-In popup flow.',
          'The "My Feeds / Shared Feeds" toggle and its duplicate filter bar have been removed — net reduction of ~130 lines.',
        ],
      },
    ],
  },
  {
    slug: 'ai-agent-mcp-integration',
    title: 'AI Agents Can Now File Snaps Automatically with the Snap4Knack MCP Server',
    date: '2026-04-07',
    tags: ['Release Notes', 'Product', 'Engineering', 'AI Agent'],
    summary:
      'Snap4Knack now exposes a hosted Model Context Protocol (MCP) server so AI monitoring agents can read your snap feed, triage issues, add comments, and file new snaps — all programmatically, with full HIPAA DLP support.',
    content: [
      {
        type: 'paragraph',
        text: 'AI-powered monitoring agents are becoming a core part of modern development workflows. Starting today, those agents can connect directly to Snap4Knack using the Model Context Protocol (MCP) — the emerging open standard for giving AI systems structured access to tools and data.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🤖 What is the MCP Server?' },
      {
        type: 'paragraph',
        text: 'The Snap4Knack MCP server is a hosted HTTP endpoint that speaks the Model Context Protocol. Any MCP-compatible AI agent — Claude, Cursor, or custom agents built with the MCP SDK — can authenticate with a tenant API key and gain access to 8 structured tools for interacting with your snap data.',
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'MCP endpoint: https://us-central1-snap4knack2.cloudfunctions.net/mcp — authenticate with Authorization: Bearer <api-key>',
      },

      { type: 'divider' },

      { type: 'h2', text: '🛠️ Available Tools' },
      {
        type: 'paragraph',
        text: 'The MCP server exposes 8 tools covering the full read/triage/submit workflow:',
      },
      {
        type: 'ul',
        items: [
          'list_snaps — List snaps with optional filters: status, priority, source, plugin, and limit. Returns newest first.',
          'get_snap — Fetch the full detail of a single snap by ID.',
          'list_plugins — List all snap plugins for the authenticated tenant.',
          'list_connections — List all Knack/React connections for the tenant.',
          'update_snap_status — Move a snap to a new status (backlog, new, in_progress, ready_for_testing, resolved, archived). Writes to history.',
          'update_snap_priority — Change snap priority to low, medium, high, or critical.',
          'add_comment — Post a comment to any snap on behalf of the AI agent.',
          'create_snap — Submit a new snap from an AI agent — the primary tool for automated monitoring.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🚨 Automated Snap Submission' },
      {
        type: 'paragraph',
        text: 'The create_snap tool is designed for monitoring agents that detect errors in production and file snaps automatically — without a human in the loop. A monitoring agent watching a Knack or React application can detect a console error, capture the page URL and a screenshot, and submit a fully-formed snap to the right plugin in seconds.',
      },
      {
        type: 'ul',
        items: [
          'pluginId and description are required. Everything else is optional.',
          'Pass consoleErrors and logEntries arrays to attach machine-captured diagnostic data.',
          'Attach a base64-encoded PNG screenshot — it is stored in Firebase Storage under the tenant\'s path.',
          'Snaps are tagged with source: ai_agent and capture type: AI Submission so they are visually distinct in the feed and Kanban.',
          'The snap number counter is the same shared sequence used by the widget — agents and humans use one unified feed.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🏥 HIPAA Support' },
      {
        type: 'paragraph',
        text: 'For tenants with HIPAA mode enabled, the create_snap tool applies the same DLP pipeline used by the widget:',
      },
      {
        type: 'ul',
        items: [
          'Snap descriptions are run through Google Cloud DLP to redact PHI before storage.',
          'Screenshots are uploaded to a staging bucket, then async-redacted by the onScreenshotStaged trigger before being moved to the live path.',
          'Page URL query parameters are stripped to prevent PII leakage via URL.',
          'Console errors and log entries are dropped entirely on HIPAA plugins.',
          'All HIPAA snap submissions are written to the audit_log collection.',
        ],
      },
      {
        type: 'callout',
        variant: 'success',
        text: 'HIPAA mode is detected automatically per-plugin. Agents do not need to know whether a plugin is HIPAA-enabled — the server handles it.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🔑 API Keys & Access Control' },
      {
        type: 'paragraph',
        text: 'API keys are issued by the Snap4Knack admin team and scoped to a single tenant. An agent authenticated with a key can only access that tenant\'s snaps, plugins, and connections — cross-tenant access is not possible by design.',
      },
      {
        type: 'ul',
        items: [
          'Each agent should have its own named key (e.g., "docgen4knack monitoring agent") so it can be revoked independently.',
          'Keys can be revoked instantly from the Admin panel — the agent loses access on the next request.',
          'Contact the Snap4Knack team to request API keys for your tenant.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🔌 Connecting Your Agent' },
      {
        type: 'paragraph',
        text: 'The MCP server uses the Streamable HTTP transport — the current MCP standard for hosted servers. Most MCP clients support this natively.',
      },
      {
        type: 'ul',
        items: [
          'Claude Desktop: add a server entry with type: "http", the MCP URL, and an Authorization: Bearer header.',
          'Cursor: add the server to ~/.cursor/mcp.json with the url and Authorization header.',
          'Custom agents: use the @modelcontextprotocol/sdk StreamableHTTPClientTransport (TypeScript) or streamablehttp_client (Python).',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Reach out if you need help wiring up your monitoring agent — we\'re happy to assist with the initial integration.',
      },
    ],
  },
  {
    slug: 'release-notes-march-2026-b',
    title: 'Release Notes — Assignees, Backlog, Google SSO & Security',
    date: '2026-03-26',
    tags: ['Release Notes', 'Product', 'Engineering'],
    summary:
      'Snaps can now be assigned to team members, a new Backlog column lands in the Kanban board, the snap feed has an "Assigned to Me" quick filter, Google Sign-In is now supported for existing accounts, and two high-severity security issues have been patched.',
    content: [
      {
        type: 'paragraph',
        text: 'This release covers workflow improvements, a new sign-in option, and a set of security hardening changes that came out of an internal security audit.',
      },
      { type: 'divider' },

      { type: 'h2', text: '👤 Snap Assignment' },
      {
        type: 'paragraph',
        text: 'Every snap now has an assignee. When a snap is submitted, it is automatically assigned to the plugin owner. Team members can reassign it to any tenant that has active access to the plugin.',
      },
      {
        type: 'ul',
        items: [
          'A new "Assigned To" dropdown appears in the snap detail sidebar, between the Status and Priority panels.',
          'The dropdown lists the plugin owner first, followed by any tenants the plugin has been shared with (active shares only).',
          'Selecting a new assignee saves immediately to Firestore — no save button needed.',
          'Kanban cards show a small violet avatar with the assignee\'s initial for at-a-glance visibility.',
          'All 97 existing snaps have been backfilled so the plugin owner is set as the default assignee.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Assignment is based on tenant accounts, not individual user accounts. If a plugin is shared with another company\'s tenant, that company\'s name appears as an assignee option.',
      },

      { type: 'divider' },

      { type: 'h2', text: '📋 Backlog Column' },
      {
        type: 'paragraph',
        text: 'A new "Backlog" status sits to the left of "New" in the Kanban board — giving teams a dedicated holding area for snaps that have been triaged but aren\'t ready to be worked on yet.',
      },
      {
        type: 'ul',
        items: [
          'Drag cards from any column into Backlog to park them for later.',
          'Backlog uses a neutral slate color scheme to visually distinguish it from the active workflow columns.',
          'The status is available in the status selector on the snap detail page and in all feed filters.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🔍 "Assigned to Me" Filter' },
      {
        type: 'paragraph',
        text: 'The snap feed filter bar now includes an "Assigned to Me" toggle. When active, only snaps assigned to your account are shown — in both list and Kanban views.',
      },
      {
        type: 'ul',
        items: [
          'The toggle is a one-click button at the end of the filter bar. It turns violet when active.',
          'Works in combination with all other filters (status, priority, plugin, source, search).',
          'The filter is applied client-side so it responds instantly without a round-trip to Firestore.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🔐 Google Sign-In' },
      {
        type: 'paragraph',
        text: 'The login page now includes a "Sign in with Google" button. This is available to any user whose Snap4Knack account was created with a matching Google email address.',
      },
      {
        type: 'ul',
        items: [
          'Google Sign-In only works for existing accounts — it cannot be used to create a new Snap4Knack account.',
          'If the Google account has no linked Snap4Knack account, the sign-in is rejected with a clear error message and the session is immediately revoked.',
          'The button appears on the login screen only — not on the forgot-password flow.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'To link your existing account to Google Sign-In, make sure the email address on your Snap4Knack account matches your Google account email.',
      },

      { type: 'divider' },

      { type: 'h2', text: '🛡️ Security Fixes' },
      {
        type: 'paragraph',
        text: 'Two high-severity issues identified during an internal security audit have been patched and deployed.',
      },
      {
        type: 'h3',
        text: 'Privilege escalation via user document self-write (H-1)',
      },
      {
        type: 'paragraph',
        text: 'Previously, any authenticated user could overwrite their own Firestore user document in its entirety, including sensitive fields like roles, clientAccess, and sharedPluginAccess. This has been fixed by splitting the write rule into explicit create and update rules. Self-updates are now restricted to a safe allowlist of five non-privileged fields: displayName, notifyOnSnap, notifyOnComment, lastLogin, and tosAcceptedAt. All role and access assignments continue to be managed exclusively by Cloud Functions via the Admin SDK.',
      },
      {
        type: 'h3',
        text: 'Legacy storage path world-readable/writable (H-2)',
      },
      {
        type: 'paragraph',
        text: 'A legacy Firebase Storage path used during early development allowed any authenticated user to read, write, or delete files belonging to any tenant. That path is no longer used — all screenshots and recordings now live under tenant-scoped paths. The legacy path has been fully blocked.',
      },
      {
        type: 'callout',
        variant: 'success',
        text: 'Both fixes are live in production. No action is required from users or tenants.',
      },

      { type: 'divider' },

      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'assignedToUid and assignedToName fields added to the SnapSubmission type and written by submitSnap at creation time.',
          'A one-time migration script backfilled assignedToUid = tenantId on all 97 existing snap documents.',
          'The Firestore submitSnap Cloud Function was redeployed to write assignedToUid on all new submissions.',
          'Content Security Policy updated to allow apis.google.com and accounts.google.com, required for the Google Sign-In popup flow.',
        ],
      },
    ],
  },
  {
    slug: 'react-app-support',
    title: 'Snap4Knack Now Works in Any React App',
    date: '2026-03-24',
    tags: ['Release Notes', 'Product', 'Engineering'],
    summary:
      'Snap4Knack is no longer Knack-only. The widget can now be embedded in any React / Firebase application with a single code snippet — full snap capture, annotations, notifications, and HIPAA mode included.',
    content: [
      {
        type: 'paragraph',
        text: 'From the beginning, Snap4Knack was built for Knack apps. The widget polled for a logged-in Knack user, read their role, and decided whether to show the feedback button. That worked well — but it locked out every other kind of app. Today that changes.',
      },
      {
        type: 'paragraph',
        text: 'React / Firebase support is now live. If your app uses Firebase Authentication, you can embed the Snap4Knack widget in a single useEffect and have it working in minutes.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🚀 How It Works' },
      {
        type: 'paragraph',
        text: 'The integration is a small snippet that you drop into any component that has access to Firebase Auth. It injects the widget loader once, listens for auth state changes, and handles the full lifecycle automatically.',
      },
      {
        type: 'ul',
        items: [
          'The loader script is injected once — a data attribute guard prevents double-loading even if the component re-renders.',
          'When Firebase Auth reports a logged-in user, the widget mounts and the FAB appears.',
          'When the user logs out, the widget tears itself down — the FAB is removed from the DOM cleanly.',
          'If the same user\'s token refreshes (which Firebase does silently every hour), the widget detects it\'s already mounted for that user and does nothing. No duplicate FABs, no re-authentication flicker.',
          'If a different user logs in after a logout, the widget tears down the previous session and mounts fresh for the new user.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'No Knack connection is required for React plugins. There is no role filtering — all authenticated Firebase users see the Snap button. A React plugin is created separately from Knack plugins in the Snap Plugins wizard.',
      },

      { type: 'divider' },

      { type: 'h2', text: '📋 The Embed Snippet' },
      {
        type: 'paragraph',
        text: 'The full snippet is generated for you in the plugin\'s Embed Code tab under "React / Firebase". It looks like this:',
      },
      {
        type: 'ul',
        items: [
          'Inject the loader script once (guarded by data-snap4knack-loader attribute)',
          'Subscribe to onAuthStateChanged',
          'On login: poll until the loader is ready, then call initReact() with the user\'s UID and email',
          'On logout: call window.Snap4Knack.teardown()',
          'Return the Firebase unsubscribe function for clean component unmount',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '🏷️ React Snaps in Your Feed' },
      {
        type: 'paragraph',
        text: 'Snaps submitted from React apps are visually distinguished throughout the dashboard:',
      },
      {
        type: 'ul',
        items: [
          'Kanban cards show a small indigo "React" badge alongside the existing HIPAA badge.',
          'The snap detail sidebar shows an "App Source: React App" field in the Submission Info panel.',
          'The "Submitted By" field is populated from the Firebase Auth user\'s email — no Knack user name needed.',
          'The activity feed entry ("submitted snap") also uses the Firebase email as the actor name.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'issueWidgetToken already had a React path (userId instead of knackUserId, role check skipped). It has been redeployed to confirm the live version is current.',
          'submitSnap stores source: "react" on the Firestore document, which drives the badge logic.',
          'A new teardown() function is exported on window.Snap4Knack — it removes the FAB, drawer, and modal backdrop, then resets auth state.',
          'mountReact() gained an idempotency guard: same user → no-op; different user → teardown then re-mount.',
        ],
      },

      { type: 'divider' },

      { type: 'h2', text: 'What\'s Next' },
      {
        type: 'paragraph',
        text: 'React support opens up a lot of possibilities. Near-term on the roadmap:',
      },
      {
        type: 'ul',
        items: [
          'Optional role-based filtering for React apps (pass a userRole to initReact and configure allowed roles in the plugin)',
          'Non-Firebase React support (bring-your-own user object, no Firebase Auth dependency)',
          'Vue / Vanilla JS variants of the loader snippet',
        ],
      },
    ],
  },
  {
    slug: 'release-notes-march-2026',
    title: 'Release Notes — March 2026',
    date: '2026-03-22',
    tags: ['Release Notes', 'Product'],
    summary:
      'Submitter status-change notifications, comment image attachments, widget expand/modal mode, per-plugin notification controls, and a handful of bug fixes.',
    content: [
      {
        type: 'paragraph',
        text: 'This release packs in a significant round of quality-of-life improvements across the widget, the admin dashboard, and the notification pipeline. Here is everything that shipped.',
      },
      { type: 'divider' },

      // ── Submitter notifications ──────────────────────────────────────────
      { type: 'h2', text: '🔔 Submitter Status-Change Notifications' },
      {
        type: 'paragraph',
        text: 'Submitters can now opt in to receive an email whenever the status of their snap changes — directly inside the widget before they submit.',
      },
      {
        type: 'ul',
        items: [
          'A "🔔 Notify me when status changes" checkbox appears in the widget form step whenever the submitter\'s email is detectable and the plugin is not HIPAA-enabled.',
          'The opt-in flag is saved with the snap record. A new Cloud Function trigger (onSnapHistoryCreated) fires whenever a history entry is written and emails the submitter if their snap\'s status changed.',
          'The notification email is branded and includes the new status (with a color-coded badge), the snap title, and a direct link back to the originating page so the submitter can see the result in context.',
          'The snap detail sidebar shows a "Submitter Notifications" toggle so your team can flip the opt-in on or off after the fact.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'HIPAA-enabled plugins suppress the opt-in checkbox entirely — notification emails for HIPAA snaps never include URLs, screenshots, or free-text content.',
      },

      { type: 'divider' },

      // ── Comment image attachments ─────────────────────────────────────────
      { type: 'h2', text: '🖼️ Image Attachments in Comments' },
      {
        type: 'paragraph',
        text: 'Team members can now attach images directly to comments — useful for annotating a suggested fix, sharing a reference screenshot, or providing a visual comparison.',
      },
      {
        type: 'ul',
        items: [
          'Click the camera icon in the comment toolbar to select one or more images.',
          'Thumbnail previews appear inline before posting. Hover a preview and click × to remove it.',
          'Images are stored in Firebase Storage under a tenant-scoped path and rendered as clickable thumbnails below the comment text.',
          'Maximum file size is 10 MB per image; only image/* content types are accepted (enforced at the storage rule level).',
        ],
      },

      { type: 'divider' },

      // ── Widget expand / modal ─────────────────────────────────────────────
      { type: 'h2', text: '⬆️ Widget Expand / Modal Mode' },
      {
        type: 'paragraph',
        text: 'The widget drawer now has an expand button in the header. Clicking it transforms the panel into a centered full-screen overlay (92 vw × 90 vh) with a dark backdrop — giving annotators much more canvas space on large screenshots.',
      },
      {
        type: 'ul',
        items: [
          'Expand / collapse with the ⬆ / ⬇ icons in the widget header.',
          'The annotation canvas max-height adapts automatically to the expanded state.',
          'Clicking the dark backdrop collapses the widget back to its default drawer position.',
        ],
      },

      { type: 'divider' },

      // ── Per-plugin notification toggle ───────────────────────────────────
      { type: 'h2', text: '🔕 Per-Plugin Notification Controls' },
      {
        type: 'paragraph',
        text: 'A new toggle in the plugin Details tab lets you enable or disable new-snap email notifications on a per-plugin basis — without touching the global account settings.',
      },
      {
        type: 'ul',
        items: [
          'The toggle is only shown when at least one notification email address is configured on the plugin.',
          'Defaults to enabled for all existing plugins.',
        ],
      },

      { type: 'divider' },

      // ── Bug fixes ─────────────────────────────────────────────────────────
      { type: 'h2', text: '🐛 Bug Fixes' },
      {
        type: 'ul',
        items: [
          'Fixed: New-snap notification emails were silently dropped for all non-critical snaps. The check was gated on a tenant-level flag (notifyOnSnap) that was never populated. Notifications now correctly fire based on the per-plugin notificationsEnabled setting.',
          'Fixed: Comments on non-HIPAA snaps showed a "Processing" spinner indefinitely. The dlpPending flag was being set to true unconditionally instead of only for HIPAA-enabled plugins.',
          'Fixed: The Knack Role shown in snap submission info displayed internal profile keys (e.g. profile_19) instead of the human-readable role name. The widget now resolves the display name from Knack\'s application metadata at login time.',
          'Improvement: The "Page" URL in snap submission info is now a clickable link that opens in a new tab.',
        ],
      },

      { type: 'divider' },

      // ── Under the hood ───────────────────────────────────────────────────
      { type: 'h2', text: '⚙️ Under the Hood' },
      {
        type: 'ul',
        items: [
          'submitterEmail is now stored as a top-level field on snap documents at write time for reliable server-side lookups (previously required traversing nested context maps).',
          'knackUserEmail is stored as a separate context field alongside knackUserId so the email is never lost when a user has a Knack ID that is not an email address.',
          'Storage rules updated to allow comment image uploads under comment_images/{tenantId}/{snapId}/{fileName}.',
          'onSnapHistoryCreated Firestore trigger added — fires on every new history entry, filters to status-change events, and dispatches the submitter email.',
        ],
      },
    ],
  },
];
