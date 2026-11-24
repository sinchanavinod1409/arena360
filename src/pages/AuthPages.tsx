import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import type { UserRole } from '../types.ts';
import { ErrorBanner } from '../components/ui/Primitives.tsx';

function routeForRole(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'facility_owner') return '/owner';
  if (role === 'trainer') return '/trainer';
  return '/dashboard';
}

export function LoginPage({
  onNavigate,
  embedded = false,
}: {
  onNavigate: (path: string) => void;
  embedded?: boolean;
}) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please enter your email/mobile number and password.');
      return;
    }
    setBusy(true);
    try {
      const user = await login(identifier.trim(), password);
      onNavigate(routeForRole(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Check your credentials.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={embedded ? 'mx-auto max-w-lg px-4 py-8 sm:px-6' : 'mx-auto max-w-lg px-4 py-12 sm:px-6'}>
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-[#0B132B]">
          Sign in to <span className="font-sporty italic tracking-wider">ARENA<span className="text-sky-600">360</span></span>
        </h1>
          <p className="mt-1 text-sm text-slate-600">
            Access your customer bookings, trainer schedule, facility console, or admin portal.
          </p>

          {error && (
            <div className="mt-4">
              <ErrorBanner message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-id" className="block text-xs font-medium text-slate-700 mb-1.5">
                Registered Email or Mobile Number
              </label>
              <input
                id="login-id"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="customer@gmail.com or 9876543210"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-pw" className="block text-xs font-medium text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => onNavigate('/forgot-password')}
                  className="text-xs font-medium text-sky-700 hover:text-sky-800"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-pw"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 pr-10 text-sm focus:border-sky-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-2.5 p-1 text-slate-500 hover:text-slate-900"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          New to ARENA360?{' '}
          <button
            type="button"
            onClick={() => onNavigate('/register')}
            className="font-semibold text-sky-700 hover:text-sky-800"
          >
            Create an account
          </button>
        </p>
      </div>
    </div>
  );
}

export function RegisterPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Full name must be at least 2 characters.');
    if (!email.includes('@')) return setError('Enter a valid email address.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter a valid 10-digit mobile number.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setBusy(true);
    try {
      const user = await register({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        role: 'customer',
        city: city.trim() || 'Bengaluru',
      });
      onNavigate(routeForRole(user.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="font-display text-2xl font-bold text-[#0B132B]">Create Customer Account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Register as a Bengaluru athlete or customer to book courts and certified coaches.
        </p>

        {error && (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Riya Sharma"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-city" className="block text-xs font-medium text-slate-700 mb-1">
                City
              </label>
              <input
                id="reg-city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 mb-1">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="riya@gmail.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-medium text-slate-700 mb-1">
                Mobile Number
              </label>
              <input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543215"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="reg-pw" className="block text-xs font-medium text-slate-700 mb-1">
                Password (min 8 chars)
              </label>
              <div className="relative">
                <input
                  id="reg-pw"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm focus:border-sky-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label="Toggle password visibility"
                  className="absolute right-2 top-2 p-1 text-slate-500"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reg-pw2" className="block text-xs font-medium text-slate-700 mb-1">
                Confirm Password
              </label>
              <input
                id="reg-pw2"
                type={showPw ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[#0B132B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
          >
            {busy ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already registered?{' '}
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="font-semibold text-sky-700 hover:text-sky-800"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordPage({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const [issuedCode, setIssuedCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post<{ message: string; verificationCode?: string }>('/api/auth/forgot-password', {
        email,
      });
      setMessage(res.message);
      if (res.verificationCode) setIssuedCode(res.verificationCode);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to process request');
    } finally {
      setBusy(false);
    }
  };

  const resetPw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>('/api/auth/reset-password', {
        email,
        code,
        newPassword,
      });
      setMessage(res.message);
      setTimeout(() => onNavigate('/login'), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2 text-[#0B132B]">
          <KeyRound className="h-5 w-5 text-sky-600" />
          <h1 className="font-display text-2xl font-bold">Reset Password</h1>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {step === 1
            ? 'Enter your registered email address to receive a verification code.'
            : 'Enter the verification code and set a new password.'}
        </p>

        {error && (
          <div className="mt-4">
            <ErrorBanner message={error} />
          </div>
        )}
        {message && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            {message}
            {issuedCode && (
              <p className="mt-1 font-mono font-bold">Verification Code: {issuedCode}</p>
            )}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={requestCode} className="mt-5 space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-xs font-medium text-slate-700 mb-1">
                Registered Email
              </label>
              <input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#0B132B] px-4 py-2.5 text-sm font-semibold text-white"
            >
              {busy ? 'Sending...' : 'Request Reset Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={resetPw} className="mt-5 space-y-4">
            <div>
              <label htmlFor="fp-code" className="block text-xs font-medium text-slate-700 mb-1">
                Verification Code
              </label>
              <input
                id="fp-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label htmlFor="fp-newpw" className="block text-xs font-medium text-slate-700 mb-1">
                New Password (min 8 chars)
              </label>
              <input
                id="fp-newpw"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              {busy ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => onNavigate('/login')}
          className="mt-4 w-full text-center text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}
