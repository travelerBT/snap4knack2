import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import Modal from '../components/Modal';
import {
  CameraIcon,
  ChevronLeftIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  UserPlusIcon,
  UsersIcon,
  TrashIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  ShieldCheckIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';
import type { SnapPlugin, Connection, ClientInvitation, KnackRole, TenantShare } from '../types';
import { WIDGET_BASE_URL } from '../config/constants';

const TABS = ['Details', 'Roles', 'Embed Code', 'Branding', 'Portal', 'Sharing', 'Integrations'] as const;
type Tab = typeof TABS[number];

export default function SnapPluginDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tenantId = user?.uid || '';

  const [plugin, setPlugin] = useState<SnapPlugin | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('Details');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [embedTab, setEmbedTab] = useState<'knack' | 'react'>('knack');
  const [copiedReact, setCopiedReact] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Info/success/error modal
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });
  // Confirm revoke modal
  const [revokeConfirm, setRevokeConfirm] = useState<{ open: boolean; invId: string }>({ open: false, invId: '' });
  // Invite URL fallback (when email send fails)
  const [inviteUrlModal, setInviteUrlModal] = useState<{ open: boolean; url: string; emailError: string }>({ open: false, url: '', emailError: '' });
  const [inviteUrlCopied, setInviteUrlCopied] = useState(false);

  const [hipaaSaving, setHipaaSaving] = useState(false);
  const [hipaaConfirm, setHipaaConfirm] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sharing state
  const [tenantShares, setTenantShares] = useState<TenantShare[]>([]);
  const [availableTenants, setAvailableTenants] = useState<{ uid: string; email: string; displayName: string }[]>([]);
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);
  const [revokeShareConfirm, setRevokeShareConfirm] = useState<{ open: boolean; shareId: string }>({ open: false, shareId: '' });

  // Slack integration state
  const [slackWebhookInput, setSlackWebhookInput] = useState('');
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackRemoving, setSlackRemoving] = useState(false);
  const [slackDisconnectConfirm, setSlackDisconnectConfirm] = useState(false);

  useEffect(() => {
    if (!tenantId || !id) return;
    const load = async () => {
      const getAvailableTenantsFunc = httpsCallable<object, { uid: string; email: string; displayName: string }[]>(functions, 'getAvailableTenants');
      const [pluginDoc, invSnap, shareSnap, tenantsResult] = await Promise.all([
        getDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id)),
        getDocs(query(collection(db, 'client_invitations'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'tenant_shares'), where('ownerTenantId', '==', tenantId))),
        getAvailableTenantsFunc({}),
      ]);
      if (pluginDoc.exists()) {
        const p = { id: pluginDoc.id, ...pluginDoc.data() } as SnapPlugin;
        setPlugin(p);
        if (p.appType === 'react') {
          setEmbedTab('react');
        }
        if (p.connectionId) {
          const connDoc = await getDoc(doc(db, 'tenants', tenantId, 'connections', p.connectionId));
          if (connDoc.exists()) setConnection({ id: connDoc.id, ...connDoc.data() } as Connection);
        }
      }
      const pluginInvitations = invSnap.docs
        .filter((d) => d.data().pluginIds?.includes(id))
        .map((d) => ({ id: d.id, ...d.data() } as ClientInvitation));
      setInvitations(pluginInvitations);
      const pluginShares = shareSnap.docs
        .filter((d) => d.data().pluginId === id)
        .map((d) => ({ id: d.id, ...d.data() } as TenantShare));
      setTenantShares(pluginShares);
      const activeShareEmails = new Set(
        pluginShares.filter((s) => s.status === 'active').map((s) => s.grantedEmail)
      );
      const tenantOptions = (tenantsResult.data || [])
        .filter((t) => !activeShareEmails.has(t.email));
      setAvailableTenants(tenantOptions);
      setLoading(false);
    };
    load();
  }, [tenantId, id]);

  const toggleStatus = async () => {
    if (!plugin || !id) return;
    const newStatus = plugin.status === 'active' ? 'inactive' : 'active';
    await updateDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id), { status: newStatus });
    setPlugin({ ...plugin, status: newStatus });
  };

  const saveRoles = async (roles: string[]) => {
    if (!id) return;
    setSaving(true);
    await updateDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id), { selectedRoles: roles });
    if (plugin) setPlugin({ ...plugin, selectedRoles: roles });
    setSaving(false);
    setModal({ open: true, type: 'success', title: 'Roles saved', message: 'Selected roles have been updated.' });
  };

  const saveBranding = async (branding: SnapPlugin['customBranding']) => {
    if (!id) return;
    setSaving(true);
    await updateDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id), { customBranding: branding });
    if (plugin) setPlugin({ ...plugin, customBranding: branding });
    setSaving(false);
    setModal({ open: true, type: 'success', title: 'Branding saved', message: 'Widget branding has been updated.' });
  };

  const saveHipaa = async (enable: boolean) => {
    if (!id) return;
    setHipaaSaving(true);
    const updates: Record<string, unknown> = {
      hipaaEnabled: enable,
      retentionDays: enable ? 2555 : 365,
    };
    if (enable) updates['snapSettings.allowRecording'] = false;
    await updateDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id), updates);
    setPlugin((p) =>
      p
        ? {
            ...p,
            hipaaEnabled: enable,
            retentionDays: enable ? 2555 : 365,
            snapSettings: {
              ...p.snapSettings,
              allowRecording: enable ? false : p.snapSettings.allowRecording,
            },
          }
        : p
    );
    setHipaaSaving(false);
    setModal({
      open: true,
      type: 'success',
      title: enable ? 'HIPAA mode enabled' : 'HIPAA mode disabled',
      message: enable
        ? 'All new snaps will be DLP-scanned. Retention set to 7 years (2,555 days). Existing snaps are not retroactively scanned.'
        : 'HIPAA mode disabled. Retention reset to 365 days.',
    });
  };

  const saveNotificationsEnabled = async (enable: boolean) => {
    if (!id || !plugin) return;
    setNotifSaving(true);
    await updateDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id), {
      'snapSettings.notificationsEnabled': enable,
    });
    setPlugin((p) =>
      p ? { ...p, snapSettings: { ...p.snapSettings, notificationsEnabled: enable } } : p
    );
    setNotifSaving(false);
  };

  const saveSlackIntegration = async () => {
    if (!id || !slackWebhookInput.startsWith('https://hooks.slack.com/services/')) return;
    setSlackSaving(true);
    try {
      const saveSlackWebhookFn = httpsCallable<{ pluginId: string; webhookUrl: string }, { success: boolean }>(
        functions, 'saveSlackWebhook'
      );
      await saveSlackWebhookFn({ pluginId: id, webhookUrl: slackWebhookInput });
      if (plugin) setPlugin({ ...plugin, snapSettings: { ...plugin.snapSettings, slackEnabled: true } });
      setSlackWebhookInput('');
      setModal({ open: true, type: 'success', title: 'Slack connected', message: 'New snaps will now be posted to your Slack channel.' });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setModal({ open: true, type: 'error', title: 'Failed to connect Slack', message: err.message || 'An error occurred.' });
    } finally {
      setSlackSaving(false);
    }
  };

  const removeSlackIntegration = async () => {
    if (!id) return;
    setSlackDisconnectConfirm(false);
    setSlackRemoving(true);
    try {
      const removeSlackWebhookFn = httpsCallable<{ pluginId: string }, { success: boolean }>(
        functions, 'removeSlackWebhook'
      );
      await removeSlackWebhookFn({ pluginId: id });
      if (plugin) setPlugin({ ...plugin, snapSettings: { ...plugin.snapSettings, slackEnabled: false } });
      setModal({ open: true, type: 'success', title: 'Slack disconnected', message: 'Slack notifications have been disabled for this plugin.' });
    } catch (e: unknown) {
      const err = e as { message?: string };
      setModal({ open: true, type: 'error', title: 'Failed to disconnect Slack', message: err.message || 'An error occurred.' });
    } finally {
      setSlackRemoving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !id) return;
    setInviting(true);
    try {
      const inviteClientFn = httpsCallable<
        { email: string; pluginIds: string[] },
        { invitationId: string; inviteUrl: string; emailSent: boolean; emailError: string }
      >(functions, 'inviteClient');
      const result = await inviteClientFn({ email: inviteEmail.trim(), pluginIds: [id] });
      const { invitationId, inviteUrl, emailSent, emailError } = result.data;
      const newInv: ClientInvitation = {
        id: invitationId,
        email: inviteEmail.trim(),
        tenantId,
        pluginIds: [id],
        invitedBy: tenantId,
        createdAt: serverTimestamp() as ClientInvitation['createdAt'],
        status: 'pending',
      };
      setInvitations((prev) => [newInv, ...prev]);
      setInviteEmail('');
      if (emailSent) {
        setModal({ open: true, type: 'success', title: 'Invitation sent', message: `An invite email was sent to ${newInv.email}.` });
      } else {
        // Email failed — show invite URL so it can be shared manually
        setInviteUrlModal({ open: true, url: inviteUrl, emailError });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite.';
      setModal({ open: true, type: 'error', title: 'Invite failed', message: msg });
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = (invId: string) => {
    setRevokeConfirm({ open: true, invId });
  };

  const doRevoke = async () => {
    const invId = revokeConfirm.invId;
    setRevokeConfirm({ open: false, invId: '' });
    try {
      const revokeClientAccess = httpsCallable(functions, 'revokeClientAccess');
      await revokeClientAccess({ invitationId: invId });
      setInvitations((prev) => prev.map((inv) => inv.id === invId ? { ...inv, status: 'revoked' as const } : inv));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke invitation.';
      setModal({ open: true, type: 'error', title: 'Revoke failed', message: msg });
    }
  };

  const copyEmbed = () => {
    if (!plugin || !connection) return;
    const code = `(function(){var s=document.createElement('script');\ns.src='${WIDGET_BASE_URL}/widget/loader.js';\ns.onload=function(){Snap4KnackLoader.init({\n  pluginId:'${plugin.id}',tenantId:'${tenantId}',appId:'${connection.appId}',\n  primaryColor:'${plugin.customBranding?.primaryColor ?? '#3b82f6'}',position:'${plugin.customBranding?.position ?? 'bottom-right'}'\n})};document.head.appendChild(s)})();`;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleShare = async () => {
    if (!shareEmail.trim() || !id) return;
    setSharing(true);
    try {
      const shareFn = httpsCallable<
        { email: string; pluginId: string },
        { shareId: string; grantedEmail: string; grantedCompanyName: string; pluginName: string }
      >(functions, 'shareFeedWithTenant');
      const result = await shareFn({ email: shareEmail.trim(), pluginId: id });
      const newShare: TenantShare = {
        id: result.data.shareId,
        ownerTenantId: tenantId,
        ownerCompanyName: '',
        grantedTenantId: '',
        grantedEmail: result.data.grantedEmail,
        grantedCompanyName: result.data.grantedCompanyName,
        pluginId: id,
        pluginName: result.data.pluginName,
        status: 'active',
        createdAt: serverTimestamp() as TenantShare['createdAt'],
      };
      setTenantShares((prev) => [newShare, ...prev]);
      setAvailableTenants((prev) => prev.filter((t) => t.email !== result.data.grantedEmail));
      setShareEmail('');
      setModal({ open: true, type: 'success', title: 'Feed shared', message: `${result.data.grantedCompanyName} now has full access to this snap feed.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to share feed.';
      setModal({ open: true, type: 'error', title: 'Sharing failed', message: msg });
    } finally {
      setSharing(false);
    }
  };

  const handleRevokeShare = (shareId: string) => {
    setRevokeShareConfirm({ open: true, shareId });
  };

  const doRevokeShare = async () => {
    const shareId = revokeShareConfirm.shareId;
    setRevokeShareConfirm({ open: false, shareId: '' });
    try {
      const revokeFn = httpsCallable(functions, 'revokeTenantShare');
      await revokeFn({ shareId });
      setTenantShares((prev) => prev.map((s) => s.id === shareId ? { ...s, status: 'revoked' as const } : s));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke share.';
      setModal({ open: true, type: 'error', title: 'Revoke failed', message: msg });
    }
  };

  const handleDeletePlugin = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const fn = httpsCallable<{ pluginId: string; tenantId: string }, { success: boolean; deletedSnaps: number }>(
        functions, 'deleteSnapPlugin'
      );
      await fn({ pluginId: id, tenantId });
      navigate('/snap-plugins');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete plugin.';
      setModal({ open: true, type: 'error', title: 'Delete failed', message: msg });
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div>;
  }

  if (!plugin) {
    return (
      <div className="text-center py-16">
        <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Plugin not found.</p>
        <Link to="/snap-plugins" className="mt-3 inline-block text-sm text-blue-600 hover:underline">← Back to plugins</Link>
      </div>
    );
  }

  return (
    <div>
      <SEO title={plugin.name} />
      <div className="mb-4">
        <Link to="/snap-plugins" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ChevronLeftIcon className="h-4 w-4" />
          Snap Plugins
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{plugin.name}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {plugin.appType === 'react'
                ? 'React / Firebase App · All logged-in users'
                : `${connection?.name} · ${plugin.selectedRoles.includes('*') ? 'All users' : `${plugin.selectedRoles.length} role${plugin.selectedRoles.length !== 1 ? 's' : ''}`}`
              }
            </p>
          </div>
          <button
            onClick={toggleStatus}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              plugin.status === 'active'
                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {plugin.status === 'active' ? '● Active' : '○ Inactive'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px space-x-8 overflow-x-auto">
          {TABS.filter((tab) => !(tab === 'Roles' && plugin.appType === 'react')).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'Details' && (
        <div className="bg-white shadow rounded-lg p-6 space-y-4">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Plugin ID</dt>
              <dd className="mt-1 text-sm text-gray-900 font-mono">{plugin.id}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Connection</dt>
              <dd className="mt-1 text-sm text-gray-900">{connection?.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Screen Recording</dt>
              <dd className="mt-1 text-sm text-gray-900">{plugin.snapSettings.allowRecording ? 'Enabled' : 'Disabled'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Categories</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {plugin.snapSettings.categories.map((c) => (
                  <span key={c} className="text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{c}</span>
                ))}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Notification Emails</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {plugin.snapSettings.notifyEmails.length > 0 ? plugin.snapSettings.notifyEmails.join(', ') : '—'}
              </dd>
            </div>
          </dl>
          {/* Notifications toggle */}
          {plugin.snapSettings.notifyEmails.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <BoltIcon className={`h-5 w-5 flex-shrink-0 ${plugin.snapSettings.notificationsEnabled !== false ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Email Notifications</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {plugin.snapSettings.notificationsEnabled !== false
                        ? `Sending to: ${plugin.snapSettings.notifyEmails.join(', ')}`
                        : 'Notifications are paused for this plugin'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => saveNotificationsEnabled(plugin.snapSettings.notificationsEnabled === false)}
                  disabled={notifSaving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                    plugin.snapSettings.notificationsEnabled !== false ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      plugin.snapSettings.notificationsEnabled !== false ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* HIPAA toggle */}
          <div className="border border-gray-200 rounded-lg p-4 mt-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheckIcon className={`h-5 w-5 flex-shrink-0 ${plugin.hipaaEnabled ? 'text-green-600' : 'text-gray-400'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">HIPAA Compliant Mode</p>
                  <p className="text-xs text-gray-500 mt-0.5">DLP PHI scanning, sanitized emails, 7-year retention</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => plugin.hipaaEnabled ? saveHipaa(false) : setHipaaConfirm(true)}
                disabled={hipaaSaving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  plugin.hipaaEnabled ? 'bg-green-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    plugin.hipaaEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {plugin.hipaaEnabled && (
              <p className="mt-3 text-xs text-green-700 bg-green-50 rounded-md px-3 py-2">
                DLP PHI scanning enabled · {plugin.retentionDays ?? 2555}-day retention · Screen recording disabled
              </p>
            )}
          </div>

          {/* Danger Zone */}
          <div className="border border-red-200 rounded-lg p-4 mt-2">
            <h4 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h4>
            <p className="text-xs text-gray-500 mb-3">Permanently deletes this plugin and all snaps in its feed. This cannot be undone.</p>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
            >
              <TrashIcon className="h-4 w-4" />
              Delete Plugin
            </button>
          </div>
        </div>
      )}

      {activeTab === 'Roles' && connection && (
        <RolesTab plugin={plugin} connection={connection} onSave={saveRoles} saving={saving} />
      )}

      {activeTab === 'Embed Code' && (
        <div className="bg-white shadow rounded-lg p-6">
          {/* Knack / React toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden w-fit mb-5">
            <button
              onClick={() => setEmbedTab('knack')}
              className={`px-5 py-2 text-sm font-medium transition-colors ${
                embedTab === 'knack' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Knack
            </button>
            <button
              onClick={() => setEmbedTab('react')}
              className={`px-5 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${
                embedTab === 'react' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              React / Firebase
            </button>
          </div>

          {embedTab === 'knack' && connection && (
            <>
              <h3 className="text-base font-semibold text-gray-900 mb-2">Embed in Knack</h3>
              <p className="text-sm text-gray-500 mb-4">
                Paste this code into your Knack app's JavaScript area (Builder → Settings → API & Code → JavaScript).
              </p>
              <div className="relative">
                <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed">
{`(function(){var s=document.createElement('script');
s.src='${WIDGET_BASE_URL}/widget/loader.js';
s.onload=function(){Snap4KnackLoader.init({
  pluginId:'${plugin.id}',tenantId:'${tenantId}',appId:'${connection.appId}',
  primaryColor:'${plugin.customBranding?.primaryColor ?? '#3b82f6'}',position:'${plugin.customBranding?.position ?? 'bottom-right'}'
})};document.head.appendChild(s)})();`}
                </pre>
                <button
                  onClick={copyEmbed}
                  className="absolute top-3 right-3 bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5"
                >
                  {copied ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="mt-4 bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700">
                <p className="font-medium">How it works:</p>
                <ul className="mt-1 list-disc list-inside space-y-1 text-blue-600 text-xs">
                  <li>The loader detects the logged-in Knack user and their role</li>
                  <li>Only users whose role matches the selected roles will see the ● Snap button</li>
                  <li>Users with non-matching roles will not see anything</li>
                </ul>
              </div>
            </>
          )}

          {embedTab === 'knack' && !connection && (
            <div className="bg-yellow-50 rounded-lg px-4 py-4 text-sm text-yellow-700">
              <p className="font-medium">No Knack connection linked to this plugin.</p>
              <p className="text-yellow-600 text-xs mt-0.5">This is a React / Firebase plugin. Switch to the React tab to get the embed snippet.</p>
            </div>
          )}

          {embedTab === 'react' && (
            <>
              <h3 className="text-base font-semibold text-gray-900 mb-2">Embed in a React / Firebase App</h3>
              <p className="text-sm text-gray-500 mb-4">
                Add this snippet after Firebase Auth confirms a logged-in user (e.g. inside a <code className="font-mono bg-gray-100 px-1 rounded">useEffect</code>).
              </p>
              <div className="relative">
                <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-x-auto leading-relaxed">
{`import { useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

useEffect(() => {
  const auth = getAuth();
  return onAuthStateChanged(auth, (user) => {
    if (!user) return;
    const s = document.createElement('script');
    s.src = '${WIDGET_BASE_URL}/widget/loader.js';
    s.onload = () => {
      window.Snap4KnackLoader.initReact({
        pluginId: '${plugin.id}',
        tenantId: '${tenantId}',
        userId: user.uid,
        userEmail: user.email ?? '',
        primaryColor: '${plugin.customBranding?.primaryColor ?? '#3b82f6'}',
        position: '${plugin.customBranding?.position ?? 'bottom-right'}',
      });
    };
    document.head.appendChild(s);
  });
}, []);`}
                </pre>
                <button
                  onClick={() => {
                    if (!plugin) return;
                    const code = `import { useEffect } from 'react';\nimport { getAuth, onAuthStateChanged } from 'firebase/auth';\n\nuseEffect(() => {\n  const auth = getAuth();\n  return onAuthStateChanged(auth, (user) => {\n    if (!user) return;\n    const s = document.createElement('script');\n    s.src = '${WIDGET_BASE_URL}/widget/loader.js';\n    s.onload = () => {\n      window.Snap4KnackLoader.initReact({\n        pluginId: '${plugin.id}',\n        tenantId: '${tenantId}',\n        userId: user.uid,\n        userEmail: user.email ?? '',\n        primaryColor: '${plugin.customBranding?.primaryColor ?? '#3b82f6'}',\n        position: '${plugin.customBranding?.position ?? 'bottom-right'}',\n      });\n    };\n    document.head.appendChild(s);\n  });\n}, []);`;
                    navigator.clipboard.writeText(code).then(() => {
                      setCopiedReact(true);
                      setTimeout(() => setCopiedReact(false), 2000);
                    });
                  }}
                  className="absolute top-3 right-3 bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5"
                >
                  {copiedReact ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
                  {copiedReact ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="mt-4 bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-700">
                <p className="font-medium">How it works:</p>
                <ul className="mt-1 list-disc list-inside space-y-1 text-blue-600 text-xs">
                  <li>The widget authenticates using the Firebase Auth user's UID</li>
                  <li>All logged-in users see the ● Snap button — no role filtering applies</li>
                  <li>Snaps appear in your feed tagged with source: React</li>
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'Branding' && (
        <BrandingTab plugin={plugin} onSave={saveBranding} saving={saving} />
      )}

      {activeTab === 'Portal' && (
        <PortalTab
          invitations={invitations}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          onInvite={handleInvite}
          inviting={inviting}
          onRevoke={handleRevoke}
        />
      )}

      {activeTab === 'Sharing' && (
        <SharingTab
          shares={tenantShares}
          tenants={availableTenants}
          shareEmail={shareEmail}
          setShareEmail={setShareEmail}
          onShare={handleShare}
          sharing={sharing}
          onRevoke={handleRevokeShare}
        />
      )}

      {activeTab === 'Integrations' && (
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center gap-3 mb-5">
            <BoltIcon className="h-5 w-5 text-yellow-500" />
            <h3 className="text-base font-semibold text-gray-900">Integrations</h3>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-gray-900">Slack</p>
              {plugin.snapSettings.slackEnabled && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Connected
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Post a message to a Slack channel when a new snap is submitted. Paste the{' '}
              <span className="font-medium">Incoming Webhook URL</span> from your Slack workspace.
            </p>
            {plugin.snapSettings.slackEnabled ? (
              <div className="flex items-start gap-3">
                <p className="flex-1 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                  Snap notifications are being posted to Slack.
                </p>
                <button
                  onClick={() => setSlackDisconnectConfirm(true)}
                  disabled={slackRemoving}
                  className="flex-shrink-0 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {slackRemoving ? 'Removing…' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="url"
                  value={slackWebhookInput}
                  onChange={(e) => setSlackWebhookInput(e.target.value)}
                  placeholder="https://hooks.slack.com/services/…"
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono"
                />
                {slackWebhookInput && !slackWebhookInput.startsWith('https://hooks.slack.com/services/') && (
                  <p className="text-xs text-red-600">
                    Must be a valid Slack Incoming Webhook URL (starts with https://hooks.slack.com/services/).
                  </p>
                )}
                <button
                  onClick={saveSlackIntegration}
                  disabled={slackSaving || !slackWebhookInput.startsWith('https://hooks.slack.com/services/')}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {slackSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite URL fallback modal */}
      {inviteUrlModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 rounded-full p-2 bg-yellow-100">
                <LinkIcon className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Invitation created — email not sent</h3>
                <p className="mt-1 text-sm text-gray-500">{inviteUrlModal.emailError}</p>
              </div>
            </div>
            <p className="text-xs font-medium text-gray-500 mb-1">Share this link with the client:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={inviteUrlModal.url}
                className="flex-1 text-xs font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrlModal.url);
                  setInviteUrlCopied(true);
                  setTimeout(() => setInviteUrlCopied(false), 2000);
                }}
                className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-1"
              >
                {inviteUrlCopied ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                {inviteUrlCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-400">The link expires in 7 days. To fix email delivery, verify your sender in SendGrid.</p>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setInviteUrlModal({ open: false, url: '', emailError: '' })}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      <Modal open={modal.open} type={modal.type} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />
      {/* Delete plugin confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 bg-red-100 rounded-full p-2">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Delete "{plugin?.name}"?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  This will permanently delete this plugin and <strong>all snaps in its feed</strong>. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePlugin}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete Plugin'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={hipaaConfirm}
        type="warning"
        title="Enable HIPAA mode?"
        message="This will disable screen recording, set retention to 7 years (2,555 days), and route all new snaps through Google Cloud DLP for PHI scanning. Existing snaps are not retroactively scanned."
        confirmLabel="Enable HIPAA"
        cancelLabel="Cancel"
        onConfirm={() => { setHipaaConfirm(false); saveHipaa(true); }}
        onClose={() => setHipaaConfirm(false)}
        loading={hipaaSaving}
      />
      <Modal
        open={revokeConfirm.open}
        type="warning"
        title="Revoke invitation"
        message="This client will immediately lose access to the portal. This cannot be undone."
        confirmLabel="Revoke access"
        cancelLabel="Cancel"
        onConfirm={doRevoke}
        onClose={() => setRevokeConfirm({ open: false, invId: '' })}
      />
      <Modal
        open={revokeShareConfirm.open}
        type="warning"
        title="Revoke feed share"
        message="This tenant will immediately lose access to this snap feed. This cannot be undone."
        confirmLabel="Revoke access"
        cancelLabel="Cancel"
        onConfirm={doRevokeShare}
        onClose={() => setRevokeShareConfirm({ open: false, shareId: '' })}
      />
      <Modal
        open={slackDisconnectConfirm}
        type="warning"
        title="Disconnect Slack?"
        message="Snap notifications will stop being posted to Slack. You can reconnect at any time."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        onConfirm={removeSlackIntegration}
        onClose={() => setSlackDisconnectConfirm(false)}
        loading={slackRemoving}
      />
    </div>
  );
}

// ── Roles Tab ─────────────────────────────────────────────────────────────────

function RolesTab({ plugin, connection, onSave, saving }: {
  plugin: SnapPlugin;
  connection: Connection;
  onSave: (roles: string[]) => void;
  saving: boolean;
}) {
  const [roles, setRoles] = useState<string[]>(plugin.selectedRoles);
  const allUsers = roles.includes('*');

  const toggleAll = () => {
    setRoles(allUsers ? [] : ['*']);
  };

  const toggle = (key: string) => {
    setRoles((prev) => prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]);
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-1">Role Access</h3>
      <p className="text-sm text-gray-500 mb-4">
        Choose which Knack users can see the snap widget.
      </p>
      <div className="space-y-2 mb-6">
        {/* All users wildcard */}
        <button
          onClick={toggleAll}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
            allUsers ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
            allUsers ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
          }`}>
            {allUsers && (
              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-900">All authenticated users</p>
            <p className="text-xs text-gray-400">Any logged-in Knack user, regardless of role</p>
          </div>
        </button>

        {/* Individual role tables — disabled when allUsers is on */}
        {!allUsers && connection.roles.map((role: KnackRole) => (
          <button
            key={role.key}
            onClick={() => toggle(role.key)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors ${
              roles.includes(role.key) ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              roles.includes(role.key) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
            }`}>
              {roles.includes(role.key) && (
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">{role.name}</p>
              <p className="text-xs text-gray-400 font-mono">{role.key}</p>
            </div>
          </button>
        ))}
      </div>
      <button
        onClick={() => onSave(roles)}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Roles'}
      </button>
    </div>
  );
}

// ── Branding Tab ──────────────────────────────────────────────────────────────

function BrandingTab({ plugin, onSave, saving }: {
  plugin: SnapPlugin;
  onSave: (b: SnapPlugin['customBranding']) => void;
  saving: boolean;
}) {
  const [color, setColor] = useState(plugin.customBranding.primaryColor);
  const [position, setPosition] = useState(plugin.customBranding.position);

  return (
    <div className="bg-white shadow rounded-lg p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Brand Color</label>
        <div className="flex items-center gap-3">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 rounded cursor-pointer border border-gray-300" />
          <input type="text" value={color} onChange={(e) => setColor(e.target.value)} className="block w-32 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono" placeholder="#3b82f6" />
        </div>
        <p className="text-xs text-gray-400 mt-1">Applied to the FAB button, header, and action buttons in the widget.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Widget Position</label>
        <div className="flex gap-3">
          {(['bottom-right', 'bottom-left'] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setPosition(pos)}
              className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                position === pos ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>
      {/* Live preview */}
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
        <div className="relative bg-gray-100 rounded-lg h-32 overflow-hidden border border-gray-200">
          <div className={`absolute bottom-4 ${position === 'bottom-right' ? 'right-4' : 'left-4'}`}>
            <div
              className="h-12 w-12 rounded-full shadow-lg flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <CameraIcon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>
      <button
        onClick={() => onSave({ primaryColor: color, position })}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Branding'}
      </button>
    </div>
  );
}

// ── Portal Tab ────────────────────────────────────────────────────────────────

function PortalTab({ invitations, inviteEmail, setInviteEmail, onInvite, inviting, onRevoke }: {
  invitations: ClientInvitation[];
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  onInvite: () => void;
  inviting: boolean;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Invite Client</h3>
        <p className="text-sm text-gray-500 mb-4">
          Send a one-time invitation link. The client will create a Snap4Knack account and see only this plugin's submissions.
        </p>
        <div className="flex gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onInvite()}
            placeholder="client@company.com"
            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <button
            onClick={onInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <UserPlusIcon className="h-4 w-4" />
            {inviting ? 'Sending…' : 'Invite'}
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Client Access</h3>
        </div>
        {invitations.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <UserPlusIcon className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">No clients invited yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{inv.email}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {inv.status === 'pending' ? 'Invitation pending' : inv.status === 'accepted' ? 'Active' : 'Revoked'}
                  </p>
                </div>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  inv.status === 'accepted' ? 'bg-green-100 text-green-800' :
                  inv.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {inv.status}
                </span>
                {inv.status !== 'revoked' && (
                  <button onClick={() => onRevoke(inv.id)} className="text-gray-400 hover:text-red-500">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// ── Sharing Tab ───────────────────────────────────────────────────────────────

function SharingTab({ shares, tenants, shareEmail, setShareEmail, onShare, sharing, onRevoke }: {
  shares: TenantShare[];
  tenants: { uid: string; email: string; displayName: string }[];
  shareEmail: string;
  setShareEmail: (v: string) => void;
  onShare: () => void;
  sharing: boolean;
  onRevoke: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Share with another tenant</h3>
        <p className="text-sm text-gray-500 mb-4">
          Select an existing Snap4Knack tenant account. They will get full access to view, triage, comment on, and reorder all snap submissions for this plugin — the same as the owner.
        </p>
        {tenants.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No other tenant accounts available to share with.</p>
        ) : (
          <div className="flex gap-3">
            <select
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Select a tenant…</option>
              {tenants.map((t) => (
                <option key={t.uid} value={t.email}>{t.displayName} ({t.email})</option>
              ))}
            </select>
            <button
              onClick={onShare}
              disabled={sharing || !shareEmail}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <UsersIcon className="h-4 w-4" />
              {sharing ? 'Sharing…' : 'Share Feed'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">Shared With</h3>
        </div>
        {shares.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <UsersIcon className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">Not shared with any tenants yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {shares.map((share) => (
              <div key={share.id} className="flex items-center gap-4 px-6 py-4">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{share.grantedCompanyName || share.grantedEmail}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{share.grantedEmail}</p>
                </div>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  share.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {share.status === 'active' ? 'Active' : 'Revoked'}
                </span>
                {share.status === 'active' && (
                  <button onClick={() => onRevoke(share.id)} className="text-gray-400 hover:text-red-500">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}