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
  }
}
