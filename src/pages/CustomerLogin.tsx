import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Loader2, Eye, EyeOff, Home, Leaf, Car, ChevronRight, CalendarDays, CreditCard, Star, ShieldCheck } from 'lucide-react';
import heroImg from '@/assets/login-miami-dusk.jpg';
import cleaningImg from '@/assets/cleaning-interior.webp';
import lawnImg from '@/assets/lawn-care.webp';
import carImg from '@/assets/car-detailing.webp';
import { useLanguage } from '@/contexts/LanguageContext';
import tidyLogo from '@/assets/tidy-official-logo.png';

/**
 * Calm Apple-style login. Cream paper, oversized logo, single column.
 * Real <form> + autocomplete so password managers offer save/autofill.
 */
export default function CustomerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useLanguage();
  // Default view: signup if entry point signals it (?mode=signup from START MY PLAN),
  // otherwise sign-in (top-nav Login link).
  const initialIsSignUp = searchParams.get('mode') === 'signup';
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp);
  // Only allow same-origin internal paths to prevent open-redirect abuse.
  // If a redirect was explicitly requested (e.g. came from a protected route), honor it.
  // Otherwise we'll route admins → /admin/kpis and customers → /dashboard after sign-in.
  const rawRedirect = searchParams.get('redirect');
  const safeRedirect =
    rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setError('password must be at least 8 characters.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}${safeRedirect ?? '/dashboard'}`, data: { language: language === 'es' ? 'es' : 'en' } },
        });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          // Durable Terms/Privacy assent record (wording + version + server IP).
          const { recordConsentWithRetry, TERMS_VERSION, TERMS_CONSENT_WORDING } = await import('@/lib/consent');
          await recordConsentWithRetry({
            kind: 'terms',
            version: TERMS_VERSION,
            wording: TERMS_CONSENT_WORDING,
            email,
          });
          setError('');
          setIsSignUp(false);
          alert('check your email to confirm your account, then sign in.');
        }
      } else {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
          setError(authError.message);
        } else {
          // Decide destination: explicit redirect wins; otherwise admins → KPI Command Center, others → dashboard.
          let destination = safeRedirect;
          if (!destination) {
            const userId = authData.user?.id;
            if (userId) {
              const { data: roles } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', userId);
              const isAdmin = (roles ?? []).some((r) => r.role === 'admin');
              destination = isAdmin ? '/admin/kpis' : '/dashboard';
            } else {
              destination = '/dashboard';
            }
          }
          navigate(destination);
        }
      }
    } catch {
      setError('login service is unavailable. please try again.');
    } finally {
      setLoading(false);
    }
  };

  const es = language === 'es';
  const tiles = [
    { img: cleaningImg, Icon: Home, label: es ? 'Limpieza del Hogar' : 'House Cleaning', to: '/house-cleaning' },
    { img: lawnImg, Icon: Leaf, label: es ? 'Cuidado del Césped' : 'Lawn Care', to: '/lawn-care' },
    { img: carImg, Icon: Car, label: es ? 'Cuidado del Auto' : 'Car Care', to: '/car-detailing' },
  ];
  const trust = [
    { Icon: CalendarDays, label: es ? 'Un horario' : 'One Schedule' },
    { Icon: CreditCard, label: es ? 'Un pago' : 'One Payment' },
    { Icon: Star, label: es ? 'Pros verificados' : 'Vetted Pros' },
    { Icon: ShieldCheck, label: es ? 'Pros asegurados' : 'Insured Pros' },
  ];
  return (
    <div className="tidy-login relative min-h-screen overflow-hidden">
      <img src={heroImg} alt="" aria-hidden width={1088} height={1600} fetchPriority="high" decoding="async"
        className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="tidy-login-shade absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-8 pt-5">
        <a href="/" aria-label="Tidy"><img src={tidyLogo} alt="Tidy" className="h-20 w-auto drop-shadow-lg" /></a>
        <h1 className="tidy-login-title mt-6">
          <span>{es ? 'Más vida.' : 'More life.'}</span>
          <span className="tidy-login-gold">{es ? 'Menos tareas.' : 'Less chores.'}</span>
        </h1>
        <p className="mt-2 text-lg font-medium tidy-login-text">
          {es ? 'Un sistema. Un horario. Un pago.' : 'One system. One schedule. One payment.'}
        </p>
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {tiles.map(({ img, Icon, label, to }) => (
            <Link key={to} to={to} className="tidy-login-tile group relative block aspect-[3/3.6] overflow-hidden rounded-2xl">
              <img src={img} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              <span aria-hidden className="tidy-login-tile-shade absolute inset-0" />
              <span className="absolute inset-x-2 bottom-2 flex flex-col gap-1 tidy-login-text">
                <Icon className="h-6 w-6" />
                <span className="flex items-end justify-between gap-1 text-[13px] font-semibold leading-tight">
                  {label}<ChevronRight className="h-5 w-5 shrink-0 rounded-full border tidy-login-ring p-0.5" />
                </span>
              </span>
            </Link>
          ))}
        </div>
        <div className="tidy-login-card mt-5 rounded-2xl p-4">
        <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tidy-login-text">{es ? 'Correo' : 'Email'}</label>
            <input
              type="email"
              name="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full tidy-login-input w-full rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tidy-login-text">
              {isSignUp ? (es ? 'Crea una contraseña' : 'Create password') : (es ? 'Contraseña' : 'Password')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isSignUp ? 'min. 8 characters' : 'enter your password'}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={8}
                className="w-full tidy-login-input w-full rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {isSignUp && password.length > 0 && (
              <p className={`text-[11px] mt-1 ${password.length >= 8 ? 'text-ink' : 'text-ink-faint'}`}>
                {password.length >= 8 ? 'strong enough.' : `${8 - password.length} more characters.`}
              </p>
            )}
          </div>

          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold tidy-login-text">
                confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="re-enter your password"
                  autoComplete="new-password"
                  minLength={8}
                  className="w-full tidy-login-input w-full rounded-xl border px-4 py-3 text-base focus:outline-none focus:ring-2"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive lowercase">{error}</p>}

          {isSignUp && (
            <p className="text-xs tidy-login-text text-center leading-relaxed">
              {t("By creating an account you agree to our")}{" "}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                {t("Terms of Service")}
              </Link>{" "}
              {t("and")}{" "}
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                {t("Privacy Policy")}
              </Link>
              .
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="tidy-login-cta w-full inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-lg font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? (isSignUp ? (es ? 'Creando…' : 'Creating…') : (es ? 'Entrando…' : 'Signing in…')) : (isSignUp ? (es ? 'Crear cuenta' : 'Create Account') : (es ? 'Iniciar sesión' : 'Sign In'))}
            {!loading && <ChevronRight className="h-5 w-5" />}
          </button>

          <div className="text-center space-y-2 pt-2">
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setError(''); setConfirmPassword(''); }}
              className="text-xs tidy-login-text underline-offset-4 hover:underline"
            >
              {isSignUp ? (es ? '¿Ya eres miembro? Inicia sesión' : 'Already a member? Sign in') : (es ? '¿Nuevo aquí? Crea una cuenta' : 'New here? Create an account')}
            </button>
            <div>
              <Link to="/forgot-password" className="text-xs tidy-login-text underline-offset-4 hover:underline">
                {es ? '¿Olvidaste tu contraseña?' : 'Forgot password?'}
              </Link>
            </div>
          </div>
        </form>
        </div>
        <ul className="mt-6 grid grid-cols-4 gap-1 text-center tidy-login-text">
          {trust.map(({ Icon, label }) => (
            <li key={label} className="flex flex-col items-center gap-1.5 text-xs"><Icon className="h-6 w-6" />{label}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
