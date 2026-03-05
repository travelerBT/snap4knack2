import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import Modal from '../components/Modal';
import {
  LinkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
} from '@heroicons/react/24/outline';
import type { Connection, KnackRole } from '../types';

export default function ConnectionDetails() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.uid || '';

  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ roles: KnackRole[]; count: number } | null>(null);
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });

  useEffect(() => {
    if (!tenantId || !id) return;
    getDoc(doc(db, 'tenants', tenantId, 'connections', id))
      .then((snap) => {
        if (snap.exists()) setConnection({ id: snap.id, ...snap.data() } as Connection);
      })
      .finally(() => setLoading(false));
  }, [tenantId, id]);

  const handleSync = async () => {
    if (!id) return;
    setSyncing(true);
    try {
      const fetchRoles = httpsCallable<{ connectionId: string }, { roles: KnackRole[]; objects: { key: string; name: string }[] }>(
        functions, 'fetchKnackRoles'
      );
      const result = await fetchRoles({ connectionId: id });
      await updateDoc(doc(db, 'tenants', tenantId, 'connections', id), {
        roles: result.data.roles,
        objects: result.data.objects,
      });
      setConnection((prev) => prev ? { ...prev, roles: result.data.roles } : prev);
      setSyncResult({ roles: result.data.roles, count: result.data.roles.length });
      setModal({ open: true, type: 'success', title: 'Roles Updated', message: `Found ${result.data.roles.length} role table(s).` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed.';
      setModal({ open: true, type: 'error', title: 'Sync Failed', message: msg });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="text-center py-16">
        <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Connection not found.</p>
        <Link to="/connections" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          ← Back to connections
        </Link>
      </div>
    );
  }

  return (
    <div>
      <SEO title={connection.name} />
      <div className="mb-6">
        <Link to="/connections" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
          <ChevronLeftIcon className="h-4 w-4" />
          Connections
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{connection.name}</h1>
            <p className="text-sm text-gray-400 mt-1 font-mono">{connection.appId}</p>
          </div>
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
            connection.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
          }`}>
            {connection.status === 'active' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationCircleIcon className="h-4 w-4" />}
            {connection.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Connection Info */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-blue-500" />
            Connection Details
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-medium text-gray-500">Connection Name</dt>
              <dd className="mt-0.5 text-sm text-gray-900">{connection.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Knack Application ID</dt>
              <dd className="mt-0.5 text-sm text-gray-900 font-mono">{connection.appId}</dd>
            </div>
            {connection.appName && (
              <div>
                <dt className="text-xs font-medium text-gray-500">App Name</dt>
                <dd className="mt-0.5 text-sm text-gray-900">{connection.appName}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-gray-500">API Key</dt>
              <dd className="mt-0.5 text-sm text-gray-900">
                <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-800 px-2 py-0.5 rounded text-xs">
                  <CheckCircleIcon className="h-3 w-3" />
                  Stored in Secret Manager
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Secret Reference</dt>
              <dd className="mt-0.5 text-xs text-gray-400 font-mono">{connection.secretName}</dd>
            </div>
          </dl>
        </div>

        {/* Discovered Roles */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">
              Discovered Role Tables
              <span className="ml-2 text-xs text-gray-400 font-normal">(tables with Password field)</span>
            </h2>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing…' : 'Re-sync'}
            </button>
          </div>

          {connection.roles.length === 0 ? (
            <div className="text-center py-8">
              <ExclamationCircleIcon className="h-8 w-8 text-yellow-400 mx-auto" />
              <p className="mt-2 text-sm text-gray-500">No role tables found.</p>
              <p className="text-xs text-gray-400">Ensure your Knack app has at least one table with a Password field, then re-sync.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(syncResult?.roles || connection.roles).map((role) => (
                <div key={role.key} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                  <CheckCircleIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{role.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{role.key}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={modal.open}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
      />
    </div>
  );
}
