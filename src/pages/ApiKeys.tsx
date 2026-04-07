import { useState, useEffect } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import SEO from '../components/SEO';
import Modal from '../components/Modal';
import {
  KeyIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  TrashIcon,
  PlusIcon,
  CpuChipIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';
import type { ApiKey, Tenant } from '../types';

interface TenantOption {
  id: string;
  companyName: string;
  email: string;
}

export default function ApiKeys() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantsLoading, setTenantsLoading] = useState(true);

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });
  const [revokeConfirm, setRevokeConfirm] = useState<{ open: boolean; keyId: string }>({ open: false, keyId: '' });

  // Load all tenants for the selector
  useEffect(() => {
    getDocs(collection(db, 'tenants')).then((snap) => {
      const list = snap.docs.map((d) => {
        const data = d.data() as Tenant;
        return { id: d.id, companyName: data.companyName, email: data.email };
      });
      list.sort((a, b) => a.companyName.localeCompare(b.companyName));
      setTenants(list);
      setTenantsLoading(false);
    });
  }, []);

  // Load keys when a tenant is selected
  useEffect(() => {
    if (!selectedTenantId) { setKeys([]); return; }
    setKeysLoading(true);
    setNewKeyValue(null);
    getDocs(collection(db, 'tenants', selectedTenantId, 'api_keys')).then((snap) => {
      setKeys(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ApiKey)));
      setKeysLoading(false);
    });
  }, [selectedTenantId]);

  const generateKey = () =>
    `sk_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

  const createKey = async () => {
    if (!newKeyName.trim() || !selectedTenantId) return;
    setCreating(true);
    const raw = generateKey();
    const keyDoc: Omit<ApiKey, 'id'> = {
      name: newKeyName.trim(),
      keyHash: raw,
      createdAt: serverTimestamp() as ApiKey['createdAt'],
      status: 'active',
    };
    const ref = await addDoc(collection(db, 'tenants', selectedTenantId, 'api_keys'), keyDoc);
    setKeys((prev) => [{ id: ref.id, ...keyDoc }, ...prev]);
    setNewKeyName('');
    setNewKeyValue(raw);
    setCreating(false);
  };

  const doRevokeKey = async () => {
    const id = revokeConfirm.keyId;
    setRevokeConfirm({ open: false, keyId: '' });
    try {
      await updateDoc(doc(db, 'tenants', selectedTenantId, 'api_keys', id), { status: 'revoked' });
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
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  return (
    <div className="max-w-2xl">
      <SEO title="API Keys" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h1>
      <p className="text-sm text-gray-500 mb-6">
        Issue API keys to tenants for use with the MCP server and REST API integrations.
      </p>

      {/* MCP Endpoint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <CpuChipIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-blue-900">AI Agent MCP Endpoint</h2>
        </div>
        <p className="text-sm text-blue-700 mb-3">
          Share this URL and the tenant's API key with their AI monitoring agent.
          Each key is scoped to its tenant — agents can only access that tenant's data.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-2 text-xs font-mono text-blue-900 truncate">
            https://us-central1-snap4knack2.cloudfunctions.net/mcp
          </code>
          <button
            onClick={() => copy('https://us-central1-snap4knack2.cloudfunctions.net/mcp', 'mcp-url')}
            className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-1"
          >
            {copiedId === 'mcp-url' ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
            Copy
          </button>
        </div>
        <p className="text-xs text-blue-600 mt-2">Authorization: Bearer {'<api-key>'}</p>
      </div>

      {/* Tenant selector */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <BuildingStorefrontIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900">Select Tenant</h2>
        </div>
        {tenantsLoading ? (
          <div className="h-9 bg-gray-100 rounded animate-pulse" />
        ) : (
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">— Choose a tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.companyName} ({t.email})</option>
            ))}
          </select>
        )}
      </div>

      {selectedTenantId && (
        <>
          {/* New key value revealed */}
          {newKeyValue && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
              <p className="text-sm font-semibold text-yellow-800 mb-1">Copy this key now — it won't be shown again.</p>
              <p className="text-xs text-yellow-700 mb-2">Share it with {selectedTenant?.companyName} to configure their AI agent.</p>
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
            <h2 className="text-base font-semibold text-gray-900 mb-1">Create Key for {selectedTenant?.companyName}</h2>
            <p className="text-xs text-gray-500 mb-3">Give this key a descriptive name so you know what integration it's for.</p>
            <div className="flex gap-3">
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createKey()}
                placeholder="e.g., docgen4knack monitoring agent"
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
            {keysLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />)}
              </div>
            ) : activeKeys.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <KeyIcon className="h-10 w-10 text-gray-300 mx-auto" />
                <p className="mt-2 text-sm text-gray-500">No active API keys for this tenant.</p>
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
                        onClick={() => setRevokeConfirm({ open: true, keyId: k.id })}
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
        </>
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
