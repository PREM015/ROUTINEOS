import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import TemplateBrowser from '@/components/templates/TemplateBrowser';

/**
 * Templates Page
 * Browse, preview and apply routine/habit templates.
 */
export default async function TemplatesPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Sparkles className="h-7 w-7 text-primary" />
          Templates
        </h1>
        <p className="mt-2 text-muted-foreground">
          Browse curated routines and habit stacks, preview the schedule, and apply one to your
          workspace in a single click.
        </p>
      </div>

      <TemplateBrowser />
    </div>
  );
}
