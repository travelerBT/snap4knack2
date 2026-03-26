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

export const ALL_TAGS = ['Release Notes', 'Product', 'Engineering', 'HIPAA'] as const;

export const blogPosts: BlogPost[] = [
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
