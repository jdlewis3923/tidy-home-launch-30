import { Link } from 'react-router-dom';
import tidyLogo from '@/assets/tidy-logo.png';
import DashboardNavbar from '@/components/dashboard/DashboardNavbar';

const DashboardIndex = () => {
  return (
    <div className="min-h-screen bg-background">
      <DashboardNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-xs font-semibold text-primary mb-6">
            ✨ Now serving Kendall, West Kendall & Pinecrest
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight text-foreground leading-tight" style={{ letterSpacing: '-0.03em' }}>
            Your home, yard & car —<br />
            <span className="text-primary">handled.</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            One subscription. Background-checked pros. Cleaning, lawn care, and car detailing — all in one plan. Cancel anytime.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/dashboard/plan"
              className="rounded-lg bg-gradient-to-br from-primary-deep to-primary px-8 py-4 text-base font-extrabold text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.35)] hover:shadow-xl hover:scale-[1.02] transition-all"
            >
              Build Your Plan →
            </Link>
            <a
              href="#how-it-works"
              className="rounded-lg border border-border px-8 py-4 text-base font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              See How It Works
            </a>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="text-3xl md:text-4xl font-black text-center text-foreground tracking-tight mb-12" style={{ letterSpacing: '-0.03em' }}>
          Three services, one plan
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: '🏠', name: 'House Cleaning', desc: 'Deep cleans, routine upkeep, move-in/out ready. From $159/mo.', gradient: 'from-[#1d4ed8] to-[#60a5fa]' },
            { icon: '🌿', name: 'Lawn Care', desc: 'Mowing, edging, trimming — your yard stays sharp. From $85/mo.', gradient: 'from-[#16a34a] to-[#4ade80]' },
            { icon: '🚗', name: 'Car Detailing', desc: 'We come to your driveway. Interior + exterior. From $159/mo.', gradient: 'from-[#7c3aed] to-[#c084fc]' },
          ].map(svc => (
            <div key={svc.name} className="rounded-xl border-[1.5px] border-border bg-card overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all">
              <div className={`h-1 w-full bg-gradient-to-r ${svc.gradient}`} />
              <div className="p-6">
                <div className="text-4xl mb-3">{svc.icon}</div>
                <h3 className="text-xl font-bold text-foreground mb-2">{svc.name}</h3>
                <p className="text-sm text-muted-foreground">{svc.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center mt-6 text-sm text-muted-foreground">
          💡 Bundle 2 services for 15% off · All 3 for 20% off
        </p>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-secondary/50 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl md:text-4xl font-black text-center text-foreground tracking-tight mb-12" style={{ letterSpacing: '-0.03em' }}>
            How it works
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Pick your services', desc: 'Choose cleaning, lawn care, car detailing — or all three.' },
              { step: '2', title: 'Set your frequency', desc: 'Weekly, biweekly, or monthly. Change anytime.' },
              { step: '3', title: 'We match your pro', desc: 'Background-checked, insured, and rated by neighbors.' },
              { step: '4', title: 'Sit back & relax', desc: 'Photo verification after every visit. Satisfaction guaranteed.' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mx-auto mb-4">
                  {s.step}
                </div>
                <h3 className="font-bold text-foreground mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-black text-foreground tracking-tight mb-4" style={{ letterSpacing: '-0.03em' }}>
          Ready to get your weekends back?
        </h2>
        <p className="text-muted-foreground mb-8">Build your custom plan in under 3 minutes.</p>
        <Link
          to="/dashboard/plan"
          className="inline-block rounded-lg bg-gradient-to-r from-gold/80 to-gold px-8 py-4 text-base font-extrabold text-foreground shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all"
        >
          Get Started — It's Free to Sign Up →
        </Link>
        <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
          <span>✓ Cancel anytime</span>
          <span>✓ No contracts</span>
          <span>✓ Background-checked pros</span>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={tidyLogo} alt="Tidy" className="h-32 w-auto drop-shadow-[0_8px_24px_rgba(15,23,42,0.18)]" />
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Tidy Home Concierge. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default DashboardIndex;
