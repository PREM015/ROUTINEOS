"use client";

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  lastActive: string;
  _count: { habits: number };
}

export function UserTable() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/users')
      .then(res => res.json())
      .then(data => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div>Loading users...</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs uppercase bg-gray-50">
          <tr>
            <th className="px-6 py-3">User</th>
            <th className="px-6 py-3">Role</th>
            <th className="px-6 py-3">Joined</th>
            <th className="px-6 py-3">Habits</th>
            <th className="px-6 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="bg-white border-b">
              <td className="px-6 py-4 font-medium">
                {user.name} <br/><span className="text-gray-500">{user.email}</span>
              </td>
              <td className="px-6 py-4"><Badge>{user.role}</Badge></td>
              <td className="px-6 py-4">{format(new Date(user.createdAt), 'MMM d, yyyy')}</td>
              <td className="px-6 py-4">{user._count?.habits || 0}</td>
              <td className="px-6 py-4 space-x-2">
                <Button size="sm" variant="outline">View</Button>
                <Button size="sm" variant="danger">Suspend</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
