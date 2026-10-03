/**
 * Landing page FAQ copy, in one place.
 *
 * These five questions are rendered on the landing page *and* emitted as
 * `FAQPage` structured data by `app/page.tsx`. They originally lived inside
 * `LandingPageClient.tsx`, which is a `'use client'` module.
 *
 * That made the duplication unavoidable: a server component cannot read a
 * value exported from a client module (Next turns such exports into client
 * reference proxies, not the real array), so the structured data would have had
 * to be retyped by hand — and would have silently gone stale the first time the
 * copy was edited. Google requires marked-up FAQ content to be visible on the
 * page, so drift here is a real penalty, not a cosmetic issue.
 *
 * Extracting the strings to a plain module lets both sides import the same
 * source of truth.
 */
export interface LandingFaq {
  q: string;
  a: string;
}

export const LANDING_FAQS: LandingFaq[] = [
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
