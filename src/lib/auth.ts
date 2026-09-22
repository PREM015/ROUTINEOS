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
      }

      // Handle session update
      if (trigger === 'update' && session) {
        token.role = session.role || token.role;
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 1 day
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