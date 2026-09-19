'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search as SearchIcon } from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { Card, EmptyState, Input, Select, Spinner } from '@/components/ui';

type EntityType =
  | 'all'
  | 'habit'
  | 'goal'
  | 'project'
  | 'task'
  | 'journal'
  | 'reflection'
  | 'mood'
  | 'sleep'
  | 'routine'
  | 'tag'
  | 'category';

interface SearchResponse {
  query: string;
  type: string;
  results: Record<string, unknown[]>;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: EntityType; label: string }> = [
  { value: 'all', label: 'Everything' },
  { value: 'habit', label: 'Habits' },
  { value: 'goal', label: 'Goals' },
  { value: 'project', label: 'Projects' },
  { value: 'task', label: 'Tasks' },
  { value: 'journal', label: 'Journal' },
  { value: 'routine', label: 'Routine' },
  { value: 'reflection', label: 'Reflections' },
  { value: 'mood', label: 'Mood' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'tag', label: 'Tags' },
  { value: 'category', label: 'Categories' },
];

function itemLabel(item: unknown): string {
  if (typeof item !== 'object' || item === null) return String(item);
  const record = item as Record<string, unknown>;
  const candidate = record.name ?? record.title ?? record.goalTitle ?? record.subject;
  return typeof candidate === 'string' ? candidate : 'Untitled';
}

function itemSubtitle(item: unknown): string | null {
  if (typeof item !== 'object' || item === null) return null;
  const record = item as Record<string, unknown>;
  const candidate = record.description ?? record.status ?? record.contentPreview ?? record.date;
  return typeof candidate === 'string' ? candidate : null;
}

function itemHref(category: string, item: unknown): string | null {
  const record =
    typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {};
  const id = typeof record.id === 'string' ? record.id : null;
  switch (category) {
    case 'goal':
      return '/goals';
    case 'habit':
      return '/habits';
    case 'project':
      return id ? `/projects/${id}` : '/projects';
    case 'task':
      return id ? `/tasks/${id}` : '/tasks';
    case 'journal':
      return '/journal';
    case 'template':
      return '/templates';
    case 'routine':
      return '/routine';
    case 'sleep':
    case 'mood':
    case 'reflection':
      return '/wellness';
    default:
      return null;
  }
}

/**
 * Search Page
 * Global search across habits, goals, projects, tasks and journal entries.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<EntityType>('all');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await apiRequest<SearchResponse>(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=${type}&limit=20`,
        );
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, type]);

  const groups = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.results)
      .map(([category, items]) => ({ category, items: items ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [data]);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <SearchIcon className="h-7 w-7 text-blue-600" />
          Search
        </h1>
        <p className="mt-2 text-gray-600">Find anything across your routines and records.</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_200px]">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search habits, goals, tasks, journal…"
          autoFocus
        />
        <Select
          value={type}
          onChange={(event) => setType(event.target.value as EntityType)}
          options={[...TYPE_OPTIONS]}
        />
      </div>

      {error && (
        <p role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-6 w-6" />
        </div>
      ) : !data ? (
        <EmptyState
          icon={<SearchIcon className="h-10 w-10 text-gray-300" />}
          title="Start typing to search"
          description="Results update as you type."
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<SearchIcon className="h-10 w-10 text-gray-300" />}
          title="No results"
          description={`Nothing matched "${data.query}".`}
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.category} ({group.items.length})
              </h2>
              <Card className="divide-y divide-gray-100 p-0">
                {group.items.map((item, index) => {
                  const label = itemLabel(item);
                  const subtitle = itemSubtitle(item);
                  const href = itemHref(group.category, item);
                  const content = (
                    <div className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>}
                    </div>
                  );
                  return href ? (
                    <Link key={index} href={href} className="block hover:bg-gray-50">
                      {content}
                    </Link>
                  ) : (
                    <div key={index}>{content}</div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
