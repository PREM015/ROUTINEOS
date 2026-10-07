'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useFocusStore } from '@/store/focus.store';
import { apiRequest } from '@/lib/api-client';
import { toast } from 'sonner';
import { enqueue } from '@/lib/focus/outbox';

const MAX_DISTRACTIONS = 10;

export function DistractionCapture() {
  const status = useFocusStore((s) => s.status);
  const sessionId = useFocusStore((s) => s.sessionId);
  const distractions = useFocusStore((s) => s.distractions);
  const adopt = useFocusStore((s) => s.adopt);

  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = status === 'running' || status === 'paused';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen]);

  const handleSave = useCallback(async () => {
    const label = inputValue.trim();
    if (!label || !live) return;

    setIsSaving(true);
    setError(null);

    try {
      if (sessionId) {
        await apiRequest(`/api/focus/${sessionId}/events`, {
          method: 'POST',
          body: { type: 'DISTRACTION', label },
        });
      } else {
        await enqueue({
          sessionId: sessionId ?? 'pending',
          kind: 'distraction',
          label,
        }).catch(() => undefined);
      }

      const newDistraction = { label, timestamp: Date.now() };
      adopt({ distractions: [...distractions, newDistraction].slice(-MAX_DISTRACTIONS) });

      setInputValue('');
      setIsOpen(false);
      toast.success('Captured');
    } catch {
      setError('Failed to capture. Will retry when online.');
      const newDistraction = { label, timestamp: Date.now() };
      adopt({ distractions: [...distractions, newDistraction].slice(-MAX_DISTRACTIONS) });
      setInputValue('');
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }, [live, sessionId, distractions]);

  const handleRemove = useCallback(
    (index: number) => {
      const updated = distractions.filter((_, i) => i !== index);
      adopt({ distractions: updated });
    },
    [distractions]
  );

  if (!live) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="tap-target fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-accent-focus/10 px-3 py-2 text-xs font-medium text-accent-focus shadow-lg backdrop-blur-sm border border-accent-focus/20 transition-all duration-300 ease-out-expo hover:bg-accent-focus/20 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-focus sm:bottom-6 sm:right-6"
        aria-label="Capture distraction"
        aria-expanded={isOpen}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Capture thought</span>
      </button>

      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm sm:right-6 sm:bottom-6 animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out-expo">
          <div className="bg-card border border-border rounded-xl shadow-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">Capture distraction</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="tap-target p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {error && (
              <div className="mb-3 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSave();
                  }
                  if (e.key === 'Escape') setIsOpen(false);
                }}
                placeholder="What pulled you away?"
                maxLength={200}
                className="flex-1"
                autoFocus
              />
              <Button
                type="button"
                onClick={handleSave}
                disabled={!inputValue.trim() || isSaving}
                isLoading={isSaving}
                className="h-10 px-4"
                aria-label="Save distraction"
              >
                <Save className="h-4 w-4 mr-1" aria-hidden="true" />
                <span className="sr-only">Save</span>
              </Button>
            </div>

            {distractions.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Recent captures</p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {distractions
                    .slice()
                    .reverse()
                    .map((d, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50">
                        <span className="text-xs text-foreground truncate">{d.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemove(distractions.length - 1 - i)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Remove"
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default DistractionCapture;