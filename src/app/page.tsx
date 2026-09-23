'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
  Timer,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useMagneticHover } from '@/hooks/useMagneticHover';
import { useTilt3D } from '@/hooks/useTilt3D';
import { useSpotlight } from '@/hooks/useSpotlight';
import { useParallax } from '@/hooks/useParallax';
import { EASE, fadeSlideUp, stagger } from '@/lib/motion';

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
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, ease: EASE }}
      aria-hidden="true"
      className="glass-panel mx-auto mt-14 w-full max-w-3xl rounded-2xl p-4 shadow-long sm:p-6"
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
    </motion.div>
  );
}

/** Feature card — glass panel + cursor spotlight + 3D tilt + scroll reveal. */
function FeatureCard({ icon: Icon, title, description }: (typeof FEATURES)[number]) {
  const cardRef = useRef<HTMLDivElement>(null);
  useTilt3D(cardRef, 6);
  useSpotlight(cardRef, 280);

  return (
    <motion.div variants={fadeSlideUp}>
      <div
        ref={cardRef}
        className="glass-panel spotlight-hover tilt-3d rounded-2xl p-6 h-full transition-transform duration-200"
      >
        <div className="glow-primary w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 text-primary flex items-center justify-center mb-5">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

/** Primary CTA — magnetic hover wrapper + neon glow + light sweep. */
function MagneticCta({ href, children }: { href: string; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  useMagneticHover(wrapRef, 0.18);
  return (
    <span ref={wrapRef} className="magnetic-hover inline-flex">
      <Link
        href={href}
        className="light-sweep glow-neon inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold text-base hover:bg-primary/90 active:scale-[0.97] transition-[background-color,transform] ease-out-expo motion-reduce:transition-none"
      >
        {children}
      </Link>
    </span>
  );
}

export default function LandingPage() {
  const { data: session, status } = useSession();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const reduce = useReducedMotion();

  const heroRef = useRef<HTMLElement>(null);
  useSpotlight(heroRef, 560);

  const heroBlobRef = useParallax<HTMLDivElement>(0.18);
  const accentBlobRef = useParallax<HTMLDivElement>(0.12);
  const howBlobRef = useParallax<HTMLDivElement>(0.14);

  const loggedIn = status === 'authenticated' && session?.user;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-emerald-500 selection:text-white dark:selection:text-black">
      {/* Shared public navbar */}
      <Navbar />

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative overflow-hidden px-4 sm:px-6 pt-16 sm:pt-24 pb-12"
      >
        <div className="absolute inset-0 gradient-mesh-animated" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="cursor-glow" aria-hidden="true" />
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2" aria-hidden="true">
          <div
            ref={heroBlobRef}
            className="parallax-layer h-72 w-[42rem] max-w-[120vw] rounded-full bg-emerald-500/15 blur-[110px]"
          />
        </div>
        <div
          ref={accentBlobRef}
          className="parallax-layer pointer-events-none absolute bottom-4 -right-24 h-64 w-64 rounded-full bg-violet-500/10 blur-[100px]"
          aria-hidden="true"
        />

        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <div className="glass-panel inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-primary/25 text-primary text-xs font-semibold mb-8">
              <Zap className="w-3.5 h-3.5" />
              <span>Habits · Routine · Goals · Focus · Journal</span>
            </div>
          </motion.div>

          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
            className="text-4xl md:text-6xl font-extrabold tracking-tight leading-[1.15] mb-6"
          >
            Build consistent days with{' '}
            <span className="animated-gradient-text">data-driven clarity</span>
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.16 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            RoutineOS unifies habit tracking, time-blocked routines, daily goals, focus sessions, and journaling into one calm workspace — with a hexagon score that shows your whole day at a glance.
          </motion.p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.24 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {loggedIn ? (
              <MagneticCta href="/dashboard">
                Go to Dashboard
                <ArrowRight className="w-5 h-5" />
              </MagneticCta>
            ) : (
              <>
                <MagneticCta href="/register">
                  Start For Free
                  <ArrowRight className="w-5 h-5" />
                </MagneticCta>
                <Link
                  href="/login"
                  className="shadow-soft inline-flex items-center justify-center gap-2 bg-card/70 border border-border text-foreground px-8 py-3.5 rounded-xl font-semibold text-base hover:bg-muted hover:border-foreground/20 active:scale-[0.97] transition-all ease-out-expo"
                >
                  Sign In
                </Link>
              </>
            )}
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.4 }}
            className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4 text-muted-foreground text-xs font-medium max-w-3xl mx-auto"
          >
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
          </motion.div>

          <ProductPreview />
        </div>
      </section>

      {/* Feature bento grid */}
      <section id="features" className="relative overflow-hidden py-16 sm:py-20 px-4 sm:px-6 border-y border-border bg-muted/30">
        <div className="absolute inset-0 gradient-mesh-bg opacity-60" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto">
          <motion.div
            variants={reduce ? undefined : stagger}
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="text-center max-w-2xl mx-auto mb-12"
          >
            <motion.h2 variants={fadeSlideUp} className="text-3xl font-bold mb-4">
              Everything for a consistent day
            </motion.h2>
            <motion.p variants={fadeSlideUp} className="text-muted-foreground text-sm md:text-base">
              Six tools that share one state: check something off anywhere and your score, streaks, and widgets update everywhere.
            </motion.p>
          </motion.div>

          <motion.div
            variants={reduce ? undefined : stagger}
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
          >
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative overflow-hidden py-16 sm:py-20 px-4 sm:px-6 max-w-5xl mx-auto">
        <div
          ref={howBlobRef}
          className="parallax-layer pointer-events-none absolute top-10 -left-40 h-72 w-72 rounded-full bg-teal-500/10 blur-[100px]"
          aria-hidden="true"
        />
        <div className="relative">
          <motion.div
            variants={reduce ? undefined : stagger}
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="text-center max-w-2xl mx-auto mb-12"
          >
            <motion.span variants={fadeSlideUp} className="text-primary text-xs font-bold uppercase tracking-wider">How it works</motion.span>
            <motion.h2 variants={fadeSlideUp} className="text-3xl font-bold mt-2 mb-4">Three steps to a better day</motion.h2>
          </motion.div>

          <motion.div
            variants={reduce ? undefined : stagger}
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {STEPS.map((s) => (
              <motion.div key={s.n} variants={fadeSlideUp} className="glass-panel rounded-2xl p-6">
                <span className="glow-primary inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 border border-primary/30 text-primary font-extrabold">
                  {s.n}
                </span>
                <h3 className="mt-4 text-base font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.description}</p>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: EASE }}
            className="glass-panel glow-primary mt-10 rounded-2xl border-primary/25 p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
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
          </motion.div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-16 sm:py-20 px-4 sm:px-6 border-t border-border bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <motion.h2
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-3xl font-bold text-center mb-10"
          >
            Questions, answered
          </motion.h2>
          <div className="space-y-3">
            {FAQS.map((f, i) => {
              const open = openFaq === i;
              return (
                <motion.div
                  key={f.q}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, ease: EASE, delay: i * 0.04 }}
                  className={`${open ? 'border-gradient-animated' : ''} overflow-hidden rounded-xl`}
                >
                  <div className="glass-panel">
                    <button
                      onClick={() => setOpenFaq(open ? null : i)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold hover:bg-muted/40 transition-colors"
                    >
                      {f.q}
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-expo ${open ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={reduce ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: EASE }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-16 px-4 sm:px-6 text-center border-t border-border">
        <div className="absolute inset-0 gradient-mesh-animated opacity-70" aria-hidden="true" />
        <div className="absolute inset-0 noise-overlay" aria-hidden="true" />
        <div className="relative max-w-3xl mx-auto">
          <motion.h2
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-3xl font-bold mb-4"
          >
            Ready for <span className="animated-gradient-text">more consistent days?</span>
          </motion.h2>
          <p className="text-muted-foreground text-sm mb-8">Create an account, add your first habit, and see tonight&apos;s hexagon.</p>
          {loggedIn ? (
            <MagneticCta href="/today">
              Open Today
              <ArrowRight className="w-5 h-5" />
            </MagneticCta>
          ) : (
            <MagneticCta href="/register">
              Create Your Account
              <ArrowRight className="w-5 h-5" />
            </MagneticCta>
          )}
        </div>
      </section>

      {/* Footer */}
      <Footer>
        <ThemeToggle />
      </Footer>
    </div>
  );
}