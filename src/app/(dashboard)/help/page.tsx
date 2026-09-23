import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  Compass,
  FolderKanban,
  HelpCircle,
  LayoutGrid,
  Mail,
  Target,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui';

/**
 * Help Page
 * Static documentation hub: feature walkthroughs, FAQ and support links.
 */
export default async function HelpPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const features = [
    {
      icon: CalendarCheck,
      title: 'Daily planning',
      description:
        'Plan your day from the Today view. Check off habits, work through routine blocks, and review your live daily score.',
    },
    {
      icon: Target,
      title: 'Habits & goals',
      description:
        'Track automated habits across core, growth and bonus tiers, then connect them to weekly, monthly and yearly goals.',
    },
    {
      icon: Timer,
      title: 'Focus sessions',
      description:
        'Run pomodoro-style focus timers, log deep work, and review focus minutes and streaks on the Focus page.',
    },
    {
      icon: LayoutGrid,
      title: 'Templates',
      description:
        'Apply ready-made routines and habit stacks to bootstrap a schedule, then tailor blocks to your own rhythm.',
    },
    {
      icon: FolderKanban,
      title: 'Projects & tasks',
      description:
        'Group goals, tasks and milestones into projects. Track progress, priorities and overdue work in one place.',
    },
    {
      icon: BookOpen,
      title: 'Journal & wellness',
      description:
        'Log mood, energy and sleep, write reflective journal entries, and let RoutineOS surface insights and correlations.',
    },
    {
      icon: BarChart3,
      title: 'Analytics & reports',
      description:
        'Explore trends, streaks and score breakdowns. Generate weekly and monthly reports to see the bigger picture.',
    },
    {
      icon: Trophy,
      title: 'Achievements',
      description:
        'Unlock achievements as you build consistency. Track milestones and compare progress over time.',
    },
    {
      icon: Users,
      title: 'Social',
      description:
        'Follow other members, discover challenges, and keep each other accountable on the leaderboard.',
    },
  ] as const;

  const faqs = [
    {
      question: 'How is my daily score calculated?',
      answer:
        'Each day combines core, growth and bonus habit tiers with routine completion. Core habits carry the most weight, growth habits reward development, and bonus habits add upside. Rest and minimum days are respected so recovery does not break your momentum.',
    },
    {
      question: 'What counts as a streak?',
      answer:
        'A streak grows each day you hit the minimum threshold of your scored habits. Rest days and minimum days are preserved, so planned recovery will not reset a healthy streak.',
    },
    {
      question: 'Where are my pomodoro settings stored?',
      answer:
        'Timer durations and auto-start preferences are stored locally on this device, so your preferred focus rhythm follows you without needing a server round-trip.',
    },
    {
      question: 'Can I edit a journal entry after writing it?',
      answer:
        'Yes. Open the day from the journal calendar or list to edit that entry in place. Each day holds a single entry you can refine at any time.',
    },
    {
      question: 'How do templates work?',
      answer:
        'Applying a template creates the routine blocks, habits or goals it defines based on the template type. You can apply as many as you like and adjust the generated structure afterward.',
    },
  ] as const;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <HelpCircle className="h-7 w-7 text-primary" />
          Help &amp; Documentation
        </h1>
        <p className="mt-2 text-muted-foreground">
          Everything you need to get the most out of RoutineOS. Start with a feature below or jump
          to the FAQ.
        </p>
      </div>

      <section aria-labelledby="feature-guide-heading" className="mb-12">
        <h2 id="feature-guide-heading" className="mb-4 flex items-center gap-2 text-xl font-semibold">
          <Compass className="h-5 w-5 text-muted-foreground" />
          Feature guide
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mb-12">
        <h2 id="faq-heading" className="mb-4 text-xl font-semibold">
          Frequently asked questions
        </h2>
        <div className="space-y-3">
          {faqs.map(({ question, answer }) => (
            <details
              key={question}
              className="group rounded-xl border border-border bg-card p-4 transition-[box-shadow] duration-200 ease-out-expo open:shadow-raised"
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:content-none">
                {question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="support-heading">
        <Card className="p-6">
          <h2 id="support-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="h-5 w-5 text-muted-foreground" />
            Still need a hand?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Send us feedback from the Feedback page and we will get back to you. Include the steps
            you took and what you expected to happen so we can reproduce it quickly.
          </p>
        </Card>
      </section>
    </div>
  );
}
