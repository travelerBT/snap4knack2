import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import {
  PhotoIcon,
  VideoCameraIcon,
  CursorArrowRaysIcon,
  RectangleStackIcon,
  CommandLineIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import type { SnapSubmission } from '../../types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, CAPTURE_TYPE_LABELS } from '../../config/constants';

const CAPTURE_ICONS: Record<string, React.ReactNode> = {
  full_viewport: <PhotoIcon className="h-4 w-4" />,
  select_area: <RectangleStackIcon className="h-4 w-4" />,
  element_pin: <CursorArrowRaysIcon className="h-4 w-4" />,
  screen_recording: <VideoCameraIcon className="h-4 w-4" />,
  console_errors: <CommandLineIcon className="h-4 w-4" />,
};

export default function ClientPortal() {
  const { clientAccess } = useAuth();
  const [submissions, setSubmissions] = useState<SnapSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (!clientAccess || clientAccess.length === 0) {
      setLoading(false);
      return;
    }
    const load = async () => {
      // Load submissions for each plugin the client has access to
      const results = await Promise.all(
        clientAccess.map((pluginId) =>
          getDocs(
            query(
              collection(db, 'snap_submissions'),
              where('pluginId', '==', pluginId),
              orderBy('createdAt', 'desc')
            )
          )
        )
      );
      const all = results.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as SnapSubmission)));
      // Sort merged by date
      all.sort((a, b) => {
        const at = a.createdAt?.seconds ?? 0;
        const bt = b.createdAt?.seconds ?? 0;
        return bt - at;
      });
      setSubmissions(all);
      setLoading(false);
    };
    load();
  }, [clientAccess]);

  const filtered = useMemo(() => {
    return submissions.filter((sub) => {
      if (statusFilter && sub.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (
          !sub.formData?.category?.toLowerCase().includes(s) &&
          !sub.formData?.description?.toLowerCase().includes(s) &&
          !sub.context?.pageUrl?.toLowerCase().includes(s)
        ) return false;
      }
      return true;
    });
  }, [submissions, statusFilter, search]);

  return (
    <div>
      <SEO title="My Snaps" />
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Snaps</h1>
          <p className="text-sm text-gray-500 mt-1">Feedback submissions you have access to.</p>
        </div>
        <p className="text-sm text-gray-400 mt-1 sm:mt-0">{filtered.length} snap{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 mb-6 flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-9 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white shadow rounded-lg">
          <ClipboardDocumentListIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-base font-medium text-gray-900">No snaps yet</p>
          <p className="mt-1 text-sm text-gray-500">Submissions will appear here as your team captures them.</p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map((sub) => {
              const status = STATUS_OPTIONS.find((s) => s.value === sub.status);
              const priority = PRIORITY_OPTIONS.find((p) => p.value === sub.priority);
              const createdAt = sub.createdAt?.toDate?.() ?? null;
              return (
                <Link
                  key={sub.id}
                  to={`/client-portal/snap/${sub.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 h-14 w-20 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
                    {sub.screenshotUrl ? (
                      <img src={sub.screenshotUrl} alt="snap" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        {CAPTURE_ICONS[sub.type] ?? <PhotoIcon className="h-6 w-6" />}
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{sub.formData?.category ?? 'Snap'}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                        {CAPTURE_ICONS[sub.type]}
                        {CAPTURE_TYPE_LABELS[sub.type]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{sub.context?.pageUrl ?? '—'}</p>
                  </div>
                  {/* Badges */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {status && <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>}
                    {priority && <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${priority.color}`}>{priority.label}</span>}
                  </div>
                  {/* Date */}
                  <div className="flex-shrink-0 text-right text-xs text-gray-400 w-16">
                    {createdAt ? createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
