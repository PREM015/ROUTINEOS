import type { Metadata } from 'next';
import { LandingPageClient } from '@/components/landing/LandingPageClient';
import { LANDING_FAQS } from '@/lib/content/landing-faqs';
import {
  faqJsonLd,
  jsonLdScript,
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  softwareApplicationJsonLd,
} from '@/lib/seo';

/**
 * The marketing landing page.
 *
 * This was a `'use client'` component, which is why the single most important
 * page on the site had no metadata of its own: a client component cannot export
 * `metadata`, so `/` silently inherited the root title, had no canonical URL, no
 * per-page description and no structured data. The body now lives in
 * `LandingPageClient` and this file — a server component — owns the SEO.
 *
 * The site-level `Organization` and `WebSite` JSON-LD is emitted once in the
 * root layout; only the page-specific `SoftwareApplication` and `FAQPage` are
 * added here.
 */
export const metadata: Metadata = pageMetadata({
  title: `${SITE_NAME} — build consistent days`,
  description: SITE_DESCRIPTION,
  path: '/',
  // The home page title already contains the brand, so the root
  // `%s | RoutineOS` template must not be applied to it.
  absolute: true,
});

export default function LandingPage() {
  return (
    <>
      <LandingPageClient />

      {/*
        SoftwareApplication markup lets the product qualify for app-style rich
        results. `offers` is a flat 0 price rather than the per-plan table, which
        is the safer shape to assert: it does not claim a subscription price the
        landing page does not display.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(softwareApplicationJsonLd()),
        }}
      />

      {/*
        Built from the same `LANDING_FAQS` the client page renders, so the
        structured answers cannot drift from the visible ones.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            faqJsonLd(
              LANDING_FAQS.map(({ q, a }) => ({ question: q, answer: a }))
            )
          ),
        }}
      />
    </>
  );
}
