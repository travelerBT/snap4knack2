import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../firebase';
import SEO from '../components/SEO';
import {
  UsersIcon,
  BuildingStorefrontIcon,
  CameraIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';

export default function Admin() {
  const [stats, setStats] = useState({ tenants: 0, users: 0, submissions: 0, plugins: 0 });
  const [loading, setLoading] = useState(true);

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

  const cards = [
    { label: 'Total Tenants', value: stats.tenants, icon: BuildingStorefrontIcon, color: 'bg-blue-50 text-blue-600' },
    { label: 'All Users', value: stats.users, icon: UsersIcon, color: 'bg-purple-50 text-purple-600' },
    { label: 'All Submissions', value: stats.submissions, icon: CameraIcon, color: 'bg-green-50 text-green-600' },
    { label: 'Active Plugins', value: stats.plugins, icon: PuzzlePieceIcon, color: 'bg-orange-50 text-orange-600' },
  ];

  return (
    <div>
      <SEO title="Admin" />
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of all tenants and activity.</p>
        </div>
        <Link
          to="/admin/users"
          className="mt-3 sm:mt-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
        >
          <UsersIcon className="h-4 w-4" />
          Manage Users
        </Link>
      </div>

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
        </div>
      </div>
    </div>
  );
}
