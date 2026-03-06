import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import {
  LinkIcon,
  CameraIcon,
  QueueListIcon,
  ExclamationCircleIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { SnapSubmission } from '../types';
import { STATUS_OPTIONS, CAPTURE_TYPE_LABELS } from '../config/constants';

interface StatCard {
  title: string;
  value: number | string;
  Icon: React.ComponentType<{ className?: string }>;
  color: string;
  to: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const tenantId = user?.uid;

  const [stats, setStats] = useState({ connections: 0, plugins: 0, snapsToday: 0, openItems: 0 });
  const [recentSnaps, setRecentSnaps] = useState<SnapSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      try {
        const [connSnap, pluginSnap, subSnap] = await Promise.all([
          getDocs(collection(db, 'tenants', tenantId, 'connections')),
          getDocs(collection(db, 'tenants', tenantId, 'snapPlugins')),
          getDocs(query(
            collection(db, 'snap_submissions'),
            where('tenantId', '==', tenantId),
            orderBy('createdAt', 'desc'),
            limit(10)
          )),
        ]);

        const submissions = subSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapSubmission));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const snapsToday = submissions.filter((s) => s.createdAt?.toDate?.() >= today).length;
        const openItems = submissions.filter((s) => s.status === 'new' || s.status === 'in_progress' || s.status === 'ready_for_testing').length;

        setStats({
          connections: connSnap.size,
          plugins: pluginSnap.size,
          snapsToday,
          openItems,
        });
        setRecentSnaps(submissions.slice(0, 5));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tenantId]);

  const statCards: StatCard[] = [
    { title: 'Total Connections', value: stats.connections, Icon: LinkIcon, color: 'blue', to: '/connections' },
    { title: 'Active Plugins', value: stats.plugins, Icon: CameraIcon, color: 'green', to: '/snap-plugins' },
    { title: 'Snaps Today', value: stats.snapsToday, Icon: QueueListIcon, color: 'purple', to: '/snap-feed' },
    { title: 'Open Items', value: stats.openItems, Icon: ExclamationCircleIcon, color: 'yellow', to: '/snap-feed' },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  return (
    <div>
      <SEO title="Dashboard" path="/dashboard" />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back. Here's what's happening.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ title, value, Icon, color, to }) => (
          <Link
            key={title}
            to={to}
            className="bg-white overflow-hidden shadow rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div className={`rounded-lg p-3 ${colorMap[color]}`}>
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{title}</p>
                {loading ? (
                  <div className="h-7 w-12 bg-gray-200 rounded animate-pulse mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent snaps */}
      <div className="mt-8 bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Recent Snaps</h2>
          <Link to="/snap-feed" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
            View all
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
        {loading ? (
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : recentSnaps.length === 0 ? (
          <div className="p-12 text-center">
            <CameraIcon className="h-12 w-12 text-gray-300 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">No snaps yet.</p>
            <Link to="/snap-plugins" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
              Set up your first snap plugin →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentSnaps.map((snap) => {
              const statusOpt = STATUS_OPTIONS.find((s) => s.value === snap.status);
              return (
                <Link
                  key={snap.id}
                  to={`/snap-feed/${snap.id}`}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {snap.formData?.description || 'No description'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {CAPTURE_TYPE_LABELS[snap.type]} · {snap.context?.pageTitle || snap.context?.pageUrl || ''}
                    </p>
                  </div>
                  {statusOpt && (
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusOpt.color}`}>
                      {statusOpt.label}
                    </span>
                  )}
                  <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
