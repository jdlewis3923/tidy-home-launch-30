/**
 * Pro sign in — /pro/login
 * States: default, focused, invalid credentials, loading, reset sent,
 * account not provisioned, disabled account.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ProHead, { ProMark } from "@/components/pro/portal/ProHead";
import { ArrowLeft, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProButton } from "@/components/pro/portal/kit";
import heroHome from "@/assets/miami-waterfront.webp";

export default function ProLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInError) {
      const msg = signInError.message.toLowerCase();
      setError(
        msg.includes("banned") || msg.includes("disabled")
          ? "This account is disabled. Contact hello@jointidy.co."
          : "That email and password don't match. Try again.",
      );
      setBusy(false);
      return;
    }
    // Provisioned? A Pro must have an applicant record linked to this login.
    const { data: me } = await supabase.rpc("pro_get_me");
    const row = Array.isArray(me) ? me[0] : me;
    if (!row) {
      setError("This login isn't set up as a Tidy Pro yet. Contact hello@jointidy.co.");
      await supabase.auth.signOut();
      setBusy(false);
      return;
    }
    const firstRun = !localStorage.getItem(`tidy_pro_first_run_${data.user?.id}`);
    navigate(firstRun ? "/pro/first-run" : "/pro/schedule", { replace: true });
  };

  const sendReset = async () => {
    if (!email.trim()) {
      setError("Enter your email first, then tap Forgot password.");
      return;
    }
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetSent(true);
    setError(null);
  };

  return (
    <div className="relative min-h-screen bg-[hsl(var(--pro-navy))] font-sans">
      <ProHead title="Sign in · Tidy Pro Portal" />

      <img
        src={heroHome}
        alt="South Florida home at golden hour"
        className="absolute inset-x-0 top-0 h-[46vh] w-full object-cover"
      />
      <div className="absolute inset-x-0 top-0 h-[46vh] bg-gradient-to-b from-[hsl(var(--pro-navy)/0.55)] via-[hsl(var(--pro-navy)/0.7)] to-[hsl(var(--pro-navy))]" />

      <header className="relative flex items-center gap-2 px-2 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <Link to="/pro/welcome" aria-label="Back" className="grid h-11 w-11 place-items-center rounded-full active:bg-white/10">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <ProMark size={30} />
        <span className="text-[15px] font-extrabold">Tidy Pro Portal</span>
      </header>

      <main className="relative mx-auto max-w-md px-5 pb-16 pt-6">
        <div className="flex flex-col items-center text-center text-white">
          <img
            src="/pro-icon-512.png"
            alt="Tidy Pro"
            className="h-20 w-20 rounded-[24%] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.7)]"
          />
          <p className="mt-3 text-[12px] font-bold uppercase tracking-[0.35em] text-[hsl(var(--pro-sky))]">
            Pro Portal
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)]">
        <h1 className="text-[24px] font-extrabold text-[hsl(var(--pro-ink))]">Sign in</h1>
        <p className="mt-1 text-[14px] text-[hsl(var(--pro-ink-soft))]">
          Use the email Tidy set your account up with.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn();
          }}
        >
          <label className="block">
            <span className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">Email</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 min-h-[48px] w-full rounded-xl border border-[hsl(var(--pro-line))] bg-white px-4 text-[16px] text-[hsl(var(--pro-ink))] outline-none focus:border-[hsl(var(--pro-blue))] focus:ring-2 focus:ring-[hsl(var(--pro-blue)/0.25)]"
            />
          </label>

          <label className="block">
            <span className="text-[13px] font-bold text-[hsl(var(--pro-ink))]">Password</span>
            <span className="relative mt-1 block">
              <input
                type={reveal ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[hsl(var(--pro-line))] bg-white px-4 pr-14 text-[16px] text-[hsl(var(--pro-ink))] outline-none focus:border-[hsl(var(--pro-blue))] focus:ring-2 focus:ring-[hsl(var(--pro-blue)/0.25)]"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? "Hide password" : "Show password"}
                className="absolute right-1 top-1 grid h-[44px] w-[44px] place-items-center rounded-lg text-[hsl(var(--pro-ink-soft))]"
              >
                {reveal ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
              </button>
            </span>
          </label>

          {error && (
            <p className="flex items-start gap-2 rounded-xl bg-[hsl(var(--pro-red-soft))] p-3 text-[14px] font-semibold text-[hsl(var(--pro-red))]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
          {resetSent && (
            <p className="rounded-xl bg-[hsl(var(--pro-blue-soft))] p-3 text-[14px] font-semibold text-[hsl(var(--pro-blue))]">
              Reset link sent. Check your email.
            </p>
          )}

          <ProButton type="submit" full disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </ProButton>
        </form>

        <button
          type="button"
          onClick={() => void sendReset()}
          className="mt-4 min-h-[44px] w-full text-[14px] font-bold text-[hsl(var(--pro-blue))]"
        >
          Forgot password
        </button>
        </div>
      </main>
    </div>
  );
}
