import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  doc, collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import {
  ChevronLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import type { SnapSubmission, SnapComment, AnnotationShape } from '../../types';
import { STATUS_OPTIONS, PRIORITY_OPTIONS, CAPTURE_TYPE_LABELS } from '../../config/constants';

export default function ClientSnapDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [sub, setSub] = useState<SnapSubmission | null>(null);
  const [comments, setComments] = useState<SnapComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [posting, setPosting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const auditLoggedRef = useRef(false);

  useEffect(() => {
    if (!id) return;

    // Live listener on the submission doc
    const unsubDoc = onSnapshot(doc(db, 'snap_submissions', id), (snap) => {
      if (snap.exists()) setSub({ id: snap.id, ...snap.data() } as SnapSubmission);
      setLoading(false);
    });

    // Live listener on comments
    const unsubComments = onSnapshot(
      query(collection(db, 'snap_submissions', id, 'comments'), orderBy('createdAt', 'asc')),
      (snap) => setComments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapComment)))
    );

    return () => {
      unsubDoc();
      unsubComments();
    };
  }, [id]);

  // HIPAA audit log — write one snap_viewed entry per page load for HIPAA snaps
  useEffect(() => {
    if (!sub || !user || !id) return;
    if (!sub.hipaaEnabled) return;
    if (auditLoggedRef.current) return;
    auditLoggedRef.current = true;
    addDoc(collection(db, 'audit_log'), {
      eventType: 'snap_viewed',
      snapId: id,
      tenantId: sub.tenantId,
      pluginId: sub.pluginId,
      actorUid: user.uid,
      actorName: user.displayName || user.email || 'Unknown',
      actorEmail: user.email || '',
      actorRole: 'client',
      detail: '',
      eventAt: serverTimestamp(),
    }).catch(() => { /* non-blocking */ });
  }, [sub, user, id]);

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

  const [updating, setUpdating] = useState(false);
  const [notifyComment, setNotifyComment] = useState(false);

  const postComment = async () => {
    if (!commentText.trim() || !id || !user) return;
    setPosting(true);
    const c: Omit<SnapComment, 'id'> = {
      submissionId: id,
      authorId: user.uid,
      authorName: user.displayName || user.email || 'Client',
      text: commentText.trim(),
      notify: notifyComment,
      createdAt: serverTimestamp() as SnapComment['createdAt'],
      dlpPending: true,
    };
    await addDoc(collection(db, 'snap_submissions', id, 'comments'), c);
    // onSnapshot listener will update comments automatically
    setCommentText('');
    setNotifyComment(false);
    setPosting(false);
  };

  const updateStatus = async (status: string) => {
    if (!id || !sub) return;
    setUpdating(true);
    const fromStatus = sub.status;
    await updateDoc(doc(db, 'snap_submissions', id), { status });
    await addDoc(collection(db, 'snap_submissions', id, 'history'), {
      changedBy: user?.uid || '',
      changedByName: user?.displayName || user?.email || 'Client',
      changeType: 'status',
      fromValue: fromStatus,
      toValue: status,
      changedAt: serverTimestamp(),
    });
    if (sub.hipaaEnabled) {
      addDoc(collection(db, 'audit_log'), {
        eventType: 'snap_status_changed',
        snapId: id,
        tenantId: sub.tenantId,
        pluginId: sub.pluginId,
        actorUid: user?.uid || null,
        actorName: user?.displayName || user?.email || 'Client',
        actorEmail: user?.email || '',
        actorRole: 'client',
        detail: `status: ${fromStatus} → ${status}`,
        eventAt: serverTimestamp(),
      }).catch(() => {});
    }
    setUpdating(false);
  };

  if (loading) return <div className="space-y-3 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}</div>;

  if (!sub) return (
    <div className="text-center py-16">
      <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
      <p className="mt-3 text-sm text-gray-500">Snap not found.</p>
      <Link to="/client-portal" className="mt-2 inline-block text-sm text-blue-600 hover:underline">← Back</Link>
    </div>
  );

  const priorityOpt = PRIORITY_OPTIONS.find((p) => p.value === sub.priority);

  return (
    <div>
      <SEO title={`Snap: ${sub.formData?.category ?? sub.type}`} />
      <Link to="/client-portal" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeftIcon className="h-4 w-4" />
        My Snaps
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Screenshot */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            {sub.type === 'screen_recording' && sub.recordingUrl ? (
              <video src={sub.recordingUrl} controls className="w-full max-h-[500px]" />
            ) : sub.screenshotUrl ? (
              <div className="relative">
                <img ref={imgRef} src={sub.screenshotUrl} alt="snap" className="w-full block" onLoad={drawAnnotations} />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-300 bg-gray-50">No image</div>
            )}
          </div>

          {/* Comments */}
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ChatBubbleLeftEllipsisIcon className="h-4 w-4" />
              Comments ({comments.length})
            </h3>
            <div className="space-y-3 mb-4">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700 flex-shrink-0">
                    {(c.authorName || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-700">{c.authorName}</span>
                      <span className="text-xs text-gray-400">{c.createdAt?.toDate?.()?.toLocaleString() ?? ''}</span>
                    </div>
                    {c.dlpPending ? (
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-3 w-48 bg-gray-200 rounded animate-pulse" />
                        <span className="text-xs text-gray-400 italic">Processing…</span>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-700 mt-0.5">{c.text}</p>
                    )}
                  </div>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No comments yet.</p>}
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
                  disabled={!commentText.trim() || posting}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  Post
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

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              {sub.snapNumber != null && (
                <div>
                  <dt className="text-gray-400 text-xs">Snap #</dt>
                  <dd className="font-bold font-mono text-gray-900">#{sub.snapNumber}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-400 text-xs">Type</dt>
                <dd className="font-medium">{CAPTURE_TYPE_LABELS[sub.type]}</dd>
              </div>
              {sub.formData?.category && <div><dt className="text-gray-400 text-xs">Category</dt><dd>{sub.formData.category}</dd></div>}
              {sub.formData?.description && <div><dt className="text-gray-400 text-xs">Description</dt><dd className="text-gray-700">{sub.formData.description}</dd></div>}
              {sub.context?.pageUrl && <div><dt className="text-gray-400 text-xs">Page</dt><dd className="text-xs break-all text-gray-700">{sub.context.pageUrl}</dd></div>}
              <div>
                <dt className="text-gray-400 text-xs">Submitted</dt>
                <dd>{sub.createdAt?.toDate?.()?.toLocaleString() ?? '—'}</dd>
              </div>
            </dl>
          </div>

          <div className="flex gap-2 flex-wrap">
            {priorityOpt && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityOpt.color}`}>{priorityOpt.label}</span>}
          </div>

          {/* Status */}
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status</h3>
            <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
