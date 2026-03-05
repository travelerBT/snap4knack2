import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import SEO from '../components/SEO';
import { MagnifyingGlassIcon, UsersIcon } from '@heroicons/react/24/outline';
import type { User } from '../types';

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as User)));
      setLoading(false);
    });
  }, []);

  const toggleSuspend = async (u: User) => {
    const suspended = !u.suspended;
    await updateDoc(doc(db, 'users', u.id), { suspended });
    setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, suspended } : x));
  };

  const filtered = users.filter((u) =>
    !search.trim() ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <SEO title="User Management" />
      <h1 className="text-2xl font-bold text-gray-900 mb-6">User Management</h1>

      <div className="relative mb-4 max-w-sm">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="pl-9 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        />
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-gray-200 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <UsersIcon className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="mt-2 text-sm text-gray-500">No users found.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3">
                    <p className="text-sm font-medium text-gray-900">{u.displayName || '—'}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                      u.role === 'tenant' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`text-xs ${u.suspended ? 'text-red-600 font-medium' : 'text-green-600'}`}>
                      {u.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => toggleSuspend(u)}
                      className={`text-xs font-medium px-3 py-1 rounded-lg ${
                        u.suspended
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                    >
                      {u.suspended ? 'Reinstate' : 'Suspend'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
