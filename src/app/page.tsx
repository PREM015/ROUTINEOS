'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
  Calendar,
  Target,
  Flame,
  BarChart3,
  ArrowRight,
  Shield,
  Zap,
  Clock,
  Award,
  CheckCircle2,
  Menu,
  X,
  Timer,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

const FEATURES = [
  {
    icon: Target,
    title: 'Tiered Habit Tracking',
    description: 'Organize habits into Growth, Bonus, and Lifestyle tiers so your daily score reflects what matters most.',
  },
  {
    icon: Calendar,
    title: 'Routine Time-Blocking',
    description: 'Structure your day with time blocks, weekday and weekend templates, and overlap warnings.',
  },
  {
    icon: FlagIcon,
    title: 'Daily & Long-Term Goals',
    description: 'Check off daily goals every day and track long-term targets with progress sliders and deadlines.',
  },
  {
    icon: Flame,
    title: 'Streaks & Milestones',
    description: 'Stay motivated with per-habit streaks, rest-day rules, and milestone celebrations.',
  },
  {
    icon: BarChart3,
    title: 'Performance Scoring',
    description: 'A hexagon radar breaks your day into Core, Growth, Bonus, Habits, Routine, and Sleep — one glance, full clarity.',
  },
  {
    icon: Timer,
    title: 'Focus Timer & Journal',
    description: 'Timestamp-accurate focus sessions with breaks and laps, plus a safe journal with version history.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Add your habits',
    description: 'Create habits with tiers, frequencies, and reminders. It takes less than a minute per habit.',
  },
  {
    n: '2',
    title: 'Block your day',
    description: 'Lay out routine blocks for weekdays, weekends, and low-energy days. Check them off as you go.',
  },
  {
    n: '3',
    title: 'Reflect and improve',
    description: 'End the day with a guided reflection, watch your hexagon fill out, and keep the streak alive.',
  },
];

const FAQS = [
  {
    q: 'Is RoutineOS free?',
    a: 'Yes. You can track habits, routines, goals, focus sessions, and journal entries with a free account. There are no fake premium gates on the core workflow.',
  },
  {
    q: 'How is the daily score calculated?',
    a: 'Six parameters — Core, Growth, Bonus, Habits, Routine, and Sleep — each scored 0–100 and shown as a hexagon radar. The number in the centre is your overall score for the day.',
  },
  {
    q: 'What happens on rest days?',
    a: 'You can mark a minimum day or rest day. Scoring adjusts so a planned day off does not punish your momentum or break honest streaks.',
  },
  {
    q: 'Can I use it on my phone?',
    a: 'Yes. Every page is responsive down to 360px wide, with a bottom navigation bar on mobile and full light/dark theme support.',
  },
  {
    q: 'Is my journal private?',
    a: 'Yes. Journal entries and private quotes are visible only to you. Quotes you explicitly mark public can appear for others; nothing else is shared.',
  },
];

function FlagIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

/** Static mini hexagon preview (pure geometry — deterministic, SSR-safe). */
function MiniHexagon() {
  const cx = 60;
  const cy = 60;
  const r = 44;
  const values = [82, 64, 48, 90, 70, 55];
  const pt = (i: number, frac: number) => {
    const angle = (2 * Math.PI * i) / 6 - Math.PI / 2;
    return `${(cx + r * frac * Math.cos(angle)).toFixed(1)},${(cy + r * frac * Math.sin(angle)).toFixed(1)}`;
  };
  const grid = [0.2, 0.4, 0.6, 0.8, 1].map((f) =>
    values.map((_, i) => pt(i, f)).join(' ')
  );
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label="Sample hexagon score preview">
      {grid.map((points, i) => (
        <polygon key={i} points={points} fill="none" strokeWidth={i === 4 ? 1.5 : 1} className="stroke-border" />
      ))}
      <polygon
        points={values.map((v, i) => pt(i, v / 100)).join(' ')}
        className="fill-primary/25 stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {values.map((v, i) => {
        const [x, y] = pt(i, v / 100).split(',') as [string, string];
        return <circle key={i} cx={x} cy={y} r={3} className="fill-primary" />;
      })}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={20} fontWeight={800} className="fill-foreground">
        78
      </text>
    </svg>
  );
}

