'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Sparkles, Plus, Pencil, Trash2, ListChecks, Check } from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { chooseQuoteForDisplay, QuoteRecord } from '@/lib/quotes';

const DEFAULT_QUOTES: QuoteRecord[] = [
  { id: 'default-1', userId: 'system', text: 'The day you plant the tree is not the day you eat the fruit. Be patient, keep watering it, and trust the process.', author: 'Growth Mindset', isPublic: true },
  { id: 'default-2', userId: 'system', text: 'Small steps every day create a life you can be proud of.', author: 'Daily Progress', isPublic: true },
  { id: 'default-3', userId: 'system', text: 'You do not need to be perfect. You only need to keep showing up.', author: 'RoutineOS', isPublic: true },
  { id: 'default-4', userId: 'system', text: 'Consistency compounds quietly, but it changes everything.', author: 'Momentum', isPublic: true },
];

const ROTATION_MS = 7 * 60 * 1000;

export default function QuoteDisplay() {
  const { data: session } = useSession();
  const [quotes, setQuotes] = useState<QuoteRecord[]>(DEFAULT_QUOTES);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [author, setAuthor] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const myQuotes = useMemo(
    () => quotes.filter((quote) => quote.userId === session?.user?.id),
    [quotes, session?.user?.id]
  );

  useEffect(() => {
    let isMounted = true;

    const loadQuotes = async () => {
      try {
        const response = await fetch('/api/quotes');
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Unable to load quotes');
        if (isMounted && Array.isArray(data?.quotes) && data.quotes.length > 0) {
          setQuotes(data.quotes);
        }
      } catch (error) {
        console.error('Quote load failed:', error);
      }
    };

    loadQuotes();

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!quotes.length) return;

    const timer = window.setInterval(() => {
      setQuoteIndex((previous) => previous + 1);
    }, ROTATION_MS);

    return () => window.clearInterval(timer);
  }, [quotes.length]);

  const currentQuote = useMemo(() => {
    return chooseQuoteForDisplay(quotes, session?.user?.id, quoteIndex) ?? DEFAULT_QUOTES[0];
  }, [quotes, session?.user?.id, quoteIndex]);

  const resetForm = () => {
    setDraft('');
    setAuthor('');
    setIsPublic(true);
    setEditingId(null);
    setError('');
  };

  const openManageModal = () => {
    resetForm();
    setIsManaging(true);
  };

  const addQuote = async () => {
    if (!draft.trim()) {
      setError('Please add a quote before saving.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/quotes', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          text: draft.trim(),
          author: author.trim() || 'Anonymous',
          isPublic,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Unable to save quote');

      const nextQuotes = Array.isArray(data?.quotes) ? data.quotes : [...quotes, data.quote];
      setQuotes(nextQuotes);
      setQuoteIndex(0);
      resetForm();
      setIsManaging(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save quote');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = (quote: QuoteRecord) => {
    setEditingId(quote.id);
    setDraft(quote.text);
    setAuthor(quote.author ?? '');
    setIsPublic(Boolean(quote.isPublic));
    setError('');
  };

  const deleteQuote = async (quoteId: string) => {
    const confirmed = window.confirm('Delete this quote from your saved list?');
    if (!confirmed) return;

    try {
      const response = await fetch('/api/quotes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: quoteId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Unable to delete quote');
      setQuotes(Array.isArray(data?.quotes) ? data.quotes : quotes.filter((quote) => quote.id !== quoteId));
      if (editingId === quoteId) {
        resetForm();
      }
    } catch (error) {
      console.error('Delete quote failed:', error);
      setError(error instanceof Error ? error.message : 'Unable to delete quote');
    }
  };

  return (
    <>
      <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-slate-900 p-5 shadow-xl shadow-emerald-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 p-2 text-emerald-300">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300">Daily reminder</p>
              <p className="text-sm text-slate-400">Fresh inspiration every few minutes</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1">Rotation: 7 min</span>
            <Button type="button" size="sm" variant="secondary" onClick={openManageModal} className="border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-[11px]">
              <ListChecks className="h-3.5 w-3.5" />
              Manage quotes
            </Button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
          <p className="text-lg font-medium italic leading-relaxed text-slate-100">
            “{currentQuote?.text || 'Focus on the process and keep showing up.'}”
          </p>
          <p className="mt-3 text-sm text-emerald-300">
            {currentQuote?.author || 'RoutineOS'}
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Add your own quote"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <input
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Author (optional)"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none md:max-w-[210px]"
            />
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
              />
              Share with all users
            </label>

            <Button type="button" size="sm" variant="primary" onClick={addQuote} loading={isSubmitting} className="w-full sm:w-auto">
              <Check className="h-4 w-4" />
              {editingId ? 'Update quote' : 'Save quote'}
            </Button>
          </div>

          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        </div>
      </div>

      <Modal open={isManaging} onClose={() => { setIsManaging(false); resetForm(); }} title="Manage your quotes" size="lg">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={editingId ? 'Edit this quote' : 'Add a new quote'}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                placeholder="Author"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none md:max-w-[190px]"
              />
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500"
                />
                Share with all users
              </label>

              <div className="flex gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={resetForm} className="text-slate-300">
                  Clear
                </Button>
                <Button type="button" size="sm" variant="primary" onClick={addQuote} loading={isSubmitting}>
                  {editingId ? 'Update' : 'Save'}
                </Button>
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Your quotes</h3>
              <span className="text-xs text-slate-500">{myQuotes.length} saved</span>
            </div>

            {myQuotes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/40 p-6 text-center text-sm text-slate-400">
                No personal quotes yet. Save one to build your quote collection.
              </div>
            ) : (
              myQuotes.map((quote) => (
                <div key={quote.id} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm italic text-slate-200">“{quote.text}”</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">{quote.author || 'Anonymous'}</span>
                        <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
                          {quote.isPublic ? 'Public' : 'Private'}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(quote)}
                        className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200 hover:border-emerald-500/40 hover:text-emerald-300"
                        aria-label="Edit quote"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteQuote(quote.id)}
                        className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-slate-200 hover:border-rose-500/40 hover:text-rose-300"
                        aria-label="Delete quote"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
