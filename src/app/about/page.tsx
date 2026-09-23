import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  Heart,
  Lock,
  Moon,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export const metadata: Metadata = {
  title: 'About — RoutineOS',
  description:
    'RoutineOS is a calm workspace for habits, routines, goals, focus, and reflection — built on honest progress, privacy, and planned rest.',
};

const VALUES = [
  {
    icon: Award,
    title: 'Honest progress',
    description:
      'We score what actually happened, not a highlight reel. A green checkbox means done, and the hexagon shows whether the whole day held together.',
  },
  {
    icon: Lock,
    title: 'Private by default',
    description:
      'Your journal and reflections are yours. Sharing is opt-in and everything else stays exactly where it belongs — on your account.',
  },
  {
    icon: Heart,
    title: 'Rest is data',
    description:
      'A planned day off tells you something useful about your rhythm. It never erases your streak or your momentum.',
  },
  {
    icon: Moon,
    title: 'Calm design',
    description:
      'No feed, no noise, no notification spam. A quiet workspace you can open at 6am and still be glad you did at 10pm.',
  },
];

const SNAPSHOT = [
  { icon: Smartphone, label: 'Mobile-first', text: 'Bottom nav, one-handed use, down to 360px.' },
  { icon: Moon, label: 'Light & dark themes', text: 'Full theme support that follows your system.' },
  { icon: WifiOff, label: 'Offline-friendly', text: 'Keep checking things off when the signal drops.' },
  { icon: Lock, label: 'Private journal', text: 'Reflections, mood, and energy stay yours alone.' },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-emerald-500 selection:text-white dark:selection:text-black">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[100px]" />
          </div>
          <div className="relative mx-auto max-w-3xl text-center">
            <span className="mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              About RoutineOS
            </span>
            <h1 className="mb-6 text-4xl font-extrabold leading-[1.15] tracking-tight md:text-5xl">
              A better system beats{' '}
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 bg-clip-text text-transparent dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-400">
                more willpower
              </span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-muted-foreground">
              RoutineOS is a workspace for habits, routines, goals, focus, and reflection — built to
              make consistent days feel natural rather than heroic.
            </p>
          </div>
        </section>

        {/* Story */}
        <section className="border-y border-border bg-muted/30 px-4 py-16 sm:px-6">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-bold">Where it started</h2>
              <div className="space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                <p>
                  RoutineOS grew out of a frustration with apps that punish you for being human.
                  Most tools count perfect days, break your streak after one sick day, and scatter
                  your life across five disconnected screens.
                </p>
                <p>
                  We set out to build the opposite: a single, calm place where your habits, routine,
                  goals, focus time, and reflections all share one state. Check something off and the
                  score, streaks, and widgets update everywhere.
                </p>
                <p>
                  The result is a hexagon score that shows your whole day at a glance, tiers that
                  weight what matters, and rest days that keep your momentum honest.
                </p>
              </div>
            </div>
            <blockquote className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
              <p className="text-lg font-semibold leading-relaxed text-foreground md:text-xl">
                “A day you can repeat is worth more than one perfect day you can&apos;t.”
              </p>
              <footer className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                — The idea RoutineOS is built around
              </footer>
            </blockquote>
          </div>
        </section>

        {/* Values */}
        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">What we stand for</h2>
              <p className="text-sm text-muted-foreground md:text-base">
                Four values shape every screen and every default in the app.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
              {VALUES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
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

        {/* Product snapshot */}
        <section className="border-t border-border bg-muted/30 px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">Built for the way you live</h2>
              <p className="text-sm text-muted-foreground md:text-base">
                Things you can rely on from the first day.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SNAPSHOT.map(({ icon: Icon, label, text }) => (
                <div
                  key={label}
                  className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 py-16 text-center sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-4 text-3xl font-bold">Ready to start tomorrow right?</h2>
            <p className="mx-auto mb-8 max-w-md text-sm text-muted-foreground">
              Create a free account and see your first hexagon after one honest day.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Start For Free
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <Footer>
        <ThemeToggle />
      </Footer>
    </div>
  );
}