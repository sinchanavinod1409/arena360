import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

// Use isolated temp SQLite database for deterministic integration testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena360-test-'));
process.env.SQLITE_DB_PATH = path.join(tmpDir, 'test.db');

const { apiRouter } = await import('./routes.ts');
const { db } = await import('./db.ts');

let server: http.Server;
let baseUrl = '';

function futureDateStr(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

async function reqJson<T = Record<string, unknown>>(
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

let customerToken = '';
let secondCustomerToken = '';
let trainerToken = '';
let ownerToken = '';
let adminToken = '';

test('TC01-TC04: Registration, duplicate rejection, login, and invalid login', async () => {
  // TC01: Register new customer
  const reg = await reqJson<{ token: string; user: { id: number; email: string; role: string } }>(
    'POST',
    '/api/auth/register',
    {
      name: 'Nikhil Sharma',
      email: 'nikhil.test@arena360.in',
      phone: '9811122233',
      password: 'Password@123',
      role: 'customer',
      city: 'Bengaluru',
    }
  );
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);
  assert.equal(reg.data.user.role, 'customer');
  secondCustomerToken = reg.data.token;

  // TC01b: Non-customer self-registration rejected with 403
  const regTrainer = await reqJson('POST', '/api/auth/register', {
    name: 'Blocked Trainer',
    email: 'blocked.trainer@arena360.in',
    phone: '9811122255',
    password: 'Password@123',
    role: 'trainer',
  });
  assert.equal(regTrainer.status, 403);

  const regOwner = await reqJson('POST', '/api/auth/register', {
    name: 'Blocked Owner',
    email: 'blocked.owner@arena360.in',
    phone: '9811122266',
    password: 'Password@123',
    role: 'facility_owner',
  });
  assert.equal(regOwner.status, 403);

  // TC02: Duplicate email/phone rejected with 409
  const dup = await reqJson('POST', '/api/auth/register', {
    name: 'Nikhil Dup',
    email: 'nikhil.test@arena360.in',
    phone: '9811122244',
    password: 'Password@123',
  });
  assert.equal(dup.status, 409);

  // TC03: Login seeded roles (email + mobile)
  const loginEmail = await reqJson<{ token: string; user: { role: string } }>('POST', '/api/auth/login', {
    identifier: 'customer@arena360.in',
    password: 'Arena360@2026',
  });
  assert.equal(loginEmail.status, 200);
  customerToken = loginEmail.data.token;

  const loginPhone = await reqJson<{ token: string }>('POST', '/api/auth/login', {
    identifier: '9876543210',
    password: 'Arena360@2026',
  });
  assert.equal(loginPhone.status, 200);

  // TC04: Invalid login rejected
  const badLogin = await reqJson('POST', '/api/auth/login', {
    identifier: 'customer@arena360.in',
    password: 'WrongPassword!',
  });
  assert.equal(badLogin.status, 401);

  // Obtain tokens for other seeded roles
  trainerToken = (
    await reqJson<{ token: string }>('POST', '/api/auth/login', {
      identifier: 'trainer@arena360.in',
      password: 'Arena360@2026',
    })
  ).data.token;
  ownerToken = (
    await reqJson<{ token: string }>('POST', '/api/auth/login', {
      identifier: 'owner@arena360.in',
      password: 'Arena360@2026',
    })
  ).data.token;
  adminToken = (
    await reqJson<{ token: string }>('POST', '/api/auth/login', {
      identifier: 'admin@arena360.in',
      password: 'Arena360@2026',
    })
  ).data.token;
});

test('TC05-TC06: Forgot password reset flow and profile updates', async () => {
  // TC05: Forgot password -> reset password -> login with new password
  const forgot = await reqJson<{ verificationCode: string }>('POST', '/api/auth/forgot-password', {
    email: 'nikhil.test@arena360.in',
  });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.data.verificationCode);

  const reset = await reqJson('POST', '/api/auth/reset-password', {
    email: 'nikhil.test@arena360.in',
    code: forgot.data.verificationCode,
    newPassword: 'NewPassword@456',
  });
  assert.equal(reset.status, 200);

  const loginNew = await reqJson('POST', '/api/auth/login', {
    identifier: 'nikhil.test@arena360.in',
    password: 'NewPassword@456',
  });
  assert.equal(loginNew.status, 200);

  // TC06: Profile update & persistence (Bengaluru)
  const profUpd = await reqJson<{ user: { city: string; preferred_sports: string[] } }>(
    'PUT',
    '/api/profile',
    {
      name: 'Nikhil Sharma Updated',
      email: 'nikhil.test@arena360.in',
      phone: '9811122233',
      city: 'Bengaluru',
      address: '15th Cross, Malleshwaram, Bengaluru',
      emergency_contact: '9811100000',
      preferred_sports: ['Badminton', 'Tennis', 'Table Tennis'],
      notification_email: true,
      notification_sms: true,
    },
    secondCustomerToken
  );
  assert.equal(profUpd.status, 200);
  assert.equal(profUpd.data.user.city, 'Bengaluru');
  assert.deepEqual(profUpd.data.user.preferred_sports, ['Badminton', 'Tennis', 'Table Tennis']);
});

