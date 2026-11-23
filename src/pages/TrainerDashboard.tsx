import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { Sport, TrainerAvailabilitySlot } from '../types.ts';
import { EmptyState, ErrorBanner, SkeletonRows, StatusText } from '../components/ui/Primitives.tsx';

interface TrainerSessionRow {
  id: number;
  session_ref: string;
  customer_name: string;
  customer_email: string;
  sport_name: string;
  session_date: string;
  slot_label: string;
  total_amount: number;
  status: string;
  notes: string;
}

export function TrainerDashboard({ section }: { section: string }) {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAuth();
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [availability, setAvailability] = useState<TrainerAvailabilitySlot[]>([]);
  const [sessions, setSessions] = useState<TrainerSessionRow[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // Profile form
  const [bio, setBio] = useState('');
  const [expYears, setExpYears] = useState(5);
  const [certsText, setCertsText] = useState('');
  const [sessionPrice, setSessionPrice] = useState(1200);
  const [city, setCity] = useState('Bengaluru');
  const [selectedSports, setSelectedSports] = useState<number[]>([]);

  // New slot form
  const [availDate, setAvailDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ov, sp] = await Promise.all([
        api.get<{
          profile: Record<string, unknown> | null;
          availability: TrainerAvailabilitySlot[];
          sessions: TrainerSessionRow[];
        }>('/api/trainer/overview'),
        api.get<{ sports: Sport[] }>('/api/sports'),
      ]);
      setProfile(ov.profile);
      setAvailability(ov.availability || []);
      setSessions(ov.sessions || []);
      setSports(sp.sports || []);
      if (ov.profile) {
        setBio(String(ov.profile.bio || ''));
        setExpYears(Number(ov.profile.experience_years || 0));
        setCertsText(((ov.profile.certifications as string[]) || []).join(', '));
        setSessionPrice(Number(ov.profile.session_price || 1000));
        setCity(String(ov.profile.city || 'Bengaluru'));
        setSelectedSports(((ov.profile.sports as Array<{ id: number }>) || []).map((s) => s.id));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to load trainer workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.put('/api/trainer/profile', {
        bio,
        experience_years: Number(expYears),
        certifications: certsText
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        session_price: Number(sessionPrice),
        city,
        sport_ids: selectedSports,
      });
      setBanner('Trainer profile, certifications, and rate updated.');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update profile.');
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/api/trainer/availability', {
        avail_date: availDate,
        start_time: startTime,
        end_time: endTime,
      });
      setBanner(`Added availability window ${availDate} (${startTime} - ${endTime}).`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add availability slot.');
    }
  };

  const handleDeleteSlot = async (id: number) => {
    try {
      await api.delete(`/api/trainer/availability/${id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to delete slot.');
    }
  };

  const handleSessionStatus = async (id: number, status: 'confirmed' | 'completed' | 'cancelled') => {
    try {
      await api.patch(`/api/trainer/sessions/${id}/status`, { status });
      setBanner(`Session status updated to ${status}.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to update session status.');
    }
  };

  const totalEarnings = sessions
    .filter((s) => s.status === 'confirmed' || s.status === 'completed')
    .reduce((acc, s) => acc + s.total_amount, 0);

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

      {loading ? (
        <SkeletonRows count={4} />
      ) : (
        <>
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-[#0B132B]">Trainer Dashboard</h1>
                  <p className="text-sm text-slate-600">
                    Verification status: <StatusText status={String(profile?.approval_status || 'pending')} />
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Total Sessions</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">{sessions.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Open Availability Slots</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                    {availability.filter((a) => !a.is_booked).length}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Session Revenue</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                    ₹{totalEarnings}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Average Rating</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    {Number(profile?.rating_avg || 0).toFixed(1)} ★
                  </p>
                </div>
              </div>

            </div>
          )}

          {section === 'availability' && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold text-[#0B132B]">Manage Coaching Availability</h1>

              <form onSubmit={handleAddSlot} className="rounded-xl border border-slate-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label htmlFor="ta-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    id="ta-date"
                    type="date"
                    value={availDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setAvailDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="ta-start" className="block text-xs font-medium text-slate-700 mb-1">
                    Start Time
                  </label>
                  <input
                    id="ta-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="ta-end" className="block text-xs font-medium text-slate-700 mb-1">
                    End Time
                  </label>
                  <input
                    id="ta-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0B132B] px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-600"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Slot</span>
                </button>
              </form>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availability.map((slot) => (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="font-mono text-xs font-semibold text-slate-900">
                        {slot.avail_date} · {slot.slot_label}
                      </p>
                      <StatusText status={slot.is_booked ? 'booked' : 'available'} />
                    </div>
                    {!slot.is_booked && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        aria-label={`Remove slot ${slot.avail_date} ${slot.slot_label}`}
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(section === 'sessions' || section === 'history') && (
            <div className="space-y-5">
              <h1 className="font-display text-2xl font-bold text-[#0B132B]">
                {section === 'history' ? 'Session History' : 'Upcoming & Session Requests'}
              </h1>
              {sessions.length === 0 ? (
                <EmptyState title="No coaching sessions yet" description="Sessions booked by athletes will appear here." />
              ) : (
                <div className="space-y-3">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-slate-500">{s.session_ref}</span>
                          <StatusText status={s.status} />
                        </div>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {s.customer_name} · {s.sport_name}
                        </p>
                        <p className="font-mono text-xs text-slate-600">
                          {s.session_date} · {s.slot_label} · ₹{s.total_amount}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {s.status === 'confirmed' && (
                          <button
                            type="button"
                            onClick={() => handleSessionStatus(s.id, 'completed')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Mark Completed
                          </button>
                        )}
                        {['pending', 'payment_pending'].includes(s.status) && (
                          <button
                            type="button"
                            onClick={() => handleSessionStatus(s.id, 'confirmed')}
                            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Accept
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(s.status) && (
                          <button
                            type="button"
                            onClick={() => handleSessionStatus(s.id, 'cancelled')}
                            className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(section === 'profile' || section === 'settings') && (
            <div className="max-w-3xl space-y-6">
              <h1 className="font-display text-2xl font-bold text-[#0B132B]">Trainer Profile & Expertise</h1>
              <form onSubmit={handleSaveProfile} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div>
                  <label htmlFor="tr-bio" className="block text-xs font-medium text-slate-700 mb-1">
                    Coaching Bio
                  </label>
                  <textarea
                    id="tr-bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="tr-expy" className="block text-xs font-medium text-slate-700 mb-1">
                      Experience (Years)
                    </label>
                    <input
                      id="tr-expy"
                      type="number"
                      min={0}
                      max={60}
                      value={expYears}
                      onChange={(e) => setExpYears(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="tr-fee" className="block text-xs font-medium text-slate-700 mb-1">
                      Session Price (₹)
                    </label>
                    <input
                      id="tr-fee"
                      type="number"
                      min={100}
                      value={sessionPrice}
                      onChange={(e) => setSessionPrice(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="tr-city" className="block text-xs font-medium text-slate-700 mb-1">
                      City
                    </label>
                    <input
                      id="tr-city"
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="tr-certs" className="block text-xs font-medium text-slate-700 mb-1">
                    Certifications (comma-separated)
                  </label>
                  <input
                    id="tr-certs"
                    type="text"
                    value={certsText}
                    onChange={(e) => setCertsText(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-2">Sports Expertise</span>
                  <div className="flex flex-wrap gap-2">
                    {sports.map((s) => {
                      const active = selectedSports.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            setSelectedSports((prev) =>
                              active ? prev.filter((x) => x !== s.id) : [...prev, s.id]
                            )
                          }
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                            active ? 'border-sky-600 bg-sky-50 text-sky-900' : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600"
                >
                  Save Trainer Profile
                </button>
              </form>
            </div>
          )}

          {section === 'notifications' && (
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">Trainer Notifications</h1>
                <button type="button" onClick={() => markAllNotificationsRead()} className="text-xs font-semibold text-sky-700">
                  Mark all read
                </button>
              </div>
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                {notifications.map((n) => (
                  <div key={n.id} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                      <p className="text-xs text-slate-600">{n.message}</p>
                    </div>
                    {!n.is_read && (
                      <button type="button" onClick={() => markNotificationRead(n.id)} className="text-xs text-sky-700 font-semibold">
                        Read
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
