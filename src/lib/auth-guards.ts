import { auth } from "@/lib/auth";
import { AuthenticationError, AuthorizationError } from "@/lib/errors/app-error";

export async function getAuthSession() {
  return await auth();
}

export async function requireAuth() {
  const session = await getAuthSession();
  if (!session || !session.user) {
    throw new AuthenticationError('Your session has expired. Please sign in again.');
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if ((session.user as any).role !== 'ADMIN') {
    throw new AuthorizationError("You don't have permission to perform this action.");
  }
  return session;
}
