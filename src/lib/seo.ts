import type { Metadata } from 'next';

/**
 * Centralised SEO primitives.
 *
 * These used to be duplicated (and largely absent): the root layout had no
 * `metadataBase`, so every relative URL Next generated for Open Graph fell back
 * to `http://localhost:3000`, which is what social scrapers would have cached.
 * One source of truth for the canonical origin, the default social card and the
 * structured data keeps `layout.tsx`, `sitemap.ts` and `robots.ts` agreeing.
 *
 * The canonical origin comes from `NEXT_PUBLIC_APP_URL`, the same variable
 * `src/config/app.ts` already uses for email links. Nothing is hardcoded to a
 * production hostname: a build that forgets to set it degrades to localhost
 * loudly (wrong absolute URLs) rather than silently shipping a wrong domain.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
).replace(/\/$/, '');

export const SITE_NAME = 'RoutineOS';

export const SITE_TAGLINE =
  'Build consistent days with data-driven clarity';

export const SITE_DESCRIPTION =
  'RoutineOS unifies habit tracking, time-blocked routines, daily goals, focus sessions and journaling into one calm workspace — with a hexagon score that shows your whole day at a glance.';

/** Path of the generated Open Graph card (see `app/opengraph-image.tsx`). */
export const OG_IMAGE_PATH = '/opengraph-image';

/**
 * Brand palette, mirrored from the `--primary` tokens in `globals.css`
 * (emerald-700 light / emerald-500 dark) and the gradient in `app/icon.svg`.
 * Kept here as literals because these are consumed by metadata, JSON-LD and the
 * generated social image, none of which can read a CSS custom property.
 */
export const BRAND = {
  light: '#047857',
  dark: '#10b981',
  accent: '#0d9488',
  background: '#ffffff',
  darkBackground: '#09090b',
} as const;

/**
 * Build a `Metadata` object for a public page.
 *
 * Every public page gets: a unique title through the root `%s | RoutineOS`
 * template, a description, an absolute canonical URL, and a complete Open Graph
 * + Twitter card. The previous state was one flat root title inherited verbatim
 * by all ~80 pages, so every page in the app shipped an identical `<title>`.
 */
export function pageMetadata({
  title,
  description,
  path = '/',
  noindex = false,
  absolute = false,
}: {
  title: string;
  description: string;
  /** Site-relative path, e.g. `/about`. Used for the canonical URL. */
  path?: string;
  noindex?: boolean;
  /**
   * Emit `title` verbatim, bypassing the root `%s | RoutineOS` template.
   *
   * Use this only where the title already carries the brand, so applying the
   * template would read `RoutineOS — ... | RoutineOS`.
   *
   * This is also the only reliable way to get an un-templated title on the
   * **home page**. In `accumulateMetadata` the inherited template is captured
   * only when `i < metadataItems.length - 2`, and `/` is the one route whose
   * metadata items are too few to satisfy that condition — so the root template
   * is silently *not* applied there, and the page title renders bare. Relying
   * on that accident would mean the home page behaves differently from every
   * other route and breaks if the segment layout changes. `absolute` states the
   * intent directly.
   */
  absolute?: boolean;
}): Metadata {
  const url = `${SITE_URL}${path === '/' ? '' : path}`;

  // Social and browser titles must agree with each other. Appending the brand
  // twice (once here, once via the root template) is the common bug here, so
  // the suffix is skipped when the title already names the product.
  const socialTitle = title.startsWith(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;

  return {
    title: absolute ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: socialTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: 'en_US',
      type: 'website',
      images: [
        {
          url: `${SITE_URL}${OG_IMAGE_PATH}`,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
      images: [`${SITE_URL}${OG_IMAGE_PATH}`],
    },
    robots: noindex
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

/**
 * Metadata for routes that must never be indexed but still need a sensible
 * title: the whole authenticated dashboard, every auth page, and the
 * error/offline fallbacks.
 *
 * This is the single highest-impact SEO fix in the audit. The dashboard group
 * is 68 pages, every one of them previously `index, follow` with no
 * `robots` directive anywhere in the repo, and every one of them 307-redirects
 * an anonymous crawler to `/login` — so the crawler's entire discovery of the
 * site collapsed into duplicate login pages.
 */
export function privateMetadata(title: string, description?: string): Metadata {
  return {
    /**
     * `absolute`, for the same reason as `pageMetadata`: a private route's
     * title is the brand name, and the root template would render it as
     * `RoutineOS | RoutineOS`. These pages are noindex anyway, so a suffix
     * only ever appears in the browser tab.
     */
    title: { absolute: title },
    description,
    robots: { index: false, follow: false, nocache: true },
  };
}

/** JSON-LD helper. Serialised with `<` escaped to stay XSS-safe in a <script>. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** Site-level structured data: the publisher and the site itself. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/icon.svg`,
    },
  };
}

export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { '@id': ORGANIZATION_ID },
    inLanguage: 'en',
  };
}

export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: 'ProductivityApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}

/**
 * FAQPage structured data. `page.tsx` and `/faq` each render their own Q&A
 * lists; both feed this so the markup is emitted wherever the questions are
 * actually visible on the page.
 */
export function faqJsonLd(entries: Array<{ question: string; answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  };
}
