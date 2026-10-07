/** Add-ons (paid and gifted look the same) and car wash vehicle details on the Pro job sheet. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProCard } from "@/components/pro/portal/kit";

type Extras = {
  addons: { name: string; status: string }[];
  car_wash: null | {
    vehicle_make?: string; vehicle_model?: string; vehicle_color?: string; parking_spot?: string;
    interior_included?: boolean; interior_access?: string; gate_code?: string; access_note?: string;
  };
};

export default function ProVisitExtras({ visitId }: { visitId: string }) {
  const [x, setX] = useState<Extras | null>(null);
  useEffect(() => {
    supabase.rpc("pro_visit_extras", { _visit: visitId }).then(({ data }) => setX((data as unknown as Extras) ?? null));
  }, [visitId]);
  if (!x || ((x.addons?.length ?? 0) === 0 && !x.car_wash)) return null;
  const c = x.car_wash;
  const row = (k: string, v?: string | null) => v ? (
    <p className="py-1 text-[14px]"><span className="font-semibold">{k}:</span> {v}</p>
  ) : null;
  return (
    <ProCard className="mt-3">
      {x.addons.length > 0 && (
        <>
          <p className="pb-1 text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">Add-ons on this visit</p>
          <ul className="list-disc pl-5 text-[14px]">
            {x.addons.map((a, i) => <li key={i}>{a.name}{a.status === "completed" ? " ✓" : ""}</li>)}
          </ul>
        </>
      )}
      {c && (
        <div className={x.addons.length ? "mt-3" : ""}>
          <p className="pb-1 text-[12px] font-bold uppercase tracking-wide text-[hsl(var(--pro-ink-soft))]">Vehicle</p>
          {row("Car", [c.vehicle_color, c.vehicle_make, c.vehicle_model].filter(Boolean).join(" "))}
          {row("Parked", c.parking_spot)}
          {row("Interior", c.interior_included ? `Included — ${c.interior_access || "ask the member for access"}` : "Exterior only")}
          {row("Gate code", c.gate_code)}
          {row("Note", c.access_note)}
        </div>
      )}
    </ProCard>
  );
}
