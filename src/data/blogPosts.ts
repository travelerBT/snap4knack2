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
