'use client';

/**
 * DeleteAccount — destructive account deletion flow.
 *
 * Requires the user to (1) tick an acknowledgement checkbox, (2) type the
 * literal text "DELETE" and optionally provide a reason before the danger
 * button activates. On submit it calls DELETE /api/auth/delete-account with
 * `{ confirm: true }` and redirects to /login on success.
 */

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';

const CONFIRM_TEXT = 'DELETE';

export function DeleteAccount() {
  const [agreed, setAgreed] = useState(false);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = agreed && typed === CONFIRM_TEXT && !loading;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/api/auth/delete-account', {
        method: 'DELETE',
        body: { confirm: true, reason: reason.trim() || undefined },
      });
      window.location.href = '/login';
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to delete account. Please try again.'
      );
      setLoading(false);
    }
  };

  return (
    <Card className="border-red-200">
      <div className="p-6">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-bold text-gray-900">Delete Account</h2>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Permanently delete your account and all associated data — habits,
          goals, focus sessions, journal entries and settings. This action
          cannot be undone.
        </p>

        <div className="mt-5 space-y-4">
          <Checkbox
            checked={agreed}
            onCheckedChange={setAgreed}
            label="I understand my account and all of my data will be permanently deleted."
          />

          <Input
            label={`Type ${CONFIRM_TEXT} to confirm`}
            placeholder={CONFIRM_TEXT}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            icon={<AlertTriangle className="h-4 w-4" />}
            aria-invalid={typed.length > 0 && typed !== CONFIRM_TEXT}
          />

          <Textarea
            label="Reason for leaving (optional)"
            placeholder="Help us improve…"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
          />

          {error && (
            <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="danger" onClick={handleDelete} disabled={!canSubmit} isLoading={loading}>
              <Trash2 className="mr-2 h-4 w-4" />
              {loading ? 'Deleting…' : 'Delete my account'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DeleteAccount;