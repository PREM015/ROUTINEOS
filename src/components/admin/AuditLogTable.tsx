"use client";

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';

export function AuditLogTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server log shape varies; used loosely in the admin table
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const res = await fetch('/api/admin/audit-log');
        if (!res.ok) {
          throw new Error(`Could not load the audit log (status ${res.status})`);
        }
        const data = await res.json();
        if (cancelled) return;
        if (!data.success) {
          throw new Error(data.error || 'Could not load the audit log');
        }
        // The route returns the `{ success, data }` envelope. This read
        // `data.logs`, which is always undefined, so the table silently
        // rendered empty on every load regardless of what the API returned.
        setLogs(Array.isArray(data.data) ? data.data : []);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load the audit log'
        );
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div>
        <p role="alert" className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-muted/50">
          <tr>
            <th className="px-6 py-3">Date</th>
            <th className="px-6 py-3">User</th>
            <th className="px-6 py-3">Action</th>
            <th className="px-6 py-3">Resource</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} className="bg-card border-b border-border/60">
              <td className="px-6 py-4">{format(new Date(log.createdAt), 'PPpp')}</td>
              <td className="px-6 py-4">{log.user?.email || log.userId}</td>
              <td className="px-6 py-4"><Badge>{log.action}</Badge></td>
              <td className="px-6 py-4">{log.resourceType} {log.resourceId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
