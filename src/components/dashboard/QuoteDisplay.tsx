'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Quote as QuoteIcon } from 'lucide-react';

interface Quote {
  id: string;
  text: string;
  author: string | null;
}

const ROTATE_MS = 10 * 60 * 1000;
const STORAGE_KEY = 'routineos-quote-state';
const SCOPE_KEY = 'routineos-quote-scope';

const FALLBACK_QUOTE: Quote = {
  id: 'default',
  text: 'The secret of getting ahead is getting started.',
  author: 'Mark Twain',
};

interface StoredState {
  quote: Quote;
  changedAt: number;
}

function readStored(): StoredState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!parsed.quote || typeof parsed.quote.text !== 'string' || typeof parsed.changedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(quote: Quote) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ quote, changedAt: Date.now() } satisfies StoredState)
    );
  } catch {
    // Storage unavailable — rotation still works in-memory.
  }
}

function readScope(): 'all' | 'mine' {
  try {
    return localStorage.getItem(SCOPE_KEY) === 'mine' ? 'mine' : 'all';
  } catch {
    return 'all';
  }
}

/** Lazily read the stored quote (client only; SSR gets null). */
function readInitialQuote(): Quote | null {
  if (typeof window === 'undefined') return null;
  const stored = readStored();
  return stored && Date.now() - stored.changedAt < ROTATE_MS ? stored.quote : null;
}

/**
 * Quote of the moment. Rotates every 10 minutes (persisted so reloads do
 * not reset the timer), never repeats twice in a row, and always renders a
 * fallback quote instead of breaking.
 */
export function QuoteDisplay() {
  const [quote, setQuote] = useState<Quote | null>(readInitialQuote);
  const [loading, setLoading] = useState(false);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quoteRef = useRef<Quote | null>(null);

  // Keep the ref in sync outside render so interval callbacks see the latest.
  useEffect(() => {
    quoteRef.current = quote;
  }, [quote]);

  const fetchQuote = useCallback(async (excludeId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (excludeId) params.set('exclude', excludeId);
      params.set('scope', readScope());
      const res = await fetch(`/api/quotes/random?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const next: Quote | undefined = res.ok ? data?.data : undefined;
      const picked = next && next.id !== excludeId ? next : (next ?? FALLBACK_QUOTE);
      // Fade transition between quotes.
      setFading(true);
      window.setTimeout(() => {
        setQuote(picked);
        writeStored(picked);
        setFading(false);
      }, 180);
    } catch {
      setQuote((prev) => prev ?? FALLBACK_QUOTE);
    } finally {
      setLoading(false);
    }
  }, []);

  const rotate = useCallback(() => {
    fetchQuote(quoteRef.current?.id).catch(() => undefined);
  }, [fetchQuote]);

  // Initial load + single 10-minute interval. A reload resumes the stored
  // quote and remaining time unless 10 minutes already passed.
  useEffect(() => {
    const stored = readStored();
    const remaining =
      stored && Date.now() - stored.changedAt < ROTATE_MS
        ? ROTATE_MS - (Date.now() - stored.changedAt)
        : 0;
    if (remaining <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initial quote fetch + rotation timer setup
      fetchQuote().catch(() => undefined);
      timerRef.current = setInterval(rotate, ROTATE_MS);
    } else {
      const timeout = window.setTimeout(() => {
        rotate();
        timerRef.current = setInterval(rotate, ROTATE_MS);
      }, remaining);
      // Cleanup only clears timers (no setState): subscription-style effect.
      return () => {
        window.clearTimeout(timeout);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [fetchQuote, rotate]);

  const handleRefresh = () => {
    if (loading) return;
    if (timerRef.current) clearInterval(timerRef.current);
    rotate();
    timerRef.current = setInterval(rotate, ROTATE_MS);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-8">
      <div className="flex items-start gap-4">
        <span className="text-3xl leading-none text-primary select-none" aria-hidden="true">
          <QuoteIcon className="h-6 w-6" />
        </span>
        <div className="flex-1 min-w-0">
          <div
            className={`transition-all duration-300 ease-out-expo motion-reduce:transition-none ${fading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'}`}
            aria-live="polite"
          >
            <p className="text-base italic text-foreground leading-relaxed">
              {quote ? quote.text : 'Loading inspiration...'}
            </p>
            {quote?.author && (
              <p className="mt-1 text-sm text-muted-foreground">— {quote.author}</p>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          aria-label="Show another quote"
          title="Show another quote"
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export default QuoteDisplay;
