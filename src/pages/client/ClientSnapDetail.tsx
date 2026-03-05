import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, collection, getDocs, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import {
  ChevronLeftIcon,
  ChatBubbleLeftEllipsisIcon,
  CheckCircleIcon,
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

  useEffect(() => {
    if (!id) return;
    Promise.all([
      getDoc(doc(db, 'snap_submissions', id)),
      getDocs(collection(db, 'snap_submissions', id, 'comments')),
    ]).then(([subDoc, commSnap]) => {
      if (subDoc.exists()) setSub({ id: subDoc.id, ...subDoc.data() } as SnapSubmission);
      setComments(commSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SnapComment)));
      setLoading(false);
    });
  }, [id]);

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
      if (shape.tool === 'pen' && shape.points?.length) {
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x, shape.points[0].y);
        shape.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (shape.tool === 'rect' && shape.x !== undefined) {
        ctx.strokeRect(shape.x, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
      } else if (shape.tool === 'blur' && shape.x !== undefined) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(shape.x, shape.y ?? 0, shape.width ?? 0, shape.height ?? 0);
      }
    });
  };

  const postComment = async () => {
    if (!commentText.trim() || !id || !user) return;
    setPosting(true);
    const c: Omit<SnapComment, 'id'> = {
      submissionId: id,
      authorId: user.uid,
      authorName: user.displayName || user.email || 'Client',
      text: commentText.trim(),
      createdAt: serverTimestamp() as SnapComment['createdAt'],
    };
    const ref = await addDoc(collection(db, 'snap_submissions', id, 'comments'), c);
    setComments((prev) => [...prev, { id: ref.id, ...c }]);
    setCommentText('');
    setPosting(false);
  };

  const markResolved = async () => {
    if (!id || !sub) return;
    await updateDoc(doc(db, 'snap_submissions', id), { status: 'resolved' });
    setSub({ ...sub, status: 'resolved' });
  };

  if (loading) return <div className="space-y-3 animate-pulse">{[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-200 rounded-lg" />)}</div>;

  if (!sub) return (
    <div className="text-center py-16">
      <ExclamationCircleIcon className="h-12 w-12 text-gray-300 mx-auto" />
      <p className="mt-3 text-sm text-gray-500">Snap not found.</p>
      <Link to="/client-portal" className="mt-2 inline-block text-sm text-blue-600 hover:underline">← Back</Link>
    </div>
  );

  const statusOpt = STATUS_OPTIONS.find((s) => s.value === sub.status);
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
                    <p className="text-sm text-gray-700 mt-0.5">{c.text}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No comments yet.</p>}
            </div>
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
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white shadow rounded-lg p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
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
            {statusOpt && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusOpt.color}`}>{statusOpt.label}</span>}
            {priorityOpt && <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityOpt.color}`}>{priorityOpt.label}</span>}
          </div>

          {sub.status !== 'resolved' && (
            <button
              onClick={markResolved}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              <CheckCircleIcon className="h-4 w-4" />
              Mark Resolved
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
