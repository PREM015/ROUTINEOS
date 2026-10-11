import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { CredentialsSignin } from 'next-auth';
import type { Session, User } from 'next-auth';
import type { AdapterUser } from 'next-auth/adapters';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { loginSchema } from '@/schemas/auth.schema';
import { checkAuthRateLimit } from '@/lib/security/auth-rate-limit';
import { readTwoFactorState, verifyTotpCode } from '@/lib/security/totp';

/**
 * Throwing Auth.js `CredentialsSignin` (instead of a plain `Error`) is what
 * lets the client receive `error=CredentialsSignin&code=<Code>` — a plain
 * `Error` is treated as a server misconfiguration and surfaces as
 * `error=Configuration`, which blocks login for every failed attempt.
 */
class InvalidCredentialsError extends CredentialsSignin {
  code = 'InvalidCredentials';
}

class AccountLockedError extends CredentialsSignin {
  code = 'AccountLocked';
}

class AccountDeletedError extends CredentialsSignin {
  code = 'AccountDeleted';
}

/**
 * The password was correct but the account has TOTP enabled and no (or an
 * invalid) code was supplied. The login form reacts to this code by revealing
 * a code field and resubmitting email + password + code.
 */
class TwoFactorRequiredError extends CredentialsSignin {
  code = 'TwoFactorRequired';
}

/** Consecutive failures before the account is temporarily locked. */
const MAX_FAILED_LOGIN_ATTEMPTS = 10;
/** Lock length. Short enough that a real user recovers on their own. */
const ACCOUNT_LOCK_MS = 15 * 60_000;

/**
 * Authentication Configuration
 * NextAuth setup with custom credentials provider
 */

