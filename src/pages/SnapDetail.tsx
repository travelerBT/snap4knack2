import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  doc, updateDoc, collection, addDoc, serverTimestamp,
  query, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SEO from '../components/SEO';
import {
  ChevronLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
  CommandLineIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  VideoCameraIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import type { SnapSubmission, SnapComment, AnnotationShape } from '../types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, CAPTURE_TYPE_LABELS } from '../config/constants';

export default function SnapDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const tenantId = user?.uid || '';

  const [sub, setSub] = useState<SnapSubmission | null>(null);
  const [comments, setComments] = useState<SnapComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [notifyComment, setNotifyComment] = useState(false);
  const [showConsole, setShowConsole] = useState(false);

  useEffect(() => {
    if (sub?.type === 'console_errors') setShowConsole(true);
  }, [sub?.type]);
  const [updating, setUpdating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!id) return;

    // Live listener on the submission doc — picks up status/priority changes
    const unsubDoc = onSnapshot(
      doc(db, 'snap_submissions', id),
      (snap) => {
        if (snap.exists()) setSub({ id: snap.id, ...snap.data() } as SnapSubmission);
        setLoading(false);
      },
      () => setLoading(false)
    );

    // Live listener on comments — picks up new comments in real time
    const unsubComments = onSnapshot(
      query(collection(db, 'snap_submissions', id, 'comments'), orderBy('createdAt', 'asc')),
      (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapComment)))
    );

    return () => {
      unsubDoc();
      unsubComments();
    };
  }, [id]);

  // Draw annotations on canvas once image loads
  const drawAnnotations = () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !sub?.annotationData?.shapes?.length) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    sub.annotationData.shapes.forEach((shape: AnnotationShape) => {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;

      switch (shape.tool) {
        case 'pen':
          if (shape.points && shape.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(shape.points[0].x, shape.points[0].y);
            shape.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
            ctx.stroke();
          }
          break;
        case 'rect':
          if (shape.x !== undefined) {
            ctx.strokeRect(shape.x, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
          }
          break;
        case 'arrow':
          if (shape.x !== undefined && shape.x2 !== undefined) {
            const x1 = shape.x, y1 = shape.y ?? 0, x2 = shape.x2, y2 = shape.y2 ?? 0;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
            // Arrowhead
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const len = 12;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - len * Math.cos(angle - 0.4), y2 - len * Math.sin(angle - 0.4));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - len * Math.cos(angle + 0.4), y2 - len * Math.sin(angle + 0.4));
            ctx.stroke();
          }
          break;
        case 'text':
          if (shape.x !== undefined && shape.text) {
            ctx.fillStyle = shape.color;
            ctx.font = '14px sans-serif';
            ctx.fillText(shape.text, shape.x, shape.y ?? 0);
          }
          break;
        case 'blur':
          if (shape.x !== undefined) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(shape.x, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
          }
          break;
      }
    });
  };

  const postComment = async () => {
    if (!commentText.trim() || !id) return;
    setPostingComment(true);
    const c: Omit<SnapComment, 'id'> = {
      submissionId: id,
      authorId: tenantId,
      authorName: user?.displayName || user?.email || 'Team',
      text: commentText.trim(),
      notify: notifyComment,
      createdAt: serverTimestamp() as SnapComment['createdAt'],
    };
    await addDoc(collection(db, 'snap_submissions', id, 'comments'), c);
    // No manual setComments — the onSnapshot listener will pick up the new comment
    setCommentText('');
    setNotifyComment(false);
    setPostingComment(false);
  };

  const updateStatus = async (status: string) => {
    if (!id || !sub) return;
    setUpdating(true);
    await updateDoc(doc(db, 'snap_submissions', id), { status });
    // onSnapshot will update sub automatically
    setUpdating(false);
  };

  const updatePriority = async (priority: string) => {
    if (!id || !sub) return;
    setUpdating(true);
    await updateDoc(doc(db, 'snap_submissions', id), { priority });
    // onSnapshot will update sub automatically
    setUpdating(false);
  };

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-lg animate-pulse" />)}</div>;
  }

  if (!sub) {
    return (
      <div className="text-center py-16">
        <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Submission not found.</p>
        <Link to="/snap-feed" className="mt-2 inline-block text-sm text-blue-600 hover:underline">← Snap Feed</Link>
      </div>
    );
  }

  const createdAt = sub.createdAt?.toDate?.() ?? null;
  const statusOpt = STATUS_OPTIONS.find((s) => s.value === sub.status);
  const priorityOpt = PRIORITY_OPTIONS.find((p) => p.value === sub.priority);

  return (
    <div>
      <SEO title={`Snap: ${sub.formData?.category ?? sub.type}`} />
      <div className="mb-4">
        <Link to="/snap-feed" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ChevronLeftIcon className="h-4 w-4" />
          Snap Feed
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: screenshot / recording */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {sub.type === 'screen_recording' && sub.recordingUrl ? (
              <video controls className="w-full max-h-[600px]" preload="metadata">
                <source src={sub.recordingUrl} type="video/webm" />
                <source src={sub.recordingUrl} type="video/mp4" />
              </video>
            ) : sub.screenshotStatus === 'scanning' ? (
              <div className="flex flex-col items-center justify-center h-64 bg-yellow-50 gap-3 p-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
                <p className="text-sm font-medium text-yellow-700">Scanning image for protected health information…</p>
                <p className="text-xs text-yellow-500">This usually takes a few seconds. The page will update automatically.</p>
              </div>
            ) : sub.screenshotStatus === 'scan_failed' ? (
              <div className="flex flex-col items-center justify-center h-64 bg-red-50 gap-3 p-6">
                <ExclamationCircleIcon className="h-10 w-10 text-red-400" />
                <p className="text-sm font-medium text-red-700">PHI image scan failed</p>
                <p className="text-xs text-red-500">The screenshot could not be processed. Please contact support.</p>
              </div>
            ) : sub.screenshotUrl ? (
              <div className="relative">
                <img
                  ref={imgRef}
                  src={sub.screenshotUrl}
                  alt="snap"
                  className="w-full block"
                  onLoad={drawAnnotations}
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  style={{ maxHeight: '600px' }}
                />
              </div>
            ) : sub.type === 'console_errors' ? (
              <div className="bg-gray-900 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CommandLineIcon className="h-5 w-5 text-green-400" />
                  <span className="text-sm font-semibold text-gray-200">Console Output ({sub.consoleErrors?.length ?? 0})</span>
                </div>
                {sub.consoleErrors && sub.consoleErrors.length > 0 ? (
                  <div className="space-y-1">
                    {sub.consoleErrors.map((entry, i) => {
                      const lvl = entry.level ?? 'log';
                      const levelColor = lvl === 'error' ? 'text-red-400' : lvl === 'warn' ? 'text-yellow-400' : lvl === 'info' ? 'text-blue-400' : lvl === 'debug' ? 'text-purple-400' : 'text-gray-300';
                      const badge = lvl === 'error' ? 'bg-red-900 text-red-300' : lvl === 'warn' ? 'bg-yellow-900 text-yellow-300' : lvl === 'info' ? 'bg-blue-900 text-blue-300' : lvl === 'debug' ? 'bg-purple-900 text-purple-300' : 'bg-gray-700 text-gray-400';
                      return (
                        <div key={i} className="flex items-start gap-2 bg-gray-800 rounded px-3 py-2">
                          <span className={`inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${badge}`}>{lvl}</span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-mono break-all ${levelColor}`}>{entry.message}</p>
                            {entry.timestamp && <p className="text-[10px] text-gray-600 mt-0.5">{new Date(entry.timestamp).toLocaleTimeString()}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No console output was captured at the time of submission.</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-gray-50 text-gray-400">
                <VideoCameraIcon className="h-12 w-12" />
              </div>
            )}
          </div>

          {/* Console output — collapsible, shown for screenshot/recording snaps that also captured logs */}
          {sub.type !== 'console_errors' && sub.consoleErrors && sub.consoleErrors.length > 0 && (
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <button
                onClick={() => setShowConsole((v) => !v)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <CommandLineIcon className="h-4 w-4 text-green-600" />
                  Console Output ({sub.consoleErrors.length})
                </span>
                {showConsole ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
              </button>
              {showConsole && (
                <div className="bg-gray-900 divide-y divide-gray-800 p-3 space-y-1">
                  {sub.consoleErrors.map((entry, i) => {
                    const lvl = entry.level ?? 'log';
                    const levelColor = lvl === 'error' ? 'text-red-400' : lvl === 'warn' ? 'text-yellow-400' : lvl === 'info' ? 'text-blue-400' : lvl === 'debug' ? 'text-purple-400' : 'text-gray-300';
                    const badge = lvl === 'error' ? 'bg-red-900 text-red-300' : lvl === 'warn' ? 'bg-yellow-900 text-yellow-300' : lvl === 'info' ? 'bg-blue-900 text-blue-300' : lvl === 'debug' ? 'bg-purple-900 text-purple-300' : 'bg-gray-700 text-gray-400';
                    return (
                      <div key={i} className="flex items-start gap-2 rounded px-2 py-1.5">
                        <span className={`inline-block text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${badge}`}>{lvl}</span>
                        <p className={`text-xs font-mono break-all ${levelColor}`}>{entry.message}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
              Comments ({comments.length})
            </h3>
            <div className="space-y-3 mb-4">
              {comments.map((c) => {
                const t = c.createdAt?.toDate?.() ?? null;
                return (
                  <div key={c.id} className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                      {(c.authorName || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700">{c.authorName || 'User'}</span>
                        <span className="text-xs text-gray-400">{t ? t.toLocaleString() : ''}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5">{c.text}</p>
                    </div>
                  </div>
                );
              })}
              {comments.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No comments yet.</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && postComment()}
                  placeholder="Add a comment…"
                  className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
                <button
                  onClick={postComment}
                  disabled={!commentText.trim() || postingComment}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {postingComment ? '…' : 'Post'}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyComment}
                  onChange={(e) => setNotifyComment(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600"
                />
                Notify all commenters
              </label>
            </div>
          </div>
        </div>

        {/* Right: metadata + controls */}
        <div className="space-y-4">
          {/* Status */}
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => updateStatus(s.value)}
                  disabled={updating}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                    sub.status === s.value ? `${s.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {sub.status === 'resolved' ? null : (
              <button
                onClick={() => updateStatus('resolved')}
                disabled={updating}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                <CheckCircleIcon className="h-4 w-4" />
                Mark Resolved
              </button>
            )}
          </div>

          {/* Priority */}
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Priority</h3>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => updatePriority(p.value)}
                  disabled={updating}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition-colors ${
                    sub.priority === p.value ? `${p.color} border-current` : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metadata */}
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Submission Info</h3>
            <dl className="space-y-2 text-sm">
              {sub.snapNumber != null && (
                <div>
                  <dt className="text-gray-400 text-xs">Snap #</dt>
                  <dd className="font-bold font-mono text-gray-900">#{sub.snapNumber}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 text-xs">Capture Type</dt>
                <dd className="font-medium text-gray-900">{CAPTURE_TYPE_LABELS[sub.type]}</dd>
              </div>
              {sub.formData?.category && (
                <div>
                  <dt className="text-gray-400 text-xs">Category</dt>
                  <dd className="font-medium text-gray-900">{sub.formData.category}</dd>
                </div>
              )}
              {sub.formData?.description && (
                <div>
                  <dt className="text-gray-400 text-xs">Description</dt>
                  <dd className="text-gray-700">{sub.formData.description}</dd>
                </div>
              )}
              {sub.context?.pageUrl && (
                <div>
                  <dt className="text-gray-400 text-xs">Page</dt>
                  <dd className="text-gray-700 break-all text-xs">{sub.context.pageUrl}</dd>
                </div>
              )}
              {sub.context?.knackUserName && (
                <div>
                  <dt className="text-gray-400 text-xs">Submitted By</dt>
                  <dd className="text-gray-700 font-medium">{sub.context.knackUserName}</dd>
                </div>
              )}
              {sub.context?.knackUserId && (
                <div>
                  <dt className="text-gray-400 text-xs">Knack User ID</dt>
                  <dd className="font-mono text-xs text-gray-700">{sub.context.knackUserId}</dd>
                </div>
              )}
              {sub.context?.knackRole && (
                <div>
                  <dt className="text-gray-400 text-xs">Knack Role</dt>
                  <dd className="text-gray-700">{sub.context.knackRole}</dd>
                </div>
              )}
              {sub.context?.userAgent && (
                <div>
                  <dt className="text-gray-400 text-xs">Browser</dt>
                  <dd className="text-xs text-gray-500 break-all">{sub.context.userAgent}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 text-xs">Submitted</dt>
                <dd className="text-gray-700">{createdAt ? createdAt.toLocaleString() : '—'}</dd>
              </div>
            </dl>
          </div>

          {/* Badges summary */}
          <div className="flex gap-2 flex-wrap">
            {statusOpt && (
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusOpt.color}`}>{statusOpt.label}</span>
            )}
            {priorityOpt && (
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${priorityOpt.color}`}>{priorityOpt.label}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
