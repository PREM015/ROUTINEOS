import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  ChevronRight,
  Database,
  Palette,
  Quote,
  Settings2,
  SlidersHorizontal,
  User,
  type LucideIcon,
} from 'lucide-react';

interface SettingsLink {
  name: string;
  href: string;
  desc: string;
}

interface SettingsGroup {
  title: string;
  links: SettingsLink[];
}

const settingsGroups: SettingsGroup[] = [
  {
    title: 'Preferences',
    links: [
      { name: 'Profile', href: '/settings/profile', desc: 'Manage your personal details' },
      { name: 'Appearance', href: '/settings/appearance', desc: 'Customize the look and feel' },
      { name: 'Quotes', href: '/settings/quotes', desc: 'Manage your quotes and widget pool' },
      { name: 'Scoring Weights', href: '/settings/scoring', desc: 'Adjust how habits are scored' },
      { name: 'Notifications', href: '/settings/notifications', desc: 'Configure reminders' },
    ],
  },
  {
    title: 'Account & Data',
    links: [
      { name: 'Data', href: '/settings/data', desc: 'Export or import your data' },
      { name: 'Danger Zone', href: '/settings/danger-zone', desc: 'Account deletion' },
    ],
  },
];

type SettingsIconKey =
  | 'Profile'
  | 'Appearance'
  | 'Quotes'
  | 'Scoring Weights'
  | 'Notifications'
  | 'Data'
  | 'Danger Zone';

const ICONS: Record<SettingsIconKey, LucideIcon> = {
  Profile: User,
  Appearance: Palette,
  Quotes: Quote,
  'Scoring Weights': SlidersHorizontal,
  Notifications: Bell,
  Data: Database,
  'Danger Zone': AlertTriangle,
};

export default function SettingsHubPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <div className="flex items-start gap-3">
        <div className="glass-panel glow-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-xl p-3">
          <Settings2 className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-1 text-muted-foreground">Manage your account and preferences.</p>
        </div>
      </div>

      {settingsGroups.map((group) => (
        <section key={group.title} aria-labelledby={`settings-group-${group.title}`}>
          <h2
            id={`settings-group-${group.title}`}
            className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            {group.title}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {group.links.map((link) => {
              const Icon = ICONS[link.name as SettingsIconKey];
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="glass-panel group flex items-start gap-4 rounded-xl p-5 transition-all duration-300 ease-out-expo hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-long"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold">{link.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{link.desc}</p>
                  </div>
                  <ChevronRight
                    className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}