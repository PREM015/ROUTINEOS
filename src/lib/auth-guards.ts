import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth"; // Assume this exists based on NextAuth setup
import { NextResponse } from "next/server";

export async function getAuthSession() {
  return await getServerSession(authOptions as any);
}

export async function requireAuth() {
  const session = await getAuthSession();
  if (!session || !session.user) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  if ((session.user as any).role !== 'ADMIN') {
    throw new Error("FORBIDDEN");
  }
  return session;
}
