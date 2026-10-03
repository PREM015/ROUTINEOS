'use client';

/**
 * Quick Actions — the four most frequent daily actions, surfaced so the common
 * case does not require navigating away.
 *
 * Desktop: a 2x2 of large tiles in the right column.
 * Mobile: the same four collapse behind a floating action button, because a 2x2
 * block of tiles above the fold would push the actual content off a phone
 * screen.
 *
 * Every action is a link to the page that already owns the flow. Nothing here
 * starts a session or writes anything — the risk of a "quick" action that
 * half-completes a flow is higher than the benefit of saving a navigation.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CheckSquare, Moon, Plus, Timer, X } from 'lucide-react';
import { DOMAIN_ACCENT, accentTint, type Domain } from '@/components/dashboard-ui/accent';
import { cn } from '@/lib/utils';

const ACTIONS: { label: string; href: string; domain: Domain; icon: typeof CheckSquare }[] = [
  { label: 'Log a habit', href: '/today', domain: 'habits', icon: CheckSquare },
  { label: 'Start focus', href: '/focus', domain: 'focus', icon: Timer },
  // These two were both plain `/today`, which lands the user at the top of the
  // page with no indication of which card they wanted. The anchors already exist
  // in the `/today` DOM (`id="today-sleep"`, `id="today-reflection"`, on the
  // wrappers in `today/page.tsx`) and were confirmed dead in both audits - the
  // palette references the same ids. Linking to them scrolls to the actual card.
  { label: 'Start sleep', href: '/today#today-sleep', domain: 'sleep', icon: Moon },
  { label: 'Add reflection', href: '/today#today-reflection', domain: 'insights', icon: Plus },
];

function Tile({ action }: { action: (typeof ACTIONS)[number] }) {
  const { label, href, domain, icon: Icon } = action;
  const hue = DOMAIN_ACCENT[domain].hue;
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col items-start gap-2 rounded-[14px] border border-border/70 bg-card/60 p-4',
        'transition-[box-shadow,transform,border-color] duration-300 ease-out-expo',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        'active:translate-y-0 active:scale-[0.995]',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0'
      )}
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-[10px]"
        style={{ background: accentTint(hue, 12), color: hue }}
      >
        <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </Link>
  );
}

export function QuickActions() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/*
        Right-column panel, desktop and tablet. Hidden below `sm` because the FAB
        takes over there — rendering both would put the same four actions on
        screen twice.

        `.glass-panel` + `.glass-panel-lift` rather than a hand-rolled
        `bg-card/70` + `border`, so the surface is the same A3 material as every
        other card on the page instead of the older flat one.
      */}
      <section
        aria-label="Quick actions"
        className="glass-panel glass-panel-lift hidden rounded-[20px] p-5 sm:block"
      >
        <h2 className="mb-3 text-sm font-semibold text-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {ACTIONS.map((a) => (
            <Tile key={a.label} action={a} />
          ))}
        </div>
      </section>

      {/*
        Mobile FAB. `sm:hidden` so the two never coexist, and the fixed
        positioning is below the existing `MobileNav` so it does not sit on top
        of the bottom bar.
      */}
      <div className="sm:hidden">
        {open && (
          <>
            <button
              type="button"
              aria-label="Close quick actions"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
            />
            <div className="fixed inset-x-4 bottom-24 z-50 grid grid-cols-2 gap-3">
              {ACTIONS.map((a) => (
                <Tile key={a.label} action={a} />
              ))}
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? 'Close quick actions' : 'Open quick actions'}
          className={cn(
            'fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-floating',
            'transition-transform duration-300 ease-out-expo active:scale-95',
            'motion-reduce:transition-none'
          )}
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Plus className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </>
  );
}
