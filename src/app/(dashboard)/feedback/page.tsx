'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Badge, Button, Card, EmptyState, Input, Select, Spinner, Textarea } from '@/components/ui';

type FeedbackType =
  | 'BUG'
  | 'FEATURE_REQUEST'
  | 'IMPROVEMENT'
  | 'QUESTION'
  | 'GENERAL'
  | 'COMPLAINT';

interface FeedbackItem {
  id: string;
  type: FeedbackType;
  subject: string;
  message: string;
  email: string | null;
  status: string;
  createdAt: string;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: FeedbackType; label: string }> = [
  { value: 'BUG', label: 'Bug report' },
  { value: 'FEATURE_REQUEST', label: 'Feature request' },
  { value: 'IMPROVEMENT', label: 'Improvement' },
  { value: 'QUESTION', label: 'Question' },
  { value: 'GENERAL', label: 'General' },
  { value: 'COMPLAINT', label: 'Complaint' },
];

const STATUS_VARIANT: Record<string, 'default' | 'primary' | 'success' | 'danger' | 'warning'> = {
  NEW: 'primary',
  IN_REVIEW: 'warning',
  PLANNED: 'warning',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'default',
  DUPLICATE: 'default',
  WONT_FIX: 'default',
};

/**
 * Feedback Page
 * Submit product feedback and track the status of past submissions.
 */
export default function FeedbackPage() {
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [type, setType] = useState<FeedbackType>('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiRequest<FeedbackItem[]>('/api/feedback?limit=50');
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    void load();
  }, [load]);

  const submit = async () => {
    if (subject.trim().length === 0 || message.trim().length === 0 || submitting) {
      setError('Subject and message are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await apiRequest('/api/feedback', {
        method: 'POST',
        body: {
          type,
          subject: subject.trim(),
          message: message.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
        },
      });
      setSubject('');
      setMessage('');
      setEmail('');
      setType('GENERAL');
      setSuccess(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <MessageSquare className="h-7 w-7 text-primary" />
          Feedback
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tell us what is working, what is not, and what you would like to see next.
        </p>
      </div>

      <Card className="mb-8 p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">Send feedback</h2>
        <div className="space-y-4">
          <Select
            label="Type"
            value={type}
            onChange={(event) => setType(event.target.value as FeedbackType)}
            options={[...TYPE_OPTIONS]}
          />
          <Input
            label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
          />
          <Textarea
            label="Message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={5}
            maxLength={5000}
          />
          <Input
            label="Contact email (optional)"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400" aria-live="polite">
              Thanks! Your feedback has been submitted.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void submit()} isLoading={submitting}>
              <Send className="mr-1.5 h-4 w-4" />
              Submit
            </Button>
          </div>
        </div>
      </Card>

      <h2 className="mb-4 text-lg font-semibold text-foreground">Your submissions</h2>
      {!items ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="h-10 w-10 text-muted-foreground/60" />}
          title="No feedback yet"
          description="Your submitted feedback and its status will appear here."
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{item.subject}</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="default">{item.type.replace(/_/g, ' ')}</Badge>
                  <Badge variant={STATUS_VARIANT[item.status] ?? 'default'}>
                    {item.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.message}</p>
              <p className="mt-2 text-xs text-muted-foreground/60">{formatDate(new Date(item.createdAt))}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
