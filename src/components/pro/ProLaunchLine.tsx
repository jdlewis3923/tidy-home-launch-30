import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLaunchConfig } from "@/hooks/useLaunchConfig";
import { CAR_PRO_ROUTE_LINE, fmtLaunchDate, launchScope } from "@/lib/launch";

/** First-visit date for the signed-in Pro's own service(s), from launch_config. Car Pros see the demand line until a date is set. */
export default function ProLaunchLine({ className = "" }: { className?: string }) {
  const { language } = useLanguage();
  const es = language === "es";
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
        if (launchScope(s) === "car" && !row?.first_visit_date) {
          return (
            <p key={s} className="text-[13px] font-semibold text-[hsl(var(--pro-ink-soft))]">
              {label[s]?.[es ? 1 : 0] ?? s}: {es ? CAR_PRO_ROUTE_LINE.es : CAR_PRO_ROUTE_LINE.en}
            </p>
          );
        }
        if (!row?.first_visit_date) return null;
        return (
          <p key={s} className="text-[13px] font-semibold text-[hsl(var(--pro-ink-soft))]">
            {label[s]?.[es ? 1 : 0] ?? s}: {es ? "primeras visitas el" : "first visits"} {fmtLaunchDate(row.first_visit_date, language)} · {es ? "listo para el" : "be ready by"} {fmtLaunchDate(row.pro_ready_by, language)}
          </p>
        );
      })}
    </div>
  );
}
