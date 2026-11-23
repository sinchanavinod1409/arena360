import React, { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { ConfirmDialog, EmptyState, ErrorBanner, Modal, SkeletonRows, StatusText } from '../components/ui/Primitives.tsx';

interface OwnerFacility {
  id: number;
  name: string;
  description: string;
  address: string;
  city: string;
  price_per_hour: number;
  is_active: number;
  image_url: string;
  amenities: string[];
  sports: Array<{ id: number; name: string }>;
  slots: Array<{ id: number; slot_label: string; start_time: string; end_time: string; is_blocked: number; price_override: number | null }>;
  hours: Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: number }>;
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface OwnerBooking {
  id: number;
  booking_ref: string;
  facility_name: string;
  customer_name: string;
  sport_name: string;
  booking_date: string;
  slot_label: string;
  total_amount: number;
  status: string;
}

export function OwnerDashboard({
  section,
  onNavigate,
}: {
  section: string;
  onNavigate: (path: string) => void;
}) {
  const { notifications, markNotificationRead } = useAuth();
  const [facilities, setFacilities] = useState<OwnerFacility[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [stats, setStats] = useState({ totalFacilities: 0, totalBookings: 0, revenueTotal: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // Edit / Archive
  const [editTarget, setEditTarget] = useState<OwnerFacility | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<OwnerFacility | null>(null);

  // New slot & operating hours
  const [selectedFacId, setSelectedFacId] = useState<number>(0);
  const [slotStart, setSlotStart] = useState('10:00');
  const [slotEnd, setSlotEnd] = useState('11:00');
  const [hoursDraft, setHoursDraft] = useState<
    Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>
  >([]);
  const [hoursBusy, setHoursBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const ov = await api.get<{
        facilities: OwnerFacility[];
        bookings: OwnerBooking[];
        stats: { totalFacilities: number; totalBookings: number; revenueTotal: number };
      }>('/api/owner/overview');
      setFacilities(ov.facilities || []);
      setBookings(ov.bookings || []);
      setStats(ov.stats);
      const nextId = selectedFacId || ov.facilities?.[0]?.id || 0;
      if (ov.facilities?.length && !selectedFacId) {
        setSelectedFacId(ov.facilities[0].id);
      }
      const targetFac = ov.facilities?.find((f) => f.id === nextId) || ov.facilities?.[0];
      if (targetFac?.hours) {
        setHoursDraft(
          targetFac.hours.map((h) => ({
            day_of_week: h.day_of_week,
            open_time: h.open_time,
            close_time: h.close_time,
            is_closed: Boolean(h.is_closed),
          }))
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to load owner console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const fac = facilities.find((f) => f.id === selectedFacId);
    if (fac?.hours) {
      setHoursDraft(
        fac.hours.map((h) => ({
          day_of_week: h.day_of_week,
          open_time: h.open_time,
          close_time: h.close_time,
          is_closed: Boolean(h.is_closed),
        }))
      );
    }
  }, [selectedFacId, facilities]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    try {
      await api.put(`/api/owner/facilities/${editTarget.id}`, {
        name: editTarget.name,
        description: editTarget.description,
        address: editTarget.address,
        city: editTarget.city,
        price_per_hour: Number(editTarget.price_per_hour),
      });
      setBanner(`Updated "${editTarget.name}".`);
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Update failed.');
    }
  };

  const handleArchiveFacility = async () => {
    if (!archiveTarget) return;
    try {
      await api.delete(`/api/owner/facilities/${archiveTarget.id}`);
      setBanner(`Facility "${archiveTarget.name}" archived.`);
      setArchiveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cannot archive facility.');
      setArchiveTarget(null);
    }
  };

  const toggleSlotBlock = async (slotId: number, currentBlocked: number) => {
    await api.patch(`/api/owner/slots/${slotId}`, { is_blocked: !currentBlocked });
    await load();
  };

  const handleAddCustomSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacId) return;
    try {
      await api.post(`/api/owner/facilities/${selectedFacId}/slots`, {
        start_time: slotStart,
        end_time: slotEnd,
      });
      setBanner(`Added time slot ${slotStart} - ${slotEnd}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add slot.');
    }
  };

  const handleSaveHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFac) return;
    setHoursBusy(true);
    setError('');
    try {
      await api.put(`/api/owner/facilities/${activeFac.id}/hours`, { hours: hoursDraft });
      setBanner(`Operating hours updated for "${activeFac.name}".`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save operating hours.');
    } finally {
      setHoursBusy(false);
    }
  };

  const handleBookingStatus = async (id: number, status: 'completed' | 'cancelled') => {
    try {
      await api.patch(`/api/owner/bookings/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Status update failed.');
    }
  };

  const venueSummary = facilities.map((f) => {
    const venueBookings = bookings.filter(
      (b) => b.facility_name === f.name && ['confirmed', 'completed', 'rescheduled'].includes(b.status)
    );
    return {
      id: f.id,
      name: f.name,
      city: f.city,
      bookings: venueBookings.length,
      revenue: venueBookings.reduce((acc, b) => acc + b.total_amount, 0),
    };
  });

  const activeFac = facilities.find((f) => f.id === selectedFacId) || facilities[0];

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
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">Facility Owner Console</h1>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Managed Venues</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                    {stats.totalFacilities}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Total Reservations</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-[#0B132B] tabular-nums">
                    {stats.totalBookings}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs text-slate-500">Confirmed Venue Revenue</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                    ₹{stats.revenueTotal}
                  </p>
                </div>
              </div>

              {venueSummary.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-5 py-4">
                    <h2 className="text-base font-semibold text-slate-900">Revenue by Facility</h2>
                  </div>
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                      <tr>
                        <th className="px-5 py-3">Facility</th>
                        <th className="px-5 py-3">Confirmed Bookings</th>
                        <th className="px-5 py-3 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {venueSummary.map((v) => (
                        <tr key={v.id}>
                          <td className="px-5 py-3 font-medium text-slate-900">{v.name}</td>
                          <td className="px-5 py-3 font-mono text-xs text-slate-700">{v.bookings}</td>
                          <td className="px-5 py-3 text-right font-mono text-xs font-semibold text-emerald-700">
                            ₹{v.revenue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {section === 'facilities' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">My Facilities</h1>
              </div>
              {facilities.length === 0 ? (
                <EmptyState
                  title="No facilities assigned"
                  description="Assigned sports complexes managed under your owner account will appear here."
                />
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {facilities.map((f) => (
                    <div key={f.id} className="rounded-xl border border-slate-200 bg-white flex flex-col">
                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex items-center justify-between">
                          <h2 className="text-lg font-semibold text-slate-900">{f.name}</h2>
                          <StatusText status={f.is_active ? 'available' : 'cancelled'} />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {f.address}, {f.city} · ₹{f.price_per_hour}/hr
                        </p>
                        <p className="text-sm text-slate-600 mt-2 flex-1">{f.description}</p>
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                          <button
                            type="button"
                            onClick={() => setEditTarget(f)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Edit Info & Price
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFacId(f.id);
                              onNavigate('/owner/slots');
                            }}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                          >
                            Manage Slots
                          </button>
                          {Boolean(f.is_active) && (
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(f)}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              Archive
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === 'slots' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="font-display text-2xl font-bold text-[#0B132B]">Manage Hours, Pricing & Time Slots</h1>
                <select
                  aria-label="Select Facility"
                  value={activeFac?.id || ''}
                  onChange={(e) => setSelectedFacId(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {activeFac && (
                <>
                  <form onSubmit={handleAddCustomSlot} className="rounded-xl border border-slate-200 bg-white p-5 flex flex-wrap items-end gap-3">
                    <div>
                      <label htmlFor="cs-start" className="block text-xs font-medium text-slate-700 mb-1">
                        Start Time
                      </label>
                      <input
                        id="cs-start"
                        type="time"
                        value={slotStart}
                        onChange={(e) => setSlotStart(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="cs-end" className="block text-xs font-medium text-slate-700 mb-1">
                        End Time
                      </label>
                      <input
                        id="cs-end"
                        type="time"
                        value={slotEnd}
                        onChange={(e) => setSlotEnd(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600"
                    >
                      Add Time Slot
                    </button>
                  </form>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeFac.slots.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div>
                          <p className="font-mono text-xs font-semibold text-slate-900">{s.slot_label}</p>
                          <p className="text-xs text-slate-500">
                            {s.is_blocked ? 'Blocked by Owner' : `Open · ₹${s.price_override ?? activeFac.price_per_hour}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSlotBlock(s.id, s.is_blocked)}
                          className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                            s.is_blocked
                              ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              : 'border-rose-200 text-rose-700 hover:bg-rose-50'
                          }`}
                        >
                          {s.is_blocked ? 'Unblock' : 'Block'}
                        </button>
                      </div>
                    ))}
                  </div>

                  {hoursDraft.length > 0 && (
                    <form onSubmit={handleSaveHours} className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h2 className="text-base font-semibold text-slate-900">Weekly Operating Hours</h2>
                        <button
                          type="submit"
                          disabled={hoursBusy}
                          className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                        >
                          {hoursBusy ? 'Saving...' : 'Save Operating Hours'}
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {hoursDraft.map((h, idx) => (
                          <div key={h.day_of_week} className="grid grid-cols-1 sm:grid-cols-4 items-center gap-3 py-2.5">
                            <span className="text-sm font-medium text-slate-900">
                              {DAY_LABELS[h.day_of_week] || `Day ${h.day_of_week}`}
                            </span>
                            <input
                              type="time"
                              disabled={h.is_closed}
                              aria-label={`${DAY_LABELS[h.day_of_week]} opening time`}
                              value={h.open_time}
                              onChange={(e) =>
                                setHoursDraft((prev) =>
                                  prev.map((row, i) => (i === idx ? { ...row, open_time: e.target.value } : row))
                                )
                              }
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
                            />
                            <input
                              type="time"
                              disabled={h.is_closed}
                              aria-label={`${DAY_LABELS[h.day_of_week]} closing time`}
                              value={h.close_time}
                              onChange={(e) =>
                                setHoursDraft((prev) =>
                                  prev.map((row, i) => (i === idx ? { ...row, close_time: e.target.value } : row))
                                )
                              }
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100"
                            />
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={h.is_closed}
                                onChange={(e) =>
                                  setHoursDraft((prev) =>
                                    prev.map((row, i) => (i === idx ? { ...row, is_closed: e.target.checked } : row))
                                  )
                                }
                                className="rounded border-slate-300"
                              />
                              <span>Closed</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          )}

          {section === 'bookings' && (
            <div className="space-y-5">
              <h1 className="font-display text-2xl font-bold text-[#0B132B]">Facility Booking Management</h1>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Ref</th>
                      <th className="px-4 py-3">Facility & Sport</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Date & Slot</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td className="px-4 py-3 font-mono text-xs">{b.booking_ref}</td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-semibold text-slate-900">{b.facility_name}</p>
                          <p className="text-slate-500">{b.sport_name}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">{b.customer_name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">
                          {b.booking_date} · {b.slot_label}
                        </td>
                        <td className="px-4 py-3">
                          <StatusText status={b.status} />
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {(b.status === 'confirmed' || b.status === 'rescheduled') && (
                            <button
                              type="button"
                              onClick={() => handleBookingStatus(b.id, 'completed')}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white"
                            >
                              Complete
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

          {section === 'notifications' && (
            <div className="max-w-3xl space-y-4">
              <h1 className="font-display text-2xl font-bold text-[#0B132B]">Owner Notifications</h1>
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

      <Modal open={Boolean(editTarget)} title="Edit Facility Details" onClose={() => setEditTarget(null)}>
        {editTarget && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label htmlFor="ef-name" className="block text-xs font-medium text-slate-700 mb-1">
                Name
              </label>
              <input
                id="ef-name"
                type="text"
                value={editTarget.name}
                onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ef-addr" className="block text-xs font-medium text-slate-700 mb-1">
                Address
              </label>
              <input
                id="ef-addr"
                type="text"
                value={editTarget.address}
                onChange={(e) => setEditTarget({ ...editTarget, address: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ef-price" className="block text-xs font-medium text-slate-700 mb-1">
                Price per Hour (₹)
              </label>
              <input
                id="ef-price"
                type="number"
                value={editTarget.price_per_hour}
                onChange={(e) => setEditTarget({ ...editTarget, price_per_hour: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="ef-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <textarea
                id="ef-desc"
                rows={3}
                value={editTarget.description}
                onChange={(e) => setEditTarget({ ...editTarget, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-[#0B132B] px-4 py-2 text-xs font-semibold text-white">
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive Facility"
        description={`Are you sure you want to archive "${archiveTarget?.name}"? Facilities with upcoming confirmed bookings cannot be removed.`}
        confirmLabel="Archive Facility"
        destructive
        onConfirm={handleArchiveFacility}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
