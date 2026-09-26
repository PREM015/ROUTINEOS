import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth, { CredentialsSignin } from 'next-auth';
import type { User } from 'next-auth';
import type { AdapterUser } from 'next-auth/adapters';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { loginSchema } from '@/schemas/auth.schema';

/**
 * Throwing Auth.js `CredentialsSignin` (instead of a plain `Error`) is what
 * lets the client receive `error=CredentialsSignin&code=<Code>` — a plain
 * `Error` is treated as a server misconfiguration and surfaces as
 * `error=Configuration`, which blocks login for every failed attempt.
 */
class InvalidCredentialsError extends CredentialsSignin {
  code = 'InvalidCredentials';
}

class EmailNotVerifiedError extends CredentialsSignin {
  code = 'EmailNotVerified';
}

class AccountLockedError extends CredentialsSignin {
  code = 'AccountLocked';
}

class AccountDeletedError extends CredentialsSignin {
  code = 'AccountDeleted';
}

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
      },
      async authorize(credentials) {
        // Validate input
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new InvalidCredentialsError();
        }

        const { email, password } = parsed.data;

        // Find user
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user) {
          throw new InvalidCredentialsError();
        }

        // Check if account is deleted
        if (user.isDeleted) {
          throw new AccountDeletedError();
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new AccountLockedError();
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.passwordHash || '');
        if (!passwordMatch) {
          // Increment failed login attempts
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: { increment: 1 },
            },
          });

          throw new InvalidCredentialsError();
        }

        // Check if email is verified
        if (!user.emailVerified) {
          throw new EmailNotVerifiedError();
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
      session?: any;
    }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role || 'USER';
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

      // Handle session update
      if (trigger === 'update' && session) {
        token.role = session.role || token.role;
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

    async session({ session, token }: { session: any; token: JWT }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role as string;
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
      await prisma.auditLog.create({
        data: {
          userId: message.token.id as string,
          action: 'LOGOUT_ALL_SESSIONS',
        },
      });
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authOptions);