import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  startAfter,
  updateDoc,
  doc,
  writeBatch,
  addDoc,
  serverTimestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import KanbanBoard from '../components/KanbanBoard';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PhotoIcon,
  VideoCameraIcon,
  CursorArrowRaysIcon,
  RectangleStackIcon,
  CommandLineIcon,
  ClipboardDocumentListIcon,
  LinkIcon,
  Squares2X2Icon,
  ListBulletIcon,
  UsersIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import type { SnapSubmission, SnapPlugin, Connection, TenantShare } from '../types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, CAPTURE_TYPE_LABELS } from '../config/constants';

const PAGE_SIZE = 20;

const CAPTURE_ICONS: Record<string, React.ReactNode> = {
  full_viewport: <PhotoIcon className="h-4 w-4" />,
  select_area: <RectangleStackIcon className="h-4 w-4" />,
  element_pin: <CursorArrowRaysIcon className="h-4 w-4" />,
  screen_recording: <VideoCameraIcon className="h-4 w-4" />,
  console_errors: <CommandLineIcon className="h-4 w-4" />,
};

export default function SnapFeed() {
  const { user, sharedPluginAccess } = useAuth();
  const tenantId = user?.uid || '';
  const [feedMode, setFeedMode] = useState<'mine' | 'shared'>('mine');

  const [liveItems, setLiveItems] = useState<SnapSubmission[]>([]);
  const [moreItems, setMoreItems] = useState<SnapSubmission[]>([]);
  const [lastLiveDoc, setLastLiveDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [lastMoreDoc, setLastMoreDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [plugins, setPlugins] = useState<SnapPlugin[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [view, setView] = useState<'list' | 'kanban'>('kanban');

  // Filters
  const [search, setSearch] = useState('');
  const [pluginFilter, setPluginFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    const loadMeta = async () => {
      const [pluginSnap, connSnap] = await Promise.all([
        getDocs(collection(db, 'tenants', tenantId, 'snapPlugins')),
        getDocs(collection(db, 'tenants', tenantId, 'connections')),
      ]);
      setPlugins(pluginSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapPlugin)));
      setConnections(connSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Connection)));
    };
    loadMeta();
  }, [tenantId]);

  // Real-time listener for first page — re-subscribes when filters change
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setMoreItems([]);
    setLastMoreDoc(null);

    const constraints: Parameters<typeof query>[1][] = [
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ];
    if (pluginFilter) constraints.push(where('pluginId', '==', pluginFilter));
    if (statusFilter) constraints.push(where('status', '==', statusFilter));
    if (typeFilter) constraints.push(where('type', '==', typeFilter));
    if (priorityFilter) constraints.push(where('priority', '==', priorityFilter));
    if (sourceFilter) constraints.push(where('source', '==', sourceFilter));

    const q = query(collection(db, 'snap_submissions'), ...constraints);
    const unsub = onSnapshot(q, (snap) => {
      setLiveItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapSubmission)));
      setLastLiveDoc(snap.docs[snap.docs.length - 1] ?? null);
      setHasMore(snap.size === PAGE_SIZE);
      setLoading(false);
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, pluginFilter, statusFilter, typeFilter, priorityFilter, sourceFilter]);

  const handleLoadMore = async () => {
    const cursor = lastMoreDoc ?? lastLiveDoc;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);

    const constraints: Parameters<typeof query>[1][] = [
      where('tenantId', '==', tenantId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
      startAfter(cursor),
    ];
    if (pluginFilter) constraints.push(where('pluginId', '==', pluginFilter));
    if (statusFilter) constraints.push(where('status', '==', statusFilter));
    if (typeFilter) constraints.push(where('type', '==', typeFilter));
    if (priorityFilter) constraints.push(where('priority', '==', priorityFilter));
    if (sourceFilter) constraints.push(where('source', '==', sourceFilter));

    const q = query(collection(db, 'snap_submissions'), ...constraints);
    const snap = await getDocs(q);
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapSubmission));
    setMoreItems((prev) => [...prev, ...docs]);
    setLastMoreDoc(snap.docs[snap.docs.length - 1] ?? null);
    setHasMore(snap.size === PAGE_SIZE);
    setLoadingMore(false);
  };

  // Merge live first page with any additional pages loaded via "Load More"
  const liveIds = useMemo(() => new Set(liveItems.map((s) => s.id)), [liveItems]);
  const submissions = useMemo(
    () => [...liveItems, ...moreItems.filter((s) => !liveIds.has(s.id))],
    [liveItems, moreItems, liveIds]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return submissions;
    const s = search.toLowerCase();
    return submissions.filter(
      (sub) =>
        sub.context?.pageUrl?.toLowerCase().includes(s) ||
        sub.formData?.category?.toLowerCase().includes(s) ||
        sub.formData?.description?.toLowerCase().includes(s)
    );
  }, [submissions, search]);

  const pluginMap = useMemo(() => Object.fromEntries(plugins.map((p) => [p.id, p])), [plugins]);
  const connectionMap = useMemo(() => Object.fromEntries(connections.map((c) => [c.id, c])), [connections]);

  // Group filtered submissions by connectionId (via plugin), preserving submission order within each group
  const grouped = useMemo(() => {
    const order: string[] = [];
    const groups: Record<string, SnapSubmission[]> = {};
    for (const sub of filtered) {
      const plugin = pluginMap[sub.pluginId];
      const connId = plugin?.connectionId ?? '__unknown__';
      if (!groups[connId]) {
        order.push(connId);
        groups[connId] = [];
      }
      groups[connId].push(sub);
    }
    return order.map((connId) => ({
      connId,
      connection: connectionMap[connId] ?? null,
      submissions: groups[connId],
    }));
  }, [filtered, pluginMap, connectionMap]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const existing = [...liveItems, ...moreItems].find((s) => s.id === id);
    await updateDoc(doc(db, 'snap_submissions', id), { status: newStatus });
    if (existing && existing.status !== newStatus) {
      await addDoc(collection(db, 'snap_submissions', id, 'history'), {
        changedBy: tenantId,
        changedByName: user?.displayName || user?.email || 'Team',
        changeType: 'status',
        fromValue: existing.status,
        toValue: newStatus,
        changedAt: serverTimestamp(),
      });
    }
  };

  const handleReorder = async (_columnStatus: string, orderedIds: string[]) => {
    const batch = writeBatch(db);
    orderedIds.forEach((id, index) => {
      batch.update(doc(db, 'snap_submissions', id), { sortOrder: index * 1000 });
    });
    await batch.commit();
  };

  return (
    <div>
      <SEO title="Snap Feed" />
      <div className="mb-6">
        <div className="sm:flex sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Snap Feed</h1>
          {feedMode === 'mine' && (
            <div className="flex items-center gap-3 mt-2 sm:mt-0">
              <p className="text-sm text-gray-500">{submissions.length} submission{submissions.length !== 1 ? 's' : ''} loaded</p>
              {/* View toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setView('list')}
                  className={`p-1.5 ${ view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="List view"
                >
                  <ListBulletIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setView('kanban')}
                  className={`p-1.5 ${ view === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="Kanban view"
                >
                  <Squares2X2Icon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
        {sharedPluginAccess.length > 0 && (
          <div className="flex mt-4 rounded-lg border border-gray-200 overflow-hidden w-fit">
            <button
              onClick={() => setFeedMode('mine')}
              className={`px-5 py-2 text-sm font-medium transition-colors ${feedMode === 'mine' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              My Feeds
            </button>
            <button
              onClick={() => setFeedMode('shared')}
              className={`px-5 py-2 text-sm font-medium border-l border-gray-200 transition-colors ${feedMode === 'shared' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Shared Feeds
            </button>
          </div>
        )}
      </div>

      {feedMode === 'shared' ? <SharedFeed /> : <>

      {/* Filter bar */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-9 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          {/* Plugin */}
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select
              value={pluginFilter}
              onChange={(e) => setPluginFilter(e.target.value)}
              className="pl-9 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All Connections</option>
              {plugins.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {/* Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All types</option>
            {Object.entries(CAPTURE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {/* Priority */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {/* Source */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All sources</option>
            <option value="knack">Knack</option>
            <option value="react">React</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-white shadow rounded-lg">
          <ClipboardDocumentListIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-base font-medium text-gray-900">No snaps yet</p>
          <p className="mt-1 text-sm text-gray-500">Submissions from your Knack apps will appear here.</p>
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          submissions={filtered}
          linkPrefix="/snap-feed"
          pluginMap={pluginMap}
          onStatusChange={handleStatusChange}
          onReorder={handleReorder}
        />
      ) : (
        <>
          <div className="space-y-6">
            {grouped.map(({ connId, connection, submissions: groupSubs }) => (
              <div key={connId}>
                {/* Connection header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <LinkIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <h2 className="text-sm font-semibold text-gray-700 truncate">
                    {connection ? connection.name : 'Unknown Connection'}
                  </h2>
                  {connection?.appName && (
                    <span className="text-xs text-gray-400 truncate">· {connection.appName}</span>
                  )}
                  <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                    {groupSubs.length} snap{groupSubs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="bg-white shadow rounded-lg overflow-hidden">
                  <div className="divide-y divide-gray-100">
                    {groupSubs.map((sub) => (
                      <SubmissionRow key={sub.id} sub={sub} pluginName={pluginMap[sub.pluginId]?.name ?? '—'} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
      </>}
    </div>
  );
}

// ── Shared Feed ───────────────────────────────────────────────────────────────

function SharedFeed() {
  const { user } = useAuth();
  const [shares, setShares] = useState<TenantShare[]>([]);
  const [liveItems, setLiveItems] = useState<SnapSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'kanban'>('kanban');

  const [search, setSearch] = useState('');
  const [pluginFilter, setPluginFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  // Load TenantShare docs where this user is the grantee
  useEffect(() => {
    if (!user?.uid) return;
    getDocs(
      query(collection(db, 'tenant_shares'), where('grantedTenantId', '==', user.uid))
    ).then((snap) => {
      const active = snap.docs
        .filter((d) => d.data().status === 'active')
        .map((d) => ({ id: d.id, ...d.data() } as TenantShare));
      setShares(active);
    });
  }, [user?.uid]);

  // One real-time listener per shared pluginId, re-subscribes on filter changes
  useEffect(() => {
    if (shares.length === 0) { setLoading(false); return; }
    const byPlugin: Record<string, SnapSubmission[]> = {};
    const settled = new Set<string>();

    const unsubs = shares.map((share) => {
      const constraints: Parameters<typeof query>[1][] = [
        where('pluginId', '==', share.pluginId),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE),
      ];
      if (statusFilter) constraints.push(where('status', '==', statusFilter));
      if (typeFilter) constraints.push(where('type', '==', typeFilter));
      if (priorityFilter) constraints.push(where('priority', '==', priorityFilter));

      return onSnapshot(
        query(collection(db, 'snap_submissions'), ...constraints),
        (snap) => {
          byPlugin[share.pluginId] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapSubmission));
          settled.add(share.pluginId);
          const merged = Object.values(byPlugin)
            .flat()
            .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
          setLiveItems(merged);
          if (settled.size >= shares.length) setLoading(false);
        }
      );
    });

    return () => unsubs.forEach((u) => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shares, statusFilter, typeFilter, priorityFilter]);

  const shareMap = useMemo(
    () => Object.fromEntries(shares.map((s) => [s.pluginId, s])),
    [shares]
  );

  // Synthetic pluginMap for KanbanBoard (name only)
  const pluginMap = useMemo(
    () => Object.fromEntries(
      shares.map((s) => [s.pluginId, { id: s.pluginId, name: s.pluginName } as SnapPlugin])
    ),
    [shares]
  );

  const filtered = useMemo(() => {
    let items = liveItems;
    if (pluginFilter) items = items.filter((s) => s.pluginId === pluginFilter);
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (sub) =>
        sub.context?.pageUrl?.toLowerCase().includes(q) ||
        sub.formData?.category?.toLowerCase().includes(q) ||
        sub.formData?.description?.toLowerCase().includes(q)
    );
  }, [liveItems, pluginFilter, search]);

  // Group by owner for list view
  const grouped = useMemo(() => {
    const order: string[] = [];
    const groups: Record<string, { ownerCompanyName: string; submissions: SnapSubmission[] }> = {};
    for (const sub of filtered) {
      const share = shareMap[sub.pluginId];
      const key = share?.ownerTenantId ?? '__unknown__';
      if (!groups[key]) {
        order.push(key);
        groups[key] = { ownerCompanyName: share?.ownerCompanyName ?? 'Unknown', submissions: [] };
      }
      groups[key].submissions.push(sub);
    }
    return order.map((key) => ({
      ownerTenantId: key,
      ownerCompanyName: groups[key].ownerCompanyName,
      submissions: groups[key].submissions,
    }));
  }, [filtered, shareMap]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    const existing = liveItems.find((s) => s.id === id);
    await updateDoc(doc(db, 'snap_submissions', id), { status: newStatus });
    if (existing && existing.status !== newStatus) {
      await addDoc(collection(db, 'snap_submissions', id, 'history'), {
        changedBy: user?.uid || '',
        changedByName: user?.displayName || user?.email || 'Team',
        changeType: 'status',
        fromValue: existing.status,
        toValue: newStatus,
        changedAt: serverTimestamp(),
      });
    }
  };

  const handleReorder = async (_columnStatus: string, orderedIds: string[]) => {
    const batch = writeBatch(db);
    orderedIds.forEach((id, index) => {
      batch.update(doc(db, 'snap_submissions', id), { sortOrder: index * 1000 });
    });
    await batch.commit();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (shares.length === 0) {
    return (
      <div className="text-center py-20 bg-white shadow rounded-lg">
        <UsersIcon className="h-12 w-12 text-gray-300 mx-auto" />
        <p className="mt-3 text-base font-medium text-gray-900">No shared feeds yet</p>
        <p className="mt-1 text-sm text-gray-500">When another tenant shares their snap feed with you, it will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Controls row */}
      <div className="sm:flex sm:items-center sm:justify-between mb-4">
        <p className="text-sm text-gray-500">{filtered.length} submission{filtered.length !== 1 ? 's' : ''}</p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mt-2 sm:mt-0">
          <button
            onClick={() => setView('list')}
            className={`p-1.5 ${view === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            title="List view"
          >
            <ListBulletIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`p-1.5 ${view === 'kanban' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            title="Kanban view"
          >
            <Squares2X2Icon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-9 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div className="relative">
            <FunnelIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <select
              value={pluginFilter}
              onChange={(e) => setPluginFilter(e.target.value)}
              className="pl-9 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">All shared feeds</option>
              {shares.map((s) => (
                <option key={s.pluginId} value={s.pluginId}>{s.pluginName} ({s.ownerCompanyName})</option>
              ))}
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All types</option>
            {Object.entries(CAPTURE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white shadow rounded-lg">
          <ClipboardDocumentListIcon className="h-12 w-12 text-gray-300 mx-auto" />
          <p className="mt-3 text-base font-medium text-gray-900">No snaps found</p>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your filters.</p>
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          submissions={filtered}
          linkPrefix="/snap-feed"
          pluginMap={pluginMap}
          onStatusChange={handleStatusChange}
          onReorder={handleReorder}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ ownerTenantId: key, ownerCompanyName, submissions: groupSubs }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <UsersIcon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-gray-700 truncate">
                  Shared by {ownerCompanyName}
                </h2>
                <span className="ml-auto text-xs text-gray-400 flex-shrink-0">
                  {groupSubs.length} snap{groupSubs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="bg-white shadow rounded-lg overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {groupSubs.map((sub) => (
                    <SubmissionRow
                      key={sub.id}
                      sub={sub}
                      pluginName={shareMap[sub.pluginId]?.pluginName ?? '—'}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SubmissionRow({ sub, pluginName }: { sub: SnapSubmission; pluginName: string }) {
  const status = STATUS_OPTIONS.find((s) => s.value === sub.status);
  const priority = PRIORITY_OPTIONS.find((p) => p.value === sub.priority);
  const createdAt = sub.createdAt?.toDate?.() ?? null;

  return (
    <Link to={`/snap-feed/${sub.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
      {/* Thumbnail */}
      <div className="flex-shrink-0 h-14 w-20 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
        {sub.screenshotUrl ? (
          <img src={sub.screenshotUrl} alt="snap" className="h-full w-full object-cover" />
        ) : sub.type === 'screen_recording' ? (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            <VideoCameraIcon className="h-6 w-6" />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            <PhotoIcon className="h-6 w-6" />
          </div>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {sub.snapNumber != null && (
            <span className="text-xs font-bold text-gray-400 font-mono">#{sub.snapNumber}</span>
          )}
          <span className="text-sm font-medium text-gray-900 truncate">
            {sub.formData?.category ?? 'Snap'}
          </span>
          {sub.hipaaEnabled && (
            <span className="inline-flex items-center gap-0.5 flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
              <ShieldCheckIcon className="h-3 w-3" />
              HIPAA
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
            {CAPTURE_ICONS[sub.type]}
            {CAPTURE_TYPE_LABELS[sub.type]}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">{sub.context?.pageUrl ?? '—'}</p>
        <p className="text-xs text-gray-400 mt-0.5">
            {pluginName}
            {sub.context?.knackUserName && <> · <span className="font-medium text-gray-500">{sub.context.knackUserName}</span></>}
            {sub.context?.knackUserId && <> · <span className="font-mono">{sub.context.knackUserId}</span></>}
            {!sub.context?.knackUserName && !sub.context?.knackUserId && <> · anonymous</>}
          </p>
      </div>
      {/* Badges */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {status && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>{status.label}</span>
        )}
        {priority && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${priority.color}`}>{priority.label}</span>
        )}
      </div>
      {/* Date */}
      <div className="flex-shrink-0 text-right w-20">
        <p className="text-xs text-gray-400">
          {createdAt
            ? createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—'}
        </p>
        <p className="text-xs text-gray-400">
          {createdAt ? createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
        </p>
      </div>
    </Link>
  );
}
