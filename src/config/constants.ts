// ─── Routes ────────────────────────────────────────────────────────────────

export const ROUTES = {
  HOME: '/home',
  LOGIN: '/login',
  LEGAL: '/legal/:page',
  DASHBOARD: '/dashboard',
  CONNECTIONS: '/connections',
  CONNECTION_DETAIL: '/connections/:id',
  SNAP_PLUGINS: '/snap-plugins',
  SNAP_PLUGIN_DETAIL: '/snap-plugins/:id',
  SNAP_FEED: '/snap-feed',
  SNAP_DETAIL: '/snap-feed/:id',
  ACCOUNT: '/account',
  ADMIN: '/admin',
  ADMIN_USERS: '/admin/users',
  CLIENT_PORTAL: '/client-portal',
  CLIENT_SNAP_DETAIL: '/client-portal/:id',
  CLIENT_EXPORT: '/client-portal/export',
} as const;

// ─── Submission ─────────────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES = [
  'Bug',
  'Feature Request',
  'Question',
  'Other',
] as const;

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-gray-600 bg-gray-100' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600 bg-blue-100' },
  { value: 'high', label: 'High', color: 'text-yellow-700 bg-yellow-100' },
  { value: 'critical', label: 'Critical', color: 'text-red-700 bg-red-100' },
] as const;

export const STATUS_OPTIONS = [
  { value: 'backlog', label: 'Backlog', color: 'text-slate-700 bg-slate-100' },
  { value: 'new', label: 'New', color: 'text-blue-800 bg-blue-100' },
  { value: 'in_progress', label: 'In Progress', color: 'text-yellow-800 bg-yellow-100' },
  { value: 'ready_for_testing', label: 'Ready for Testing', color: 'text-purple-800 bg-purple-100' },
  { value: 'resolved', label: 'Resolved', color: 'text-green-800 bg-green-100' },
  { value: 'archived', label: 'Archived', color: 'text-gray-700 bg-gray-100' },
] as const;

export const CAPTURE_TYPE_LABELS: Record<string, string> = {
  full_viewport: 'Full Screenshot',
  select_area: 'Selected Area',
  element_pin: 'Pinned Element',
  screen_recording: 'Screen Recording',
  console_errors: 'Console Output',
  ai_submission: 'AI Submission',
};

// ─── Plugin Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_BRANDING = {
  primaryColor: '#3b82f6',
  position: 'bottom-right' as const,
};

export const DEFAULT_SNAP_SETTINGS = {
  allowRecording: false,
  formFields: [],
  categories: [...DEFAULT_CATEGORIES],
  notifyEmails: [],
};

// ─── Max limits ───────────────────────────────────────────────────────────────

export const MAX_CUSTOM_FIELDS = 10;
export const MAX_RECORDING_SECONDS = 30;
export const MAX_SCREENSHOT_SIZE_MB = 10;
export const MAX_RECORDING_SIZE_MB = 50;

// ─── Widget ───────────────────────────────────────────────────────────────────

export const WIDGET_VERSION = '1.0.0';
export const WIDGET_BASE_URL = 'https://snap4knack2.web.app';
