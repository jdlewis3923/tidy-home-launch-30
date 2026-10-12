import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLaunchConfig } from "@/hooks/useLaunchConfig";
import { fmtLaunchDate, launchScope } from "@/lib/launch";

/** First-visit date for the signed-in Pro's own service(s), from launch_config. */
export default function ProLaunchLine({ className = "" }: { className?: string }) {
  const cfg = useLaunchConfig();
  const { data: services } = useQuery({
    queryKey: ["my_pro_services"],
    queryFn: async () => {
      const { data } = await supabase.rpc("my_pro_services");
      return (data ?? []) as string[];
    },
  });
  if (!cfg || !services?.length) return null;
  const label: Record<string, [string, string]> = { cleaning: ["Cleaning", "Limpieza"], lawn: ["Lawn", "Jardín"], detailing: ["Car care", "Cuidado del auto"] };
  return (
    <div className={className} data-testid="pro-launch-line">
      {services.map((s) => {
        const row = cfg[launchScope(s)];
        if (!row?.first_visit_date) return null;
        return (
          <p key={s} className="text-[13px] font-semibold text-[hsl(var(--pro-ink-soft))]">
            {label[s]?.[0] ?? s}: first visits {fmtLaunchDate(row.first_visit_date)} · be ready by {fmtLaunchDate(row.pro_ready_by)}
            <span className="block font-normal" lang="es">{label[s]?.[1] ?? s}: primeras visitas el {fmtLaunchDate(row.first_visit_date, "es")} · listo para el {fmtLaunchDate(row.pro_ready_by, "es")}</span>
          </p>
        );
      })}
    </div>
  );
}
