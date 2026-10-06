'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, X } from 'lucide-react';
import { SETTINGS_ICONS } from '@/components/settings/settings-icons';
import {
  countFilteredDestinations,
  filterSettingsGroups,
  type SettingsDestination,
  type SettingsGroup,
} from '@/lib/settings/manifest';
import { cn } from '@/lib/utils';

/**
 * The search + filter island for `/settings`.
 *
 * ## Why this is a client component at all
 *
 * The directory is static data and `/settings` still renders it on the server —
 * this component is prerendered like any other client component, so all 22 links
 * are in the page HTML. Only the *filtering* genuinely needs a browser, so this
 * is the entire client surface: one input, one derived array, no fetch, no store,
 * no mutation. It receives the manifest through props, which keeps
 * `lib/settings/manifest.ts` importable from the `node` test environment.
 *
 * ## Accessibility
 *
 * The input is a real labelled `<input type="search">`, so the native clear
 * affordance and `Esc`-to-dismiss come from the platform. The result count sits
 * in a `role="status"` live region, which is what tells a screen-reader user
 * that filtering removed nine cards — without it, a sighted user gets immediate
 * feedback from the grid collapsing and a non-sighted user gets nothing. Group
 * headings survive filtering, and a group whose destinations all filtered out is
 * dropped rather than left as a bare heading.
 *
 * ## Motion
 *
 * Hover and focus feedback is `transition`-only (transform and colour), gated on
 * the `motion-reduce:` variant, which covers the OS preference. The in-app
 * `animationsEnabled` toggle needs no per-component handling: the settings store
 * projects it onto `<html>` as `.reduce-motion`, and `globals.css` already forces
 * `transition-duration: 0.001ms` on every descendant of that class. Reading it
 * again through `useAnimationsEnabled()` here would have meant importing
 * `useSettings` and framer-motion into a page that previously had neither.
 */

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    el?.isContentEditable === true
  );
}

function DestinationCard({ destination }: { destination: SettingsDestination }) {
  const Icon = SETTINGS_ICONS[destination.icon];
  const danger = destination.tone === 'danger';

  return (
    <Link
      href={destination.href}
      className={cn(
        'group flex items-start gap-4 rounded-xl p-5',
        'glass-panel',
        'transition-[transform,border-color] duration-200 ease-out-expo',
        'hover:-translate-y-0.5 hover:border-primary/40',
        /*
          The previous card had no focus style at all: a keyboard user tabbed
          through every destination link with nothing indicating where they were.
        */
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        danger && 'border-destructive/40 hover:border-destructive/60'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors motion-reduce:transition-none',
          danger
            ? 'bg-destructive/10 text-destructive'
            : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{destination.name}</span>
          {danger && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
              Destructive
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{destination.desc}</span>
      </span>

      <ChevronRight
        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform motion-reduce:transition-none group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}

function GroupSection({ group }: { group: SettingsGroup }) {
  const headingId = `settings-group-${group.id}`;

  return (
    <section aria-labelledby={headingId}>
      {/*
        `aria-labelledby` needs a single valid id. The previous version
        interpolated the group *title* into it, so "Account & Safety" produced
        `aria-labelledby="settings-group-Account & Safety"` — three whitespace-
        separated tokens, none matching the heading's id, so those sections had no
        accessible name at all. `group.id` is an explicit slug; the test suite pins
        it to `/^[a-z0-9-]+$/` and to uniqueness.
      */}
      <h2
        id={headingId}
        className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {group.title}
      </h2>
      <p className="mb-4 text-sm text-muted-foreground/80">{group.blurb}</p>

      <ul className="grid gap-4 md:grid-cols-2">
        {group.destinations.map((destination) => (
          <li key={destination.id}>
            <DestinationCard destination={destination} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SettingsDirectory({
  groups,
  totalCount,
}: {
  groups: readonly SettingsGroup[];
  /** Unfiltered destination count, for the "N of 22" summary line. */
  totalCount: number;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  const visible = useMemo(() => filterSettingsGroups(query, groups), [query, groups]);
  const visibleCount = countFilteredDestinations(visible);
  const filtering = query.trim().length > 0;

  /*
    `/` focuses the search box, matching the shortcut already used on the
    achievements filter bar. Guarded on the event target, or pressing `/` while
    typing anywhere on the page would steal the keystroke and focus the filter
    mid-word — the same bug that shortcut was fixed for there.
  */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function clear() {
    setQuery('');
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-8">
      <div className="max-w-md">
        {/*
          A visible label rather than only a placeholder. A placeholder
          disappears on focus, taking the field's visible name with it, and this
          control has no other label on the page.
        */}
        <label
          htmlFor="settings-search"
          className="mb-1.5 block text-sm font-medium text-foreground"
        >
          Search settings
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="settings-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search settings…"
            autoComplete="off"
            aria-describedby={statusId}
            className={cn(
              'w-full rounded-lg border border-border bg-card/70 py-2.5 pl-10 text-sm',
              'transition-[border-color,box-shadow] duration-200 ease-out-expo',
              'placeholder:text-muted-foreground/60',
              'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25',
              'motion-reduce:transition-none',
              // Room for the clear button, or for the `/` hint when idle.
              query.length > 0 ? 'pr-10' : 'pr-12'
            )}
          />
          {/*
            The shortcut is discoverable here rather than being an easter egg.
            `type="search"` also renders the platform's own clear affordance in
            WebKit, which is why this is a hint and not a button — rendering both
            would put two identical affordances in the same corner.
          */}
          {query.length === 0 && (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground sm:block"
            >
              /
            </kbd>
          )}
          {query.length > 0 && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear settings search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <p id={statusId} role="status" className="mt-2 text-xs text-muted-foreground">
          {filtering
            ? `${visibleCount} of ${totalCount} settings match`
            : `${totalCount} settings in ${groups.length} sections`}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">
            No settings match “{query.trim()}”
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a shorter word, or clear the search to see all {totalCount}.
          </p>
          <button
            type="button"
            onClick={clear}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3.5 py-2 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear search
          </button>
        </div>
      ) : (
        visible.map((group) => <GroupSection key={group.id} group={group} />)
      )}
    </div>
  );
}