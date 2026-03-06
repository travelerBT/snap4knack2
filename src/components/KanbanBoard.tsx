import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
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

interface KanbanBoardProps {
  submissions: SnapSubmission[];
  linkPrefix: string; // '/snap-feed' for staff, '/client-portal/snap' for client
  pluginMap?: Record<string, SnapPlugin>;
  onStatusChange?: (id: string, newStatus: string) => Promise<void>;
}

// ── Draggable card ────────────────────────────────────────────────────────────

function DraggableCard({
  sub,
  linkPrefix,
  pluginMap,
  isDragging,
}: {
  sub: SnapSubmission;
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
  isDragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: sub.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? 'opacity-40' : ''}`}
    >
      <SnapCard sub={sub} linkPrefix={linkPrefix} pluginMap={pluginMap} />
    </div>
  );
}

function StaticCard({
  sub,
  linkPrefix,
  pluginMap,
}: {
  sub: SnapSubmission;
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
}) {
  return <SnapCard sub={sub} linkPrefix={linkPrefix} pluginMap={pluginMap} />;
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
      {/* Thumbnail */}
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

      {/* Category + type */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-xs font-semibold text-gray-800 truncate">{sub.formData?.category ?? 'Snap'}</span>
        <span className="flex items-center gap-0.5 text-xs text-gray-400 flex-shrink-0">
          {CAPTURE_ICONS[sub.type]}
          <span className="hidden sm:inline">{CAPTURE_TYPE_LABELS[sub.type]}</span>
        </span>
      </div>

      {/* Description */}
      {sub.formData?.description && (
        <p className="text-xs text-gray-500 line-clamp-2 mb-1.5">{sub.formData.description}</p>
      )}

      {/* Page URL */}
      <p className="text-[10px] text-gray-400 truncate mb-2">{sub.context?.pageUrl ?? ''}</p>

      {/* Footer: plugin/user, priority, date */}
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
  cards,
  linkPrefix,
  pluginMap,
  draggingId,
  canDrag,
}: {
  statusValue: string;
  statusLabel: string;
  cards: SnapSubmission[];
  linkPrefix: string;
  pluginMap?: Record<string, SnapPlugin>;
  draggingId: string | null;
  canDrag: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: statusValue });
  const styles = COLUMN_STYLES[statusValue] ?? COLUMN_STYLES['archived'];

  return (
    <div className="flex flex-col min-w-[260px] w-full flex-1">
      {/* Column header */}
      <div className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl ${styles.headerBg} border ${styles.border} border-b-0`}>
        <span className="text-sm font-semibold text-gray-700">{statusLabel}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles.count}`}>{cards.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-b-xl border ${styles.border} ${styles.bg} p-2 space-y-2 transition-colors ${
          isOver ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''
        }`}
      >
        {cards.map((sub) =>
          canDrag ? (
            <DraggableCard
              key={sub.id}
              sub={sub}
              linkPrefix={linkPrefix}
              pluginMap={pluginMap}
              isDragging={draggingId === sub.id}
            />
          ) : (
            <StaticCard key={sub.id} sub={sub} linkPrefix={linkPrefix} pluginMap={pluginMap} />
          )
        )}
        {cards.length === 0 && (
          <div className={`h-16 rounded-lg border-2 border-dashed ${styles.border} flex items-center justify-center`}>
            <span className="text-xs text-gray-400">No snaps</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────

export default function KanbanBoard({ submissions, linkPrefix, pluginMap, onStatusChange }: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const grouped = Object.fromEntries(
    STATUS_OPTIONS.map((s) => [s.value, submissions.filter((sub) => sub.status === s.value)])
  );

  const draggingSnap = draggingId ? submissions.find((s) => s.id === draggingId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || !onStatusChange) return;
    const newStatus = String(over.id);
    const snap = submissions.find((s) => s.id === String(active.id));
    if (!snap || snap.status === newStatus) return;
    await onStatusChange(String(active.id), newStatus);
  }

  const canDrag = !!onStatusChange;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 items-start">
        {STATUS_OPTIONS.map((s) => (
          <KanbanColumn
            key={s.value}
            statusValue={s.value}
            statusLabel={s.label}
            cards={grouped[s.value] ?? []}
            linkPrefix={linkPrefix}
            pluginMap={pluginMap}
            draggingId={draggingId}
            canDrag={canDrag}
          />
        ))}
      </div>

      {/* Drag overlay — floats a ghost card while dragging */}
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
