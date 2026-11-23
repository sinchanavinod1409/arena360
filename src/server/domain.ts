import crypto from 'node:crypto';

export type UserRole = 'customer' | 'trainer' | 'facility_owner' | 'admin';

export type BookingStatus =
  | 'pending'
  | 'payment_pending'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'completed'
  | 'failed'
  | 'expired';

export type PaymentMethod = 'upi' | 'credit_card' | 'debit_card';

export type PaymentStatus = 'initiated' | 'verified' | 'failed' | 'cancelled' | 'refunded';

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['payment_pending', 'cancelled', 'expired', 'failed'],
  payment_pending: ['confirmed', 'failed', 'cancelled', 'expired'],
  confirmed: ['completed', 'cancelled', 'rescheduled'],
  rescheduled: ['completed', 'cancelled', 'rescheduled'],
  cancelled: [],
  completed: [],
  failed: ['payment_pending', 'cancelled'],
  expired: ['payment_pending'],
};

export function isValidBookingTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isActiveSlotHold(
  status: BookingStatus,
  reservationExpiresAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (status === 'confirmed' || status === 'rescheduled' || status === 'pending') {
    return true;
  }
  if (status === 'payment_pending') {
    if (!reservationExpiresAt) return true;
    return new Date(reservationExpiresAt).getTime() > now.getTime();
  }
  return false;
}

export interface RefundPolicyResult {
  refundPercentage: number;
  refundAmount: number;
  policyTier: 'full_refund' | 'partial_refund' | 'no_refund';
  explanation: string;
}

export function calculateCancellationRefund(
  totalAmount: number,
  bookingDate: string,
  slotStartTime: string,
  now: Date = new Date()
): RefundPolicyResult {
  const safeAmount = Math.max(0, Math.round(totalAmount));
  const [year, month, day] = bookingDate.split('-').map(Number);
  const [hours, minutes] = slotStartTime.split(':').map(Number);
  const slotDateTime = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, 0, 0);
  const hoursUntilStart = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilStart >= 24) {
    return {
      refundPercentage: 100,
      refundAmount: safeAmount,
      policyTier: 'full_refund',
      explanation: 'Cancelled 24+ hours before slot start: 100% refund eligible.',
    };
  }
  if (hoursUntilStart >= 6) {
    return {
      refundPercentage: 50,
      refundAmount: Math.round(safeAmount * 0.5),
      policyTier: 'partial_refund',
      explanation: 'Cancelled between 6 and 24 hours before slot start: 50% refund eligible.',
    };
  }
  return {
    refundPercentage: 0,
    refundAmount: 0,
    policyTier: 'no_refund',
    explanation: 'Cancelled within 6 hours of slot start: non-refundable under cancellation policy.',
  };
}

export function generateBookingReference(prefix: 'BK' | 'TR' | 'PAY' = 'BK'): string {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PNX-${prefix}-${datePart}-${rand}`;
}

export function generateRazorpayOrderSignature(
  orderId: string,
  paymentId: string,
  secret: string
): string {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = generateRazorpayOrderSignature(orderId, paymentId, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/[\s\-+]/g, '');
  return /^\d{10,13}$/.test(digits);
}

export function validateUpiId(upiId: string): boolean {
  return /^[a-zA-Z0-9._\-]{2,64}@[a-zA-Z0-9]{2,32}$/.test(upiId.trim());
}

export function validateCardLast4(cardNumber: string): { valid: boolean; last4: string } {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) {
    return { valid: false, last4: '' };
  }
  return { valid: true, last4: digits.slice(-4) };
}

export function getReservationExpiryIso(minutesFromNow = 10, now: Date = new Date()): string {
  return new Date(now.getTime() + minutesFromNow * 60 * 1000).toISOString();
}

export function canUserReviewStatus(status: BookingStatus, bookingDate: string, now: Date = new Date()): boolean {
  if (status === 'completed') return true;
  if (status === 'confirmed' || status === 'rescheduled') {
    const todayStr = now.toISOString().slice(0, 10);
    return bookingDate <= todayStr;
  }
  return false;
}
