import { Link } from 'react-router-dom';

export default function DashboardConfirmation() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center space-y-8 py-16">
        <div className="text-6xl">✅</div>
        <div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground" style={{ letterSpacing: '-0.03em' }}>
            You're all set! 🎉
          </h1>
          <p className="mt-2 text-muted-foreground">Welcome to Tidy. Your first service is being scheduled now.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 text-left">
          <div className="rounded-xl border-[1.5px] border-border bg-card p-6 space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">What happens next</h2>
            <ol className="space-y-3 text-sm text-foreground">
              <li className="flex gap-3"><span className="text-primary font-bold">1.</span> Check your email — your account login link is on its way</li>
              <li className="flex gap-3"><span className="text-primary font-bold">2.</span> We'll text you 24 hours before your first visit with your pro's details</li>
              <li className="flex gap-3"><span className="text-primary font-bold">3.</span> Your pro will text you when they're on the way</li>
              <li className="flex gap-3"><span className="text-primary font-bold">4.</span> After the visit, you'll get a photo summary and a chance to rate</li>
            </ol>
          </div>

          <div className="rounded-xl border-[1.5px] border-border bg-card p-6 space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Your plan summary</h2>
            <p className="text-sm text-muted-foreground">Your subscription details have been emailed to you.</p>

            <div className="pt-2 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Service status</h3>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="text-primary">Scheduled</span>
                <span>→ On the way</span>
                <span>→ In progress</span>
                <span>→ Completed</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/dashboard"
            className="rounded-lg bg-gradient-to-br from-primary-deep to-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-lg"
          >
            Back to your dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