test('TC07-TC09: Bengaluru 12 sports (2+ coaches each), Bengaluru-only facilities, and live availability', async () => {
  // TC07: Sports browse — 12 sports including indoor sports, each with >= 2 approved coaches & >= 1 Bengaluru venue
  const sportsRes = await reqJson<{
    sports: Array<{ id: number; name: string; facility_count: number; trainer_count: number }>;
  }>('GET', '/api/sports');
  assert.equal(sportsRes.status, 200);
  assert.equal(sportsRes.data.sports.length, 12);
  for (const sp of sportsRes.data.sports) {
    assert.ok(sp.trainer_count >= 2, `Expected >=2 coaches for ${sp.name}, got ${sp.trainer_count}`);
    assert.ok(sp.facility_count >= 1, `Expected >=1 Bengaluru venue for ${sp.name}, got ${sp.facility_count}`);
  }

  // TC08: All facilities are Bengaluru-based + area filter works
  const allFacRes = await reqJson<{ facilities: Array<{ id: number; name: string; city: string; price_per_hour: number }> }>(
    'GET',
    '/api/facilities'
  );
  assert.equal(allFacRes.status, 200);
  assert.ok(allFacRes.data.facilities.length >= 7);
  for (const fac of allFacRes.data.facilities) {
    assert.equal(fac.city, 'Bengaluru');
  }

  const facRes = await reqJson<{ facilities: Array<{ id: number; name: string; city: string; price_per_hour: number }> }>(
    'GET',
    '/api/facilities?city=Bengaluru&area=Indiranagar&sport=badminton&maxPrice=1000&availableOnly=true'
  );
  assert.equal(facRes.status, 200);
  assert.ok(facRes.data.facilities.length >= 1);
  assert.equal(facRes.data.facilities[0].city, 'Bengaluru');

  // TC09: Live availability check
  const dateStr = futureDateStr(4);
  const availRes = await reqJson<{ slots: Array<{ id: number; slot_label: string; is_available: boolean }> }>(
    'GET',
    `/api/facilities/1/availability?date=${dateStr}`
  );
  assert.equal(availRes.status, 200);
  assert.ok(availRes.data.slots.length >= 6);
});

