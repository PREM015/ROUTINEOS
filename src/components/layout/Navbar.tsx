'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Magnetic } from '@/components/motion/Magnetic';
import { EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';

export interface NavbarLink {
  label: string;
  href: string;
}

/**
 * Shared public-site navbar (landing, why, FAQ, about). Sticky with a backdrop
 * blur and scroll-aware shrink, an animated underline for the current route,
 * a staggered slide-down menu on mobile, and a magnetic primary CTA. Swaps its
 * call-to-action based on the session state.
 */
export const NAV_LINKS: NavbarLink[] = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how' },
  { label: 'Why RoutineOS', href: '/why' },
  { label: 'FAQ', href: '/faq' },
  { label: 'About', href: '/about' },
];

const menuItem = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } },
};

const menuList = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};

export function Navbar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const loggedIn = status === 'authenticated' && session?.user;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  /** Colored active state: section anchors count as active on the home page. */
  const isActive = (href: string): boolean => {
    if (href === '/' || href.startsWith('/#')) {
      return pathname === '/';
    }
    return pathname === href;
  };

  /** Underlined state: only real routes get the sliding indicator. */
  const isCurrentRoute = (href: string): boolean =>
    href.startsWith('/') && !href.includes('#') && pathname === href;

  const primaryCta = loggedIn ? 'Go to Dashboard' : 'Get Started';

  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={cn(
        'sticky top-0 z-50 backdrop-blur-md transition-[height,background-color,border-color,box-shadow] duration-300 ease-out-expo',
        scrolled
          ? 'border-b border-border bg-background/80 shadow-sm'
          : 'border-b border-transparent bg-background/60',
        className,
      )}
    >
      <div
        className={cn(
          'mx-auto flex max-w-7xl items-center justify-between px-4 transition-[height] duration-300 ease-out-expo sm:px-6',
          scrolled ? 'h-14' : 'h-16',
        )}
      >
        <Link href="/" aria-label="RoutineOS home" className="shrink-0">
          <Logo size="md" />
        </Link>

        <nav
          className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex"
          aria-label="Public site"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isCurrentRoute(link.href) ? 'page' : undefined}
              className={cn(
                'relative py-1 transition-colors duration-300 ease-out-expo',
                isActive(link.href) ? 'font-semibold text-primary' : 'hover:text-foreground',
              )}
            >
              {link.label}
              <AnimatePresence>
                {isCurrentRoute(link.href) && (
                  <motion.span
                    layoutId="navbar-route-indicator"
                    className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-primary"
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                  />
                )}
              </AnimatePresence>
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {loggedIn ? (
            <Magnetic strength={0.12}>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-emerald-500/20 transition-transform duration-300 ease-out-expo hover:scale-[1.03] active:scale-[0.98]"
              >
                {primaryCta}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Magnetic>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-300 ease-out-expo hover:text-foreground"
              >
                Login
              </Link>
              <Magnetic strength={0.12}>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-emerald-500/20 transition-transform duration-300 ease-out-expo hover:scale-[1.03] active:scale-[0.98]"
                >
                  {primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Magnetic>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="p-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            {reduce ? (
              menuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={menuOpen ? 'close' : 'open'}
                  initial={{ rotate: -90, opacity: 0, scale: 0.75 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.75 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  className="inline-flex"
                >
                  {menuOpen ? (
                    <X className="h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="h-6 w-6" aria-hidden="true" />
                  )}
                </motion.span>
              </AnimatePresence>
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            className="overflow-hidden border-t border-border bg-background/95 backdrop-blur-md md:hidden"
            initial={reduce ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reduce ? { opacity: 0, height: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            <motion.nav
              aria-label="Mobile"
              className="flex flex-col gap-1 px-4 py-4"
              initial="hidden"
              animate="visible"
              variants={reduce ? undefined : menuList}
            >
              {NAV_LINKS.map((link) => (
                <motion.div key={link.href} variants={reduce ? undefined : menuItem}>
                  <Link
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={isCurrentRoute(link.href) ? 'page' : undefined}
                    className={cn(
                      'block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-300 ease-out-expo',
                      isActive(link.href)
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
              <motion.div variants={reduce ? undefined : menuItem} className="mt-2">
                <div className="flex gap-2 border-t border-border pt-4">
                  {loggedIn ? (
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                    >
                      {primaryCta}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => setMenuOpen(false)}
                        className="flex-1 inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-muted-foreground"
                      >
                        Login
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => setMenuOpen(false)}
                        className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
                      >
                        {primaryCta}
                      </Link>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

export default Navbar;