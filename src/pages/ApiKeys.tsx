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
} from '@heroicons/react/24/outline';
import type { ApiKey, Tenant } from '../types';

interface TenantOption {
  id: string;
  companyName: string;
  email: string;
}

interface FlatKey extends ApiKey {
  tenantId: string;
  tenantName: string;
}

export default function ApiKeys() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [allKeys, setAllKeys] = useState<FlatKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<{ raw: string; tenantName: string } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modal, setModal] = useState({ open: false, type: 'success' as 'success' | 'error', title: '', message: '' });
  const [revokeConfirm, setRevokeConfirm] = useState<{ open: boolean; keyId: string; tenantId: string }>({ open: false, keyId: '', tenantId: '' });

  // Load all tenants + all their api_keys in parallel
  useEffect(() => {
    const load = async () => {
      const tenantSnap = await getDocs(collection(db, 'tenants'));
      const tenantList: TenantOption[] = tenantSnap.docs.map((d) => {
        const data = d.data() as Tenant;
        return { id: d.id, companyName: data.companyName, email: data.email };
      });
      tenantList.sort((a, b) => a.companyName.localeCompare(b.companyName));
      setTenants(tenantList);

      const keyFetches = tenantList.map((t) =>
        getDocs(collection(db, 'tenants', t.id, 'api_keys')).then((snap) =>
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            tenantId: t.id,
            tenantName: t.companyName,
          } as FlatKey))
        )
      );
      const results = await Promise.all(keyFetches);
      const flat = results.flat().sort((a, b) => {
        // Sort by tenant name, then by createdAt desc within tenant
        const tn = a.tenantName.localeCompare(b.tenantName);
        if (tn !== 0) return tn;
        const at = a.createdAt?.toDate?.()?.getTime() ?? 0;
        const bt = b.createdAt?.toDate?.()?.getTime() ?? 0;
        return bt - at;
      });
      setAllKeys(flat);
      setLoading(false);
    };
    load();
  }, []);

  const generateKey = () =>
    `sk_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')}`;

  const createKey = async () => {
    if (!newKeyName.trim() || !selectedTenantId) return;
    setCreating(true);
    const raw = generateKey();
    const tenantName = tenants.find((t) => t.id === selectedTenantId)?.companyName ?? '';
    const keyDoc: Omit<ApiKey, 'id'> = {
      name: newKeyName.trim(),
      keyHash: raw,
      createdAt: serverTimestamp() as ApiKey['createdAt'],
      status: 'active',
    };
    const ref = await addDoc(collection(db, 'tenants', selectedTenantId, 'api_keys'), keyDoc);
    setAllKeys((prev) => [
      { id: ref.id, ...keyDoc, tenantId: selectedTenantId, tenantName },
      ...prev,
    ]);
    setNewKeyName('');
    setNewKeyValue({ raw, tenantName });
    setCreating(false);
  };

  const doRevokeKey = async () => {
    const { keyId, tenantId } = revokeConfirm;
    setRevokeConfirm({ open: false, keyId: '', tenantId: '' });
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'api_keys', keyId), { status: 'revoked' });
      setAllKeys((prev) => prev.map((k) => k.id === keyId ? { ...k, status: 'revoked' } : k));
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

  const activeKeys = allKeys.filter((k) => k.status === 'active');
  const revokedKeys = allKeys.filter((k) => k.status === 'revoked');

  return (
    <div className="max-w-3xl">
      <SEO title="API Keys" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h1>
      <p className="text-sm text-gray-500 mb-6">
        Manage tenant API keys for MCP agent and REST API integrations.
      </p>

      {/* MCP Endpoint */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <CpuChipIcon className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-semibold text-blue-900">AI Agent MCP Endpoint</h2>
        </div>
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

      {/* New key revealed */}
      {newKeyValue && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold text-yellow-800 mb-1">Copy this key now — it won't be shown again.</p>
          <p className="text-xs text-yellow-700 mb-2">Share with <strong>{newKeyValue.tenantName}</strong> to configure their AI agent.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-yellow-200 rounded px-3 py-2 text-xs font-mono break-all">{newKeyValue.raw}</code>
            <button
              onClick={() => copy(newKeyValue.raw, 'new')}
              className="flex-shrink-0 bg-yellow-700 hover:bg-yellow-800 text-white text-xs px-3 py-2 rounded-lg flex items-center gap-1"
            >
              {copiedId === 'new' ? <CheckIcon className="h-3 w-3" /> : <ClipboardDocumentIcon className="h-3 w-3" />}
              Copy
            </button>
          </div>
          <button onClick={() => setNewKeyValue(null)} className="mt-2 text-xs text-yellow-700 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Create new key */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-3">Issue New Key</h2>
        <div className="flex gap-3">
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="w-48 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">— Tenant —</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.companyName}</option>
            ))}
          </select>
          <input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createKey()}
            placeholder="Key name (e.g., docgen4knack agent)"
            className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <button
            onClick={createKey}
            disabled={creating || !newKeyName.trim() || !selectedTenantId}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>

      {/* All active keys */}
      <div className="bg-white shadow rounded-lg overflow-hidden mb-4">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Active Keys ({activeKeys.length})</h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />)}
          </div>
        ) : activeKeys.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <KeyIcon className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">No active API keys yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {activeKeys.map((k) => {
              const t = k.createdAt?.toDate?.() ?? null;
              return (
                <div key={`${k.tenantId}-${k.id}`} className="flex items-center gap-4 px-6 py-4">
                  <KeyIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{k.name}</p>
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-gray-500">{k.tenantName}</span>
                      {t ? ` · ${t.toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <code className="text-xs text-gray-400 font-mono hidden sm:block flex-shrink-0">
                    {k.keyHash.substring(0, 12)}…
                  </code>
                  <button
                    onClick={() => copy(k.keyHash, k.id)}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                    title="Copy key"
                  >
                    {copiedId === k.id ? <CheckIcon className="h-4 w-4 text-green-500" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setRevokeConfirm({ open: true, keyId: k.id, tenantId: k.tenantId })}
                    className="text-gray-400 hover:text-red-500 flex-shrink-0"
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
              <div key={`${k.tenantId}-${k.id}`} className="flex items-center gap-4 px-6 py-3">
                <KeyIcon className="h-4 w-4 text-gray-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-400 line-through truncate">{k.name}</p>
                  <p className="text-xs text-gray-400">{k.tenantName}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">Revoked</span>
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
        onClose={() => setRevokeConfirm({ open: false, keyId: '', tenantId: '' })}
      />
    </div>
  );
}