test('TC10-TC17: Slot hold, blocked slot, double-booking prevention, UPI/card payment, failure/retry, cancel, HMAC check', async () => {
  const testDate = futureDateStr(5);
  const slotLabel = '06:00 - 07:00';

  // TC10 & TC12: User 1 holds slot -> User 2 cannot double-book same slot (409)
  const hold1 = await reqJson<{ booking: { id: number; status: string; booking_ref: string } }>(
    'POST',
    '/api/bookings',
    {
      facility_id: 1,
      sport_id: 3, // Badminton
      booking_date: testDate,
      slot_label: slotLabel,
    },
    customerToken
  );
  assert.equal(hold1.status, 201);
  assert.equal(hold1.data.booking.status, 'payment_pending');

  const conflictHold = await reqJson(
    'POST',
    '/api/bookings',
    {
      facility_id: 1,
      sport_id: 3,
      booking_date: testDate,
      slot_label: slotLabel,
    },
    secondCustomerToken
  );
  assert.equal(conflictHold.status, 409);

  // TC15: Payment failure simulation -> retry -> success (TC13)
  const orderFail = await reqJson<{
    payment_id: number;
    order_id: string;
    simulated_payment_id: string;
    simulated_signature: string;
  }>(
    'POST',
    '/api/payments/create-order',
    { type: 'facility', reference_id: hold1.data.booking.id, method: 'upi' },
    customerToken
  );
  assert.equal(orderFail.status, 200);

  const failAttempt = await reqJson<{ verified: boolean; status: string }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: orderFail.data.payment_id,
      gateway_order_id: orderFail.data.order_id,
      method: 'upi',
      outcome: 'failed',
    },
    customerToken
  );
  assert.equal(failAttempt.status, 402);
  assert.equal(failAttempt.data.verified, false);

  // Retry payment
  const orderRetry = await reqJson<{
    payment_id: number;
    order_id: string;
    simulated_payment_id: string;
    simulated_signature: string;
  }>(
    'POST',
    '/api/payments/create-order',
    { type: 'facility', reference_id: hold1.data.booking.id, method: 'upi' },
    customerToken
  );
  assert.equal(orderRetry.status, 200);

  // TC17: Tampered signature rejected
  const tampered = await reqJson(
    'POST',
    '/api/payments/verify',
    {
      payment_id: orderRetry.data.payment_id,
      gateway_order_id: orderRetry.data.order_id,
      gateway_payment_id: orderRetry.data.simulated_payment_id,
      gateway_signature: 'tampered_sig_123456',
      method: 'upi',
      upi_id: 'aarav@okaxis',
      outcome: 'success',
    },
    customerToken
  );
  assert.equal(tampered.status, 400);

  // Valid UPI verification
  const verified = await reqJson<{ verified: boolean; booking: { status: string } }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: orderRetry.data.payment_id,
      gateway_order_id: orderRetry.data.order_id,
      gateway_payment_id: orderRetry.data.simulated_payment_id,
      gateway_signature: orderRetry.data.simulated_signature,
      method: 'upi',
      upi_id: 'aarav@okaxis',
      outcome: 'success',
    },
    customerToken
  );
  assert.equal(verified.status, 200);
  assert.equal(verified.data.verified, true);
  assert.equal(verified.data.booking.status, 'confirmed');

  // TC16: Duplicate verification idempotency guard -> 409
  const dupPay = await reqJson(
    'POST',
    '/api/payments/verify',
    {
      payment_id: orderRetry.data.payment_id,
      gateway_order_id: orderRetry.data.order_id,
      gateway_payment_id: orderRetry.data.simulated_payment_id,
      gateway_signature: orderRetry.data.simulated_signature,
      method: 'upi',
      upi_id: 'aarav@okaxis',
      outcome: 'success',
    },
    customerToken
  );
  assert.equal(dupPay.status, 409);

  // TC14: Credit Card payment verification & card masking
  const hold2 = await reqJson<{ booking: { id: number } }>(
    'POST',
    '/api/bookings',
    {
      facility_id: 1,
      sport_id: 3,
      booking_date: testDate,
      slot_label: '07:00 - 08:00',
    },
    secondCustomerToken
  );
  assert.equal(hold2.status, 201);
  const ccOrder = await reqJson<{
    payment_id: number;
    order_id: string;
    simulated_payment_id: string;
    simulated_signature: string;
  }>(
    'POST',
    '/api/payments/create-order',
    { type: 'facility', reference_id: hold2.data.booking.id, method: 'credit_card' },
    secondCustomerToken
  );
  const ccVerify = await reqJson<{ verified: boolean; payment: { method_detail: string } }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: ccOrder.data.payment_id,
      gateway_order_id: ccOrder.data.order_id,
      gateway_payment_id: ccOrder.data.simulated_payment_id,
      gateway_signature: ccOrder.data.simulated_signature,
      method: 'credit_card',
      card_number: '4111111111114242',
      outcome: 'success',
    },
    secondCustomerToken
  );
  assert.equal(ccVerify.status, 200);
  assert.match(ccVerify.data.payment.method_detail, /4242/);
  assert.ok(!ccVerify.data.payment.method_detail.includes('411111111111'));

  // TC16b: Cancel payment outcome
  const hold3 = await reqJson<{ booking: { id: number } }>(
    'POST',
    '/api/bookings',
    {
      facility_id: 1,
      sport_id: 3,
      booking_date: testDate,
      slot_label: '08:00 - 09:00',
    },
    secondCustomerToken
  );
  const cancelPayOrder = await reqJson<{ payment_id: number; order_id: string }>(
    'POST',
    '/api/payments/create-order',
    { type: 'facility', reference_id: hold3.data.booking.id, method: 'debit_card' },
    secondCustomerToken
  );
  const cancelAttempt = await reqJson<{ verified: boolean; status: string }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: cancelPayOrder.data.payment_id,
      gateway_order_id: cancelPayOrder.data.order_id,
      method: 'debit_card',
      outcome: 'cancelled',
    },
    secondCustomerToken
  );
  assert.equal(cancelAttempt.status, 402);
  assert.equal(cancelAttempt.data.status, 'cancelled');

  // TC11: Owner blocks a slot -> booking rejected with 409
  const slotsBefore = await reqJson<{ slots: Array<{ id: number; slot_label: string }> }>(
    'GET',
    `/api/facilities/1/availability?date=${testDate}`
  );
  const slotToBlock = slotsBefore.data.slots.find((s) => s.slot_label === '21:00 - 22:00')!;
  const blockRes = await reqJson('PATCH', `/api/owner/slots/${slotToBlock.id}`, { is_blocked: true }, ownerToken);
  assert.equal(blockRes.status, 200);
  const blockedBook = await reqJson(
    'POST',
    '/api/bookings',
    { facility_id: 1, sport_id: 3, booking_date: testDate, slot_label: '21:00 - 22:00' },
    customerToken
  );
  assert.equal(blockedBook.status, 409);
  // Restore slot
  await reqJson('PATCH', `/api/owner/slots/${slotToBlock.id}`, { is_blocked: false }, ownerToken);
});

