import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PhotoIcon, VideoCameraIcon, CursorArrowRaysIcon, RectangleStackIcon, CommandLineIcon } from '@heroicons/react/24/outline';
import type { SnapSubmission, SnapPlugin } from '../types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, CAPTURE_TYPE_LABELS } from '../config/constants';

const CAPTURE_ICONS: Record<string, React.ReactNode> = {
  full_viewport: <PhotoIcon className="h-3.5 w-3.5" />,
  select_area: <RectangleStackIcon className="h-3.5 w-3.5" />,
  element_pin: <CursorArrowRaysIcon className="h-3.5 w-3.5" />,
  screen_recording: <VideoCameraIcon className="h-3.5 w-3.5" />,
  console_errors: <CommandLineIcon className="h-3.5 w-3.5" />,
};

const COLUMN_STYLES: Record<string, { bg: string; headerBg: string; border: string; count: string }> = {
  new:         { bg: 'bg-blue-50',   headerBg: 'bg-blue-100',   border: 'border-blue-200',  count: 'bg-blue-200 text-blue-800' },
  in_progress: { bg: 'bg-yellow-50', headerBg: 'bg-yellow-100', border: 'border-yellow-200', count: 'bg-yellow-200 text-yellow-800' },
  resolved:    { bg: 'bg-green-50',  headerBg: 'bg-green-100',  border: 'border-green-200',  count: 'bg-green-200 text-green-800' },
  archived:    { bg: 'bg-gray-50',   headerBg: 'bg-gray-100',   border: 'border-gray-200',   count: 'bg-gray-200 text-gray-700' },
};

const STATUS_VALUES = new Set<string>(STATUS_OPTIONS.map((s) => s.value));