export const authOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    // Credentials Provider for email/password
    Credentials({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        totpCode: { label: 'Two-factor code', type: 'text' },
      },
      async authorize(credentials, request) {
        // Throttle by client IP before doing any work. bcrypt is deliberately
        // expensive, which makes it a poor rate limiter: it is slow for the
        // legitimate user too, and it does nothing to stop a patient attacker.
        // Auth.js hands `authorize` a standard `Request` here, not a
        // `NextRequest`; `checkAuthRateLimit` only needs the headers.
        const limit = checkAuthRateLimit(request, 'login', {
          max: 10,
          windowMs: 5 * 60_000,
        });
        if (!limit.ok) {
          /*
           * Logged because this is the one rejection that leaves **no trace in
           * the database at all** — it is an in-memory per-IP bucket, so the
           * account row still looks completely healthy while every sign-in is
           * being refused. Without this line it is indistinguishable from a
           * wrong password.
           */
          console.error(
            `[auth] sign-in rejected: IP rate limit tripped, retry in ` +
              `${limit.retryAfterSeconds}s`
          );
          throw new InvalidCredentialsError();
        }

        // Validate input. `totpCode` is optional so that a first attempt
        // without a code still passes schema validation; the 2FA check below
        // decides whether it was required.
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          console.error(
            `[auth] sign-in rejected at schema validation: ` +
              parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}`).join(', ')
          );
          throw new InvalidCredentialsError();
        }

        const { email, password } = parsed.data;
        const totpCode =
          typeof credentials?.totpCode === 'string' ? credentials.totpCode.trim() : '';

        // Find user
        const lookupEmail = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({
          where: { email: lookupEmail },
        });

        /*
         * Which branch rejected, and the address that was looked up.
         *
         * Every failure below throws a `CredentialsSignin` subclass, and NextAuth
         * flattens all of them into one generic `[auth][error] CredentialsSignin`
         * line. That line cannot distinguish a mistyped email from a wrong
         * password from a locked account — and the `if (!user)` branch and the
         * schema branch even fail at the same column, so a stack trace alone
         * cannot tell them apart either.
         *
         * This log is deliberately **server-side only**. Nothing here is added to
         * the response or the redirect, because telling a caller "no such
         * account" *would* be an account-enumeration oracle; the client must keep
         * receiving one undifferentiated "invalid credentials". The operator log
         * is the one place where the distinction is safe and necessary.
         *
         * The address is shown as **first character + length + domain**. That is
         * the combination that actually resolves this class of failure: the
         * domain is where typos live (`gamil.com`, `.cmo`), and the length
         * catches a dropped character that still happens to be a valid email
         * shape. The local part stays masked, since it is the identifying half.
         *
         * Everything here is the value the *caller submitted*, echoed back — not
         * stored data — so there is nothing here that an attacker could not
         * already see.
         */
        const at = lookupEmail.lastIndexOf('@');
        const domain = at === -1 ? '(no domain)' : lookupEmail.slice(at);
        const masked = lookupEmail.length
          ? `${lookupEmail[0]}*** ${domain} (${lookupEmail.length} chars)`
          : '(empty)';

        if (!user) {
          console.error(
            `[auth] sign-in rejected: no account for ${masked}` +
              (at === -1 ? ' — the submitted value has no "@"' : '')
          );
          throw new InvalidCredentialsError();
        }

        // Check if account is deleted
        if (user.isDeleted) {
          console.error(`[auth] sign-in rejected for ${masked}: account deleted`);
          throw new AccountDeletedError();
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          console.error(
            `[auth] sign-in rejected for ${masked}: account locked until ` +
              user.lockedUntil.toISOString()
          );
          throw new AccountLockedError();
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.passwordHash || '');
        if (!passwordMatch) {
          console.error(`[auth] sign-in rejected for ${masked}: wrong password`);
          // Count the failure and lock the account once the threshold is
          // crossed. `lockedUntil` was previously incremented-adjacent data
          // that nothing ever set, so `failedLoginAttempts` grew forever and
          // the lockout control did not exist.
          const failedAttempts = (user.failedLoginAttempts ?? 0) + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: failedAttempts,
              lockedUntil:
                failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
                  ? new Date(Date.now() + ACCOUNT_LOCK_MS)
                  : user.lockedUntil,
            },
          });

          throw new InvalidCredentialsError();
        }

        

        // ── Two-factor enforcement ───────────────────────────────────────────
        // This used to be missing entirely. `setupTwoFactor`/`verifyTwoFactor`
        // wrote an `enabled` flag that only ever got read by the code that set
        // it, so a user who turned 2FA on was shown a green confirmation and
        // then logged in with nothing but their password. The state lives in
        // the `preferences` JSON column, which is why nothing here found it.
        const twoFactor = readTwoFactorState(user.preferences);
        if (twoFactor.enabled && twoFactor.secret) {
          if (!totpCode) {
            throw new TwoFactorRequiredError();
          }
          if (!verifyTotpCode(twoFactor.secret, totpCode)) {
            throw new TwoFactorRequiredError();
          }
        }

        // Reset failed login attempts
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            lastActivityAt: new Date(),
          },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          image: user.avatarUrl,
        };
      },
    }),

    // OAuth Providers
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),

    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
          GitHub({
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }),
        ]
      : []),
  ],

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async jwt({
      token,
      user,
      trigger,
      session,
    }: {
      token: JWT;
      user?: User | AdapterUser;
      trigger?: 'update' | 'signIn' | 'signUp';
      session?: Session;
    }) {
      if (user) {
        token.id = user.id;
        token.role = 'role' in user && typeof user.role === 'string' ? user.role : 'USER';
        // Stamp absolute login time once at sign-in. This is the anchor for
        // the 6-hour absolute expiry; it never moves regardless of activity.
        token.loginAt = Date.now();
        // Snapshot the user's sessionVersion so we can detect forced
        // invalidation (e.g. dev-restart bumps, logout-all, password change).
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id! },
          select: { sessionVersion: true },
        });
        token.sessionVersion = dbUser?.sessionVersion ?? 0;
      }

      // Handle session update. `role` lives on `session.user`, not on
      // `session` itself — reading `session.role` always yielded undefined and
      // silently made this a no-op.
      if (trigger === 'update' && session?.user?.role) {
        token.role = session.user.role;
      }

      // ── Absolute 6-hour expiry (server-side enforcement) ──────────────────
      // Reject the token if it was issued more than 6 hours ago, even if
      // NextAuth's default rolling refresh would otherwise keep it alive.
      const SESSION_MAX_MS = 6 * 60 * 60 * 1000; // 6 hours
      const loginAt = token.loginAt as number | undefined;
      if (loginAt && Date.now() - loginAt > SESSION_MAX_MS) {
        // Return a token with a past expiry so NextAuth treats it as invalid.
        return { ...token, exp: 0 };
      }

      // ── sessionVersion check ──────────────────────────────────────────────
      // If the stored version differs from the token's snapshot, the session
      // has been force-invalidated (dev restart, logout-all, password change).
      const tokenSessionVersion = token.sessionVersion as number | undefined;
      if (typeof token.id === 'string' && typeof tokenSessionVersion === 'number') {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { sessionVersion: true },
        });
        if (dbUser && dbUser.sessionVersion !== tokenSessionVersion) {
          return { ...token, exp: 0 };
        }
      }

      return token;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? '';
        session.user.role = (token.role as string) ?? 'USER';
      }
      // Expose absolute expiry to client so AutoLogout can use it without
      // relying on the rolling `session.expires` (which NextAuth rewrites).
      const loginAt = token.loginAt as number | undefined;
      if (loginAt) {
        session.absoluteExpiresAt = loginAt + 6 * 60 * 60 * 1000;
      }
      return session;
    },

    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // Redirect to same origin URL
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  session: {
    strategy: 'jwt' as const,
    maxAge: 6 * 60 * 60, // 6 hours in seconds — absolute, not idle-based
    updateAge: 0, // disable rolling refresh; the 6-hour clock never resets
  },

  events: {
    async signIn({ user }: { user: User }) {
      // Log sign in
      if (user.id) {
        await prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'LOGIN_SUCCESS',
            ipAddress: undefined,
          },
        });
      }
    },

    async signOut(message: { session?: unknown } | { token?: JWT | null }) {
      if (!('token' in message) || !message.token?.id) {
        return;
      }
      // `signOut` fires for both a single-device sign-out and an explicit
      // "sign out everywhere", and this event cannot tell them apart. Logging
      // `LOGOUT_ALL_SESSIONS` for every ordinary sign-out made the audit log
      // useless, so record the accurate action; the "everywhere" variant is
      // already audited by `AuthService.logoutAll`.
      await prisma.auditLog.create({
        data: {
          userId: message.token.id as string,
          action: 'LOGOUT',
        },
      });
    },
  },

  // Resolve the secret the SAME way `proxy.ts` does (`AUTH_SECRET` first).
  // Hard-pinning NEXTAUTH_SECRET here diverged from the proxy the moment
  // `AUTH_SECRET` — the name Auth.js v5 prefers and the one most hosting
  // providers document — appeared in the environment: the proxy would decode
  // cookies with AUTH_SECRET while NextAuth encrypted them with
  // NEXTAUTH_SECRET. That mismatch is `JWTSessionError: no matching
  // decryption secret`, and because `readSessionToken` swallows it, every
  // protected route saw a live session as anonymous and 307'd to /login.
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);