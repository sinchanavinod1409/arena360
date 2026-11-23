import React, { useEffect, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Star,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type {
  FacilityDetail,
  FacilitySlot,
  FacilitySummary,
  Sport,
  TrainerDetail,
  TrainerSummary,
} from '../types.ts';
import { ErrorBanner, SkeletonRows, StatusText } from '../components/ui/Primitives.tsx';
import { PaymentCheckoutModal, type CheckoutTarget } from '../components/booking/PaymentCheckoutModal.tsx';
import { LoginPage } from './AuthPages.tsx';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export function LandingPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { user } = useAuth();
  const [sportsCount, setSportsCount] = useState(12);
  const [trainersCount, setTrainersCount] = useState(6);

  useEffect(() => {
    Promise.all([
      api.get<{ sports: Sport[] }>('/api/sports'),
      api.get<{ trainers: TrainerSummary[] }>('/api/trainers'),
    ])
      .then(([s, t]) => {
        if (s.sports?.length) setSportsCount(s.sports.length);
        if (t.trainers?.length) setTrainersCount(t.trainers.length);
      })
      .catch(() => {});
  }, []);

  const workspaceRoute =
    user?.role === 'admin'
      ? '/admin'
      : user?.role === 'facility_owner'
      ? '/owner'
      : user?.role === 'trainer'
      ? '/trainer'
      : '/dashboard';

  return (
    <div className="bg-slate-50">
      {/* Compact Hero + 2 KPI Rectangles */}
      <section className="mx-auto max-w-4xl px-4 pt-10 pb-8 sm:px-6 lg:px-8 lg:pt-12 text-center">
        <p className="text-xs font-semibold tracking-wide text-sky-700">
          Verified Courts · Live Slot Locks · Certified Coaches
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-[#0B132B] sm:text-5xl text-balance leading-[1.08]">
          Book verified sports venues and coaching in real time.
        </h1>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl mx-auto text-left">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Bengaluru Sports</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
              {sportsCount} Disciplines
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500">Certified Coaches</p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
              {trainersCount} Approved
            </p>
          </div>
        </div>
      </section>

      {/* Sign In Section Shown Directly on Opening */}
      <section className="border-t border-slate-200 bg-slate-50">
        {user ? (
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6">
              <div>
                <p className="text-xs font-medium text-sky-700">Active Session</p>
                <h2 className="mt-1 font-display text-xl font-bold text-[#0B132B]">
                  Signed in as {user.name}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(workspaceRoute)}
                className="rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
              >
                Open Workspace
              </button>
            </div>
          </div>
        ) : (
          <LoginPage onNavigate={onNavigate} embedded />
        )}
      </section>
    </div>
  );
}

