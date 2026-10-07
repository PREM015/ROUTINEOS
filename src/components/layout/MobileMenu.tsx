"use client";

/**
 * MobileMenu — the hamburger button and the slide-in navigation drawer that
 * stand in for the desktop `Sidebar` below the `md` breakpoint.
 *
 * The sidebar is `hidden md:flex` and the `MobileNav` bottom bar pins only
 * four destinations (its "More" item used to be a plain link to /settings), so
 * on a phone eight of the eleven sidebar pages were unreachable without the
 * ⌘K palette. This mounts the exact same content (`SidebarContent`, shared
 * with the desktop sidebar) in a left `Drawer`, opened either by the hamburger
 * in the header or by the "More" button in the bottom bar. Both triggers write
 * to `useMobileMenuStore`; any link click closes the drawer.
 */

import { Menu } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { SidebarContent } from '@/components/layout/Sidebar';
import { useMobileMenuStore } from '@/store/mobile-menu.store';

/** Hamburger trigger for the header — mobile only, matching the header's pill buttons. */
export function MobileMenuButton() {
  const setOpen = useMobileMenuStore((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Open navigation menu"
      aria-haspopup="dialog"
      className="rounded-full border border-border bg-card/60 p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:hidden"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** The drawer itself. Mounted once, layout-wide; portals above the bottom bar. */
export function MobileMenu() {
  const open = useMobileMenuStore((s) => s.open);
  const setOpen = useMobileMenuStore((s) => s.setOpen);

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      side="left"
      title="Menu"
      description="All pages"
      className="w-72 max-w-[85vw]"
    >
      <SidebarContent
        onNavigate={() => setOpen(false)}
        pillLayoutId="mobile-menu-active-pill"
      />
    </Drawer>
  );
}

export default MobileMenu;
