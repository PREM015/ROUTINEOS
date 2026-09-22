'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'next-auth/react';

/**
 * Logout confirmation page.
 *
 * Single NextAuth `signOut` call with `callbackUrl: '/login'` — no custom
 * logout endpoint, no extra router navigation (the cause of the / ↔ /login
 * loop). NextAuth performs the one redirect itself.
 */

export default function LogoutPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await signOut({ callbackUrl: '/login' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out');
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
    >
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <LogOut className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Sign out</h1>
      <p className="text-center text-white/60 mb-8">
        Are you sure you want to sign out of RoutineOS?
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-400 text-center mb-4">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={handleLogout}
        className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Signing out...' : 'Sign Out'}
      </button>

      <Link
        href="/dashboard"
        className="mt-4 block w-full py-3 px-4 border border-white/10 text-white font-semibold rounded-lg hover:bg-white/5 transition-colors text-center"
      >
        Cancel
      </Link>
    </motion.div>
  );
}
