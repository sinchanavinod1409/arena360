import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Lock, RefreshCw, Smartphone, XCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { PaymentMethod } from '../../types.ts';
import { Modal } from '../ui/Primitives.tsx';

export interface CheckoutTarget {
  type: 'facility' | 'trainer';
  referenceId: number;
  bookingRef: string;
  title: string;
  subtitle: string;
  date: string;
  slotLabel: string;
  amount: number;
}

export function PaymentCheckoutModal({
  target,
  onClose,
  onSuccess,
}: {
  target: CheckoutTarget | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { refreshNotifications } = useAuth();
  const [method, setMethod] = useState<PaymentMethod>('upi');
  const [upiId, setUpiId] = useState('athlete@okaxis');
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('424');
  const [cardName, setCardName] = useState('Aarav Mehta');

  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedReceipt, setConfirmedReceipt] = useState<{
    payment_ref: string;
    gateway_payment_id: string;
    method_detail: string;
    amount: number;
  } | null>(null);

  useEffect(() => {
    setConfirmedReceipt(null);
    setErrorMsg('');
    setProcessing(false);
  }, [target?.type, target?.referenceId]);

  if (!target) return null;

  const executePayment = async (outcome: 'success' | 'failed' | 'cancelled') => {
    setErrorMsg('');
    setProcessing(true);
    try {
      const order = await api.post<{
        payment_id: number;
        payment_ref: string;
        order_id: string;
        simulated_payment_id: string;
        simulated_signature: string;
        test_mode: boolean;
      }>('/api/payments/create-order', {
        type: target.type,
        reference_id: target.referenceId,
        method,
      });

      const verifyRes = await api.post<{
        verified: boolean;
        payment: {
          payment_ref: string;
          gateway_payment_id: string;
          method_detail: string;
          amount: number;
        };
      }>('/api/payments/verify', {
        payment_id: order.payment_id,
        gateway_order_id: order.order_id,
        gateway_payment_id: order.simulated_payment_id,
        gateway_signature: order.simulated_signature,
        method,
        upi_id: method === 'upi' ? upiId : undefined,
        card_number: method !== 'upi' ? cardNumber : undefined,
        outcome,
      });

      if (verifyRes.verified) {
        setConfirmedReceipt(verifyRes.payment);
        await refreshNotifications();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Network error while communicating with payment gateway.');
      }
      await refreshNotifications();
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      title={confirmedReceipt ? 'Booking Confirmation & Receipt' : 'Checkout'}
      onClose={() => {
        if (confirmedReceipt) onSuccess();
        else onClose();
      }}
      maxWidth="max-w-xl"
    >
      {confirmedReceipt ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <h3 className="mt-2 text-lg font-bold text-slate-900">Booking Confirmed</h3>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Booking Reference</span>
              <span className="font-mono font-semibold text-slate-900">{target.bookingRef}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Receipt</span>
              <span className="font-mono font-medium text-slate-900">{confirmedReceipt.payment_ref}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Venue / Coach</span>
              <span className="font-medium text-slate-900 text-right">{target.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Schedule</span>
              <span className="font-mono text-slate-900">
                {target.date} · {target.slotLabel}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Method</span>
              <span className="font-medium text-slate-900">{confirmedReceipt.method_detail}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2.5 font-semibold">
              <span className="text-slate-900">Total Paid</span>
              <span className="font-mono text-emerald-700 tabular-nums">₹{confirmedReceipt.amount}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => onSuccess()}
              className="rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors"
            >
              View My Bookings
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Booking Ref: {target.bookingRef}</p>
                <h3 className="text-base font-semibold text-slate-900 mt-0.5">{target.title}</h3>
                <p className="text-xs text-slate-600 mt-0.5">{target.subtitle}</p>
                <p className="font-mono text-xs text-slate-700 mt-1.5">
                  {target.date} · {target.slotLabel}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-slate-500">Amount Due</p>
                <p className="font-mono text-xl font-bold text-slate-900 tabular-nums">₹{target.amount}</p>
              </div>
            </div>
          </div>

          {/* Method Tabs */}
          <div>
            <p className="text-xs font-semibold text-slate-700 mb-2">Select Payment Method</p>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
              {[
                { id: 'upi' as const, label: 'UPI / QR', icon: Smartphone },
                { id: 'credit_card' as const, label: 'Credit Card', icon: CreditCard },
                { id: 'debit_card' as const, label: 'Debit Card', icon: CreditCard },
              ].map((m) => {
                const Icon = m.icon;
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setMethod(m.id);
                      setErrorMsg('');
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Method Inputs */}
          {method === 'upi' ? (
            <div>
              <label htmlFor="upi-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                UPI ID (VPA)
              </label>
              <input
                id="upi-input"
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="name@okhdfcbank"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Supports GPay, PhonePe, Paytm, and BHIM UPI handles.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor="card-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Cardholder Name
                </label>
                <input
                  id="card-name"
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="card-num" className="block text-xs font-medium text-slate-700 mb-1">
                  Card Number
                </label>
                <input
                  id="card-num"
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-600 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="card-exp" className="block text-xs font-medium text-slate-700 mb-1">
                    Expiry (MM/YY)
                  </label>
                  <input
                    id="card-exp"
                    type="text"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="card-cvv" className="block text-xs font-medium text-slate-700 mb-1">
                    CVV
                  </label>
                  <input
                    id="card-cvv"
                    type="password"
                    maxLength={4}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-sky-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {errorMsg && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <XCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Payment Attempt Failed</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              disabled={processing}
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={processing}
              onClick={() => executePayment('success')}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
            >
              {processing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              <span>{processing ? 'Processing...' : errorMsg ? `Retry Pay ₹${target.amount}` : `Pay ₹${target.amount}`}</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
