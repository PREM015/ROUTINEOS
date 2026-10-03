import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Dynamic sitemap (`/sitemap.xml`).
 *
 * This file did not exist, so the site had no crawl surface at all.
 *
 * The list is an explicit allow-list, never a directory walk. That is the only
 * safe way to build one for an app where 68 of ~80 routes sit behind
 * authentication: a generated sitemap would happily enumerate the dashboard,
 * and every entry would be a soft-404 redirect to `/login` for an anonymous
 * crawler, which is exactly the duplicate-content pattern search engines
 * penalise.
 *
 * Excluded on purpose: the whole `(dashboard)` group, every `(auth)` page,
 * `/unauthorized`, `/offline`, all `/api/*`, and the 404 route. Each of those
 * is additionally protected by `robots: noindex` metadata or the proxy.
 */

export const dynamic = 'force-static';

type Entry = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
  lastModified?: Date;
};

/**
 * Only genuinely public, indexable, content-bearing pages.
 * Every entry here is reachable without a session and has real prose on it.
 */
const PUBLIC_ROUTES: Entry[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/why', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
];

/**
 * Last-modified timestamp for the static content pages.
 *
 * `Date.now()` would be wrong here: the route is `force-static`, so a fresh
 * timestamp on every build would make every page look newly published and
 * would be a lie about the content actually having changed. A fixed date
 * derived from the app version is honest — bump it when the copy changes.
 */
const CONTENT_UPDATED = new Date('2026-01-01T00:00:00.000Z');

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path === '/' ? '' : route.path}`,
    lastModified: route.lastModified ?? CONTENT_UPDATED,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
