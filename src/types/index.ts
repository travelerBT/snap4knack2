import { Timestamp } from 'firebase/firestore';

// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'tenant' | 'client';

export interface User {
  id: string;       // Firestore doc id (== uid)
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;   // primary role
  roles: UserRole[];
  tenantId?: string;
  clientAccess?: string[]; // pluginIds visible to client users
  sharedPluginAccess?: string[]; // pluginIds from other tenants shared with this user
  tosAcceptedAt?: Timestamp;
  createdAt: Timestamp;
  lastLogin?: Timestamp;
  suspended?: boolean;
  notifyOnSnap?: boolean;
  notifyOnComment?: boolean;
}

// ─── Tenant ──────────────────────────────────────────────────────────────────

export interface Tenant {
  ownerId: string;
  companyName: string;
  email: string;
  phoneNumber?: string;
  smsAlerts?: boolean;
  createdAt: Timestamp;
}

// ─── Knack Connection ────────────────────────────────────────────────────────

export interface KnackRole {
  key: string;   // e.g. 'object_1'
  name: string;  // e.g. 'Administrators'
}

export interface KnackObject {
  key: string;
  name: string;
}

export type ConnectionStatus = 'active' | 'inactive' | 'error';

export interface Connection {
  id: string;
  tenantId: string;
  name: string;
  appId: string;
  appName?: string;
  status: ConnectionStatus;
  secretName: string; // Secret Manager ref: knack_api_key_{tenantId}_{connectionId}
  roles: KnackRole[];    // objects with a password field (user account tables)
  objects: KnackObject[]; // all objects in the app
  createdAt: Timestamp;
}

// ─── Snap Plugin ─────────────────────────────────────────────────────────────

export type PluginStatus = 'active' | 'inactive';

export type FormFieldType = 'text' | 'textarea' | 'select';

export interface FormField {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  options?: string[]; // for select type
}

export interface SnapSettings {
  allowRecording: boolean;
  formFields: FormField[];
  categories: string[];
  notifyEmails: string[];
  hipaaEnabled?: boolean;
  retentionDays?: number;
}

export interface CustomBranding {
  primaryColor: string; // hex e.g. '#3b82f6'
  logo?: string;        // Storage URL
  position: 'bottom-right' | 'bottom-left';
}

export interface SnapPlugin {
  id: string;
  tenantId: string;
  connectionId: string;
  name: string;
  status: PluginStatus;
  selectedRoles: string[]; // KnackRole keys e.g. ['object_1', 'object_3']
  snapSettings: SnapSettings;
  customBranding: CustomBranding;
  hipaaEnabled?: boolean;
  retentionDays?: number;
  createdAt: Timestamp;
}

// ─── Snap Submission ─────────────────────────────────────────────────────────

export type CaptureType =
  | 'full_viewport'
  | 'select_area'
  | 'element_pin'
  | 'screen_recording'
  | 'console_errors';

export type SubmissionStatus = 'new' | 'in_progress' | 'ready_for_testing' | 'resolved' | 'archived';

export interface ConsoleError {
  level?: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;   // URL or stack snippet
  stack?: string;
  timestamp: number;
}

export interface SubmissionContext {
  pageUrl: string;
  pageTitle?: string;
  knackRecordId?: string;
  userAgent?: string;
  knackUserId?: string;
  knackUserName?: string;
  knackRole?: string;       // Knack object key e.g. 'object_1'
  knackUserRole?: string;   // alias
  viewportWidth?: number;
  viewportHeight?: number;
  scrollX?: number;
  scrollY?: number;
}

export interface AnnotationData {
  width: number;
  height: number;
  shapes: AnnotationShape[];
}

export type AnnotationToolType = 'pen' | 'rect' | 'arrow' | 'text' | 'blur';

export interface AnnotationShape {
  tool: AnnotationToolType;
  color: string;
  points?: { x: number; y: number }[];  // for pen
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  x2?: number;
  y2?: number;
  w?: number;  // alias for width used in drawing
  h?: number;  // alias for height used in drawing
}

export interface SnapSubmission {
  id: string;
  pluginId: string;
  tenantId: string;
  type: CaptureType;
  screenshotUrl?: string;
  screenshotStatus?: 'scanning' | 'ready' | 'scan_failed';
  scanError?: string;
  recordingUrl?: string;
  annotationData?: AnnotationData;
  consoleErrors: ConsoleError[];
  formData: {
    description?: string;
    category?: string;
    [key: string]: string | undefined;
  };
  context: SubmissionContext;
  status: SubmissionStatus;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  hipaaEnabled?: boolean;
  retentionDays?: number;
  snapNumber?: number;
  sortOrder?: number;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}

// ─── Comments ────────────────────────────────────────────────────────────────

export interface SnapComment {
  id: string;
  submissionId: string;
  authorId: string;      // uid
  authorUid?: string;    // alias
  authorName: string;
  authorRole?: UserRole;
  text: string;
  createdAt: Timestamp;
  notify?: boolean;      // when true, fan-out email to all commenters
  dlpPending?: boolean;  // true while Cloud Function DLP processing is in-flight
  dlpFlagged?: boolean;  // true if DLP redacted any PHI
}

export interface StatusHistoryEntry {
  id: string;
  changedBy: string;       // uid
  changedByName: string;
  changeType: 'status' | 'priority';
  fromValue: string;
  toValue: string;
  changedAt: Timestamp;
}

export interface AuditLogEntry {
  eventType: 'snap_viewed';
  snapId: string;
  tenantId: string;
  pluginId: string;
  viewedBy: string;          // uid
  viewedByName: string;
  viewedByEmail: string;
  viewedByRole: 'tenant' | 'client' | 'admin';
  viewedAt: Timestamp;
}

// ─── Client Invitations ──────────────────────────────────────────────────────

export type InvitationStatus = 'pending' | 'accepted' | 'revoked';

export interface ClientInvitation {
  id: string;
  email: string;
  tenantId: string;
  pluginIds: string[];
  invitedBy: string; // uid
  createdAt: Timestamp;
  acceptedAt?: Timestamp;
  status: InvitationStatus;
}

// ─── Tenant Shares ───────────────────────────────────────────────────────────

export interface TenantShare {
  id: string;
  ownerTenantId: string;
  ownerCompanyName: string;
  grantedTenantId: string;
  grantedEmail: string;
  grantedCompanyName: string;
  pluginId: string;
  pluginName: string;
  status: 'active' | 'revoked';
  createdAt: Timestamp;
  revokedAt?: Timestamp;
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export interface ApiKey {
  id: string;
  tenantId?: string;
  name: string;
  keyHash: string;         // full key shown once; hash for lookup
  keyPreview?: string;     // last 4 chars if stored separately
  status: 'active' | 'revoked';
  permissions?: string[];
  createdAt: Timestamp;
}

// ─── Auth Context ────────────────────────────────────────────────────────────

import type { User as FirebaseUser } from 'firebase/auth';

export interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  tenant: Tenant | null;
  userRoles: UserRole[];
  isAdmin: boolean;
  isTenant: boolean;
  isClient: boolean;
  clientAccess: string[];
  sharedPluginAccess: string[];
  loading: boolean;
  tosAccepted: boolean;
  signup: (email: string, password: string, companyName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  acceptTerms: () => Promise<void>;
}
