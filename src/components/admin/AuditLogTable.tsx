"use client";

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';

export function AuditLogTable() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin/audit-log')
      .then(res => res.json())
      .then(data => setLogs(data.logs || []))
      .catch(console.error);
  }, []);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-gray-50">
          <tr>
            <th className="px-6 py-3">Date</th>
            <th className="px-6 py-3">User</th>
            <th className="px-6 py-3">Action</th>
            <th className="px-6 py-3">Resource</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.id} className="bg-white border-b">
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
