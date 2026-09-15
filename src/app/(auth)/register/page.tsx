"use client";

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl"
    >
      <div className="flex justify-center mb-6">
        <div className="p-3 bg-primary/20 rounded-full">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
      </div>
      <h1 className="text-2xl font-bold text-center text-white mb-2">Create Account</h1>
      <p className="text-center text-white/60 mb-8">Join RoutineOS today</p>

      <form className="space-y-4" onSubmit={e => { e.preventDefault(); setLoading(true); }}>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Name</label>
          <input type="text" required className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-primary outline-none transition-all" placeholder="John Doe" />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Email</label>
          <input type="email" required className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-primary outline-none transition-all" placeholder="you@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-1">Password</label>
          <input type="password" required className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:border-primary outline-none transition-all" placeholder="••••••••" />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 mt-4"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/60">
        Already have an account? <Link href="/login" className="text-primary hover:underline">Sign In</Link>
      </p>
    </motion.div>
  );
}