test('TC18-TC19: Rescheduling with conflict check and cancellation refund', async () => {
  const testDate = futureDateStr(5);
  const myBookings = await reqJson<{
    bookings: Array<{ id: number; booking_type: string; status: string; booking_date: string; slot_label: string }>;
  }>('GET', '/api/bookings/my?type=facility&status=confirmed', undefined, customerToken);

  const target = myBookings.data.bookings.find(
    (b) => b.booking_date === testDate && b.slot_label === '06:00 - 07:00'
  )!;
  assert.ok(target);

  // Conflict reschedule to 07:00 - 08:00 (held by secondCustomer) -> 409
  const reschedConflict = await reqJson(
    'POST',
    `/api/bookings/${target.id}/reschedule`,
    { booking_date: testDate, slot_label: '07:00 - 08:00' },
    customerToken
  );
  assert.equal(reschedConflict.status, 409);

  // Valid reschedule to 09:00 - 10:00 -> 200
  const reschedOk = await reqJson<{ booking: { status: string; slot_label: string } }>(
    'POST',
    `/api/bookings/${target.id}/reschedule`,
    { booking_date: testDate, slot_label: '09:00 - 10:00' },
    customerToken
  );
  assert.equal(reschedOk.status, 200);
  assert.equal(reschedOk.data.booking.status, 'rescheduled');

  // TC18: Cancel >24h ahead -> 100% refund
  const cancelRes = await reqJson<{ refund_percentage: number; refund_amount: number }>(
    'POST',
    `/api/bookings/${target.id}/cancel`,
    { reason: 'Testing 100% refund policy' },
    customerToken
  );
  assert.equal(cancelRes.status, 200);
  assert.equal(cancelRes.data.refund_percentage, 100);
  assert.ok(cancelRes.data.refund_amount > 0);
});

test('TC20-TC22: Trainer discovery (6 photo-free Bengaluru coaches), session booking & payment, and trainer availability management', async () => {
  // Verify 6 approved Bengaluru trainers and null avatar_url
  const allTrainers = await reqJson<{
    trainers: Array<{ user_id: number; name: string; city: string; avatar_url: string | null }>;
  }>('GET', '/api/trainers');
  assert.equal(allTrainers.status, 200);
  assert.equal(allTrainers.data.trainers.length, 6);
  for (const tr of allTrainers.data.trainers) {
    assert.equal(tr.city, 'Bengaluru');
    assert.equal(tr.avatar_url, null);
  }

  // TC20: Trainer discovery filter
  const tList = await reqJson<{ trainers: Array<{ user_id: number; name: string }> }>(
    'GET',
    '/api/trainers?sport=badminton&minExp=5'
  );
  assert.equal(tList.status, 200);
  assert.equal(tList.data.trainers.length, 2);
  const trainerUserId = tList.data.trainers[0].user_id;

  const tDetail = await reqJson<{ trainer: { availability: Array<{ id: number; is_booked: number }> } }>(
    'GET',
    `/api/trainers/${trainerUserId}`
  );
  assert.equal(tDetail.status, 200);
  const openAvail = tDetail.data.trainer.availability.find((a) => a.is_booked === 0)!;
  assert.ok(openAvail);

  // TC21: Book trainer session & pay
  const sessHold = await reqJson<{ session: { id: number } }>(
    'POST',
    '/api/sessions',
    { trainer_user_id: trainerUserId, availability_id: openAvail.id, sport_id: 3 },
    customerToken
  );
  assert.equal(sessHold.status, 201);

  const sessOrder = await reqJson<{
    payment_id: number;
    order_id: string;
    simulated_payment_id: string;
    simulated_signature: string;
  }>(
    'POST',
    '/api/payments/create-order',
    { type: 'trainer', reference_id: sessHold.data.session.id, method: 'upi' },
    customerToken
  );
  const sessVerify = await reqJson<{ verified: boolean; session: { status: string } }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: sessOrder.data.payment_id,
      gateway_order_id: sessOrder.data.order_id,
      gateway_payment_id: sessOrder.data.simulated_payment_id,
      gateway_signature: sessOrder.data.simulated_signature,
      method: 'upi',
      upi_id: 'aarav@okaxis',
      outcome: 'success',
    },
    customerToken
  );
  assert.equal(sessVerify.status, 200);
  assert.equal(sessVerify.data.session.status, 'confirmed');

  // TC22: Trainer manages availability & marks session completed
  const addAvail = await reqJson<{ slot: { id: number } }>(
    'POST',
    '/api/trainer/availability',
    { avail_date: futureDateStr(8), start_time: '10:00', end_time: '11:00' },
    trainerToken
  );
  assert.equal(addAvail.status, 201);

  const delAvail = await reqJson('DELETE', `/api/trainer/availability/${addAvail.data.slot.id}`, undefined, trainerToken);
  assert.equal(delAvail.status, 200);

  const completeSess = await reqJson(
    'PATCH',
    `/api/trainer/sessions/${sessHold.data.session.id}/status`,
    { status: 'completed' },
    trainerToken
  );
  assert.equal(completeSess.status, 200);
});

