import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AppProvider } from '@/context/AppContext';
import AuthProvider from '@/components/auth/AuthProvider';
import AutoLogout from '@/components/auth/AutoLogout';
import { SWRegistration } from '@/components/SWRegistration';
import { CookieConsentProvider, CookieConsentBanner } from '@/components/privacy/CookieConsent';
import { Analytics } from '@/components/privacy/Analytics';
import {
  BRAND,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  jsonLdScript,
  organizationJsonLd,
  webSiteJsonLd,
} from '@/lib/seo';

export const metadata: Metadata = {
  /**
   * Without this, Next resolves every relative metadata URL (Open Graph images,
   * canonicals, the sitemap) against `http://localhost:3000`. This is the
   * single most damaging omission in the previous metadata: social scrapers
   * were handed localhost URLs.
   */
  metadataBase: new URL(SITE_URL),

  /**
   * `default` is used by the root layout; every child page sets a bare
   * `title` and gets `Title | RoutineOS` automatically. Previously there was no
   * template, so all ~80 pages rendered the identical root string.
   */
  title: {
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: 'Next.js',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: SITE_NAME,
  },
  /**
   * `public/favicon.ico` and `public/apple-icon.png` are real generated files.
   * `apple-icon.svg` was previously referenced here but never existed, so
   * iOS fetched a 404 for its home-screen icon. `/icon.svg` is served by the
   * `app/icon.svg` file convention.
   */
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  /**
   * The default for the whole site is index+follow, but every authenticated
   * route overrides this to noindex via `privateMetadata` in
   * `(dashboard)/layout.tsx`, the `(auth)` layout and the error pages.
   */
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
    url: SITE_URL,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: ['/opengraph-image'],
  },
  category: 'productivity',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
};

/**
 * `theme-color` is emitted per colour scheme instead of the hardcoded blue
 * `#3b82f6` that was previously sent twice (once here, once as a manual
 * `<meta>` tag). That blue did not exist anywhere in the design system — the
 * brand primary is emerald, `--primary: #047857` light / `#10b981` dark — so
 * mobile browser chrome did not match the app.
 *
 * This also replaces a hand-written `<head>` block that duplicated what the
 * metadata API already generates for the manifest and the touch icon.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Keeps content clear of the iOS notch/home indicator in standalone mode.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND.light },
    { media: '(prefers-color-scheme: dark)', color: BRAND.dark },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Site-level structured data. Rendered as an explicit script rather
          than via a library so there is no new dependency and the payload is
          inspectable in view-source. `<` is escaped by `jsonLdScript` so a
          value can never close the tag early.
        */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(organizationJsonLd()),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(webSiteJsonLd()),
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <AppProvider>
              <CookieConsentProvider>
                <AutoLogout />
                <SWRegistration />
                {/*
                  Renders nothing at all unless the visitor has accepted the
                  analytics category, so an opt-out downloads no script.
                */}
                <Analytics />
                {children}
                {/*
                  The first-visit banner. A no-op pass-through, so it can sit
                  here unconditionally; the real UI renders only once the store
                  has read `localStorage` and found no recorded decision, which
                  is what stops it flashing for someone who already answered.
                */}
                <CookieConsentBanner />
              </CookieConsentProvider>
            </AppProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
