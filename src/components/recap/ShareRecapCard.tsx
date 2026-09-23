'use client';

import { useState } from 'react';
import { Check, Copy, Share2, Sparkles } from 'lucide-react';

export interface ShareStat {
  label: string;
  value: string;
}

interface ShareRecapCardProps {
  periodLabel: string;
  stats: ShareStat[];
}

function buildSummary(periodLabel: string, stats: ShareStat[]): string {
  const lines = stats.map((stat) => `${stat.label}: ${stat.value}`);
  return [`My RoutineOS ${periodLabel}`, ...lines, 'Made with daily-plan'].join('\n');
}

export default function ShareRecapCard({ periodLabel, stats }: ShareRecapCardProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(buildSummary(periodLabel, stats));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-2xl py-1">
      <div className="rounded-2xl bg-gradient-to-br from-primary/70 via-primary/30 to-transparent p-px">
        <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/10 blur-2xl"
            aria-hidden="true"
          />

          <p className="shimmer-active inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Share your recap
          </p>

          <h2 className="mt-4 text-2xl font-black text-foreground">{periodLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A quick, honest summary of your week. Share it with your circle.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-3">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl bg-card/70 p-3">
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                <dd className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          <button
            onClick={copy}
            className="light-sweep glow-neon mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform duration-300 ease-out-expo hover:scale-[1.02] active:scale-[0.97]"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" /> Copied to clipboard
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copy summary to share
              </>
            )}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <Share2 className="h-3 w-3" /> Paste it anywhere — messages, notes, social
          </p>
        </div>
      </div>
    </section>
  );
}