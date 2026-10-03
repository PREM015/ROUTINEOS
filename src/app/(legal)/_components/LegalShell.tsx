import type { ReactNode } from 'react';
import Link from 'next/link';
import { APP_CONFIG } from '@/config/app';
import { SITE_NAME } from '@/lib/seo';

/**
 * Shared shell for the two legal documents (`/privacy`, `/terms`).
 *
 * Kept as one component so the two pages cannot drift on the things that
 * matter for compliance: the effective date, the controller contact address,
 * and the navigation back into the product. Both documents read the support
 * address from `APP_CONFIG.supportEmail`, which is `NEXT_PUBLIC_SUPPORT_EMAIL`
 * — so there is exactly one place to change it, and it can never become a
 * placeholder that no one updates.
 */

export function LegalShell({
  title,
  summary,
  updated,
  children,
}: {
  title: string;
  /** One-paragraph plain-English summary shown above the table of contents. */
  summary: ReactNode;
  /** ISO date, rendered as a readable date. */
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/40">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-semibold text-foreground transition-colors hover:text-primary"
          >
            ← {SITE_NAME}
          </Link>
          <nav aria-label="Legal" className="flex items-center gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-muted-foreground transition-colors hover:text-primary"
              aria-current="page"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              Terms
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated:{' '}
          <time dateTime={updated}>
            {new Date(updated).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
        </p>

        <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
          {summary}
        </div>

        <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_li]:pl-1 [&_p]:mt-3 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:space-y-1.5">
          {children}
          {/*
            The support address is read from config rather than written into
            the prose, so a deployment that sets NEXT_PUBLIC_SUPPORT_EMAIL gets
            a correct policy with no code change.
          */}
          <p className="mt-10 border-t border-border pt-6 text-xs">
            Questions about this document? Write to{' '}
            <a href={`mailto:${APP_CONFIG.supportEmail}`}>{APP_CONFIG.supportEmail}</a>.
          </p>
        </div>
      </main>
    </div>
  );
}

/** Convenience wrapper for a numbered top-level section. */
export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2>{heading}</h2>
      {children}
    </section>
  );
}