function ProductPreview() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto mt-14 w-full max-w-3xl rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-emerald-500/5 sm:p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col items-center rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Today Progress</p>
          <MiniHexagon />
        </div>
        <div className="flex flex-col justify-center rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Streak</p>
          <p className="flex items-center gap-2 text-2xl font-extrabold text-foreground">
            <Flame className="h-6 w-6 text-orange-500" /> 12 <span className="text-sm font-medium text-muted-foreground">days</span>
          </p>
          <div className="mt-3 space-y-2">
            {['Morning run', 'Read 20 min', 'Meditate'].map((h, i) => (
              <div key={h} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className={`h-3.5 w-3.5 ${i < 2 ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                <span className={i < 2 ? 'text-foreground' : ''}>{h}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col justify-center rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Routine</p>
          <div className="space-y-2">
            {[
              { t: '06:00 – 07:00', n: 'Workout', done: true },
              { t: '09:00 – 12:00', n: 'Deep work', done: true },
              { t: '18:00 – 18:30', n: 'Evening walk', done: false },
            ].map((b) => (
              <div key={b.n} className="rounded-lg border border-border bg-card p-2">
                <p className="text-[10px] tabular-nums text-muted-foreground">{b.t}</p>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <CheckCircle2 className={`h-3 w-3 ${b.done ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                  {b.n}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { data: session, status } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Lazy init (never in an effect): SSR-safe constant unless the client is
  // in a different calendar year, which only matters at New Year midnight.
  const [year] = useState(() =>
    typeof window === 'undefined' ? 2026 : new Date().getFullYear()
  );
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const loggedIn = status === 'authenticated' && session?.user;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-emerald-500 selection:text-white dark:selection:text-black">
      {/* Landing navbar */}
      <header
        className={`sticky top-0 z-50 backdrop-blur-md transition-all ${
          scrolled ? 'border-b border-border bg-background/80 shadow-sm' : 'border-b border-transparent bg-background/60'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label="RoutineOS home">
            <Logo size="md" />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground" aria-label="Landing">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />
            {loggedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>

          <div className="flex md:hidden items-center gap-1">
            <ThemeToggle />
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="p-2 text-muted-foreground hover:text-foreground"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="md:hidden border-t border-border bg-background px-4 py-4" aria-label="Mobile">
            <div className="flex flex-col gap-1">
              {[
                { href: '#features', label: 'Features' },
                { href: '#how', label: 'How it works' },
                { href: '#faq', label: 'FAQ' },
              ].map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-2 flex gap-2 border-t border-border pt-4">
                {loggedIn ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold text-sm"
                  >
                    Go to Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setMenuOpen(false)}
                      className="flex-1 inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-muted-foreground"
                    >
                      Login
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMenuOpen(false)}
                      className="flex-1 inline-flex items-center justify-center bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-semibold text-sm"
                    >
                      Get Started
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[100px]" />
        </div>
        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-8">
            <Zap className="w-3.5 h-3.5" />
            <span>Habits · Routine · Goals · Focus · Journal</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.15] mb-6">
            Build consistent days with{' '}
            <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-400 bg-clip-text text-transparent">
              data-driven clarity
            </span>
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            RoutineOS unifies habit tracking, time-blocked routines, daily goals, focus sessions, and journaling into one calm workspace — with a hexagon score that shows your whole day at a glance.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {loggedIn ? (
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold text-base hover:opacity-90 transition-opacity"
              >
                Go to Dashboard
                <ArrowRight className="w-5 h-5" />
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold text-base hover:opacity-90 transition-opacity"
                >
                  Start For Free
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-card border border-border text-foreground px-8 py-3.5 rounded-xl font-semibold text-base hover:bg-muted transition-colors"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>

          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-muted-foreground text-xs font-medium max-w-3xl mx-auto">
            {[
              { icon: CheckCircle2, label: 'Rest days respected' },
              { icon: Shield, label: 'Private by default' },
              { icon: Clock, label: '30-second check-ins' },
              { icon: Award, label: 'Hexagon daily score' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center justify-center gap-2">
                <Icon className="w-4 h-4 text-primary" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <ProductPreview />
        </div>
      </section>

      {/* Feature bento grid */}
      <section id="features" className="py-16 sm:py-20 px-4 sm:px-6 border-y border-border bg-muted/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-4">Everything for a consistent day</h2>
            <p className="text-muted-foreground text-sm md:text-base">
              Six tools that share one state: check something off anywhere and your score, streaks, and widgets update everywhere.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-card border border-border rounded-2xl p-6 hover:border-primary/40 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mb-5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-primary text-xs font-bold uppercase tracking-wider">How it works</span>
          <h2 className="text-3xl font-bold mt-2 mb-4">Three steps to a better day</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-card border border-border rounded-2xl p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-extrabold">
                {s.n}
              </span>
              <h3 className="mt-4 text-base font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <BookOpen className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-bold">Hexagon score</h3>
            <p className="mt-1 text-sm text-muted-foreground">Six axes — Core, Growth, Bonus, Habits, Routine, Sleep — one honest number in the middle.</p>
          </div>
          <div>
            <Flame className="h-5 w-5 text-orange-500 mb-2" />
            <h3 className="font-bold">Streaks that forgive</h3>
            <p className="mt-1 text-sm text-muted-foreground">Planned rest no longer breaks streaks. Momentum survives real life.</p>
          </div>
          <div>
            <Award className="h-5 w-5 text-primary mb-2" />
            <h3 className="font-bold">Achievements</h3>
            <p className="mt-1 text-sm text-muted-foreground">Milestones unlock as streaks grow and goals complete.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-10">Questions, answered</h2>
          <div className="space-y-3">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={f.q} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold hover:bg-muted/50 transition-colors"
                  >
                    {f.q}
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 px-4 sm:px-6 text-center border-t border-border bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Ready for more consistent days?</h2>
          <p className="text-muted-foreground text-sm mb-8">Create an account, add your first habit, and see tonight&apos;s hexagon.</p>
          {loggedIn ? (
            <Link
              href="/today"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold text-base hover:opacity-90 transition-opacity"
            >
              Open Today
              <ArrowRight className="w-5 h-5" />
            </Link>
          ) : (
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold text-base hover:opacity-90 transition-opacity"
            >
              Create Your Account
              <ArrowRight className="w-5 h-5" />
            </Link>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-border py-10 px-4 sm:px-6 text-sm">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo size="sm" />
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              A calm workspace for habits, routines, goals, focus, and reflection.
            </p>
            <div className="mt-4">
              <ThemeToggle />
            </div>
          </div>
          <nav aria-label="Product">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Product</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
              <li><a href="#how" className="hover:text-foreground transition-colors">How it works</a></li>
              <li><a href="#faq" className="hover:text-foreground transition-colors">FAQ</a></li>
            </ul>
          </nav>
          <nav aria-label="Resources">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Resources</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/analytics" className="hover:text-foreground transition-colors">Analytics</Link></li>
              <li><Link href="/achievements" className="hover:text-foreground transition-colors">Achievements</Link></li>
              <li><Link href="/recap" className="hover:text-foreground transition-colors">Recaps</Link></li>
            </ul>
          </nav>
          <nav aria-label="Account">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Account</h3>
            <ul className="space-y-2 text-muted-foreground">
              {loggedIn ? (
                <>
                  <li><Link href="/dashboard" className="hover:text-foreground transition-colors">Dashboard</Link></li>
                  <li><Link href="/settings" className="hover:text-foreground transition-colors">Settings</Link></li>
                </>
              ) : (
                <>
                  <li><Link href="/login" className="hover:text-foreground transition-colors">Login</Link></li>
                  <li><Link href="/register" className="hover:text-foreground transition-colors">Register</Link></li>
                </>
              )}
            </ul>
          </nav>
        </div>
        <div className="max-w-7xl mx-auto mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {year} RoutineOS. All rights reserved.</span>
          <span>Built for consistent days.</span>
        </div>
      </footer>
    </div>
  );
}
