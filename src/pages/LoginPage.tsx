import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowLeft, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Logo } from '@/components/Logo';
import { friendlyError } from '@/lib/validation';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
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
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-navy-900 text-white flex-col justify-between p-12 overflow-hidden">
        <div className="absolute inset-0 bg-islamic-pattern opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-brand-900" />
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </div>
        <div className="relative z-10">
          <Logo variant="badge" imgClassName="h-20 w-20 rounded-full bg-white p-1" className="mb-8" />
          <h1 className="font-display text-4xl font-extrabold leading-tight text-balance">
            HajjERP Operations Platform
          </h1>
          <p className="mt-4 text-lg text-white/60 leading-relaxed max-w-md">
            Pilgrim Journey Control & Risk Monitoring — a secure internal control centre for Inna Ataina Travels.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4 max-w-md">
            {['Pilgrim Tracking', 'Sub-Agent Accountability', 'Risk Monitoring', 'Operations Dashboard'].map((label) => (
              <div key={label} className="flex items-center gap-2 text-sm text-white/70">
                <ShieldCheck className="h-4 w-4 text-gold-300 shrink-0" />
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-white/40">
          Authorised staff access only. Activity may be monitored for operational security.
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-20 bg-slate-50">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
            <Logo variant="badge" imgClassName="h-16 w-16 rounded-full bg-white p-1 mx-auto" className="justify-center" />
          </div>

          <div className="rounded-2xl bg-white shadow-xl border border-slate-100 p-8 sm:p-10">
            <div className="mb-8">
              <p className="text-sm font-semibold tracking-wider text-brand-600 uppercase">HajjERP Operations Platform</p>
              <h2 className="mt-2 font-display text-2xl font-extrabold text-slate-900">Welcome Back</h2>
              <p className="mt-2 text-sm text-slate-500">Sign in to access the Operations Control Centre</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4 animate-scale-in">
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@innaataina.com"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-11 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none transition-all"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-200"
                  />
                  <span className="text-sm text-slate-600">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen((v) => !v)}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {forgotOpen && (
                <div className="rounded-xl bg-brand-50 border border-brand-100 p-4 text-sm text-brand-800 animate-scale-in">
                  Please contact your Administrator to reset your password. Self-service password reset is not available on this platform.
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-900/20 hover:bg-brand-400 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <Lock className="h-5 w-5" />
                    Secure Sign In
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-center text-xs text-slate-400 leading-relaxed">
                Authorised staff access only. Activity may be monitored for operational security.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Need an account? Contact an Administrator to request staff access.
          </p>
        </div>
      </div>
    </div>
  );
}
