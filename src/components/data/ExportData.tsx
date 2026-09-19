'use client';

/**
 * ExportData — request and download a full data export.
 *
 * Submits a POST /api/export/request (JSON or CSV), polls
 * /api/export/status/[id] until the export completes, then surfaces a download
 * link backed by /api/export/download/[id] along with file size and expiry.
 * Handles loading, polling and failure states.
 */

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Download, FileDown, Loader2, XCircle } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { cn, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export type ExportFormat = 'JSON' | 'CSV';
export type ExportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface ExportRequestResult {
  exportId: string;
  fileUrl: string;
  fileSize: number;
  expiresAt: string;
}

interface ExportStatusRow {
  id: string;
  format: string;
  status: ExportStatus;
  fileUrl: string | null;
  fileSize: number | null;
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
}

const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 1500;

async function pollExport(exportId: string): Promise<ExportStatusRow> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const row = await apiRequest<ExportStatusRow>(`/api/export/status/${exportId}`);
    if (row.status === 'COMPLETED' || row.status === 'FAILED') return row;
    if (attempt < POLL_ATTEMPTS - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  return { status: 'FAILED', errorMessage: 'Export timed out after repeated polling.' } as ExportStatusRow;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ExportData() {
  const [format, setFormat] = useState<ExportFormat>('JSON');
  const [phase, setPhase] = useState<'idle' | 'requesting' | 'polling' | 'done' | 'failed'>('idle');
  const [result, setResult] = useState<ExportRequestResult | null>(null);
  const [status, setStatus] = useState<ExportStatusRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const handleExport = useCallback(async () => {
    cancelledRef.current = false;
    setError(null);
    setResult(null);
    setStatus(null);

    try {
      setPhase('requesting');
      const requested = await apiRequest<ExportRequestResult>('/api/export/request', {
        method: 'POST',
        body: { format },
      });
      if (cancelledRef.current) return;

      setPhase('polling');
      const row = await pollExport(requested.exportId);
      if (cancelledRef.current) return;

      setStatus(row);
      setResult(requested);
      setPhase(row.status === 'COMPLETED' ? 'done' : 'failed');
      if (row.status === 'FAILED') {
        setError(row.errorMessage ?? 'The export failed. Please try again.');
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setPhase('failed');
      setError(
        err instanceof ApiError ? err.message : 'Unable to request an export. Please try again.'
      );
    }
  }, [format]);

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center gap-2">
          <FileDown className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-bold text-gray-900">Export Data</h2>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Generate a portable copy of your data. Exports are stored for 7 days.
        </p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="export-format" className="mb-1 block text-sm font-medium text-gray-700">
              Format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
              disabled={phase === 'requesting' || phase === 'polling'}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="JSON">JSON</option>
              <option value="CSV">CSV</option>
            </select>
          </div>

          <Button
            onClick={handleExport}
            disabled={phase === 'requesting' || phase === 'polling'}
            isLoading={phase === 'requesting' || phase === 'polling'}
          >
            <Download className="mr-2 h-4 w-4" />
            {phase === 'requesting' ? 'Requesting…' : phase === 'polling' ? 'Processing…' : 'Export Data'}
          </Button>
        </div>

        {(phase === 'requesting' || phase === 'polling') && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            {phase === 'requesting'
              ? 'Sending export request…'
              : 'Compiling your data — this usually takes a few seconds…'}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {phase === 'done' && result && status && (
          <div
            className={cn(
              'mt-4 rounded-lg border border-green-200 bg-green-50/70 p-4',
            )}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <h3 className="text-sm font-semibold text-green-800">Export ready</h3>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-700">
              <span>
                Size:{' '}
                <span className="font-medium">
                  {formatBytes(status.fileSize ?? result.fileSize)}
                </span>
              </span>
              {status.expiresAt && (
                <span>
                  Expires:{' '}
                  <span className="font-medium">{formatDate(new Date(status.expiresAt))}</span>
                </span>
              )}
            </div>
            <a
              href={result.fileUrl}
              download
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" />
              Download export
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}

export default ExportData;