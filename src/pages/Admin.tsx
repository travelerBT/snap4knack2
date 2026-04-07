import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getCountFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import SEO from '../components/SEO';
import {
  UsersIcon,
  BuildingStorefrontIcon,
  CameraIcon,
  PuzzlePieceIcon,
  UserPlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  KeyIcon,
} from '@heroicons/react/24/outline';

type Tab = 'overview' | 'add-tenant';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState({ tenants: 0, users: 0, submissions: 0, plugins: 0 });
  const [loading, setLoading] = useState(true);

  // Add-tenant form state
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      const [tenantSnap, userSnap, subSnap] = await Promise.all([
        getCountFromServer(collection(db, 'tenants')),
        getCountFromServer(collection(db, 'users')),
        getCountFromServer(collection(db, 'snap_submissions')),
      ]);
      setStats({
        tenants: tenantSnap.data().count,
        users: userSnap.data().count,
        submissions: subSnap.data().count,
        plugins: 0,
      });
      setLoading(false);
    };
    load();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);
    try {
      const fn = httpsCallable(functions, 'createTenant');
      const result = await fn({ email, companyName, displayName: displayName || undefined }) as { data: { email: string; companyName: string } };
      setCreateResult({ type: 'success', message: `Tenant "${result.data.companyName}" created. A welcome email with login instructions has been sent to ${result.data.email}.` });
      setEmail('');
      setCompanyName('');
      setDisplayName('');
      // Bump tenant count
      setStats((s) => ({ ...s, tenants: s.tenants + 1, users: s.users + 1 }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setCreateResult({ type: 'error', message: msg });
    } finally {
      setCreating(false);
    }
  };

  const cards = [
    { label: 'Total Tenants', value: stats.tenants, icon: BuildingStorefrontIcon, color: 'bg-blue-50 text-blue-600' },
    { label: 'All Users', value: stats.users, icon: UsersIcon, color: 'bg-purple-50 text-purple-600' },
    { label: 'All Submissions', value: stats.submissions, icon: CameraIcon, color: 'bg-green-50 text-green-600' },
    { label: 'Active Plugins', value: stats.plugins, icon: PuzzlePieceIcon, color: 'bg-orange-50 text-orange-600' },
  ];

  return (
    <div>
      <SEO title="Admin" />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Platform Admin</h1>
        <p className="text-sm text-gray-500 mt-1">Manage tenants and platform activity.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {([['overview', 'Overview'], ['add-tenant', 'Add Tenant']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
            {cards.map((c) => (
              <div key={c.label} className="bg-white rounded-lg shadow p-5">
                {loading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-5 w-5 bg-gray-200 rounded" />
                    <div className="h-8 w-16 bg-gray-200 rounded" />
                    <div className="h-3 w-20 bg-gray-200 rounded" />
                  </div>
                ) : (
                  <>
                    <div className={`inline-flex p-2 rounded-lg ${c.color}`}>
                      <c.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-3xl font-bold text-gray-900">{c.value.toLocaleString()}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{c.label}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Admin Actions</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                to="/admin/users"
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <UsersIcon className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">User Management</p>
                  <p className="text-xs text-gray-500">View, search, and manage all platform users</p>
                </div>
              </Link>
              <Link
                to="/admin/api-keys"
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <KeyIcon className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">API Keys</p>
                  <p className="text-xs text-gray-500">Issue and revoke tenant API keys for MCP agent access</p>
                </div>
              </Link>
              <button
                onClick={() => setTab('add-tenant')}
                className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
              >
                <UserPlusIcon className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Add Tenant</p>
                  <p className="text-xs text-gray-500">Create a new tenant account and send welcome email</p>
                </div>
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'add-tenant' && (
        <div className="max-w-lg">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-50 p-2 rounded-lg">
                <UserPlusIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Create New Tenant</h2>
                <p className="text-sm text-gray-500">A welcome email with login instructions will be sent automatically.</p>
              </div>
            </div>

            {createResult && (
              <div className={`mb-5 flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
                createResult.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {createResult.type === 'success'
                  ? <CheckCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  : <ExclamationCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />}
                {createResult.message}
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="admin@acmecorp.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Jane Smith"
                />
                <p className="mt-1 text-xs text-gray-500">Defaults to company name if left blank.</p>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating tenant…' : 'Create Tenant & Send Welcome Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