export function SportsDiscoveryPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<{ sports: Sport[] }>('/api/sports')
      .then((d) => setSports(d.sports || []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load sports'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-[#0B132B]">Sports Directory</h1>
        <p className="mt-1 text-sm text-slate-600">
          Choose a sport category to view verified venues, pricing, and available coaching sessions.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading ? (
        <SkeletonRows count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {sports.map((sport) => (
            <div
              key={sport.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white"
            >
              <div className="flex flex-1 flex-col p-5">
                <h2 className="text-lg font-semibold text-slate-900">{sport.name}</h2>
                <p className="mt-1.5 text-xs text-slate-600 flex-1 leading-relaxed">{sport.description}</p>
                <p className="mt-3 text-xs font-mono text-slate-500 tabular-nums">
                  {sport.facility_count ?? 0} venues · {sport.trainer_count ?? 0} trainers
                </p>
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => onNavigate(`/facilities?sport=${sport.slug}`)}
                    className="flex-1 rounded-lg bg-[#0B132B] px-3 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors"
                  >
                    View Facilities
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/trainers?sport=${sport.slug}`)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Coaches
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FacilityDiscoveryPage({
  initialSport = 'all',
  onNavigate,
}: {
  initialSport?: string;
  onNavigate: (path: string) => void;
}) {
  const [facilities, setFacilities] = useState<FacilitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sport, setSport] = useState(initialSport);

  useEffect(() => {
    setSport(initialSport);
  }, [initialSport]);

  const loadFacilities = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('city', 'Bengaluru');
      if (sport !== 'all') params.set('sport', sport);
      const data = await api.get<{ facilities: FacilitySummary[] }>(`/api/facilities?${params.toString()}`);
      setFacilities(data.facilities || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load facilities');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFacilities();
  }, [sport]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#0B132B]">Explore Bengaluru Sports Facilities</h1>
          <p className="mt-1 text-sm text-slate-600">
            Browse verified Bengaluru indoor and outdoor venues and reserve real-time court slots.
          </p>
        </div>
        {sport !== 'all' && (
          <button
            type="button"
            onClick={() => {
              setSport('all');
              onNavigate('/facilities');
            }}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Show All Facilities
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadFacilities} />}

      {loading ? (
        <SkeletonRows count={4} />
      ) : facilities.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-base font-semibold text-slate-900">No Bengaluru facilities available for this sport</p>
          <button
            type="button"
            onClick={() => {
              setSport('all');
              onNavigate('/facilities');
            }}
            className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white"
          >
            Show All Facilities
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {facilities.map((f) => (
            <div
              key={f.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs text-slate-500">
                  {f.sports.map((s) => s.name).join(' / ')} · {f.city}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">{f.name}</h2>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{f.address}</span>
                </p>
                <p className="mt-2 text-sm text-slate-600 line-clamp-2 flex-1">{f.description}</p>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                      ₹{f.price_per_hour}/hr
                    </p>
                    <p className="text-xs text-emerald-700 font-medium tabular-nums">
                      {f.available_slots_count} of {f.total_slots_count} slots open
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(`/facilities/${f.id}`)}
                    className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 transition-colors"
                  >
                    Select & Book
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FacilityDetailsPage({
  facilityId,
  onNavigate,
}: {
  facilityId: string;
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuth();
  const [facility, setFacility] = useState<FacilityDetail | null>(null);
  const [slots, setSlots] = useState<FacilitySlot[]>([]);
  const [date, setDate] = useState(todayStr());
  const [selectedSportId, setSelectedSportId] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<FacilitySlot | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  const loadSlots = async (id: number, dt: string) => {
    const data = await api.get<{ slots: FacilitySlot[] }>(`/api/facilities/${id}/availability?date=${dt}`);
    setSlots(data.slots || []);
    setSelectedSlot(null);
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get<{ facility: FacilityDetail }>(`/api/facilities/${facilityId}`)
      .then(async (res) => {
        setFacility(res.facility);
        if (res.facility.sports.length > 0) {
          setSelectedSportId(res.facility.sports[0].id);
        }
        await loadSlots(res.facility.id, date);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to load facility'))
      .finally(() => setLoading(false));
  }, [facilityId]);

  useEffect(() => {
    if (facility) {
      loadSlots(facility.id, date).catch(() => {});
    }
  }, [date]);

  const handleConfirmReservation = async () => {
    if (!facility || !selectedSlot) return;
    if (!user) {
      onNavigate('/login');
      return;
    }
    setBookingBusy(true);
    setError('');
    try {
      const res = await api.post<{ booking: { id: number; booking_ref: string; total_amount: number } }>('/api/bookings', {
        facility_id: facility.id,
        sport_id: selectedSportId || facility.sports[0]?.id,
        booking_date: date,
        slot_label: selectedSlot.slot_label,
        notes,
      });
      await loadSlots(facility.id, date);
      setCheckoutTarget({
        type: 'facility',
        referenceId: res.booking.id,
        bookingRef: res.booking.booking_ref,
        title: facility.name,
        subtitle: `${facility.address}, ${facility.city}`,
        date,
        slotLabel: selectedSlot.slot_label,
        amount: res.booking.total_amount,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reserve selected slot.');
      await loadSlots(facility.id, date);
    } finally {
      setBookingBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <SkeletonRows count={5} />
      </div>
    );
  }

  if (!facility) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <ErrorBanner message={error || 'Facility not found.'} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      <button
        type="button"
        onClick={() => onNavigate('/facilities')}
        className="text-xs font-semibold text-sky-700 hover:text-sky-800"
      >
        ← Back to Facilities
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Details + Reviews */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-medium text-slate-500">
              {facility.sports.map((s) => s.name).join(' · ')} · {facility.city}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-[#0B132B]">{facility.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <MapPin className="h-4 w-4 text-slate-400" />
              <span>{facility.address}, {facility.city}</span>
            </p>
            <p className="mt-4 text-sm text-slate-700 leading-relaxed">{facility.description}</p>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h2 className="text-xs font-semibold text-slate-700">Amenities & Venue Features</h2>
              <p className="mt-1.5 text-sm text-slate-600">{facility.amenities.join(' · ')}</p>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h2 className="text-xs font-semibold text-slate-700 mb-2">Operating Hours</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {facility.operating_hours.map((h) => (
                  <div key={h.day_of_week} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="font-semibold text-slate-900">{DAY_NAMES[h.day_of_week]}</p>
                    <p className="font-mono text-slate-600">
                      {h.is_closed ? 'Closed' : `${h.open_time} - ${h.close_time}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reviews */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Verified Athlete Reviews</h2>
              <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {facility.rating_avg.toFixed(1)} ★ ({facility.review_count})
              </span>
            </div>
            {facility.reviews.length === 0 ? (
              <p className="text-sm text-slate-500">No reviews published yet for this venue.</p>
            ) : (
              <div className="space-y-4">
                {facility.reviews.map((rev) => (
                  <div key={rev.id} className="border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{rev.reviewer_name}</p>
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-amber-500" />
                        {rev.rating}/5
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{rev.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Interactive Availability & Booking Panel */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-xl border border-slate-200 bg-white p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs text-slate-500">Hourly Rate</p>
                <p className="font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                  ₹{facility.price_per_hour}
                  <span className="text-xs font-normal text-slate-500"> / hour</span>
                </p>
              </div>
              <StatusText status="available" />
            </div>

            {error && <ErrorBanner message={error} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="book-sport" className="block text-xs font-medium text-slate-700 mb-1">
                  Sport Activity
                </label>
                <select
                  id="book-sport"
                  value={selectedSportId}
                  onChange={(e) => setSelectedSportId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-sky-600 focus:outline-none"
                >
                  {facility.sports.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="book-date" className="block text-xs font-medium text-slate-700 mb-1">
                  Select Date
                </label>
                <input
                  id="book-date"
                  type="date"
                  value={date}
                  min={todayStr()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Availability Slot Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-700">Live Slot Availability</span>
                <span className="text-[11px] text-slate-500">Select an open time slot</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot?.id === slot.id;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!slot.is_available}
                      onClick={() => setSelectedSlot(slot)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        !slot.is_available
                          ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                          : isSelected
                          ? 'border-sky-600 bg-sky-50 text-sky-900 ring-1 ring-sky-600'
                          : 'border-slate-200 bg-white text-slate-800 hover:border-sky-400'
                      }`}
                    >
                      <p className="font-mono text-xs font-semibold">{slot.slot_label}</p>
                      <p className="mt-0.5 text-[11px] capitalize">
                        {slot.is_available ? `Available · ₹${slot.price}` : slot.state}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="book-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Court / Equipment Notes (Optional)
              </label>
              <input
                id="book-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Need 2 rental racquets"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            {selectedSlot && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3.5 text-xs space-y-1">
                <p className="font-semibold text-slate-900">Booking Summary</p>
                <p className="text-slate-700">
                  {date} · <span className="font-mono">{selectedSlot.slot_label}</span>
                </p>
                <p className="font-mono font-bold text-slate-900">Total: ₹{selectedSlot.price}</p>
              </div>
            )}

            <button
              type="button"
              disabled={!selectedSlot || bookingBusy}
              onClick={handleConfirmReservation}
              className="w-full rounded-lg bg-[#0B132B] px-5 py-3 text-sm font-semibold text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {!user
                ? 'Sign In to Confirm & Pay'
                : bookingBusy
                ? 'Reserving Slot...'
                : selectedSlot
                ? `Reserve Slot & Pay ₹${selectedSlot.price}`
                : 'Select an Available Slot'}
            </button>
          </div>
        </div>
      </div>

      <PaymentCheckoutModal
        target={checkoutTarget}
        onClose={() => {
          setCheckoutTarget(null);
          loadSlots(facility.id, date).catch(() => {});
        }}
        onSuccess={() => {
          setCheckoutTarget(null);
          onNavigate('/dashboard/bookings');
        }}
      />
    </div>
  );
}

export function TrainerDiscoveryPage({
  initialSport = 'all',
  onNavigate,
}: {
  initialSport?: string;
  onNavigate: (path: string) => void;
}) {
  const [trainers, setTrainers] = useState<TrainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sport, setSport] = useState(initialSport);

  useEffect(() => {
    setSport(initialSport);
  }, [initialSport]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sport !== 'all') params.set('sport', sport);
      const res = await api.get<{ trainers: TrainerSummary[] }>(`/api/trainers?${params.toString()}`);
      setTrainers(res.trainers || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trainers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sport]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[#0B132B]">Certified Sports Trainers</h1>
          <p className="mt-1 text-sm text-slate-600">
            Book 1-on-1 coaching sessions with approved Bengaluru trainers across every indoor and outdoor sport.
          </p>
        </div>
        {sport !== 'all' && (
          <button
            type="button"
            onClick={() => {
              setSport('all');
              onNavigate('/trainers');
            }}
            className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Show All Coaches
          </button>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {loading ? (
        <SkeletonRows count={3} />
      ) : trainers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-base font-semibold text-slate-900">No coaches available for this sport</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {trainers.map((t) => (
            <div key={t.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-4">
                <div
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#0B132B] font-display text-lg font-bold text-white"
                >
                  {getInitials(t.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-900">{t.name}</h2>
                  <p className="text-xs text-slate-500">
                    {t.sports.map((s) => s.name).join(' · ')} · {t.city}
                  </p>
                  <p className="mt-1 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                    {t.experience_years} yrs exp · {t.rating_avg.toFixed(1)} ★ ({t.review_count})
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600 flex-1 line-clamp-3">{t.bio}</p>
              <p className="mt-3 text-xs text-slate-500">
                Certifications: {t.certifications.join(' · ')}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                <div>
                  <p className="font-mono text-base font-bold text-slate-900 tabular-nums">
                    ₹{t.session_price}/session
                  </p>
                  <p className="text-xs text-emerald-700 tabular-nums">{t.available_slots_count} open slots</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(`/trainers/${t.user_id}`)}
                  className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                >
                  Book Session
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrainerProfilePage({
  trainerId,
  onNavigate,
}: {
  trainerId: string;
  onNavigate: (path: string) => void;
}) {
  const { user } = useAuth();
  const [trainer, setTrainer] = useState<TrainerDetail | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [selectedSportId, setSelectedSportId] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkoutTarget, setCheckoutTarget] = useState<CheckoutTarget | null>(null);

  const loadTrainer = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ trainer: TrainerDetail }>(`/api/trainers/${trainerId}`);
      setTrainer(res.trainer);
      if (res.trainer.sports.length > 0) setSelectedSportId(res.trainer.sports[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trainer not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrainer();
  }, [trainerId]);

  const handleBookSession = async () => {
    if (!trainer || !selectedSlotId) return;
    if (!user) {
      onNavigate('/login');
      return;
    }
    const slot = trainer.availability.find((s) => s.id === selectedSlotId);
    if (!slot) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ session: { id: number; session_ref: string; total_amount: number } }>(
        '/api/sessions',
        {
          trainer_user_id: trainer.user_id,
          availability_id: selectedSlotId,
          sport_id: selectedSportId || trainer.sports[0]?.id,
          notes,
        }
      );
      await loadTrainer();
      setCheckoutTarget({
        type: 'trainer',
        referenceId: res.session.id,
        bookingRef: res.session.session_ref,
        title: `Coaching with ${trainer.name}`,
        subtitle: `${trainer.city} · ${trainer.sports.map((s) => s.name).join(', ')}`,
        date: slot.avail_date,
        slotLabel: slot.slot_label,
        amount: res.session.total_amount,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to book session');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <SkeletonRows count={4} />
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <ErrorBanner message={error || 'Trainer unavailable'} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <button
        type="button"
        onClick={() => onNavigate('/trainers')}
        className="text-xs font-semibold text-sky-700 hover:text-sky-800"
      >
        ← Back to Trainers
      </button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div
                aria-hidden="true"
                className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[#0B132B] font-display text-2xl font-bold text-white"
              >
                {getInitials(trainer.name)}
              </div>
              <div>
                <p className="text-xs font-medium text-sky-700">
                  Verified Coach · {trainer.sports.map((s) => s.name).join(' / ')}
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold text-[#0B132B]">{trainer.name}</h1>
                <p className="mt-1 text-sm text-slate-600">
                  {trainer.city} · {trainer.experience_years} years experience · {trainer.rating_avg.toFixed(1)} ★
                </p>
              </div>
            </div>

            <p className="mt-5 text-sm text-slate-700 leading-relaxed">{trainer.bio}</p>

            <div className="mt-5 border-t border-slate-100 pt-4">
              <h2 className="text-xs font-semibold text-slate-700">Certifications</h2>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {trainer.certifications.map((c) => (
                  <li key={c} className="flex items-center gap-2">
                    <Award className="h-4 w-4 text-sky-600 shrink-0" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Client Reviews</h2>
            {trainer.reviews.length === 0 ? (
              <p className="text-sm text-slate-500">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {trainer.reviews.map((r) => (
                  <div key={r.id} className="border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">{r.reviewer_name}</span>
                      <span className="font-mono text-xs text-amber-600">{r.rating}/5 ★</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{r.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs text-slate-500">1-on-1 Session Fee</p>
                <p className="font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                  ₹{trainer.session_price}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>

            {error && <ErrorBanner message={error} />}

            <div>
              <label htmlFor="sess-sport" className="block text-xs font-medium text-slate-700 mb-1">
                Training Sport
              </label>
              <select
                id="sess-sport"
                value={selectedSportId}
                onChange={(e) => setSelectedSportId(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {trainer.sports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Available Session Windows</p>
              <div className="max-h-64 overflow-y-auto grid grid-cols-1 gap-2">
                {trainer.availability.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={Boolean(slot.is_booked)}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                      slot.is_booked
                        ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                        : selectedSlotId === slot.id
                        ? 'border-sky-600 bg-sky-50 text-sky-900 ring-1 ring-sky-600'
                        : 'border-slate-200 hover:border-sky-400'
                    }`}
                  >
                    <span className="font-mono font-semibold">
                      <Calendar className="inline h-3.5 w-3.5 mr-1.5" />
                      {slot.avail_date} · <Clock className="inline h-3.5 w-3.5 mx-1" />
                      {slot.slot_label}
                    </span>
                    <span>{slot.is_booked ? 'Booked' : 'Open'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="sess-notes" className="block text-xs font-medium text-slate-700 mb-1">
                Training Focus Notes
              </label>
              <input
                id="sess-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Footwork, serve mechanics, conditioning..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              disabled={!selectedSlotId || busy}
              onClick={handleBookSession}
              className="w-full rounded-lg bg-[#0B132B] px-5 py-3 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
            >
              {!user ? 'Sign In to Book Session' : busy ? 'Reserving...' : `Book & Pay ₹${trainer.session_price}`}
            </button>
          </div>
        </div>
      </div>

      <PaymentCheckoutModal
        target={checkoutTarget}
        onClose={() => {
          setCheckoutTarget(null);
          loadTrainer();
        }}
        onSuccess={() => {
          setCheckoutTarget(null);
          onNavigate('/dashboard/bookings');
        }}
      />
    </div>
  );
}
