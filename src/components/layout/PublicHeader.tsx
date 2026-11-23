import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export function PublicHeader({
  currentPath,
  onNavigate,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const workspacePath =
    user?.role === 'admin'
      ? '/admin'
      : user?.role === 'facility_owner'
      ? '/owner'
      : user?.role === 'trainer'
      ? '/trainer'
      : '/dashboard';

  const navItems = [
    { label: 'Sports', path: '/sports' },
    { label: 'Facilities', path: '/facilities' },
    { label: 'Trainers', path: '/trainers' },
    ...(user ? [{ label: 'Dashboard', path: workspacePath }] : []),
  ];

  const primaryPath = user ? workspacePath : '/register';
  const primaryLabel = user ? 'Open Workspace' : 'Book a Court';

  const go = (path: string) => {
    setMobileOpen(false);
    onNavigate(path);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go('/');
          }}
          className="font-sporty italic text-2xl font-normal tracking-wider text-[#0B132B] whitespace-nowrap shrink-0"
        >
          ARENA<span className="text-sky-600">360</span>
        </a>

        {/* Zone 2: 5 concise single-line text links */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-7">
          {navItems.map((item) => {
            const active = currentPath === item.path;
            return (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.path);
                }}
                className={`text-sm font-medium whitespace-nowrap shrink-0 transition-colors hover:text-[#0B132B] ${
                  active ? 'text-sky-600 underline underline-offset-8 decoration-2' : 'text-slate-600'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => go(primaryPath)}
            className="hidden sm:inline-flex items-center justify-center rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors whitespace-nowrap shrink-0"
          >
            {primaryLabel}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.path}
                href={item.path}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.path);
                }}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                  currentPath === item.path ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => go(primaryPath)}
              className="mt-2 w-full rounded-lg bg-[#0B132B] px-4 py-2.5 text-sm font-semibold text-white"
            >
              {primaryLabel}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