interface KanbanBoardProps {
  submissions: SnapSubmission[];
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
  onStatusChange?: (id: string, newStatus: string) => Promise<void>;
  onReorder?: (columnStatus: string, orderedIds: string[]) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortKey(sub: SnapSubmission) {
  if (sub.sortOrder != null) return sub.sortOrder;
  return sub.createdAt?.toMillis?.() ?? 0;
}

function buildGroups(submissions: SnapSubmission[]): Record<string, string[]> {
  const sorted = [...submissions].sort((a, b) => sortKey(a) - sortKey(b));
  const groups: Record<string, string[]> = {};
  STATUS_OPTIONS.forEach((s) => { groups[s.value] = []; });
  sorted.forEach((sub) => {
    if (groups[sub.status]) groups[sub.status].push(sub.id);
    else groups['new']?.push(sub.id);
  });
  return groups;
}

// ── Sortable card ─────────────────────────────────────────────────────────────

function SortableCard({
  sub,
  linkPrefix,
  pluginMap,
  canDrag,
  isDragging,
}: {
  sub: SnapSubmission;
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
  canDrag: boolean;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: sub.id,
    disabled: !canDrag,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canDrag ? { ...listeners, ...attributes } : {})}
      className={`touch-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <SnapCard sub={sub} linkPrefix={linkPrefix} pluginMap={pluginMap} />
    </div>
  );
}

function SnapCard({
  sub,
  linkPrefix,
  pluginMap,
}: {
  sub: SnapSubmission;
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
}) {
  const priority = PRIORITY_OPTIONS.find((p) => p.value === sub.priority);
  const createdAt = sub.createdAt?.toDate?.() ?? null;
  const pluginName = pluginMap?.[sub.pluginId]?.name;

  return (
    <Link
      to={`${linkPrefix}/${sub.id}`}
      onClick={(e) => e.stopPropagation()}
      className="block bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all p-3 cursor-pointer select-none"
      draggable={false}
    >
      {sub.screenshotUrl && (
        <div className="h-24 w-full rounded overflow-hidden bg-gray-100 mb-2">
          <img src={sub.screenshotUrl} alt="snap" className="h-full w-full object-cover" />
        </div>
      )}
      {!sub.screenshotUrl && sub.type === 'screen_recording' && (
        <div className="h-16 w-full rounded bg-gray-100 mb-2 flex items-center justify-center text-gray-400">
          <VideoCameraIcon className="h-7 w-7" />
        </div>
      )}

      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-xs font-semibold text-gray-800 truncate">{sub.formData?.category ?? 'Snap'}</span>
        <span className="flex items-center gap-0.5 text-xs text-gray-400 flex-shrink-0">
          {CAPTURE_ICONS[sub.type]}
          <span className="hidden sm:inline">{CAPTURE_TYPE_LABELS[sub.type]}</span>
        </span>
      </div>

      {sub.formData?.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{sub.formData.description}</p>
      )}
      <p className="text-[10px] text-gray-400 truncate mb-2">{sub.context?.pageUrl ?? ''}</p>

      <div className="flex items-center justify-between gap-1 flex-wrap">
        <div className="flex flex-col min-w-0">
          {sub.context?.knackUserName && (
            <span className="text-[10px] font-medium text-gray-600 truncate">{sub.context.knackUserName}</span>
          )}
          {pluginName && (
            <span className="text-[10px] text-gray-400 truncate">{pluginName}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {priority && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priority.color}`}>{priority.label}</span>
          )}
          <span className="text-[10px] text-gray-400">
            {createdAt ? createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ── Droppable column ──────────────────────────────────────────────────────────

function KanbanColumn({
  statusValue,
  statusLabel,
  orderedIds,
  subMap,
  linkPrefix,
  pluginMap,
  draggingId,
  canDrag,
}: {
  statusValue: string;
  statusLabel: string;
  orderedIds: string[];
  subMap: Record<string, SnapSubmission>;
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
  draggingId: string | null;
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statusValue });
  const styles = COLUMN_STYLES[statusValue] ?? COLUMN_STYLES['archived'];

  return (
    <div className="flex flex-col min-w-[260px] w-full flex-1">
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${styles.headerBg} border ${styles.border} border-b-0`}>
        <span className="text-sm font-semibold text-gray-700">{statusLabel}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles.count}`}>{orderedIds.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-b-xl border ${styles.border} ${styles.bg} p-2 transition-colors ${
          isOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''
        }`}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {orderedIds.map((id) => {
              const sub = subMap[id];
              if (!sub) return null;
              return (
                <SortableCard
                  key={id}
                  sub={sub}
                  linkPrefix={linkPrefix}
                  pluginMap={pluginMap}
                  canDrag={canDrag}
                  isDragging={draggingId === id}
                />
              );
            })}
            {orderedIds.length === 0 && (
              <div className={`h-16 rounded-lg border-2 border-dashed ${styles.border} flex items-center justify-center`}>
                <span className="text-xs text-gray-400">No snaps</span>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

export default function KanbanBoard({ submissions, linkPrefix, pluginMap, onStatusChange, onReorder }: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStartCol, setDragStartCol] = useState<string | null>(null);
  const [localGroups, setLocalGroups] = useState<Record<string, string[]>>(() => buildGroups(submissions));

  // Sync when submissions change (new items, removals, status changes from Firestore)
  useEffect(() => {
    setLocalGroups(buildGroups(submissions));
  }, [submissions]);

  const subMap = useCallback(() => {
    const m: Record<string, SnapSubmission> = {};
    submissions.forEach((s) => { m[s.id] = s; });
    return m;
  }, [submissions])();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const canDrag = !!(onStatusChange || onReorder);

  function findColOfId(id: string, groups: Record<string, string[]>): string | null {
    for (const [col, ids] of Object.entries(groups)) {
      if (ids.includes(id)) return col;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setDraggingId(id);
    setDragStartCol(findColOfId(id, localGroups));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    setLocalGroups((prev) => {
      const activeCol = findColOfId(activeId, prev);
      if (!activeCol) return prev;

      // Determine target column: over a column directly, or over a card
      const targetCol = STATUS_VALUES.has(overId) ? overId : findColOfId(overId, prev);
      if (!targetCol || targetCol === activeCol) return prev;

      // Move card to target column (at the end for now; handleDragEnd will fine-tune)
      const next = { ...prev };
      next[activeCol] = next[activeCol].filter((id) => id !== activeId);
      next[targetCol] = [...(next[targetCol] ?? []), activeId];
      return next;
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    setLocalGroups((prev) => {
      const activeCol = findColOfId(activeId, prev);
      if (!activeCol) return prev;

      // Determine target column
      const targetCol = STATUS_VALUES.has(overId) ? overId : (findColOfId(overId, prev) ?? activeCol);

      const next = { ...prev };

      if (activeCol !== targetCol) {
        // Cross-column: status change
        next[activeCol] = next[activeCol].filter((id) => id !== activeId);
        next[targetCol] = [...(next[targetCol] ?? []), activeId];
        if (onStatusChange) {
          setTimeout(() => onStatusChange(activeId, targetCol), 0);
        }
      } else {
        // Same column: reorder
        if (!STATUS_VALUES.has(overId)) {
          const oldIndex = next[activeCol].indexOf(activeId);
          const newIndex = next[activeCol].indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            next[activeCol] = arrayMove(next[activeCol], oldIndex, newIndex);
          }
        }
        // Fire reorder if order actually changed
        if (onReorder) {
          const origCol = dragStartCol ?? activeCol;
          if (origCol === activeCol) {
            setTimeout(() => onReorder!(activeCol, next[activeCol]), 0);
          }
        }
      }

      return next;
    });
  }

  const draggingSnap = draggingId ? subMap[draggingId] ?? null : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {STATUS_OPTIONS.map((s) => (
          <KanbanColumn
            key={s.value}
            statusValue={s.value}
            statusLabel={s.label}
            orderedIds={localGroups[s.value] ?? []}
            subMap={subMap}
            linkPrefix={linkPrefix}
            pluginMap={pluginMap}
            draggingId={draggingId}
            canDrag={canDrag}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingSnap && (
          <div className="w-[260px] opacity-95 rotate-1 shadow-2xl">
            <SnapCard sub={draggingSnap} linkPrefix={linkPrefix} pluginMap={pluginMap} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

