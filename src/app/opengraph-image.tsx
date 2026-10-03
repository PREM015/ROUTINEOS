import { ImageResponse } from 'next/og';
import { BRAND, SITE_NAME, SITE_TAGLINE } from '@/lib/seo';

/**
 * Generated Open Graph / Twitter card image (`/opengraph-image`).
 *
 * Served at the exact dimensions the crawlers expect — 1200×630, 1.91:1 — and
 * built with `next/og` (Satori), so there is no binary asset to keep in sync
 * with the brand palette: the gradient and text come from the same constants
 * as `icon.svg` and the CSS tokens.
 *
 * This also fixes a concrete social-preview failure: the root metadata
 * advertised OG images at absolute URLs derived from `metadataBase`, which was
 * unset, so they resolved to `http://localhost:3000/...`. Any link shared
 * before this change would have rendered with no preview image at all.
 */

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Static: the card never varies, so there is no reason to render per request. */
export const dynamic = 'force-static';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundColor: BRAND.darkBackground,
          // Same emerald→teal direction as the app icon.
          backgroundImage: `linear-gradient(135deg, ${BRAND.dark}22 0%, ${BRAND.accent}33 55%, ${BRAND.darkBackground} 100%)`,
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Brand mark, matching app/icon.svg: rounded gradient tile + check. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '20px',
              backgroundImage: `linear-gradient(135deg, ${BRAND.dark} 0%, ${BRAND.accent} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6 9 17l-5-5"
                stroke="#ffffff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ fontSize: '40px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              fontSize: '68px',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              maxWidth: '960px',
            }}
          >
            Build consistent days
          </div>
          <div
            style={{
              fontSize: '68px',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
              color: BRAND.dark,
            }}
          >
            with data-driven clarity
          </div>
          <div style={{ fontSize: '30px', color: '#a1a1aa', maxWidth: '900px' }}>
            Habits · Routine · Goals · Focus · Journal — one hexagon score for
            the whole day.
          </div>
        </div>
      </div>
    ),
    size
  );
}
