import { useState } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import SEO from '../../components/SEO';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import type { SnapSubmission } from '../../types';
import { STATUS_OPTIONS, CAPTURE_TYPE_LABELS } from '../../config/constants';

export default function ClientExport() {
  const { clientAccess } = useAuth();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [exporting, setExporting] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  const fetchData = async (): Promise<SnapSubmission[]> => {
    if (!clientAccess || clientAccess.length === 0) return [];
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
    let all = results.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...d.data() } as SnapSubmission)));

    if (statusFilter) all = all.filter((s) => s.status === statusFilter);
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      all = all.filter((s) => (s.createdAt?.seconds ?? 0) * 1000 >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      all = all.filter((s) => (s.createdAt?.seconds ?? 0) * 1000 <= to);
    }
    return all;
  };

  const exportCSV = async () => {
    setExporting(true);
    const data = await fetchData();
    setCount(data.length);
    if (data.length === 0) { setExporting(false); return; }

    const headers = ['ID', 'Date', 'Type', 'Category', 'Description', 'Status', 'Priority', 'Page URL', 'Knack User'];
    const rows = data.map((s) => [
      s.id,
      s.createdAt?.toDate?.()?.toISOString() ?? '',
      CAPTURE_TYPE_LABELS[s.type] ?? s.type,
      s.formData?.category ?? '',
      (s.formData?.description ?? '').replace(/"/g, '""'),
      s.status,
      s.priority ?? '',
      s.context?.pageUrl ?? '',
      s.context?.knackUserId ?? '',
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snap4knack-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const exportPDF = async () => {
    setExporting(true);
    const data = await fetchData();
    setCount(data.length);
    if (data.length === 0) { setExporting(false); return; }

    // Simple HTML→print PDF approach
    const html = `<!DOCTYPE html><html><head><title>Snap4Knack Export</title>
<style>body{font-family:sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}
th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left}th{background:#f9fafb;font-weight:600}
tr:nth-child(even){background:#f9fafb}</style></head><body>
<h2>Snap4Knack Export — ${new Date().toLocaleDateString()}</h2>
<p>${data.length} record${data.length !== 1 ? 's' : ''}</p>
<table><thead><tr>
<th>Date</th><th>Type</th><th>Category</th><th>Status</th><th>Priority</th><th>Page</th>
</tr></thead><tbody>
${data.map((s) => `<tr>
<td>${s.createdAt?.toDate?.()?.toLocaleDateString() ?? ''}</td>
<td>${CAPTURE_TYPE_LABELS[s.type] ?? s.type}</td>
<td>${s.formData?.category ?? ''}</td>
<td>${s.status}</td>
<td>${s.priority ?? ''}</td>
<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.context?.pageUrl ?? ''}</td>
</tr>`).join('')}
</tbody></table></body></html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.print();
    }
    setExporting(false);
  };

  return (
    <div className="max-w-lg">
      <SEO title="Export Snaps" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Export</h1>
      <p className="text-sm text-gray-500 mb-6">Download your snap submissions as CSV or PDF.</p>

      <div className="bg-white shadow rounded-lg p-6 space-y-5">
        {/* Date range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        {/* Status filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        {count !== null && (
          <p className="text-sm text-gray-600 font-medium">
            {count === 0 ? 'No records match your filters.' : `${count} record${count !== 1 ? 's' : ''} matched.`}
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            disabled={exporting}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          <button
            onClick={exportPDF}
            disabled={exporting}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            {exporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
