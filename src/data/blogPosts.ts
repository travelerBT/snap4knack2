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
    slug: 'mic-voiceover-screen-recording',
    title: 'Screen Recording Now Supports Microphone Voiceover',
    date: '2026-03-25',
    tags: ['Release Notes', 'Product', 'Engineering'],
    summary:
      'You can now narrate while you record. The screen recording capture mode has been updated with an optional microphone input, a device selector for users with multiple mics, and a 60-second recording cap.',
    content: [
      {
        type: 'paragraph',
        text: 'Screen recordings are a powerful way to report a bug or walk through an unexpected workflow. Until now, they were silent — you had to describe the issue separately in the form. Starting today, you can talk through what you\'re seeing as you record.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🎙️ Microphone Voiceover' },
      {
        type: 'paragraph',
        text: 'A new "🎙️ Include microphone" checkbox appears below the Record Screen button in the capture mode selector. When checked:',
      },
      {
        type: 'ol',
        items: [
          'The browser prompts for microphone permission (one-time, per browser).',
          'A device dropdown appears if more than one audio input is detected — headsets, built-in mics, and USB devices are all listed by name.',
          'Your chosen microphone\'s audio track is combined with the screen capture and recorded together into a single WebM file.',
          'If microphone permission is denied, recording continues silently — no interruption, no error message.',
        ],
      },
      {
        type: 'callout',
        variant: 'info',
        text: 'Microphone voiceover is disabled automatically for HIPAA-enabled plugins — the entire screen recording mode is hidden in HIPAA mode, as it has always been.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🎛️ Microphone Device Selector' },
      {
        type: 'paragraph',
        text: 'Users with multiple audio inputs (e.g. a built-in Mac microphone and a USB headset) now see a dropdown to select which device to use. The browser\'s media permission prompt is used once to enumerate device names; after that the dropdown renders instantly on subsequent uses within the same page session.',
      },
      {
        type: 'ul',
        items: [
          'Devices are listed by their system name (e.g. "Bose QC35 II" or "MacBook Pro Microphone").',
          'A "Default microphone" option at the top lets the OS decide, matching browser auto-select behaviour.',
          'The selected device is remembered within the session so you don\'t have to re-pick on every snap.',
        ],
      },
      { type: 'divider' },

      { type: 'h2', text: '⏱️ 60-Second Recording Cap' },
      {
        type: 'paragraph',
        text: 'The maximum recording duration has been extended from 30 seconds to 60 seconds. The Stop button and the auto-stop timer both respect the new limit. For most bug reports and walkthroughs, 60 seconds is more than enough — and keeps uploaded file sizes reasonable.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🧹 Widget Console Cleanup' },
      {
        type: 'paragraph',
        text: 'Several diagnostic console.log statements left over from the Knack modal compatibility work have been removed from the widget. The widget now only emits console.warn messages for genuine error conditions (e.g. auth timeout, API key not found). This keeps your browser DevTools clean in production.',
      },
      { type: 'divider' },

      {
        type: 'callout',
        variant: 'success',
        text: 'No configuration changes required. All users with screen recording enabled will see the mic checkbox immediately after a hard refresh. HIPAA plugins are unaffected.',
      },
    ],
  },
  {
    slug: 'knack-modal-widget-fix',
    title: 'Widget Now Works Inside Knack Modals',
    date: '2026-03-24',
    tags: ['Release Notes', 'Engineering'],
    summary:
      'The Snap4Knack widget FAB, drawer, and all capture modes now work correctly when a Knack modal dialog is open — a multi-layer fix for pointer-event blocking, aria-hidden injection, and stale build artifacts.',
    content: [
      {
        type: 'paragraph',
        text: 'Several customers reported that the Snap4Knack widget would not open — or would open but be completely unclickable — when a Knack modal dialog was on screen. This release fixes that end-to-end.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🐛 What Was Happening' },
      {
        type: 'paragraph',
        text: 'Knack\'s modal system applies three independent mechanisms that together made the widget unreachable:',
      },
      {
        type: 'ol',
        items: [
          'aria-hidden injection — Knack uses the aria-hidden npm package to stamp aria-hidden="true" and data-aria-hidden="true" on every element in the background when a modal opens. Some browsers and polyfills treat aria-hidden as an interaction barrier.',
          'CSS pointer-events: none — Knack applies a stylesheet rule that sets pointer-events: none on all direct children of <body> while a dialog is open. This silently blocked every click on the FAB, the drawer panel, the area-selection overlay, and the recording Stop button.',
          'Stale dist/ — Firebase Hosting serves from the dist/ folder, which is only updated by running npm run build. Previous fix attempts were deployed without a build step, so the live site was serving months-old code regardless of what was committed.',
        ],
      },
      { type: 'divider' },

      { type: 'h2', text: '✅ The Fix' },
      {
        type: 'h3',
        text: 'MutationObserver on every widget element',
      },
      {
        type: 'paragraph',
        text: 'A MutationObserver is attached to each element after it is appended to document.body. It watches for aria-hidden, data-aria-hidden, and inert attribute changes and strips them immediately whenever Knack adds them.',
      },
      {
        type: 'h3',
        text: 'pointer-events: auto !important via setProperty',
      },
      {
        type: 'paragraph',
        text: 'After every document.body.appendChild call, the widget now immediately calls element.style.setProperty(\'pointer-events\', \'auto\', \'important\'). The !important priority overrides the Knack stylesheet rule. This was applied to all five appendages: the FAB, the drawer panel, the area-select overlay, the pin-element overlay, and the recording indicator.',
      },
      {
        type: 'h3',
        text: 'Z-index stack corrected',
      },
      {
        type: 'paragraph',
        text: 'Element z-indices were reorganised so the drawer (2147483646) and FAB (2147483647) sit above the Knack dialog overlay (z-index: 50), while remaining below 2147483647 — the browser maximum — for the FAB only.',
      },
      {
        type: 'h3',
        text: 'Build pipeline enforced',
      },
      {
        type: 'paragraph',
        text: 'The root cause of prior failed deploys was confirmed: dist/ was stale because npm run build was never run before firebase deploy --only hosting. All subsequent deployments now run the build step first.',
      },
      { type: 'divider' },

      { type: 'h2', text: '🔧 Elements Fixed' },
      {
        type: 'ul',
        items: [
          'FAB (feedback button) — clicking now opens the drawer even when a Knack modal is open',
          'Drawer panel — all buttons (Full Page, Select Area, Pin Element, Record Screen, close, expand) are now fully interactive',
          'Area-select overlay — crosshair drag-to-select works correctly',
          'Pin-element overlay — click-to-pin works correctly',
          'Recording indicator — Stop button responds to clicks during an active recording session',
        ],
      },
      { type: 'divider' },

      {
        type: 'callout',
        variant: 'success',
        text: 'No configuration changes are required. The fix is bundled in the widget script automatically loaded by your Knack page. Hard-refresh your Knack app to pick up the latest version.',
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
