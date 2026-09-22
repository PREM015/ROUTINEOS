import Link from 'next/link';

export default function SettingsHubPage() {
  const settingsLinks = [
    { name: 'Profile', href: '/settings/profile', desc: 'Manage your personal details' },
    { name: 'Appearance', href: '/settings/appearance', desc: 'Customize the look and feel' },
    { name: 'Quotes', href: '/settings/quotes', desc: 'Manage your quotes and widget pool' },
    { name: 'Scoring Weights', href: '/settings/scoring', desc: 'Adjust how habits are scored' },
    { name: 'Notifications', href: '/settings/notifications', desc: 'Configure reminders' },
    { name: 'Data', href: '/settings/data', desc: 'Export or import your data' },
    { name: 'Danger Zone', href: '/settings/danger-zone', desc: 'Account deletion' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your account and preferences.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsLinks.map((link) => (
          <Link key={link.href} href={link.href} className="block p-6 border rounded-xl hover:border-primary transition-colors bg-card">
            <h2 className="text-lg font-semibold">{link.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">{link.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
