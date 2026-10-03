/** Reservation → paid conversion, from real rows only. Expected 40–60%. */
import { useReservations } from "./ReservationsForecast";

export default function ReservationConversionCard() {
  const { rows } = useReservations();
  if (!rows) return null;
  const live = rows.filter((r) => r.status !== "canceled");
  const invited = live.filter((r) => r.invited_at || r.status === "converted").length;
  const paid = live.filter((r) => r.status === "converted").length;
  const pct = invited ? (paid / invited) * 100 : null;
  return (
    <div className="rounded-xl border border-border bg-card p-4" data-testid="reservation-conversion-card">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Reservation → paid conversion</h3>
        <span className="text-2xl font-bold tabular-nums text-foreground">{pct === null ? "—" : `${pct.toFixed(0)}%`}</span>
      </div>
      <p className="text-xs text-muted-foreground">{paid} paid of {invited} sent a Convert link · {live.length} reservations total · expected 40–60%.</p>
    </div>
  );
}