test('TC23: Facility owner CRUD & operating hours', async () => {
  const createFac = await reqJson<{ id: number }>(
    'POST',
    '/api/owner/facilities',
    {
      name: 'HSR Smash & Turf Test Complex',
      description: 'Dedicated test facility with 4 indoor courts and LED floodlights.',
      address: '27th Main, HSR Layout',
      city: 'Bengaluru',
      price_per_hour: 950,
      amenities: ['Parking', 'Water'],
      sport_ids: [3],
    },
    ownerToken
  );
  assert.equal(createFac.status, 201);
  const newFacId = createFac.data.id;

  const updFac = await reqJson(
    'PUT',
    `/api/owner/facilities/${newFacId}`,
    {
      name: 'HSR Smash Arena Pro',
      description: 'Updated description for indoor badminton complex.',
      address: '27th Main, HSR Layout Sector 1',
      city: 'Bengaluru',
      price_per_hour: 900,
    },
    ownerToken
  );
  assert.equal(updFac.status, 200);

  const delFac = await reqJson('DELETE', `/api/owner/facilities/${newFacId}`, undefined, ownerToken);
  assert.equal(delFac.status, 200);
});

test('TC24-TC26: Admin trainer approval, sport category CRUD, and user suspension', async () => {
  const admOv = await reqJson<{
    trainers: Array<{ id: number; approval_status: string; name: string }>;
    users: Array<{ id: number; email: string }>;
  }>('GET', '/api/admin/overview', undefined, adminToken);
  assert.equal(admOv.status, 200);

  // TC24: Approve pending trainer
  const pendingTr = admOv.data.trainers.find((t) => t.approval_status === 'pending')!;
  assert.ok(pendingTr);
  const approveRes = await reqJson(
    'PATCH',
    `/api/admin/trainers/${pendingTr.id}/approval`,
    { approval_status: 'approved' },
    adminToken
  );
  assert.equal(approveRes.status, 200);

  // TC25: Add & deactivate sport
  const addSport = await reqJson<{ id: number }>(
    'POST',
    '/api/admin/sports',
    { name: 'Padel', description: 'Enclosed glass-wall Bengaluru padel doubles courts.' },
    adminToken
  );
  assert.equal(addSport.status, 201);
  const delSport = await reqJson('DELETE', `/api/admin/sports/${addSport.data.id}`, undefined, adminToken);
  assert.equal(delSport.status, 200);

  // TC25b: Admin-only creation of Facility Owner & Trainer accounts (non-admin rejected 403)
  const nonAdminCreate = await reqJson(
    'POST',
    '/api/admin/users',
    {
      name: 'Unauthorized Owner',
      email: 'unauth.owner@arena360.in',
      phone: '9845099881',
      password: 'Password@123',
      role: 'facility_owner',
    },
    customerToken
  );
  assert.equal(nonAdminCreate.status, 403);

  const adminCreateOwner = await reqJson<{ user: { role: string } }>(
    'POST',
    '/api/admin/users',
    {
      name: 'Rajeshwari Shetty',
      email: 'rajeshwari.owner@arena360.in',
      phone: '9845099882',
      password: 'Password@123',
      role: 'facility_owner',
      city: 'Bengaluru',
      businessName: 'Malleshwaram Indoor Arenas',
    },
    adminToken
  );
  assert.equal(adminCreateOwner.status, 201);
  assert.equal(adminCreateOwner.data.user.role, 'facility_owner');

  const adminCreateTrainer = await reqJson<{ user: { role: string } }>(
    'POST',
    '/api/admin/users',
    {
      name: 'Siddharth Menon',
      email: 'siddharth.coach@arena360.in',
      phone: '9845099883',
      password: 'Password@123',
      role: 'trainer',
      city: 'Bengaluru',
      experienceYears: 6,
      sessionPrice: 1200,
      sportIds: [3],
    },
    adminToken
  );
  assert.equal(adminCreateTrainer.status, 201);
  assert.equal(adminCreateTrainer.data.user.role, 'trainer');

  // TC26: Suspend user -> login fails 403 -> restore user
  const targetUser = admOv.data.users.find((u) => u.email === 'nikhil.test@arena360.in')!;
  const susp = await reqJson('PATCH', `/api/admin/users/${targetUser.id}/status`, { is_active: false }, adminToken);
  assert.equal(susp.status, 200);

  const loginSusp = await reqJson('POST', '/api/auth/login', {
    identifier: 'nikhil.test@arena360.in',
    password: 'NewPassword@456',
  });
  assert.equal(loginSusp.status, 403);

  await reqJson('PATCH', `/api/admin/users/${targetUser.id}/status`, { is_active: true }, adminToken);
});

