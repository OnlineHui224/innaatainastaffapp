import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { friendlyError } from '@/lib/validation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';

const CAPABILITIES = [
  { label: 'Pilgrim journey control', detail: 'Arrival and departure state, confirmed or derived' },
  { label: 'Sub-agent accountability', detail: 'Responsibility traced to an organisation' },
  { label: 'Departure-risk monitoring', detail: 'Overdue and unconfirmed follow-up' },
  { label: 'Visa & contract logging', detail: 'Reviewed extraction into the pilgrim record' },
];

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setLoading(false);

    if (signInError) {
      setError(friendlyError({ message: signInError }));
      return;
    }
    navigate('/app/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand / context panel */}
      <div className="relative hidden overflow-hidden bg-navy-900 text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 bg-hajj-motif opacity-70" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-brand-900"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded px-1 py-0.5 text-sm text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Return to gateway
          </Link>
        </div>

        <div className="relative z-10">
          <Logo variant="badge" imgClassName="h-20 w-20 rounded-md bg-white p-2" className="mb-7" />
          <p className="text-2xs font-bold uppercase tracking-[0.24em] text-gold-300">Inna Ataina Travels</p>
          <h1 className="mt-2.5 font-display text-[2rem] font-extrabold leading-[1.1] tracking-tight text-balance xl:text-[2.375rem]">
            HajjERP Operations Platform
          </h1>
          <p className="mt-3.5 max-w-md text-[0.9375rem] leading-relaxed text-white/70">
            The internal control centre for Hajj and Umrah operations — where every pilgrim's position is either
            confirmed by a named officer or clearly marked as derived from a plan.
          </p>

          <div className="mt-8 grid max-w-lg grid-cols-1 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10 sm:grid-cols-2">
            {CAPABILITIES.map((capability) => (
              <div key={capability.label} className="bg-navy-900/80 px-3.5 py-3">
                <p className="text-[0.8125rem] font-semibold leading-snug text-white">{capability.label}</p>
                <p className="mt-0.5 text-2xs leading-snug text-white/50">{capability.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 border-t border-white/10 pt-5 text-xs leading-relaxed text-white/45">
          Authorised staff access only. Activity is recorded in the platform audit history for operational
          security.
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-1 flex-col justify-center bg-slate-100 px-4 py-10 sm:px-8 lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-7 text-center lg:hidden">
            <Logo
              variant="badge"
              imgClassName="mx-auto h-16 w-16 rounded-md bg-white p-2"
              className="justify-center"
            />
            <p className="mt-3 font-display text-lg font-extrabold text-navy-900">HajjERP</p>
            <p className="text-xs text-slate-500">Operations Platform</p>
          </div>

          <div className="rounded-lg border border-slate-300 bg-white">
            <div className="border-b border-slate-200 px-6 py-4">
              <p className="text-2xs font-bold uppercase tracking-widest text-brand-700">Staff sign in</p>
              <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-navy-900">
                Operations Control Centre
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Sign in with the credentials issued to you by an Administrator.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5" noValidate>
              {error && <Alert tone="critical" title="Sign-in failed">{error}</Alert>}

              <Field label="Email" htmlFor="login-email" required>
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@innaataina.com"
                  disabled={loading}
                  invalid={Boolean(error)}
                  leadingIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
                />
              </Field>

              <Field label="Password" htmlFor="login-password" required>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <Input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={loading}
                    invalid={Boolean(error)}
                    className="pl-9 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </Field>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotOpen((v) => !v)}
                  aria-expanded={forgotOpen}
                  aria-controls="forgot-password-help"
                  className="rounded px-1 py-0.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-800 hover:underline"
                >
                  Forgot password?
                </button>
              </div>

              {forgotOpen && (
                <div id="forgot-password-help">
                  <Alert tone="info" title="Password resets are administered">
                    Contact your Administrator to have your password reset. Self-service password reset is not
                    available on this platform.
                  </Alert>
                </div>
              )}

              <Button type="submit" size="lg" fullWidth loading={loading} icon={<Lock className="h-4 w-4" />}>
                {loading ? 'Signing in…' : 'Secure sign in'}
              </Button>

              {/*
                Session persistence is governed entirely by the existing Supabase
                client configuration. No "remember me" control is offered, because
                offering one would misrepresent what the platform actually does.
              */}
              <p className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
                Your session stays active until you sign out or it expires. Sign out when you leave a shared
                workstation.
              </p>
            </form>
          </div>

          <p className="mt-5 text-center text-sm text-slate-600">
            Need an account? Contact an Administrator.
            <span className="mt-0.5 block text-xs text-slate-500">
              There is no public registration on this platform.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
