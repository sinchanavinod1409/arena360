import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidBookingTransition,
  isActiveSlotHold,
  calculateCancellationRefund,
  generateBookingReference,
  generateRazorpayOrderSignature,
  verifyRazorpaySignature,
  validateEmail,
  validatePhone,
  validateUpiId,
  validateCardLast4,
  canUserReviewStatus,
} from './domain.ts';

test('booking state machine enforces valid and invalid transitions', () => {
  assert.equal(isValidBookingTransition('pending', 'payment_pending'), true);
  assert.equal(isValidBookingTransition('payment_pending', 'confirmed'), true);
  assert.equal(isValidBookingTransition('payment_pending', 'failed'), true);
  assert.equal(isValidBookingTransition('confirmed', 'rescheduled'), true);
  assert.equal(isValidBookingTransition('confirmed', 'cancelled'), true);
  assert.equal(isValidBookingTransition('confirmed', 'completed'), true);

  // Invalid state shortcuts or transitions from terminal states
  assert.equal(isValidBookingTransition('cancelled', 'confirmed'), false);
  assert.equal(isValidBookingTransition('completed', 'cancelled'), false);
  assert.equal(isValidBookingTransition('confirmed', 'confirmed'), false);
  assert.equal(isValidBookingTransition('pending', 'completed'), false);
});

test('slot hold respects active bookings and 10-minute payment expiry', () => {
  const now = new Date('2026-11-16T10:00:00.000Z');
  assert.equal(isActiveSlotHold('confirmed', null, now), true);
  assert.equal(isActiveSlotHold('cancelled', null, now), false);
  assert.equal(isActiveSlotHold('failed', null, now), false);
  assert.equal(isActiveSlotHold('payment_pending', '2026-11-16T10:08:00.000Z', now), true);
  assert.equal(isActiveSlotHold('payment_pending', '2026-11-16T09:55:00.000Z', now), false);
});

test('cancellation policy computes 100%, 50%, and 0% refunds accurately', () => {
  const now = new Date(2026, 10, 16, 10, 0, 0); // Nov 16, 2026 10:00 local

  const full = calculateCancellationRefund(1200, '2026-11-18', '10:00', now);
  assert.equal(full.refundPercentage, 100);
  assert.equal(full.refundAmount, 1200);
  assert.equal(full.policyTier, 'full_refund');

  const partial = calculateCancellationRefund(1200, '2026-11-16', '20:00', now);
  assert.equal(partial.refundPercentage, 50);
  assert.equal(partial.refundAmount, 600);
  assert.equal(partial.policyTier, 'partial_refund');

  const none = calculateCancellationRefund(1200, '2026-11-16', '13:00', now);
  assert.equal(none.refundPercentage, 0);
  assert.equal(none.refundAmount, 0);
  assert.equal(none.policyTier, 'no_refund');
});

test('Razorpay HMAC signature generation and verification prevents tampering', () => {
  const secret = 'test_secret_123';
  const orderId = 'order_PNX001';
  const paymentId = 'pay_PNX999';
  const sig = generateRazorpayOrderSignature(orderId, paymentId, secret);

  assert.equal(verifyRazorpaySignature(orderId, paymentId, sig, secret), true);
  assert.equal(verifyRazorpaySignature(orderId, 'pay_TAMPERED', sig, secret), false);
  assert.equal(verifyRazorpaySignature(orderId, paymentId, 'wrong_sig', secret), false);
});

test('booking reference generator creates unique structured IDs', () => {
  const a = generateBookingReference('BK');
  const b = generateBookingReference('BK');
  assert.match(a, /^PNX-BK-\d{6}-[A-F0-9]{6}$/);
  assert.notEqual(a, b);
});

test('validators check email, phone, UPI, card digits, and review eligibility', () => {
  assert.equal(validateEmail('athlete@gmail.com'), true);
  assert.equal(validateEmail('invalid-email'), false);
  assert.equal(validatePhone('+91 98765 43210'), true);
  assert.equal(validatePhone('12345'), false);
  assert.equal(validateUpiId('arjun.sharma@okaxis'), true);
  assert.equal(validateUpiId('not-a-upi'), false);
  assert.deepEqual(validateCardLast4('4111 1111 1111 4242'), { valid: true, last4: '4242' });
  assert.deepEqual(validateCardLast4('4111'), { valid: false, last4: '' });

  const today = new Date('2026-11-16T12:00:00.000Z');
  assert.equal(canUserReviewStatus('completed', '2026-11-20', today), true);
  assert.equal(canUserReviewStatus('confirmed', '2026-11-15', today), true);
  assert.equal(canUserReviewStatus('confirmed', '2026-11-25', today), false);
  assert.equal(canUserReviewStatus('cancelled', '2026-11-10', today), false);
});
