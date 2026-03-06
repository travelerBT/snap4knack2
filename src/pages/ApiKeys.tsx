import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import Modal from '../components/Modal';
import {
  KeyIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  TrashIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import type { ApiKey } from '../types';

export default function ApiKeys() {
  const { user } = useAuth();
  const tenantId = user?.uid || '';

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });
  const [revokeConfirm, setRevokeConfirm] = useState<{ open: boolean; keyId: string }>({ open: false, keyId: '' });

  useEffect(() => {
    if (!tenantId) return;
    getDocs(collection(db, 'tenants', tenantId, 'api_keys')).then((snap) => {
      setKeys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ApiKey)));
      setLoading(false);
    });
  }, [tenantId]);

  const generateKey = () =>
    `sk_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    const raw = generateKey();
    const keyDoc: Omit<ApiKey, 'id'> = {
      name: newKeyName.trim(),
      keyHash: raw, // In production, hash this before saving
      createdAt: serverTimestamp() as ApiKey['createdAt'],
      status: 'active',
    };
    const ref = await addDoc(collection(db, 'tenants', tenantId, 'api_keys'), keyDoc);
    const newKey = { id: ref.id, ...keyDoc };
    setKeys((prev) => [newKey, ...prev]);
    setNewKeyName('');
    setNewKeyValue(raw);
    setCreating(false);
  };

  const revokeKey = (id: string) => {
    setRevokeConfirm({ open: true, keyId: id });
  };

  const doRevokeKey = async () => {
    const id = revokeConfirm.keyId;
    setRevokeConfirm({ open: false, keyId: '' });
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'api_keys', id), { status: 'revoked' });
      setKeys((prev) => prev.map((k) => k.id === id ? { ...k, status: 'revoked' } : k));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke key.';
      setModal({ open: true, type: 'error', title: 'Revoke failed', message: msg });
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const activeKeys = keys.filter((k) => k.status === 'active');
  const revokedKeys = keys.filter((k) => k.status === 'revoked');

  return (
    <div className="max-w-2xl">
      <SEO title="API Keys" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h1>
      <p className="text-sm text-gray-500 mb-6">
        Use these keys to submit snaps via the REST API (e.g., from automated tests or CI pipelines).
      </p>

      {/* New key value revealed */}
      {newKeyValue && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold text-yellow-800 mb-1">Copy this key now — it won't be shown again.</p>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 bg-white border border-yellow-200 rounded px-3 py-2 text-xs font-mono break-all">{newKeyValue}</code>
            <button
              onClick={() => copy(newKeyValue, 'new')}
              className="flex-shrink-0 bg-yellow-700 hover:bg-yellow-800 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-1"
            >
              {copiedId === 'new' ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
              Copy
            </button>
          </div>
          <button onClick={() => setNewKeyValue(null)} className="mt-2 text-xs text-yellow-700 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Create new */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Create New Key</h2>
        <div className="flex gap-3">
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
            placeholder="Key name (e.g., CI Pipeline)"
            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <button
            onClick={createKey}
            disabled={creating || !newKeyName.trim()}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {/* Active keys */}
      <div className="bg-white shadow rounded-lg overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Active Keys ({activeKeys.length})</h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />)}
          </div>
        ) : activeKeys.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <KeyIcon className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">No active API keys.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeKeys.map((k) => {
              const t = k.createdAt?.toDate?.() ?? null;
              return (
                <div key={k.id} className="flex items-center gap-4 px-6 py-4">
                  <KeyIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{k.name}</p>
                    <p className="text-xs text-gray-400">Created {t ? t.toLocaleDateString() : '—'}</p>
                  </div>
                  <code className="text-xs text-gray-400 font-mono hidden sm:block">
                    {k.keyHash.substring(0, 12)}…
                  </code>
                  <button
                    onClick={() => copy(k.keyHash, k.id)}
                    className="text-gray-400 hover:text-gray-600"
                    title="Copy key"
                  >
                    {copiedId === k.id ? <CheckIcon className="h-4 w-4 text-green-500" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => revokeKey(k.id)}
                    className="text-gray-400 hover:text-red-500"
                    title="Revoke key"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden opacity-60">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-sm font-medium text-gray-500">Revoked Keys ({revokedKeys.length})</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {revokedKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-4 px-6 py-3">
                <KeyIcon className="h-4 w-4 text-gray-300 flex-shrink-0" />
                <p className="flex-1 text-sm text-gray-400 line-through">{k.name}</p>
                <span className="text-xs text-gray-400">Revoked</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={modal.open} type={modal.type} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />
      <Modal
        open={revokeConfirm.open}
        type="warning"
        title="Revoke API key"
        message="This key will stop working immediately. Any integrations using it will break. This cannot be undone."
        confirmLabel="Revoke key"
        cancelLabel="Cancel"
        onConfirm={doRevokeKey}
        onClose={() => setRevokeConfirm({ open: false, keyId: '' })}
      />
    </div>
  );
}
