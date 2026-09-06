/**
 * First-login welcome — /pro/first-run
 * Skippable, and shown only once per login.
 */
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { CalendarDays, DollarSign, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProSession } from "@/hooks/useProSession";
import { ProButton, ProCard } from "@/components/pro/portal/kit";
import tidyLogo from "@/assets/tidy-logo.png";

const CALLOUTS = [
  { icon: CalendarDays, title: "Today's work", body: "Every visit, time window and address in one list." },
  { icon: DollarSign, title: "Your pay", body: "A flat amount per completed visit, and the Friday it lands." },
  { icon: Trophy, title: "Your standing", body: "Visits, rating and days active — your path to Tier 2." },
];

export default function ProFirstRun() {
  const navigate = useNavigate();
  const { me, userId, loading } = useProSession();

  useEffect(() => {
    if (!loading && !userId) navigate("/pro/login", { replace: true });
  }, [loading, userId, navigate]);

  const done = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) localStorage.setItem(`tidy_pro_first_run_${data.user.id}`, "1");
    navigate("/pro/schedule", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--pro-ground))] font-sans">
      <Helmet>
        <title>Welcome · Tidy Pro Portal</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="bg-gradient-to-b from-[hsl(var(--pro-navy))] to-[hsl(var(--pro-sky))] px-6 pb-10 pt-[max(2rem,env(safe-area-inset-top))] text-white">
        <img src={tidyLogo} alt="" className="h-14 w-14 rounded-full object-contain" />
        <h1 className="mt-4 text-[28px] font-extrabold leading-tight">
          Welcome to Tidy{me?.first_name ? `, ${me.first_name}` : ""}.
        </h1>
        <p className="mt-2 text-[15px] text-white/85">Three things live in here.</p>
      </div>

      <main className="mx-auto -mt-6 max-w-md space-y-3 px-4 pb-10">
        {CALLOUTS.map(({ icon: Icon, title, body }) => (
          <ProCard key={title}>
            <div className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[hsl(var(--pro-blue-soft))]">
                <Icon className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
              </span>
              <div>
                <p className="text-[16px] font-bold text-[hsl(var(--pro-ink))]">{title}</p>
                <p className="text-[14px] text-[hsl(var(--pro-ink-soft))]">{body}</p>
              </div>
            </div>
          </ProCard>
        ))}
        <ProButton full onClick={() => void done()}>
          Start
        </ProButton>
        <button
          type="button"
          onClick={() => void done()}
          className="min-h-[44px] w-full text-[14px] font-bold text-[hsl(var(--pro-ink-soft))]"
        >
          Skip
        </button>
      </main>
    </div>
  );
}
