import "next-auth";
import "next-auth/jwt";
import type { Role } from "./auth";

/**
 * NextAuth type augmentation for RoutineOS.
 *
 * Extends the default Session and JWT interfaces so that
 * `session.user.id` and `session.user.role` are typed throughout
 * the codebase without extra casting.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      role: Role;
    };
    /**
     * Absolute sign-out timestamp (loginAt + 6h). Optional because the server
     * only stamps it when the JWT carries `loginAt`; consumers must fall back
     * to the rolling `expires` rather than assuming it is present.
     */
    absoluteExpiresAt?: number;
  }

  interface User {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    loginAt: number;
    sessionVersion: number;
  }
}
