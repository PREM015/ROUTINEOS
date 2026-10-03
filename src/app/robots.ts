import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Dynamic robots.txt (`/robots.txt`).
 *
 * Previously absent entirely, which is the worst case: with no robots file
 * every URL under the origin is crawlable, and the 68 authenticated dashboard
 * pages were all `index, follow` with nothing to stop a crawler. Each of them
 * answers an anonymous request with a 307 to `/login`, so a crawler would
 * discover the whole app as one page repeated 68 times.
 *
 * Two independent layers now protect the private surface:
 *  1. This file asks well-behaved crawlers not to fetch the app or the API.
 *  2. Every private route also sends `robots: noindex` via metadata, which is
 *     the layer that actually works. A crawler that ignores robots.txt can
 *     still reach a page, but it will then see `noindex` and drop it, and
 *     `noindex` is only honoured if the URL is not blocked — which is why the
 *     blocking below is scoped to `/api/` and not to the dashboard pages.
 *
 * Deliberately NOT blocked: the public pages, and the legal pages, which are
 * referenced from the site footer and need to be crawlable.
 */
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          // Auth surface. Not secret, but crawling it wastes crawl budget and
          // surfaces sign-in forms in results.
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/change-password',
          '/verify-email',
          '/email-verified',
          '/verify-2fa',
          '/setup-2fa',
          '/resend-verification',
          '/logout',
          // Error and offline fallbacks should never appear in results.
          '/unauthorized',
          '/offline',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
