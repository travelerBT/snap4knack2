import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  TrashIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import type { SnapPlugin, Connection, ClientInvitation, KnackRole } from '../types';
import { WIDGET_BASE_URL } from '../config/constants';

const TABS = ['Details', 'Roles', 'Embed Code', 'Branding', 'Portal'] as const;
type Tab = typeof TABS[number];

export default function SnapPluginDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.uid || '';

  const [plugin, setPlugin] = useState<SnapPlugin | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('Details');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  // Modal
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });

  useEffect(() => {
    if (!tenantId || !id) return;
    const load = async () => {
      const [pluginDoc, invSnap] = await Promise.all([
        getDoc(doc(db, 'tenants', tenantId, 'snapPlugins', id)),
        getDocs(query(collection(db, 'client_invitations'), where('tenantId', '==', tenantId))),
      ]);
      if (pluginDoc.exists()) {
        const p = { id: pluginDoc.id, ...pluginDoc.data() } as SnapPlugin;
        setPlugin(p);
        const connDoc = await getDoc(doc(db, 'tenants', tenantId, 'connections', p.connectionId));
        if (connDoc.exists()) setConnection({ id: connDoc.id, ...connDoc.data() } as Connection);
      }
      const pluginInvitations = invSnap.docs
        .filter((d) => d.data().pluginIds?.includes(id))
        .map((d) => ({ id: d.id, ...d.data() } as ClientInvitation));
      setInvitations(pluginInvitations);
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

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !id) return;
    setInviting(true);
    try {
      const inviteClient = httpsCallable(functions, 'inviteClient');
      await inviteClient({ email: inviteEmail.trim(), pluginIds: [id] });
      const newInv: ClientInvitation = {
        id: Date.now().toString(),
        email: inviteEmail.trim(),
        tenantId,
        pluginIds: [id],
        invitedBy: tenantId,
        createdAt: serverTimestamp() as ClientInvitation['createdAt'],
        status: 'pending',
      };
      setInvitations((prev) => [newInv, ...prev]);
      setInviteEmail('');
      setModal({ open: true, type: 'success', title: 'Invitation sent', message: `An invite was sent to ${inviteEmail.trim()}.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send invite.';
      setModal({ open: true, type: 'error', title: 'Invite failed', message: msg });
    } finally {
      setInviting(false);
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
            <p className="text-sm text-gray-400 mt-1">{connection?.name} · {plugin.selectedRoles.includes('*') ? 'All users' : `${plugin.selectedRoles.length} role${plugin.selectedRoles.length !== 1 ? 's' : ''}`}</p>
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
          {TABS.map((tab) => (
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
            <div>
              <dt className="text-xs font-medium text-gray-500">Notification Emails</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {plugin.snapSettings.notifyEmails.length > 0 ? plugin.snapSettings.notifyEmails.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {activeTab === 'Roles' && connection && (
        <RolesTab plugin={plugin} connection={connection} onSave={saveRoles} saving={saving} />
      )}

      {activeTab === 'Embed Code' && connection && (
        <div className="bg-white shadow rounded-lg p-6">
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
          onRevoke={() => {}}
        />
      )}

      <Modal open={modal.open} type={modal.type} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />
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