test('TC27-TC30: Review eligibility, admin moderation/issues, history filters, and RBAC 403 checks', async () => {
  // TC27: Review eligibility (cannot review another user's or future uncompleted booking)
  const unelig = await reqJson(
    'POST',
    '/api/reviews',
    {
      target_type: 'facility',
      booking_id: 999999,
      rating: 5,
      comment: 'Should not succeed without valid completed booking.',
    },
    customerToken
  );
  assert.equal(unelig.status, 403);

  // Eligible review for completed trainer session from TC21/TC22
  const mySess = await reqJson<{ bookings: Array<{ id: number; booking_type: string; status: string; has_reviewed: number }> }>(
    'GET',
    '/api/bookings/my?type=trainer&status=completed',
    undefined,
    customerToken
  );
  const reviewable = mySess.data.bookings.find((b) => !b.has_reviewed)!;
  assert.ok(reviewable);

  const revOk = await reqJson(
    'POST',
    '/api/reviews',
    {
      target_type: 'trainer',
      trainer_session_id: reviewable.id,
      rating: 5,
      comment: 'Structured drills and clear tactical feedback throughout.',
    },
    customerToken
  );
  assert.equal(revOk.status, 201);

  // Duplicate review rejected 409
  const revDup = await reqJson(
    'POST',
    '/api/reviews',
    {
      target_type: 'trainer',
      trainer_session_id: reviewable.id,
      rating: 4,
      comment: 'Duplicate attempt.',
    },
    customerToken
  );
  assert.equal(revDup.status, 409);

  // TC28: Reported issue + Admin moderation
  const issRes = await reqJson<{ id: number }>(
    'POST',
    '/api/issues',
    {
      target_type: 'facility',
      target_id: 1,
      subject: 'Court 3 net tension check',
      description: 'Net cord slightly loose during evening session.',
    },
    customerToken
  );
  assert.equal(issRes.status, 201);
  const resolveIss = await reqJson(
    'PATCH',
    `/api/admin/issues/${issRes.data.id}`,
    { status: 'resolved', admin_notes: 'Maintained by venue staff.' },
    adminToken
  );
  assert.equal(resolveIss.status, 200);

  // TC29: Payment history
  const payHist = await reqJson<{ payments: unknown[] }>('GET', '/api/payments/my', undefined, customerToken);
  assert.equal(payHist.status, 200);
  assert.ok(payHist.data.payments.length >= 1);

  // TC30: RBAC enforcement (401 unauth, 403 unauthorized role)
  assert.equal((await reqJson('GET', '/api/admin/overview')).status, 401);
  assert.equal((await reqJson('GET', '/api/admin/overview', undefined, customerToken)).status, 403);
  assert.equal((await reqJson('GET', '/api/owner/overview', undefined, customerToken)).status, 403);
  assert.equal((await reqJson('GET', '/api/trainer/overview', undefined, customerToken)).status, 403);

  // Verify DB integrity: check foreign keys intact
  const fkCheck = db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fkCheck.length, 0);
});

