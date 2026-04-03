import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import tidyLogo from '@/assets/tidy-logo.png';

export default function CustomerLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      // Import supabase client dynamically to avoid errors when Cloud isn't set up yet
      const { supabase } = await import('@/integrations/supabase/client');
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(authError.message);
      } else {
        navigate('/dashboard');
      }
    } catch {
      setError('Authentication service is not available yet. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img src={tidyLogo} alt="Tidy" className="h-20 w-auto mx-auto mb-4" />
          <h1 className="text-2xl font-black tracking-tight text-foreground" style={{ letterSpacing: '-0.03em' }}>
            Login
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to manage your Tidy plan</p>
        </div>

        {isSignUp && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-sm text-foreground font-medium">🎉 Creating your account</p>
            <p className="text-xs text-muted-foreground mt-0.5">You'll set your password below — use at least 8 characters.</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {isSignUp ? 'Create Password' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isSignUp ? 'Create a strong password (min. 8 characters)' : 'Enter your password'}
              minLength={8}
              className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              required
            />
            {isSignUp && password.length > 0 && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className={`h-1 flex-1 rounded-full ${password.length >= 8 ? 'bg-success' : 'bg-destructive/40'}`} />
                <span className={`text-xs font-medium ${password.length >= 8 ? 'text-success' : 'text-muted-foreground'}`}>
                  {password.length >= 8 ? '✓ Strong enough' : `${8 - password.length} more characters needed`}
                </span>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-br from-primary-deep to-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-all hover:shadow-xl hover:scale-[1.01] disabled:opacity-50"
          >
            {loading ? (isSignUp ? 'Creating account...' : 'Signing in...') : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>

          <div className="text-center space-y-2">
            <button type="button" onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-sm text-primary hover:underline">
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
            </button>
            {!isSignUp && (
              <div>
                <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot your password?
                </Link>
              </div>
            )}
          </div>

          <div className="text-center pt-4 border-t border-border">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to main site
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
