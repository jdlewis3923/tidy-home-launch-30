/**
 * CapacityBanner — the one thing Justin must see without scrolling.
 *
 * Rendered by AdminChrome on every /admin route. Silent when every service is
 * green; loud the moment one turns amber or red.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CapacityResult } from "@/lib/capacity-config";

export default function CapacityBanner() {
  const [worst, setWorst] = useState<CapacityResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke("capacity-status");
      if (cancelled || error || !data?.ok) return;
      const w = (data.worst ?? null) as CapacityResult | null;
      setWorst(w && w.status !== "green" ? w : null);
    };
    load();
    const id = setInterval(load, 120_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!worst) return null;

  const red = worst.status === "red";

  return (
    <Link
      to="/admin/capacity"
      className={`admin-capacity-banner block px-4 py-2 text-sm font-semibold ${
        red ? "bg-rose-600 text-white" : "bg-amber-400 text-amber-950"
      }`}
      role="alert"
    >
      <span className="mx-auto flex max-w-5xl items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {worst.serviceName}: {worst.message}
      </span>
    </Link>
  );
}
