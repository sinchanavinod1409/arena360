import React, { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { ConfirmDialog, ErrorBanner, Modal, SkeletonRows, StatusText } from '../components/ui/Primitives.tsx';

interface AdminOverviewData {
  users: Array<{ id: number; name: string; email: string; phone: string | null; role: string; is_active: number; created_at: string }>;
  trainers: Array<{ id: number; user_id: number; name: string; email: string; experience_years: number; session_price: number; city: string; approval_status: string }>;
  sports: Array<{ id: number; name: string; slug: string; description: string; is_active: number }>;
  facilities: Array<{ id: number; name: string; owner_name: string; city: string; price_per_hour: number; is_active: number }>;
  bookings: Array<{ id: number; booking_ref: string; customer_name: string; facility_name: string; sport_name: string; booking_date: string; slot_label: string; total_amount: number; status: string }>;
  payments: Array<{ id: number; payment_ref: string; user_name: string; method: string; amount: number; status: string; created_at: string }>;
  reviews: Array<{ id: number; reviewer_name: string; facility_name: string | null; trainer_name: string | null; rating: number; comment: string; moderation_status: string }>;
  issues: Array<{ id: number; reporter_name: string; target_type: string; subject: string; description: string; status: string; admin_notes: string }>;
  analytics: {
    sportBreakdown: Array<{ sport: string; bookings: number; revenue: number }>;
    totalRevenue: number;
  };
}

export function AdminDashboard({ section }: { section: string }) {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // New Sport form
  const [sportName, setSportName] = useState('');
  const [sportDesc, setSportDesc] = useState('');

  // Admin-only create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [newUserRole, setNewUserRole] = useState<'trainer' | 'facility_owner' | 'customer'>('trainer');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserCity, setNewUserCity] = useState('Bengaluru');
  const [newUserBiz, setNewUserBiz] = useState('');
  const [newTrainerExp, setNewTrainerExp] = useState(5);
  const [newTrainerPrice, setNewTrainerPrice] = useState(1200);
  const [newTrainerBio, setNewTrainerBio] = useState('');
  const [newTrainerCerts, setNewTrainerCerts] = useState('NIS Certified Coach');
  const [newTrainerSports, setNewTrainerSports] = useState<number[]>([]);

  // Confirmation dialog state
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    destructive: boolean;
    run: () => Promise<void>;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<AdminOverviewData>('/api/admin/overview');
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to load admin console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAddSport = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/admin/sports', { name: sportName, description: sportDesc });
      setBanner(`Added sport category "${sportName}".`);
      setSportName('');
      setSportDesc('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add sport.');
    }
  };

  const openCreateModal = (role: 'trainer' | 'facility_owner' | 'customer') => {
    setNewUserRole(role);
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPhone('');
    setNewUserPassword('user@123');
    setNewUserCity('Bengaluru');
    setNewUserBiz('');
    setNewTrainerExp(5);
    setNewTrainerPrice(1200);
    setNewTrainerBio('');
    setNewTrainerCerts('NIS Certified Coach');
    setNewTrainerSports([]);
    setCreateOpen(true);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCreateBusy(true);
    try {
      const res = await api.post<{ message: string }>('/api/admin/users', {
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        phone: newUserPhone.trim(),
        password: newUserPassword,
        role: newUserRole,
        city: newUserCity.trim() || 'Bengaluru',
        businessName: newUserRole === 'facility_owner' ? newUserBiz.trim() || undefined : undefined,
        bio: newUserRole === 'trainer' ? newTrainerBio.trim() || undefined : undefined,
        experienceYears: newUserRole === 'trainer' ? Number(newTrainerExp) : undefined,
        sessionPrice: newUserRole === 'trainer' ? Number(newTrainerPrice) : undefined,
        certifications:
          newUserRole === 'trainer'
            ? newTrainerCerts
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean)
            : undefined,
        sportIds: newUserRole === 'trainer' && newTrainerSports.length > 0 ? newTrainerSports : undefined,
      });
      setBanner(res.message);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create account.');
    } finally {
      setCreateBusy(false);
    }
  };

  if (loading) return <SkeletonRows count={5} />;
  if (!data) return <ErrorBanner message={error || 'Admin access required.'} onRetry={load} />;

  return (
    <div className="space-y-6">
      {banner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner('')} className="text-xs font-semibold underline">
            Dismiss
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* OVERVIEW */}
      {section === 'overview' && (
        <div className="space-y-6">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Administrator Control Center</h1>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Registered Users</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">{data.users.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Active Facilities</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                {data.facilities.filter((f) => f.is_active).length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Pending Trainers</p>
              <p className="mt-1 font-mono text-2xl font-bold text-amber-700 tabular-nums">
                {data.trainers.filter((t) => t.approval_status === 'pending').length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs text-slate-500">Verified Platform Revenue</p>
              <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                ₹{data.analytics.totalRevenue}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">Bookings & Revenue by Sport</h2>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-5 py-3">Sport</th>
                  <th className="px-5 py-3">Bookings</th>
                  <th className="px-5 py-3 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.analytics.sportBreakdown.map((row) => (
                  <tr key={row.sport}>
                    <td className="px-5 py-3 font-medium text-slate-900">{row.sport}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{row.bookings}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-emerald-700">
                      ₹{row.revenue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USERS */}
      {section === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold text-[#0B132B]">Customer & Account Management</h1>
            <button
              type="button"
              onClick={() => openCreateModal('facility_owner')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              <span>Create Trainer / Facility Owner</span>
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{u.email}</td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-700">{u.role.replace('_', ' ')}</td>
                    <td className="px-4 py-3">
                      <StatusText status={u.is_active ? 'approved' : 'cancelled'} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: u.is_active ? `Suspend ${u.name}` : `Activate ${u.name}`,
                              description: `Confirm changing account status for ${u.email}.`,
                              destructive: Boolean(u.is_active),
                              run: async () => {
                                await api.patch(`/api/admin/users/${u.id}/status`, { is_active: !u.is_active });
                                setBanner(`Updated account status for ${u.name}.`);
                                await load();
                              },
                            })
                          }
                          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {u.is_active ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TRAINER APPROVALS */}
      {section === 'trainers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-display text-2xl font-bold text-[#0B132B]">Trainer Verification & Approvals</h1>
            <button
              type="button"
              onClick={() => openCreateModal('trainer')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              <span>Add Certified Trainer</span>
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Trainer</th>
                  <th className="px-4 py-3">City & Exp</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.trainers.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500">{t.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {t.city} · {t.experience_years} yrs
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">₹{t.session_price}</td>
                    <td className="px-4 py-3">
                      <StatusText status={t.approval_status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      {t.approval_status !== 'approved' && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: `Approve Trainer ${t.name}`,
                              description: 'Approved trainers become immediately visible for public booking.',
                              destructive: false,
                              run: async () => {
                                await api.patch(`/api/admin/trainers/${t.id}/approval`, { approval_status: 'approved' });
                                setBanner(`${t.name} approved.`);
                                await load();
                              },
                            })
                          }
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                        >
                          Approve
                        </button>
                      )}
                      {t.approval_status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmAction({
                              title: `Reject Trainer ${t.name}`,
                              description: 'Rejecting removes this trainer from public listings.',
                              destructive: true,
                              run: async () => {
                                await api.patch(`/api/admin/trainers/${t.id}/approval`, { approval_status: 'rejected' });
                                setBanner(`${t.name} rejected.`);
                                await load();
                              },
                            })
                          }
                          className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700"
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SPORTS MANAGEMENT */}
      {section === 'sports' && (
        <div className="space-y-6">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Sports Category Management</h1>

          <form onSubmit={handleAddSport} className="rounded-xl border border-slate-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label htmlFor="sp-name" className="block text-xs font-medium text-slate-700 mb-1">
                Sport Name
              </label>
              <input
                id="sp-name"
                required
                type="text"
                value={sportName}
                onChange={(e) => setSportName(e.target.value)}
                placeholder="Table Tennis"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="sp-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                id="sp-desc"
                required
                type="text"
                value={sportDesc}
                onChange={(e) => setSportDesc(e.target.value)}
                placeholder="ITTF regulation indoor tables & robot practice."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="rounded-lg bg-[#0B132B] px-4 py-2.5 text-xs font-semibold text-white">
              Add Sport Category
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.sports.map((s) => (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{s.name}</h3>
                  <p className="mt-1 text-xs text-slate-600">{s.description}</p>
                </div>
                {Boolean(s.is_active) && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: `Remove Sport "${s.name}"`,
                        description: 'Deactivate this sport category from public discovery?',
                        destructive: true,
                        run: async () => {
                          await api.delete(`/api/admin/sports/${s.id}`);
                          await load();
                        },
                      })
                    }
                    className="text-xs font-semibold text-rose-700 shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FACILITIES */}
      {section === 'facilities' && (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Facility Directory</h1>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Venue</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.facilities.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{f.name}</p>
                      <p className="text-xs text-slate-500">{f.city}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{f.owner_name}</td>
                    <td className="px-4 py-3 font-mono text-xs">₹{f.price_per_hour}/hr</td>
                    <td className="px-4 py-3">
                      <StatusText status={f.is_active ? 'approved' : 'cancelled'} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.patch(`/api/admin/facilities/${f.id}/status`, { is_active: !f.is_active });
                          await load();
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {f.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BOOKINGS */}
      {section === 'bookings' && (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Platform Bookings Monitor</h1>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Ref</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3">Schedule</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.bookings.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-mono text-xs">{b.booking_ref}</td>
                    <td className="px-4 py-3 text-xs font-medium">{b.customer_name}</td>
                    <td className="px-4 py-3 text-xs">{b.facility_name} ({b.sport_name})</td>
                    <td className="px-4 py-3 font-mono text-xs">{b.booking_date} · {b.slot_label}</td>
                    <td className="px-4 py-3"><StatusText status={b.status} /></td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold">₹{b.total_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENTS */}
      {section === 'payments' && (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Payment Ledger</h1>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Payment Ref</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono text-xs">{p.payment_ref}</td>
                    <td className="px-4 py-3 text-xs">{p.user_name}</td>
                    <td className="px-4 py-3 text-xs uppercase">{p.method}</td>
                    <td className="px-4 py-3"><StatusText status={p.status} /></td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold">₹{p.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REVIEW MODERATION */}
      {section === 'reviews' && (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Review Moderation</h1>
          <div className="space-y-3">
            {data.reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {r.reviewer_name} · {r.facility_name || r.trainer_name} ({r.rating}/5 ★)
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{r.comment}</p>
                  <div className="mt-2"><StatusText status={r.moderation_status} /></div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/api/admin/reviews/${r.id}`, { moderation_status: 'approved' });
                      await load();
                    }}
                    className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/api/admin/reviews/${r.id}`, { moderation_status: 'removed' });
                      await load();
                    }}
                    className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPORTED ISSUES */}
      {section === 'issues' && (
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-bold text-[#0B132B]">Reported Issues Triage</h1>
          <div className="space-y-3">
            {data.issues.map((iss) => (
              <div key={iss.id} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase text-slate-500">{iss.target_type}</span>
                    <StatusText status={iss.status} />
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{iss.subject}</h3>
                  <p className="mt-1 text-sm text-slate-600">{iss.description}</p>
                  <p className="mt-1 text-xs text-slate-400">Reported by {iss.reporter_name}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {iss.status !== 'resolved' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.patch(`/api/admin/issues/${iss.id}`, { status: 'resolved', admin_notes: 'Resolved by administrator' });
                        setBanner(`Issue #${iss.id} marked resolved.`);
                        await load();
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Mark Resolved
                    </button>
                  )}
                  {iss.status === 'open' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await api.patch(`/api/admin/issues/${iss.id}`, { status: 'in_review' });
                        await load();
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      In Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        title="Provision Account (Admin Only)"
        onClose={() => setCreateOpen(false)}
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <div>
            <label htmlFor="adm-role" className="block text-xs font-medium text-slate-700 mb-1">
              Account Role
            </label>
            <select
              id="adm-role"
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as 'trainer' | 'facility_owner' | 'customer')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="trainer">Certified Sports Trainer</option>
              <option value="facility_owner">Facility Owner</option>
              <option value="customer">Customer</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="adm-name" className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="adm-name"
                required
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Deepak Rao"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="adm-city" className="block text-xs font-medium text-slate-700 mb-1">
                City
              </label>
              <input
                id="adm-city"
                required
                type="text"
                value={newUserCity}
                onChange={(e) => setNewUserCity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="adm-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                id="adm-email"
                required
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="deepak@gmail.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="adm-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                id="adm-phone"
                required
                type="tel"
                value={newUserPhone}
                onChange={(e) => setNewUserPhone(e.target.value)}
                placeholder="9845012345"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="adm-pw" className="block text-xs font-medium text-slate-700 mb-1">
              Initial Password (min 8 chars)
            </label>
            <input
              id="adm-pw"
              required
              minLength={8}
              type="password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {newUserRole === 'facility_owner' && (
            <div>
              <label htmlFor="adm-biz" className="block text-xs font-medium text-slate-700 mb-1">
                Sports Complex / Business Name
              </label>
              <input
                id="adm-biz"
                type="text"
                value={newUserBiz}
                onChange={(e) => setNewUserBiz(e.target.value)}
                placeholder="Bengaluru Arena Ventures LLP"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          )}

          {newUserRole === 'trainer' && (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="adm-exp" className="block text-xs font-medium text-slate-700 mb-1">
                    Experience (Years)
                  </label>
                  <input
                    id="adm-exp"
                    type="number"
                    min={0}
                    max={50}
                    value={newTrainerExp}
                    onChange={(e) => setNewTrainerExp(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="adm-fee" className="block text-xs font-medium text-slate-700 mb-1">
                    Session Fee (₹)
                  </label>
                  <input
                    id="adm-fee"
                    type="number"
                    min={100}
                    value={newTrainerPrice}
                    onChange={(e) => setNewTrainerPrice(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="adm-certs" className="block text-xs font-medium text-slate-700 mb-1">
                  Certifications (comma-separated)
                </label>
                <input
                  id="adm-certs"
                  type="text"
                  value={newTrainerCerts}
                  onChange={(e) => setNewTrainerCerts(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="adm-bio" className="block text-xs font-medium text-slate-700 mb-1">
                  Coaching Bio
                </label>
                <textarea
                  id="adm-bio"
                  rows={2}
                  value={newTrainerBio}
                  onChange={(e) => setNewTrainerBio(e.target.value)}
                  placeholder="Specialist coaching profile in Bengaluru..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-slate-700 mb-1.5">Assigned Sports</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.sports
                    .filter((s) => Boolean(s.is_active))
                    .map((s) => {
                      const active = newTrainerSports.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setNewTrainerSports((prev) =>
                              active ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            active ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createBusy}
              className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {createBusy ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ''}
        description={confirmAction?.description || ''}
        destructive={confirmAction?.destructive}
        onConfirm={async () => {
          if (confirmAction) {
            await confirmAction.run();
            setConfirmAction(null);
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
