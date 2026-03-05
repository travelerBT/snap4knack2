import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import Modal from '../components/Modal';
import {
  LinkIcon,
  PlusIcon,
  TrashIcon,
  ChevronRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type { Connection, KnackRole } from '../types';

type WizardStep = 'credentials' | 'discovering' | 'confirm';

interface DiscoveryResult {
  roles: KnackRole[];
  objects: { key: string; name: string }[];
  appName?: string;
}

export default function Connections() {
  const { user } = useAuth();
  const tenantId = user?.uid || '';

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('credentials');
  const [name, setName] = useState('');
  const [appId, setAppId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [wizardError, setWizardError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadConnections = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'tenants', tenantId, 'connections'), where('tenantId', '==', tenantId))
      );
      setConnections(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Connection)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConnections(); }, [tenantId]);

  const openWizard = () => {
    setStep('credentials');
    setName('');
    setAppId('');
    setApiKey('');
    setDiscovery(null);
    setWizardError('');
    setWizardOpen(true);
  };

  const handleDiscover = async () => {
    if (!name.trim() || !appId.trim() || !apiKey.trim()) {
      setWizardError('All fields are required.');
      return;
    }
    setWizardError('');
    setStep('discovering');
    try {
      // Create connection doc first so we have an ID for Secret Manager key
      const connRef = await addDoc(collection(db, 'tenants', tenantId, 'connections'), {
        tenantId,
        name: name.trim(),
        appId: appId.trim(),
        status: 'inactive',
        secretName: '',
        roles: [],
        objects: [],
        createdAt: serverTimestamp(),
      });
      const connectionId = connRef.id;

      // Store API key in Secret Manager
      const storeKey = httpsCallable(functions, 'storeKnackApiKey');
      await storeKey({ connectionId, tenantId, appId: appId.trim(), apiKey: apiKey.trim() });

      // Discover roles
      const fetchRoles = httpsCallable<{ connectionId: string }, DiscoveryResult>(functions, 'fetchKnackRoles');
      const result = await fetchRoles({ connectionId });
      setDiscovery(result.data);

      // Update connection doc with secret name and roles
      await updateDoc(doc(db, 'tenants', tenantId, 'connections', connectionId), {
        secretName: `knack_api_key_${tenantId}_${connectionId}`,
        roles: result.data.roles,
        objects: result.data.objects,
        appName: result.data.appName || '',
        status: 'active',
      });

      setStep('confirm');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Discovery failed.';
      setWizardError(msg);
      setStep('credentials');
    }
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await loadConnections();
      setWizardOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'tenants', tenantId, 'connections', deleteTarget.id));
      setConnections((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <SEO title="Connections" path="/connections" />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connections</h1>
          <p className="text-sm text-gray-500 mt-1">Connect your Knack applications to Snap4Knack.</p>
        </div>
        <button
          onClick={openWizard}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm"
        >
          <PlusIcon className="h-4 w-4" />
          Add Connection
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-white shadow rounded-lg p-12 text-center">
          <LinkIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <h3 className="mt-3 text-sm font-medium text-gray-900">No connections yet</h3>
          <p className="mt-1 text-sm text-gray-500">Connect your first Knack app to get started.</p>
          <button onClick={openWizard} className="mt-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            <PlusIcon className="h-4 w-4" />
            Add Connection
          </button>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-100">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50">
                <div className="bg-blue-50 rounded-lg p-2.5">
                  <LinkIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{conn.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    App ID: {conn.appId} · {conn.roles.length} role{conn.roles.length !== 1 ? 's' : ''} discovered
                  </p>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  conn.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {conn.status === 'active' ? <CheckCircleIcon className="h-3 w-3" /> : <ExclamationCircleIcon className="h-3 w-3" />}
                  {conn.status}
                </span>
                <Link to={`/connections/${conn.id}`} className="text-gray-400 hover:text-gray-600">
                  <ChevronRightIcon className="h-5 w-5" />
                </Link>
                <button onClick={() => setDeleteTarget(conn)} className="text-gray-400 hover:text-red-500">
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Connection Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {step === 'credentials' && 'Add Knack Connection'}
                {step === 'discovering' && 'Discovering Roles…'}
                {step === 'confirm' && 'Connection Ready'}
              </h2>
            </div>
            <div className="p-6">
              {step === 'credentials' && (
                <form onSubmit={(e) => { e.preventDefault(); handleDiscover(); }} className="space-y-4">
                  {wizardError && (
                    <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{wizardError}</p>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Connection Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      placeholder="e.g. ACME Workforce App"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Knack Application ID</label>
                    <input
                      type="text"
                      value={appId}
                      onChange={(e) => setAppId(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono"
                      placeholder="5f4a3b2c1d0e…"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Knack API Key</label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono"
                      placeholder="••••••••••••••••"
                    />
                    <p className="text-xs text-gray-400 mt-1">Stored securely in Google Secret Manager. Never saved in the database.</p>
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={() => setWizardOpen(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                      Connect &amp; Discover Roles
                    </button>
                  </div>
                </form>
              )}

              {step === 'discovering' && (
                <div className="py-8 text-center">
                  <ArrowPathIcon className="h-10 w-10 text-blue-600 mx-auto animate-spin" />
                  <p className="mt-4 text-sm text-gray-600">Fetching role tables from Knack…</p>
                  <p className="text-xs text-gray-400 mt-1">Looking for tables with user account (password) fields</p>
                </div>
              )}

              {step === 'confirm' && discovery && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-start gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Connection successful!</p>
                      <p className="text-xs text-green-700 mt-0.5">API key stored securely in Secret Manager.</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      Discovered {discovery.roles.length} role table{discovery.roles.length !== 1 ? 's' : ''}:
                    </p>
                    <div className="space-y-1">
                      {discovery.roles.map((r) => (
                        <div key={r.key} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                          <CheckCircleIcon className="h-4 w-4 text-blue-500" />
                          <span className="text-sm text-gray-900">{r.name}</span>
                          <span className="text-xs text-gray-400 font-mono ml-auto">{r.key}</span>
                        </div>
                      ))}
                    </div>
                    {discovery.roles.length === 0 && (
                      <p className="text-sm text-yellow-700 bg-yellow-50 rounded-lg px-3 py-2">
                        No user account tables found. Ensure your Knack app has at least one table with a Password field.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleConfirm}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Done'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        type="error"
        title="Delete Connection"
        message={`Delete "${deleteTarget?.name}"? Any snap plugins using this connection will stop working.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
