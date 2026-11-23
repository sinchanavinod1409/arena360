import React, { useState } from 'react';
import {
  Activity,
  Award,
  Bell,
  Building2,
  Calendar,
  CreditCard,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Settings,
  Trophy,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

export interface SidebarLink {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function getLinksForRole(role: string): SidebarLink[] {
  if (role === 'trainer') {
    return [
      { id: 'overview', label: 'Overview', path: '/trainer', icon: LayoutDashboard },
      { id: 'availability', label: 'Manage Availability', path: '/trainer/availability', icon: Calendar },
      { id: 'sessions', label: 'Upcoming & Requests', path: '/trainer/sessions', icon: Activity },
      { id: 'history', label: 'Session History', path: '/trainer/history', icon: Trophy },
      { id: 'profile', label: 'Trainer Profile', path: '/trainer/profile', icon: Award },
      { id: 'notifications', label: 'Notifications', path: '/trainer/notifications', icon: Bell },
      { id: 'settings', label: 'Settings', path: '/trainer/settings', icon: Settings },
    ];
  }
  if (role === 'facility_owner') {
    return [
      { id: 'overview', label: 'Owner Overview', path: '/owner', icon: LayoutDashboard },
      { id: 'facilities', label: 'My Facilities', path: '/owner/facilities', icon: Building2 },
      { id: 'slots', label: 'Hours, Pricing & Slots', path: '/owner/slots', icon: Calendar },
      { id: 'bookings', label: 'Booking Management', path: '/owner/bookings', icon: Activity },
      { id: 'notifications', label: 'Notifications', path: '/owner/notifications', icon: Bell },
    ];
  }
  if (role === 'admin') {
    return [
      { id: 'overview', label: 'Admin Overview', path: '/admin', icon: LayoutDashboard },
      { id: 'users', label: 'Customers & Users', path: '/admin/users', icon: Users },
      { id: 'trainers', label: 'Trainer Approvals', path: '/admin/trainers', icon: Award },
      { id: 'sports', label: 'Sports Categories', path: '/admin/sports', icon: Trophy },
      { id: 'facilities', label: 'Facility Directory', path: '/admin/facilities', icon: Building2 },
      { id: 'bookings', label: 'All Bookings', path: '/admin/bookings', icon: Calendar },
      { id: 'payments', label: 'Payment Ledger', path: '/admin/payments', icon: CreditCard },
      { id: 'reviews', label: 'Review Moderation', path: '/admin/reviews', icon: MessageSquare },
      { id: 'issues', label: 'Reported Issues', path: '/admin/issues', icon: Flag },
    ];
  }
  return [
    { id: 'overview', label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
    { id: 'sports', label: 'Browse Sports', path: '/sports', icon: Trophy },
    { id: 'facilities', label: 'Explore Facilities', path: '/facilities', icon: Search },
    { id: 'trainers', label: 'Trainer Discovery', path: '/trainers', icon: Award },
    { id: 'bookings', label: 'My Bookings', path: '/dashboard/bookings', icon: Calendar },
    { id: 'history', label: 'Booking History', path: '/dashboard/history', icon: Activity },
    { id: 'payments', label: 'Payment History', path: '/dashboard/payments', icon: CreditCard },
    { id: 'profile', label: 'My Profile', path: '/dashboard/profile', icon: User },
    { id: 'notifications', label: 'Notifications', path: '/dashboard/notifications', icon: Bell },
    { id: 'settings', label: 'Settings & Help', path: '/dashboard/settings', icon: Settings },
  ];
}

export function DashboardShell({
  currentPath,
  onNavigate,
  breadcrumb,
  children,
}: {
  currentPath: string;
  onNavigate: (path: string) => void;
  breadcrumb: string;
  children: React.ReactNode;
}) {
  const { user, logout, notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  if (!user) return null;
  const links = getLinksForRole(user.role);

  const roleLabel =
    user.role === 'facility_owner'
      ? 'Facility Owner'
      : user.role === 'admin'
      ? 'Administrator'
      : user.role === 'trainer'
      ? 'Trainer'
      : 'Customer';

  const handleLogout = async () => {
    await logout();
    onNavigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#0B132B] text-slate-200 border-r border-slate-800">
        <div className="flex h-16 items-center justify-between px-6 border-b border-slate-800/80">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            className="font-sporty italic text-2xl tracking-wider text-white whitespace-nowrap"
          >
            ARENA<span className="text-sky-400">360</span>
          </a>
        </div>

        <div className="px-4 pt-5 pb-2">
          <p className="px-3 text-xs font-medium text-slate-400">{roleLabel} Workspace</p>
        </div>

        <nav aria-label="Workspace Navigation" className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {links.map((link) => {
            const Icon = link.icon;
            const active = currentPath === link.path;
            return (
              <button
                key={link.path}
                type="button"
                onClick={() => onNavigate(link.path)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{link.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-semibold text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setSidebarOpen(false)} />
          <aside className="relative flex w-64 flex-col bg-[#0B132B] text-slate-200 shadow-xl">
            <div className="flex h-16 items-center justify-between px-5 border-b border-slate-800">
              <span className="font-sporty italic text-xl tracking-wider text-white">
                ARENA<span className="text-sky-400">360</span>
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
                className="rounded-lg p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
              {links.map((link) => {
                const Icon = link.icon;
                const active = currentPath === link.path;
                return (
                  <button
                    key={link.path}
                    type="button"
                    onClick={() => {
                      setSidebarOpen(false);
                      onNavigate(link.path);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left ${
                      active ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{link.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-slate-800 p-4">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col lg:pl-64 min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open workspace navigation"
              className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-sm font-medium text-slate-600">
              <span className="font-sporty italic text-xs tracking-wider text-slate-500">ARENA360</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-900 font-semibold">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 relative">
            <button
              type="button"
              onClick={() => onNavigate('/facilities')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            >
              <Search className="h-3.5 w-3.5" />
              <span>{user.role === 'customer' ? 'Book Court' : 'Public Directory'}</span>
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen((o) => !o)}
              aria-label="View notifications"
              className="relative rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] font-bold text-white tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-900">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllNotificationsRead()}
                      className="text-xs font-medium text-sky-600 hover:text-sky-700"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-500">No notifications yet.</p>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => markNotificationRead(n.id)}
                        className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                          n.is_read ? 'opacity-70' : 'bg-sky-50/40'
                        }`}
                      >
                        <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
