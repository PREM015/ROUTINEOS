'use client';

/**
 * Settings — Quotes
 *
 * CRUD over the user's quotes via GET/POST/PUT/DELETE /api/quotes.
 *
 * Bug fixed: after a create, edit or delete the page read
 * `json.data.quotes` and fell back to `[]`. The routes return
 * `{ success: true, data: <Quote> }` — a single quote, not a
 * `{ quotes: [...] }` wrapper — so every mutation silently emptied the list and
 * the user's new quote appeared to vanish. Mutations now re-fetch the list,
 * which is the only way to get the server's authoritative ordering and scope.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Quote as QuoteIcon, Trash2 } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';

interface Quote {
  id: string;
  userId: string;
  text: string;
  author: string | null;
  isPublic: boolean;
}

const SCOPE_KEY = 'routineos-quote-scope';

function apiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const details = err.details as
      | { fieldErrors?: Record<string, string[]> }
      | undefined;
    const first = details?.fieldErrors
      ? Object.entries(details.fieldErrors).find(([, v]) => v?.length)
      : undefined;
    if (first) return `${first[0]}: ${first[1][0]}`;
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

export default function QuotesSettingsPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<'all' | 'mine'>(() => {
    try {
      return localStorage.getItem(SCOPE_KEY) === 'mine' ? 'mine' : 'all';
    } catch {
      return 'all';
    }
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [text, setText] = useState('');
  const [author, setAuthor] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Quote | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<Quote[]>('/api/quotes');
      setQuotes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(apiError(err, 'Failed to load quotes'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial data fetch on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount data fetch
    load().catch(() => undefined);
  }, [load]);

  const setScopePref = (value: 'all' | 'mine') => {
    setScope(value);
    try {
      localStorage.setItem(SCOPE_KEY, value);
    } catch {
      // ignore
    }
  };

  const openCreate = () => {
    setEditing(null);
    setText('');
    setAuthor('');
    setIsPublic(false);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (q: Quote) => {
    setEditing(q);
    setText(q.text);
    setAuthor(q.author ?? '');
    setIsPublic(q.isPublic);
    setFormError(null);
    setFormOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!text.trim()) {
      setFormError('Quote text is required');
      return;
    }
    if (text.trim().length > 280) {
      setFormError('Quote must be 280 characters or less');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest('/api/quotes', {
        method: editing ? 'PUT' : 'POST',
        body: {
          ...(editing ? { id: editing.id } : {}),
          text: text.trim(),
          author: author.trim() || undefined,
          isPublic,
        },
      });
      setFormOpen(false);
      // The response is the single affected quote; re-read the list.
      await load();
    } catch (err) {
      setFormError(apiError(err, 'Failed to save quote'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    setBusyId(id);
    setError(null);
    try {
      await apiRequest('/api/quotes', {
        method: 'DELETE',
        body: { id },
      });
      await load();
    } catch (err) {
      setError(apiError(err, 'Failed to delete quote'));
    } finally {
      setBusyId(null);
    }
  };

  const ownQuotes = quotes.filter((q) => q.userId !== 'system' && !q.id.startsWith('default-'));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quotes</h1>
          <p className="text-muted-foreground mt-2">Add your own quotes and choose what the widget shows.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add quote
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="glass-panel shadow-soft rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground">Widget pool</h2>
        <p className="mt-1 text-sm text-muted-foreground">The dashboard quote rotates from this pool every 10 minutes.</p>
        <div className="mt-3 inline-flex gap-1 rounded-xl border border-border bg-muted/50 p-1" role="radiogroup" aria-label="Quote pool">
          {([
            { value: 'all', label: 'All quotes' },
            { value: 'mine', label: 'Only mine' },
          ] as const).map((o) => (
            <button
              key={o.value}
              role="radio"
              aria-checked={scope === o.value}
              onClick={() => setScopePref(o.value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                scope === o.value ? 'bg-card text-foreground shadow-soft' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel shadow-soft rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground">Your quotes</h2>
        {loading ? (
          <div className="mt-4 animate-pulse space-y-3" aria-busy="true" aria-label="Loading quotes">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg bg-muted" />
            ))}
          </div>
        ) : ownQuotes.length === 0 ? (
          <div className="mt-4 text-center py-8">
            <QuoteIcon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">You have not added any quotes yet.</p>
            <button
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add your first quote
            </button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {ownQuotes.map((q) => (
              <li key={q.id} className="glass-panel rounded-xl p-4">
                <p className="text-sm text-foreground leading-relaxed">&ldquo;{q.text}&rdquo;</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {q.author && <span>— {q.author}</span>}
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${q.isPublic ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                      {q.isPublic ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(q)}
                      disabled={busyId === q.id}
                      aria-label={`Edit quote: ${q.text.slice(0, 40)}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => setDeleting(q)}
                      disabled={busyId === q.id}
                      aria-label={`Delete quote: ${q.text.slice(0, 40)}`}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && setFormOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit quote' : 'Add quote'}
            className="w-full max-w-md glass-panel shadow-soft rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-foreground">{editing ? 'Edit quote' : 'Add quote'}</h2>
            <form onSubmit={save} className="mt-4 space-y-4">
              <div>
                <label htmlFor="quote-text" className="mb-1 block text-sm font-medium text-foreground">
                  Quote (max 280 characters)
                </label>
                <textarea
                  id="quote-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                  maxLength={280}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-border bg-muted/50 p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="What inspires you?"
                />
                <p className="mt-1 text-right text-xs text-muted-foreground">{text.length}/280</p>
              </div>
              <div>
                <label htmlFor="quote-author" className="mb-1 block text-sm font-medium text-foreground">
                  Author (optional)
                </label>
                <input
                  id="quote-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border border-border bg-muted/50 p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Anonymous"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-600"
                />
                <span className="text-sm text-foreground">
                  Make public
                  <span className="block text-xs font-normal text-muted-foreground">
                    Public quotes can appear for other users. Private quotes are only yours.
                  </span>
                </span>
              </label>
              {formError && (
                <p role="alert" className="text-sm text-destructive dark:text-destructive">{formError}</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !text.trim()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editing ? 'Save changes' : 'Add quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDeleting(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Delete quote"
            className="w-full max-w-sm glass-panel shadow-soft rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-foreground">Delete quote?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              &ldquo;{deleting.text}&rdquo; will be removed permanently.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleting(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
