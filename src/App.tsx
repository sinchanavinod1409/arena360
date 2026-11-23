import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { PublicHeader } from './components/layout/PublicHeader.tsx';
import { DashboardShell } from './components/layout/DashboardShell.tsx';
import {
  FacilityDetailsPage,
  FacilityDiscoveryPage,
  LandingPage,
  SportsDiscoveryPage,
  TrainerDiscoveryPage,
  TrainerProfilePage,
} from './pages/PublicPages.tsx';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages.tsx';
import { CustomerDashboard } from './pages/CustomerDashboard.tsx';
import { TrainerDashboard } from './pages/TrainerDashboard.tsx';
import { OwnerDashboard } from './pages/OwnerDashboard.tsx';
import { AdminDashboard } from './pages/AdminDashboard.tsx';
import { SkeletonRows } from './components/ui/Primitives.tsx';

function AccessDenied({
  requiredRole,
  onNavigate,
}: {
  requiredRole: string;
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuth();
  const home =
    user?.role === 'admin'
      ? '/admin'
      : user?.role === 'facility_owner'
      ? '/owner'
      : user?.role === 'trainer'
      ? '/trainer'
      : '/dashboard';

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="rounded-xl border border-rose-200 bg-white p-8">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-600" />
        <h1 className="mt-3 font-display text-2xl font-bold text-slate-900">Access Restricted (403)</h1>
        <p className="mt-2 text-sm text-slate-600">
          This workspace requires <span className="font-semibold">{requiredRole}</span> privileges.
        </p>
        <button
          type="button"
          onClick={() => onNavigate(user ? home : '/login')}
          className="mt-6 rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600"
        >
          {user ? 'Return to My Workspace' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

function RouterView() {
  const { user, loading } = useAuth();
  const [fullPath, setFullPath] = useState<string>(() => window.location.pathname + window.location.search);

  useEffect(() => {
    const onPop = () => setFullPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: string) => {
    if (next !== fullPath) {
      window.history.pushState({}, '', next);
      setFullPath(next);
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  };

  const [pathname, searchStr] = fullPath.split('?');
  const params = new URLSearchParams(searchStr || '');

  // Check if path is an authenticated dashboard route
  const isCustomerDash = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isTrainerDash = pathname === '/trainer' || pathname.startsWith('/trainer/');
  const isOwnerDash = pathname === '/owner' || pathname.startsWith('/owner/');
  const isAdminDash = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAnyDash = isCustomerDash || isTrainerDash || isOwnerDash || isAdminDash;

  if (loading && isAnyDash) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (isAnyDash && !user) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader currentPath={pathname} onNavigate={navigate} />
        <LoginPage onNavigate={navigate} />
      </div>
    );
  }

  // RBAC Enforcement on Frontend Routes (mirrored on Backend APIs)
  if (isAdminDash && user && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader currentPath={pathname} onNavigate={navigate} />
        <AccessDenied requiredRole="Administrator" onNavigate={navigate} />
      </div>
    );
  }
  if (isOwnerDash && user && user.role !== 'facility_owner' && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader currentPath={pathname} onNavigate={navigate} />
        <AccessDenied requiredRole="Facility Owner" onNavigate={navigate} />
      </div>
    );
  }
  if (isTrainerDash && user && user.role !== 'trainer' && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50">
        <PublicHeader currentPath={pathname} onNavigate={navigate} />
        <AccessDenied requiredRole="Trainer" onNavigate={navigate} />
      </div>
    );
  }

  if (isCustomerDash && user) {
    const sub = pathname.replace('/dashboard', '').replace(/^\//, '') || 'overview';
    const breadcrumbMap: Record<string, string> = {
      overview: 'Customer Overview',
      bookings: 'My Bookings',
      history: 'Booking History',
      payments: 'Payment History',
      profile: 'My Profile',
      notifications: 'Notifications',
      settings: 'Settings & Issue Support',
    };
    return (
      <DashboardShell
        currentPath={pathname}
        onNavigate={navigate}
        breadcrumb={breadcrumbMap[sub] || 'Customer Dashboard'}
      >
        <CustomerDashboard section={sub} onNavigate={navigate} />
      </DashboardShell>
    );
  }

  if (isTrainerDash && user) {
    const sub = pathname.replace('/trainer', '').replace(/^\//, '') || 'overview';
    const breadcrumbMap: Record<string, string> = {
      overview: 'Trainer Overview',
      availability: 'Manage Availability',
      sessions: 'Upcoming & Session Requests',
      history: 'Session History',
      profile: 'Trainer Profile',
      notifications: 'Notifications',
      settings: 'Settings',
    };
    return (
      <DashboardShell
        currentPath={pathname}
        onNavigate={navigate}
        breadcrumb={breadcrumbMap[sub] || 'Trainer Workspace'}
      >
        <TrainerDashboard section={sub} />
      </DashboardShell>
    );
  }

  if (isOwnerDash && user) {
    const sub = pathname.replace('/owner', '').replace(/^\//, '') || 'overview';
    const breadcrumbMap: Record<string, string> = {
      overview: 'Facility Owner Overview',
      facilities: 'My Facilities',
      slots: 'Hours, Pricing & Slots',
      bookings: 'Booking Management',
      notifications: 'Notifications',
    };
    return (
      <DashboardShell
        currentPath={pathname}
        onNavigate={navigate}
        breadcrumb={breadcrumbMap[sub] || 'Owner Console'}
      >
        <OwnerDashboard section={sub} onNavigate={navigate} />
      </DashboardShell>
    );
  }

  if (isAdminDash && user) {
    const sub = pathname.replace('/admin', '').replace(/^\//, '') || 'overview';
    const breadcrumbMap: Record<string, string> = {
      overview: 'Admin Overview',
      users: 'Customer & Account Management',
      trainers: 'Trainer Approvals',
      sports: 'Sports Category Management',
      facilities: 'Facility Directory',
      bookings: 'Platform Bookings',
      payments: 'Payment Ledger',
      reviews: 'Review Moderation',
      issues: 'Reported Issues',
    };
    return (
      <DashboardShell
        currentPath={pathname}
        onNavigate={navigate}
        breadcrumb={breadcrumbMap[sub] || 'Admin Console'}
      >
        <AdminDashboard section={sub} />
      </DashboardShell>
    );
  }

  // Public Pages
  let pageContent: React.ReactNode = <LandingPage onNavigate={navigate} />;
  if (pathname === '/sports') {
    pageContent = <SportsDiscoveryPage onNavigate={navigate} />;
  } else if (pathname === '/facilities') {
    pageContent = <FacilityDiscoveryPage initialSport={params.get('sport') || 'all'} onNavigate={navigate} />;
  } else if (pathname.startsWith('/facilities/')) {
    const id = pathname.replace('/facilities/', '');
    pageContent = <FacilityDetailsPage facilityId={id} onNavigate={navigate} />;
  } else if (pathname === '/trainers') {
    pageContent = <TrainerDiscoveryPage initialSport={params.get('sport') || 'all'} onNavigate={navigate} />;
  } else if (pathname.startsWith('/trainers/')) {
    const id = pathname.replace('/trainers/', '');
    pageContent = <TrainerProfilePage trainerId={id} onNavigate={navigate} />;
  } else if (pathname === '/login') {
    pageContent = <LoginPage onNavigate={navigate} />;
  } else if (pathname === '/register') {
    pageContent = <RegisterPage onNavigate={navigate} />;
  } else if (pathname === '/forgot-password') {
    pageContent = <ForgotPasswordPage onNavigate={navigate} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <PublicHeader currentPath={pathname} onNavigate={navigate} />
      <main className="flex-1">{pageContent}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RouterView />
    </AuthProvider>
  );
}
