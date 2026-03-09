import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  collection, query, where, orderBy, limit, startAfter,
  getDocs, type DocumentSnapshot, type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import {
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import type { AuditLogEntry } from '../types';

const PAGE_SIZE = 50;

interface AuditLogRow extends AuditLogEntry { id: string }

export default function AuditLog() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'tenant' | 'client' | 'admin'>('');

  const buildQuery = useCallback((after?: DocumentSnapshot) => {
    const constraints: QueryConstraint[] = [];
    if (!isAdmin) {
      constraints.push(where('tenantId', '==', user?.uid ?? ''));
    }
    constraints.push(orderBy('viewedAt', 'desc'));
    constraints.push(limit(PAGE_SIZE));
    if (after) constraints.push(startAfter(after));
    return query(collection(db, 'audit_log'), ...constraints);
  }, [isAdmin, user?.uid]);

  const load = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(buildQuery());
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogRow));
    setRows(docs);
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
    setLoading(false);
  }, [buildQuery]);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    if (!lastDoc) return;
    setLoadingMore(true);
    const snap = await getDocs(buildQuery(lastDoc));
    const more = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogRow));
    setRows((prev) => [...prev, ...more]);
    setLastDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.docs.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  // Client-side filter (date range, role, search term)
  const filtered = rows.filter((r) => {
    if (roleFilter && r.viewedByRole !== roleFilter) return false;
    const dt = r.viewedAt?.toDate?.();
    if (fromDate && dt && dt < new Date(fromDate)) return false;
    if (toDate && dt && dt > new Date(toDate + 'T23:59:59')) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !r.snapId?.toLowerCase().includes(q) &&
        !r.viewedByName?.toLowerCase().includes(q) &&
        !r.viewedByEmail?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const exportCsv = () => {
    const header = ['Timestamp', 'Event', 'Snap ID', 'Tenant ID', 'Plugin ID', 'Viewed By', 'Email', 'Role'];
    const csvRows = [header, ...filtered.map((r) => [
      r.viewedAt?.toDate?.()?.toISOString() ?? '',
      r.eventType,
      r.snapId,
      r.tenantId,
      r.pluginId,
      r.viewedByName,
      r.viewedByEmail,
      r.viewedByRole,
    ])];
    const blob = new Blob([csvRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snap4knack-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <SEO title="Audit Log" />

      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardDocumentListIcon className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              HIPAA § 164.312(b) — read-access events for HIPAA-enabled submissions
            </p>
          </div>
        </div>
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-5 flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search snap ID, name, or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Role filter */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Role</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All roles</option>
            <option value="tenant">Tenant</option>
            <option value="client">Client</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {/* Clear */}
        {(search || fromDate || toDate || roleFilter) && (
          <button
            onClick={() => { setSearch(''); setFromDate(''); setToDate(''); setRoleFilter(''); }}
            className="text-sm text-gray-500 hover:text-gray-700 underline self-end pb-2"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <ShieldCheckIcon className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No audit events found</p>
            <p className="text-gray-400 text-sm mt-1 max-w-xs">
              Audit events are recorded when a HIPAA-enabled submission is opened. Enable HIPAA mode on a Snap Plugin to start logging.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Event</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Snap</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Viewed By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                    {isAdmin && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tenant ID</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((r) => {
                    const dt = r.viewedAt?.toDate?.();
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 font-mono text-xs">
                          {dt ? dt.toLocaleString() : '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                            <ShieldCheckIcon className="h-3 w-3" />
                            {r.eventType}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            to={`/snap-feed/${r.snapId}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {r.snapId}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{r.viewedByName}</div>
                          <div className="text-xs text-gray-400">{r.viewedByEmail}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                            r.viewedByRole === 'admin'
                              ? 'bg-purple-50 text-purple-700'
                              : r.viewedByRole === 'client'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {r.viewedByRole}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">{r.tenantId}</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : `Load more (showing ${filtered.length})`}
                </button>
              </div>
            )}

            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} event{filtered.length !== 1 ? 's' : ''} shown
              {(search || fromDate || toDate || roleFilter) ? ' (filtered)' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
