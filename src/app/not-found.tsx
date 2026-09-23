import Link from 'next/link';
import { Reveal } from '@/components/motion/Reveal';
import { Logo } from '@/components/layout/Logo';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4 text-center text-foreground">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="gradient-mesh-animated absolute inset-0" />
        <div className="noise-overlay absolute inset-0" />
        <div className="absolute top-1/3 -left-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <Reveal className="relative">
        <div className="mb-6">
          <Logo variant="icon" size="lg" />
        </div>
        <h1 className="animated-gradient-text mb-4 text-6xl font-extrabold tracking-tight sm:text-7xl md:text-8xl">
          404
        </h1>
        <h2 className="mb-3 text-xl font-bold sm:text-2xl">Page not found</h2>
        <p className="text-muted-foreground mb-8 max-w-md">
          We couldn&apos;t find the page you were looking for. It might have been moved or deleted.
        </p>
        <Link
          href="/"
          className="light-sweep glow-neon inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-bold text-primary-foreground transition-transform duration-300 ease-out-expo hover:scale-[1.03] active:scale-[0.98]"
        >
          Return Home
        </Link>
      </Reveal>
    </div>
  );
}