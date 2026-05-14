/**
 * Pro Dashboard — /pro
 *
 * Lightweight contractor-app shell. Surfaces the tier progression
 * widget at the very top under the welcome header, with placeholder
 * cards for the route, payouts, and photo upload modules that the Pro
 * app will render in production.
 */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, Navigate } from "react-router-dom";
import { Calendar, DollarSign, Camera, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import MyTierWidget from "@/components/pro/MyTierWidget";

export default function ProDashboard() {
  const [firstName, setFirstName] = useState("Pro");
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) { setAuthed(false); return; }
      setAuthed(true);
      const meta = (user.user_metadata ?? {}) as Record<string, string>;
      const email = user.email ?? "";
      setFirstName(meta.first_name || email.split("@")[0] || "Pro");
    })();
  }, []);

  if (authed === false) return <Navigate to="/login?next=/pro" replace />;

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet><title>Pro Dashboard — Tidy</title></Helmet>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pro app</p>
          <h1 className="text-3xl font-bold text-slate-900">
            Welcome back, {firstName}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Here's your tier status, route, and earnings at a glance.
          </p>
        </header>

        <MyTierWidget />

        <div className="grid gap-3 sm:grid-cols-3 mt-6">
          <PlaceholderCard icon={<Calendar className="h-4 w-4" />} title="Today's route" body="3 visits scheduled" />
          <PlaceholderCard icon={<DollarSign className="h-4 w-4" />} title="This week" body="$640 earned" />
          <PlaceholderCard icon={<Camera className="h-4 w-4" />} title="Photo uploads" body="2 pending" />
        </div>
      </div>
    </div>
  );
}

function PlaceholderCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="text-slate-500">{icon}</span>
            <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </div>
        <p className="mt-2 text-sm font-medium text-slate-900">{body}</p>
      </CardContent>
    </Card>
  );
}
