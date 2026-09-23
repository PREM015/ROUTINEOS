import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BarChart3,
  Flame,
  Gift,
  Layers,
  Lock,
  ScatterChart,
  Smartphone,
  Timer,
  Zap,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export const metadata: Metadata = {
  title: 'Why RoutineOS — Consistency beats intensity',
  description:
    'The thinking behind RoutineOS: honest daily scoring, rest you can plan without guilt, and one calm workspace for your whole day.',
};

const PROBLEMS = [
  {
    icon: Flame,
    title: 'Streaks that punish recovery',
    description:
      'Most trackers count perfect days and reset you to zero after one sick day. The result: a broken streak makes you quit instead of showing up tomorrow.',
  },
  {
    icon: ScatterChart,
    title: 'Your day scattered across apps',
    description:
      'Habits in one app, routine in a calendar, focus in a timer, journal in a notes doc. Nothing shares state, so you never see the whole picture.',
  },
  {
    icon: BarChart3,
    title: 'Feedback that lies to you',
    description:
      'A checkbox says a habit happened, but it says nothing about balance. Without honest feedback you cannot tell a good week from a lucky one.',
  },
];

const PRINCIPLES = [
  {
    icon: Layers,
    title: 'Weight what matters',
    description:
      'Habits live in Core, Growth, and Bonus tiers. Your daily score reflects that weight instead of treating every checkbox as equal.',
  },
  {
    icon: Award,
    title: 'Rest is part of the plan',
    description:
      'Mark a minimum day or a rest day and the scoring adjusts. A planned day off keeps your momentum honest instead of breaking it.',
  },
  {
    icon: Lock,
    title: 'Private by default',
    description:
      'Journal entries and quotes are yours alone. Nothing is shared unless you deliberately mark it public. No feed, no followers required.',
  },
  {
    icon: Smartphone,
    title: 'Calm on every screen',
    description:
      'Every view works down to a 360px phone with a bottom nav in one hand, light and dark themes, and no notification spam.',
  },
];

export default function WhyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-emerald-500 selection:text-white dark:selection:text-black">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="gradient-mesh-animated absolute inset-0" />
            <div className="noise-overlay absolute inset-0" />
            <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[100px]" />
          </div>
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Why RoutineOS
            </span>
            <h1 className="mb-6 text-4xl font-extrabold leading-[1.15] tracking-tight md:text-5xl">
              Consistency beats{' '}
              <span className="animated-gradient-text">intensity</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
              RoutineOS is built on one belief: a day you can repeat is worth more than one perfect
              day you cannot. So we built the tools to make repetition feel honest — scores that
              reflect balance, streaks that forgive, and a workspace that stays out of your way.
            </p>
          </div>
        </section>

        {/* The problem */}
        <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">What most apps get wrong</h2>
              <p className="text-sm text-muted-foreground md:text-base">
                Popular habit tools optimize for engagement. RoutineOS optimizes for a life you can
                actually sustain.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-3">
              {PROBLEMS.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="glass-panel p-6 transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:border-primary/40"
                >
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-500">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 text-lg font-bold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Principles */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">Four principles we refuse to drop</h2>
              <p className="text-sm text-muted-foreground md:text-base">
                Every feature either serves these principles or it doesn&apos;t ship.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {PRINCIPLES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="glass-panel p-6 transition-all duration-300 ease-out-expo hover:-translate-y-1 hover:border-primary/40"
                >
                  <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 text-base font-bold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The result */}
        <section className="border-t border-border bg-muted/30 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <div className="glass-panel glow-primary p-6 sm:p-10">
              <div className="mb-8 flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                  <Timer className="h-6 w-6 text-white" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">What a week looks like</h2>
                  <p className="text-sm text-muted-foreground">
                    RoutineOS is designed so the honest answer to &ldquo;how was your week?&rdquo;
                    is already on screen.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { icon: Gift, label: '30-second check-ins', text: 'Tick off blocks, add a note, move on.' },
                  { icon: BarChart3, label: 'One honest number', text: 'A hexagon score summarizes the whole day.' },
                  { icon: Award, label: 'Momentum over perfection', text: 'Recovery days keep streaks alive.' },
                ].map(({ icon: Icon, label, text }) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-5">
                    <Icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" />
                    <h3 className="text-sm font-bold">{label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-12 text-center">
              <h2 className="mb-4 text-3xl font-bold">Give consistency a chance</h2>
              <p className="mx-auto mb-8 max-w-2xl text-sm text-muted-foreground">
                Create a free account, add your first habit, and let tomorrow&apos;s hexagon do the
                talking.
              </p>
              <Link
                href="/register"
                className="light-sweep glow-neon inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-bold text-primary-foreground transition-transform duration-300 ease-out-expo hover:scale-[1.03] active:scale-[0.98]"
              >
                Start For Free
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer>
        <ThemeToggle />
      </Footer>
    </div>
  );
}