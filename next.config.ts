import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy.
 *
 * The app renders zero `dangerouslySetInnerHTML` and stores no user HTML that
 * is ever interpreted, so CSP is a backstop rather than the primary XSS
 * defence. It is still worth having: it is the control that would contain the
 * latent risk in `RichTextEditor`, and it blocks remote script exfiltration.
 *
 * Deliberate choices, each of which is a correctness decision rather than a
 * style preference:
 *
 *  - `script-src` keeps `'unsafe-inline'`. Next.js emits its hydration
 *    bootstrap as an inline script and only moves to a nonce when a
 *    middleware sets the `x-nonce` request header. Claiming `'strict-dynamic'`
 *    without actually issuing a nonce would silently break every page, so it
 *    is not claimed. The upgrade path is to generate a nonce in `proxy.ts` and
 *    drop `'unsafe-inline'` — see the deliverables notes.
 *  - `'unsafe-eval'` is development-only. Next.js dev tooling evaluates code;
 *    production does not, so it must not ship.
 *  - `style-src` needs `'unsafe-inline'`: framer-motion (used across the
 *    marketing pages) sets inline `style` attributes per frame.
 *  - `img-src https:` because avatars are fetched from GitHub/Google OAuth
 *    hosts and user-supplied attachment URLs.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Push notifications and the offline service worker need both.
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  isDev ? '' : 'upgrade-insecure-requests',
]
  .filter(Boolean)
  .join('; ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // The app needs notifications; it does not need camera, mic, geolocation,
    // payment or the fullscreen escape hatch.
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  // Cross-origin isolation for the response body. The app serves no
  // cross-origin resources it needs to read, so CORP can be strict.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/**
 * HSTS is only meaningful over TLS, and sending it during `next dev` would
 * pin a developer to https on a host that is serving plain http. It is
 * therefore production-only. `max-age=31536000` with `includeSubDomains`
 * matches what a Vercel-hosted custom domain needs; the Vercel `x-vercel`
 * and `*.vercel.app` preview hosts are intentionally not covered by the
 * preload list so a staging deployment cannot affect a production cookie.
 */
const hstsHeaders = isDev
  ? []
  : [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      },
    ];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  turbopack: {},

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.vercel-storage.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        // Everything, including the 404/500 pages.
        source: '/:path*',
        headers: [...securityHeaders, ...hstsHeaders],
      },
    ];
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