test('Lab FR1-FR15 Invalid Input & Edge-Case Verification', async () => {
  // FR1 Register invalid email, phone, password
  const badEmailReg = await reqJson<{ error: string }>('POST', '/api/auth/register', {
    name: 'Riya Sharma',
    email: 'riya@.com',
    phone: '9876543299',
    password: 'Password@123',
  });
  assert.equal(badEmailReg.status, 400);

  const badPhoneReg = await reqJson<{ error: string }>('POST', '/api/auth/register', {
    name: 'Riya Sharma',
    email: 'riya.valid@arena360.in',
    phone: '12345',
    password: 'Password@123',
  });
  assert.equal(badPhoneReg.status, 400);

  const shortPwReg = await reqJson<{ error: string }>('POST', '/api/auth/register', {
    name: 'Riya Sharma',
    email: 'riya.valid@arena360.in',
    phone: '9876543299',
    password: 'Pass12',
  });
  assert.equal(shortPwReg.status, 400);

  // FR1 Login empty fields -> 400
  const emptyLogin = await reqJson<{ error: string }>('POST', '/api/auth/login', {
    identifier: '',
    password: '',
  });
  assert.equal(emptyLogin.status, 400);

  // FR2 Profile update with email already owned by another account -> 409, invalid name -> 400
  const dupProf = await reqJson<{ error: string }>(
    'PUT',
    '/api/profile',
    {
      name: 'Nikhil Sharma',
      email: 'customer@arena360.in',
      phone: '9811122233',
      city: 'Bengaluru',
    },
    secondCustomerToken
  );
  assert.equal(dupProf.status, 409);

  const badNameProf = await reqJson<{ error: string }>(
    'PUT',
    '/api/profile',
    {
      name: 'N',
      email: 'nikhil.test@arena360.in',
    },
    secondCustomerToken
  );
  assert.equal(badNameProf.status, 400);

  // FR4 Search non-Bengaluru city -> 0 facilities
  const mumbaiSearch = await reqJson<{ facilities: unknown[] }>('GET', '/api/facilities?city=Mumbai');
  assert.equal(mumbaiSearch.status, 200);
  assert.equal(mumbaiSearch.data.facilities.length, 0);

  // FR5 Invalid facility availability -> 404
  const badAvail = await reqJson<{ error: string }>('GET', '/api/facilities/9999/availability?date=2026-12-01');
  assert.equal(badAvail.status, 404);

  // FR6 Non-existent slot -> 400
  const badSlot = await reqJson<{ error: string }>(
    'POST',
    '/api/bookings',
    {
      facility_id: 1,
      sport_id: 3,
      booking_date: futureDateStr(6),
      slot_label: '03:00 - 04:00',
    },
    customerToken
  );
  assert.equal(badSlot.status, 400);

  // FR7 Re-cancelling an already cancelled booking -> 409
  const cancelledList = await reqJson<{ bookings: Array<{ id: number; booking_type: string }> }>(
    'GET',
    '/api/bookings/my?type=facility&status=cancelled',
    undefined,
    customerToken
  );
  assert.ok(cancelledList.data.bookings.length >= 1);
  const recancel = await reqJson<{ error: string }>(
    'POST',
    `/api/bookings/${cancelledList.data.bookings[0].id}/cancel`,
    { reason: 'Duplicate cancel' },
    customerToken
  );
  assert.equal(recancel.status, 409);

  // FR8 Double-booking already booked trainer availability -> 409
  const bookedAvailRow = db
    .prepare('SELECT id, trainer_user_id FROM trainer_availability WHERE is_booked = 1 LIMIT 1')
    .get() as { id: number; trainer_user_id: number } | undefined;
  if (bookedAvailRow) {
    const dupSess = await reqJson<{ error: string }>(
      'POST',
      '/api/sessions',
      { trainer_user_id: bookedAvailRow.trainer_user_id, availability_id: bookedAvailRow.id, sport_id: 3 },
      secondCustomerToken
    );
    assert.equal(dupSess.status, 409);
  }

  // FR9 Invalid UPI ID & Invalid Card Digits -> 400
  const holdForPay = await reqJson<{ booking: { id: number } }>(
    'POST',
    '/api/bookings',
    {
      facility_id: 1,
      sport_id: 3,
      booking_date: futureDateStr(7),
      slot_label: '06:00 - 07:00',
    },
    customerToken
  );
  assert.equal(holdForPay.status, 201);

  const ordPay = await reqJson<{
    payment_id: number;
    order_id: string;
    simulated_payment_id: string;
    simulated_signature: string;
  }>('POST', '/api/payments/create-order', { type: 'facility', reference_id: holdForPay.data.booking.id, method: 'upi' }, customerToken);

  const badUpi = await reqJson<{ error: string }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: ordPay.data.payment_id,
      gateway_order_id: ordPay.data.order_id,
      gateway_payment_id: ordPay.data.simulated_payment_id,
      gateway_signature: ordPay.data.simulated_signature,
      method: 'upi',
      upi_id: 'invalid-upi-handle',
      outcome: 'success',
    },
    customerToken
  );
  assert.equal(badUpi.status, 400);

  const badCard = await reqJson<{ error: string }>(
    'POST',
    '/api/payments/verify',
    {
      payment_id: ordPay.data.payment_id,
      gateway_order_id: ordPay.data.order_id,
      gateway_payment_id: ordPay.data.simulated_payment_id,
      gateway_signature: ordPay.data.simulated_signature,
      method: 'credit_card',
      card_number: '411122',
      outcome: 'success',
    },
    customerToken
  );
  assert.equal(badCard.status, 400);

  // FR10 Notifications fetch, read, and unauthenticated 401 check
  const unauthNotif = await reqJson('GET', '/api/notifications');
  assert.equal(unauthNotif.status, 401);
  const notifList = await reqJson<{ notifications: Array<{ id: number }> }>('GET', '/api/notifications', undefined, customerToken);
  assert.equal(notifList.status, 200);
  assert.ok(notifList.data.notifications.length >= 1);
  const readAll = await reqJson('POST', '/api/notifications/read-all', {}, customerToken);
  assert.equal(readAll.status, 200);

  // FR11 Short comment review -> 400
  const shortRev = await reqJson<{ error: string }>(
    'POST',
    '/api/reviews',
    { target_type: 'facility', booking_id: 1, rating: 5, comment: 'Ok' },
    customerToken
  );
  assert.equal(shortRev.status, 400);

  // FR12 Trainer cannot delete an already booked availability slot -> 409
  if (bookedAvailRow) {
    const delBookedSlot = await reqJson<{ error: string }>(
      'DELETE',
      `/api/trainer/availability/${bookedAvailRow.id}`,
      undefined,
      trainerToken
    );
    assert.equal(delBookedSlot.status, 409);
  }

  // FR13 Non-owner trying to update facility 1 -> 403; Owner updating operating hours -> 200
  const unauthFacUpd = await reqJson<{ error: string }>(
    'PUT',
    '/api/owner/facilities/1',
    {
      name: 'Tampered Venue',
      description: 'Unauthorized attempt to modify facility.',
      address: 'Indiranagar, Bengaluru',
      city: 'Bengaluru',
      price_per_hour: 500,
    },
    customerToken
  );
  assert.equal(unauthFacUpd.status, 403);

  const ownerHours = await reqJson<{ message: string }>(
    'PUT',
    '/api/owner/facilities/1/hours',
    { hours: [{ day_of_week: 0, open_time: '06:00', close_time: '22:00', is_closed: false }] },
    ownerToken
  );
  assert.equal(ownerHours.status, 200);

  // FR14 Admin cannot deactivate self -> 400
  const adminMe = await reqJson<{ user: { id: number } }>('GET', '/api/auth/me', undefined, adminToken);
  const selfDeact = await reqJson<{ error: string }>(
    'PATCH',
    `/api/admin/users/${adminMe.data.user.id}/status`,
    { is_active: false },
    adminToken
  );
  assert.equal(selfDeact.status, 400);

  // FR15 Unauthenticated booking history -> 401
  const unauthHist = await reqJson('GET', '/api/bookings/my');
  assert.equal(unauthHist.status, 401);
});

test('Vercel serverless config resolves writable tmp SQLite path and exports Express handler', async () => {
  const { resolveDatabasePath } = await import('./db.ts');
  assert.equal(resolveDatabasePath({ SQLITE_DB_PATH: '/custom/db.sqlite' }), '/custom/db.sqlite');
  assert.equal(resolveDatabasePath({ VERCEL: '1' }), path.join(os.tmpdir(), 'arena360.db'));
  assert.equal(
    resolveDatabasePath({}),
    path.resolve(process.cwd(), 'data', 'arena360.db')
  );

  const vercelEntry = await import('../../api/index.ts');
  assert.equal(typeof vercelEntry.default, 'function');
});
