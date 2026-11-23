import React, { useEffect, useState } from 'react';
import { Calendar, CreditCard, RefreshCw, Star, Upload } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { BookingRecord, FacilitySlot, PaymentRecord, Sport } from '../types.ts';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Modal,
  SafeImage,
  SkeletonRows,
  StatusText,
} from '../components/ui/Primitives.tsx';
import { PaymentCheckoutModal, type CheckoutTarget } from '../components/booking/PaymentCheckoutModal.tsx';

export function CustomerDashboard({
  section,
  onNavigate,
}: {
  section: string;
  onNavigate: (path: string) => void;
}) {
  const { user, refreshUser, notifications, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [sportsList, setSportsList] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // History filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');

  // Modals
  const [cancelTarget, setCancelTarget] = useState<BookingRecord | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState<BookingRecord | null>(null);
  const [reschedDate, setReschedDate] = useState('');
  const [reschedSlots, setReschedSlots] = useState<FacilitySlot[]>([]);
  const [reschedSlotLabel, setReschedSlotLabel] = useState('');
  const [reschedBusy, setReschedBusy] = useState(false);

  const [reviewTarget, setReviewTarget] = useState<BookingRecord | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  // Profile form
  const [profName, setProfName] = useState(user?.name || '');
  const [profEmail, setProfEmail] = useState(user?.email || '');
  const [profPhone, setProfPhone] = useState(user?.phone || '');
  const [profCity, setProfCity] = useState(user?.city || '');
  const [profAddress, setProfAddress] = useState(user?.address || '');
  const [profEmergency, setProfEmergency] = useState(user?.emergency_contact || '');
  const [profSports, setProfSports] = useState<string[]>(user?.preferred_sports || []);
  const [profAvatar, setProfAvatar] = useState<string | null>(user?.avatar_url || null);
  const [notifEmail, setNotifEmail] = useState(user?.notification_email ?? true);
  const [notifSms, setNotifSms] = useState(user?.notification_sms ?? false);
  const [profBusy, setProfBusy] = useState(false);

  // Report Issue form
  const [issueSubject, setIssueSubject] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [issueType, setIssueType] = useState<'facility' | 'trainer' | 'booking' | 'payment' | 'other'>('other');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, pRes, sRes] = await Promise.all([
        api.get<{ bookings: BookingRecord[] }>('/api/bookings/my'),
        api.get<{ payments: PaymentRecord[] }>('/api/payments/my'),
        api.get<{ sports: Sport[] }>('/api/sports'),
      ]);
      setBookings(bRes.bookings || []);
      setPayments(pRes.payments || []);
      setSportsList(sRes.sports || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (user) {
      setProfName(user.name);
      setProfEmail(user.email);
      setProfPhone(user.phone || '');
      setProfCity(user.city || '');
      setProfAddress(user.address || '');
      setProfEmergency(user.emergency_contact || '');
      setProfSports(user.preferred_sports || []);
      setProfAvatar(user.avatar_url || null);
      setNotifEmail(user.notification_email);
      setNotifSms(user.notification_sms);
    }
  }, [user]);

  useEffect(() => {
    if (rescheduleTarget?.facility_id && reschedDate) {
      api
        .get<{ slots: FacilitySlot[] }>(
          `/api/facilities/${rescheduleTarget.facility_id}/availability?date=${reschedDate}`
        )
        .then((d) => {
          setReschedSlots(d.slots || []);
          setReschedSlotLabel('');
        })
        .catch(() => {});
    }
  }, [rescheduleTarget, reschedDate]);

  const handleCancelBooking = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const res = await api.post<{ message: string; refund_amount: number; explanation: string }>(
        `/api/bookings/${cancelTarget.id}/cancel`,
        { reason: 'Customer cancelled from My Bookings' }
      );
      setBanner(`${res.explanation} Refund processed: ₹${res.refund_amount}.`);
      setCancelTarget(null);
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Cancellation failed.');
    } finally {
      setCancelBusy(false);
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !reschedDate || !reschedSlotLabel) return;
    setReschedBusy(true);
    try {
      await api.post(`/api/bookings/${rescheduleTarget.id}/reschedule`, {
        booking_date: reschedDate,
        slot_label: reschedSlotLabel,
      });
      setBanner(`Booking ${rescheduleTarget.booking_ref} rescheduled to ${reschedDate} (${reschedSlotLabel}).`);
      setRescheduleTarget(null);
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to reschedule to that slot.');
    } finally {
      setReschedBusy(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setReviewBusy(true);
    try {
      await api.post('/api/reviews', {
        target_type: reviewTarget.booking_type,
        booking_id: reviewTarget.booking_type === 'facility' ? reviewTarget.id : undefined,
        trainer_session_id: reviewTarget.booking_type === 'trainer' ? reviewTarget.id : undefined,
        rating,
        comment,
      });
      setBanner('Thank you! Your review has been published.');
      setReviewTarget(null);
      setComment('');
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to submit review.');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfBusy(true);
    setError('');
    try {
      await api.put('/api/profile', {
        name: profName,
        email: profEmail,
        phone: profPhone,
        city: profCity,
        address: profAddress,
        emergency_contact: profEmergency,
        preferred_sports: profSports,
        avatar_url: profAvatar,
        notification_email: notifEmail,
        notification_sms: notifSms,
      });
      await refreshUser();
      setBanner('Personal profile and sports preferences saved.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update profile.');
    } finally {
      setProfBusy(false);
    }
  };

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setProfAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/issues', {
        target_type: issueType,
        subject: issueSubject,
        description: issueDesc,
      });
      setBanner('Issue submitted to ARENA360 administrators.');
      setIssueSubject('');
      setIssueDesc('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit issue.');
    }
  };

  const filteredBookings = bookings.filter((b) => {
    if (typeFilter !== 'all' && b.booking_type !== typeFilter) return false;
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (fromDate && b.booking_date < fromDate) return false;
    return true;
  });

  const upcomingBookings = bookings.filter((b) =>
    ['confirmed', 'rescheduled', 'payment_pending', 'pending'].includes(b.status)
  );
  const totalSpent = payments
    .filter((p) => p.status === 'verified')
    .reduce((sum, p) => sum + p.amount, 0);

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
      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
          {/* OVERVIEW */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0B132B]">
                    Welcome back, {user?.name}
                  </h1>
                  <p className="text-sm text-slate-600">
                    Manage your court reservations, coaching sessions, and payment receipts.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('/facilities')}
                    className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                  >
                    Book a Facility
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('/trainers')}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Book a Trainer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Upcoming Reservations</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                    {upcomingBookings.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Total Bookings</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                    {bookings.length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Verified Spend</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                    ₹{totalSpent}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Preferred Sports</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {user?.preferred_sports?.length ? user.preferred_sports.join(', ') : 'Not set'}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-slate-900">Next Upcoming</h2>
                  <button
                    type="button"
                    onClick={() => onNavigate('/dashboard/bookings')}
                    className="text-xs font-semibold text-sky-700"
                  >
                    View all
                  </button>
                </div>
                {upcomingBookings.length === 0 ? (
                  <EmptyState
                    title="No upcoming bookings"
                    description="Find a court or coach to schedule your next session."
                    actionLabel="Explore Facilities"
                    onAction={() => onNavigate('/facilities')}
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {upcomingBookings.slice(0, 4).map((b) => (
                      <div key={`${b.booking_type}-${b.id}`} className="rounded-lg border border-slate-200 p-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {b.booking_type === 'facility' ? b.facility_name : b.trainer_name}
                          </p>
                          <StatusText status={b.status} />
                        </div>
                        <p className="mt-1 font-mono text-xs text-slate-600">
                          {b.booking_date} · {b.slot_label} · ₹{b.total_amount}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MY BOOKINGS & HISTORY */}
          {(section === 'bookings' || section === 'history') && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0B132B]">
                    {section === 'history' ? 'Booking History' : 'My Bookings'}
                  </h1>
                  <p className="text-sm text-slate-600">
                    Filter reservations, complete pending checkouts, reschedule slots, cancel with refund policy, or review completed visits.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="bh-type" className="block text-xs font-medium text-slate-600 mb-1">
                    Booking Type
                  </label>
                  <select
                    id="bh-type"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="all">All Types</option>
                    <option value="facility">Facility Bookings</option>
                    <option value="trainer">Trainer Sessions</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bh-status" className="block text-xs font-medium text-slate-600 mb-1">
                    Status
                  </label>
                  <select
                    id="bh-status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="rescheduled">Rescheduled</option>
                    <option value="completed">Completed</option>
                    <option value="payment_pending">Payment Pending</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bh-date" className="block text-xs font-medium text-slate-600 mb-1">
                    From Date
                  </label>
                  <input
                    id="bh-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {filteredBookings.length === 0 ? (
                <EmptyState
                  title="No bookings match these filters"
                  description="Try resetting your filters or book a new facility slot."
                  actionLabel="Explore Facilities"
                  onAction={() => onNavigate('/facilities')}
                />
              ) : (
                <div className="space-y-3">
                  {filteredBookings.map((b) => (
                    <div
                      key={`${b.booking_type}-${b.id}`}
                      className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            {b.booking_ref}
                          </span>
                          <StatusText status={b.status} />
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {b.booking_type === 'facility'
                            ? b.facility_name
                            : `Coaching · ${b.trainer_name}`}
                        </h3>
                        <p className="text-xs text-slate-600">
                          {b.sport_name} · {b.facility_city} ·{' '}
                          <span className="font-mono">
                            {b.booking_date} ({b.slot_label})
                          </span>
                        </p>
                        {b.refund_amount !== undefined && b.refund_amount !== null && b.status === 'cancelled' && (
                          <p className="text-xs text-emerald-700 font-medium">
                            Refunded: ₹{b.refund_amount} ({b.refund_percentage}%)
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="font-mono text-base font-bold text-slate-900 tabular-nums mr-2">
                          ₹{b.total_amount}
                        </span>

                        {(b.status === 'payment_pending' || b.status === 'failed') && (
                          <button
                            type="button"
                            onClick={() =>
                              setCheckoutTarget({
                                type: b.booking_type,
                                referenceId: b.id,
                                bookingRef: b.booking_ref,
                                title:
                                  b.booking_type === 'facility'
                                    ? b.facility_name || 'Facility'
                                    : `Coaching · ${b.trainer_name}`,
                                subtitle: b.sport_name,
                                date: b.booking_date,
                                slotLabel: b.slot_label,
                                amount: b.total_amount,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            <span>{b.status === 'failed' ? 'Retry Payment' : 'Pay Now'}</span>
                          </button>
                        )}

                        {b.booking_type === 'facility' &&
                          (b.status === 'confirmed' || b.status === 'rescheduled') && (
                            <button
                              type="button"
                              onClick={() => {
                                setRescheduleTarget(b);
                                setReschedDate(b.booking_date);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>Reschedule</span>
                            </button>
                          )}

                        {b.booking_type === 'facility' &&
                          ['confirmed', 'rescheduled', 'payment_pending', 'pending'].includes(b.status) && (
                            <button
                              type="button"
                              onClick={() => setCancelTarget(b)}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              Cancel
                            </button>
                          )}

                        {b.status === 'completed' && !b.has_reviewed && (
                          <button
                            type="button"
                            onClick={() => {
                              setReviewTarget(b);
                              setRating(5);
                              setComment('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#0B132B] px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
                          >
                            <Star className="h-3.5 w-3.5" />
                            <span>Write Review</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PAYMENT HISTORY */}
          {section === 'payments' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">Payment History</h1>
                <p className="text-sm text-slate-600">Verified transaction receipts, payment methods, and refund records.</p>
              </div>
              {payments.length === 0 ? (
                <EmptyState
                  title="No payments recorded"
                  description="Your verified UPI and card transactions will appear here."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Payment Ref</th>
                        <th className="px-4 py-3">Booking</th>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                            {p.payment_ref}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-700">
                            {p.facility_name || p.trainer_name || 'Reservation'} ·{' '}
                            <span className="font-mono text-slate-500">{p.booking_ref || p.session_ref}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {p.method.toUpperCase()} {p.method_detail ? `(${p.method_detail})` : ''}
                          </td>
                          <td className="px-4 py-3">
                            <StatusText status={p.status} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            ₹{p.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PROFILE */}
          {section === 'profile' && (
            <div className="max-w-3xl space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">My Profile</h1>
                <p className="text-sm text-slate-600">
                  Update your contact details, avatar, and preferred sports categories.
                </p>
              </div>

              <form onSubmit={handleSaveProfile} className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
                <div className="flex items-center gap-4">
                  <SafeImage
                    src={profAvatar}
                    alt={profName}
                    className="h-16 w-16 rounded-xl object-cover shrink-0"
                    fallbackTitle={profName}
                  />
                  <div>
                    <label
                      htmlFor="avatar-upload"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Profile Photo</span>
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarFile}
                      className="hidden"
                    />
                    <p className="mt-1 text-xs text-slate-500">PNG or JPG recommended.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="p-name" className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      id="p-name"
                      type="text"
                      value={profName}
                      onChange={(e) => setProfName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-email" className="block text-xs font-medium text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      id="p-email"
                      type="email"
                      value={profEmail}
                      onChange={(e) => setProfEmail(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-phone" className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number
                    </label>
                    <input
                      id="p-phone"
                      type="tel"
                      value={profPhone}
                      onChange={(e) => setProfPhone(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="p-city" className="block text-xs font-medium text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      id="p-city"
                      type="text"
                      value={profCity}
                      onChange={(e) => setProfCity(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="p-addr" className="block text-xs font-medium text-slate-700 mb-1">
                      Address
                    </label>
                    <input
                      id="p-addr"
                      type="text"
                      value={profAddress}
                      onChange={(e) => setProfAddress(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="p-emerg" className="block text-xs font-medium text-slate-700 mb-1">
                      Emergency Contact
                    </label>
                    <input
                      id="p-emerg"
                      type="text"
                      value={profEmergency}
                      onChange={(e) => setProfEmergency(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-2">Preferred Sports</span>
                  <div className="flex flex-wrap gap-2">
                    {sportsList.map((s) => {
                      const active = profSports.includes(s.name);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setProfSports((prev) =>
                              active ? prev.filter((x) => x !== s.name) : [...prev, s.name]
                            )
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? 'border-sky-600 bg-sky-50 text-sky-900'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={profBusy}
                    className="rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                  >
                    {profBusy ? 'Saving...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* NOTIFICATIONS */}
          {section === 'notifications' && (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">Notifications</h1>
                <button
                  type="button"
                  onClick={() => markAllNotificationsRead()}
                  className="text-xs font-semibold text-sky-700 hover:text-sky-800"
                >
                  Mark all as read
                </button>
              </div>
              {notifications.length === 0 ? (
                <EmptyState title="No notifications" description="Booking confirmations and updates will appear here." />
              ) : (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {notifications.map((n) => (
                    <div key={n.id} className="flex items-start justify-between gap-4 p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                        <p className="mt-0.5 text-xs text-slate-600">{n.message}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">{n.created_at}</p>
                      </div>
                      {!n.is_read && (
                        <button
                          type="button"
                          onClick={() => markNotificationRead(n.id)}
                          className="shrink-0 text-xs font-semibold text-sky-700"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS & REPORT ISSUE */}
          {section === 'settings' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">Settings & Issue Support</h1>
                <p className="text-sm text-slate-600">Manage alert channels or report an issue to administrators.</p>
              </div>

              <form onSubmit={handleSaveProfile} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-base font-semibold text-slate-900">Notification Channels</h2>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="text-sm text-slate-700">Email booking confirmations & receipts</span>
                  <input
                    type="checkbox"
                    checked={notifEmail}
                    onChange={(e) => setNotifEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span className="text-sm text-slate-700">SMS reminders before scheduled sessions</span>
                  <input
                    type="checkbox"
                    checked={notifSms}
                    onChange={(e) => setNotifSms(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </label>
                <button
                  type="submit"
                  disabled={profBusy}
                  className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {profBusy ? 'Saving...' : 'Save Preferences'}
                </button>
              </form>

              <form onSubmit={handleReportIssue} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-base font-semibold text-slate-900">Report a Facility, Booking, or Payment Issue</h2>
                <div>
                  <label htmlFor="iss-type" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="iss-type"
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as typeof issueType)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="facility">Facility Condition</option>
                    <option value="booking">Booking Conflict</option>
                    <option value="payment">Payment / Refund</option>
                    <option value="trainer">Trainer Session</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="iss-subj" className="block text-xs font-medium text-slate-700 mb-1">
                    Subject
                  </label>
                  <input
                    id="iss-subj"
                    type="text"
                    required
                    value={issueSubject}
                    onChange={(e) => setIssueSubject(e.target.value)}
                    placeholder="Brief summary of the issue"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="iss-desc" className="block text-xs font-medium text-slate-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="iss-desc"
                    rows={3}
                    required
                    value={issueDesc}
                    onChange={(e) => setIssueDesc(e.target.value)}
                    placeholder="Provide details so an admin can resolve it quickly..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0B132B] px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
                >
                  Submit Report
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* Cancel Confirm */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title={`Cancel Booking ${cancelTarget?.booking_ref || ''}`}
        description="Cancellations 24+ hours before start receive a 100% refund; 6–24 hours receive 50%; under 6 hours are non-refundable. Release this slot now?"
        confirmLabel="Confirm Cancellation"
        destructive
        loading={cancelBusy}
        onConfirm={handleCancelBooking}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Reschedule Modal */}
      <Modal
        open={Boolean(rescheduleTarget)}
        title={`Reschedule ${rescheduleTarget?.booking_ref || ''}`}
        onClose={() => setRescheduleTarget(null)}
      >
        <form onSubmit={handleReschedule} className="space-y-4">
          <div>
            <label htmlFor="rs-date" className="block text-xs font-medium text-slate-700 mb-1">
              New Date
            </label>
            <input
              id="rs-date"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={reschedDate}
              onChange={(e) => setReschedDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-700 mb-2">Available Slots</p>
            <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto">
              {reschedSlots.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={!s.is_available}
                  onClick={() => setReschedSlotLabel(s.slot_label)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs ${
                    !s.is_available
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : reschedSlotLabel === s.slot_label
                      ? 'border-sky-600 bg-sky-50 text-sky-900 font-semibold'
                      : 'border-slate-200 hover:border-sky-400'
                  }`}
                >
                  <span className="font-mono">{s.slot_label}</span>
                  <span className="block text-[11px]">{s.is_available ? 'Open' : s.state}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRescheduleTarget(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!reschedSlotLabel || reschedBusy}
              className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {reschedBusy ? 'Updating...' : 'Confirm Reschedule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Review Modal */}
      <Modal
        open={Boolean(reviewTarget)}
        title={`Rate & Review ${reviewTarget?.facility_name || reviewTarget?.trainer_name || ''}`}
        onClose={() => setReviewTarget(null)}
      >
        <form onSubmit={handleSubmitReview} className="space-y-4">
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">Rating (1 to 5 Stars)</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    rating >= n ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-400'
                  }`}
                >
                  {n} ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="rev-comment" className="block text-xs font-medium text-slate-700 mb-1">
              Your Review
            </label>
            <textarea
              id="rev-comment"
              rows={3}
              required
              minLength={5}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share surface quality, lighting, amenities, or coaching feedback..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReviewTarget(null)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reviewBusy}
              className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white"
            >
              {reviewBusy ? 'Publishing...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </Modal>

      <PaymentCheckoutModal
        target={checkoutTarget}
        onClose={() => setCheckoutTarget(null)}
        onSuccess={() => {
          setCheckoutTarget(null);
          loadData();
        }}
      />
    </div>
  );
}
