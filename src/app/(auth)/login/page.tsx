'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError('Invalid email or password.');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050816] px-4 text-slate-100">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/70 shadow-2xl shadow-emerald-950/20 lg:grid-cols-2">
        <div className="hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-8 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-slate-50/90">
              RoutineOS
            </div>
            <h1 className="text-4xl font-semibold leading-tight">Build a calm rhythm that actually lasts.</h1>
          </div>
          <div className="text-sm text-slate-100/90">
            Track your habits, protect your energy, and turn good intentions into a sustainable daily routine.
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-8">
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-emerald-400">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold">Log in</h2>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-slate-100 outline-none ring-0 transition focus:border-emerald-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-slate-100 outline-none ring-0 transition focus:border-emerald-500"
                placeholder="••••••••"
              />
            </div>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-sm text-slate-400">
            No account yet?{' '}
            <Link href="/register" className="font-medium text-emerald-400 hover:text-emerald-300">
              Create one
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
