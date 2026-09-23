import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronDown, HelpCircle } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export const metadata: Metadata = {
  title: 'FAQ — RoutineOS',
  description:
    'Answers on accounts, pricing, daily scoring, streaks, rest days, routines, and privacy for RoutineOS.',
};

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

const CATEGORIES: FaqCategory[] = [
  {
    title: 'Getting started',
    items: [
      {
        question: 'Do I need an account to use RoutineOS?',
        answer:
          'Yes. Your habits, routines, score, and journal are stored per account so they follow you across devices and sessions. Registration takes under a minute.',
      },
      {
        question: 'Is RoutineOS free?',
        answer:
          'Yes. Tracking habits, routines, goals, focus sessions, and journaling — plus the daily hexagon score — is free. There are no premium gates on the core workflow.',
      },
      {
        question: 'Where should I start?',
        answer:
          'Add a handful of habits first, give them a tier, then block out your day with routine templates. The Today view ties it together and shows your live score.',
      },
    ],
  },
  {
    title: 'Scoring & streaks',
    items: [
      {
        question: 'How is the daily score calculated?',
        answer:
          'Six parameters — Core, Growth, Bonus, Habits, Routine, and Sleep — are each scored 0–100 and drawn as the hexagon radar. The number in the centre is your overall score for the day. You can adjust the weights that feed it from the Scoring Weights area in Settings.',
      },
      {
        question: 'What counts as a streak?',
        answer:
          'A streak grows each day you hit the minimum threshold for your scored habits. Rest days and minimum days are preserved, so planned recovery does not reset a healthy streak.',
      },
      {
        question: 'What happens on rest days?',
        answer:
          'You can mark a minimum day or a rest day. Scoring adjusts so a planned day off does not punish your momentum or break honest streaks.',
      },
      {
        question: 'Do milestone celebrations work automatically?',
        answer:
          'Yes. Achievements unlock as streaks grow and goals complete, so progress gets acknowledged without you having to track anything extra.',
      },
    ],
  },
  {
    title: 'Routines & planning',
    items: [
      {
        question: 'How do routine templates work?',
        answer:
          'Applying a template creates the routine blocks, habits, or goals it defines based on the template type. You can apply as many as you like and adjust the generated structure afterwards.',
      },
      {
        question: 'Can I have different plans for weekdays and weekends?',
        answer:
          'Yes. Routines support separate weekday and weekend templates, and you can mark low-energy days so the plan flexes with your actual life.',
      },
      {
        question: 'What happens if two scheduled blocks overlap?',
        answer:
          'RoutineOS flags overlapping time blocks before they happen, so you can resolve the conflict instead of silently running two plans at once.',
      },
    ],
  },
  {
    title: 'Privacy & devices',
    items: [
      {
        question: 'Is my journal private?',
        answer:
          'Yes. Journal entries and private quotes are visible only to you. Quotes you explicitly mark public can appear for others; nothing else is shared.',
      },
      {
        question: 'Can I export my data?',
        answer:
          'Yes. From Settings → Data you can export your data, and re-import it if you ever move between devices or accounts.',
      },
      {
        question: 'Can I use RoutineOS on my phone?',
        answer:
          'Yes. Every page is responsive down to 360px wide, with a bottom navigation bar on mobile and full light/dark theme support.',
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground selection:bg-emerald-500 selection:text-white dark:selection:text-black">
      <Navbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
        {/* Hero */}
        <div className="relative mb-14 text-center">
          <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
            <div className="gradient-mesh-animated absolute inset-0" />
            <div className="noise-overlay absolute inset-0" />
          </div>
          <span className="glow-primary mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            FAQ
          </span>
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight md:text-5xl">
            Questions, answered
          </h1>
          <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
            If you can&apos;t find what you need here, the Why RoutineOS page explains the thinking
            behind the product.
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-12">
          {CATEGORIES.map((category) => (
            <section key={category.title} aria-labelledby={`faq-${category.title}`}>
              <h2
                id={`faq-${category.title}`}
                className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground"
              >
                {category.title}
              </h2>
              <div className="space-y-3">
                {category.items.map((item) => (
                  <div key={item.question} className="group relative">
                    <div
                      aria-hidden="true"
                      className="border-gradient-animated pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-open:opacity-100"
                    />
                    <details className="relative overflow-hidden rounded-xl border border-border bg-card transition-shadow duration-300 group-open:shadow-soft">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold transition-colors hover:bg-muted/50 marker:content-none">
                        {item.question}
                        <ChevronDown
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                        {item.answer}
                      </p>
                    </details>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Still curious CTA */}
        <div className="glass-panel glow-primary mt-14 p-6 text-center sm:p-8">
          <h2 className="mb-2 text-xl font-bold">Still curious?</h2>
          <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
            Read about the principles behind RoutineOS and why it works the way it does.
          </p>
          <Link
            href="/why"
            className="light-sweep glow-neon inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-transform duration-300 ease-out-expo hover:scale-[1.03] active:scale-[0.98]"
          >
            Why RoutineOS
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </main>

      <Footer>
        <ThemeToggle />
      </Footer>
    </div>
  );
}