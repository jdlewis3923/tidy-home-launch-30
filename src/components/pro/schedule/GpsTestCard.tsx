/**
 * GPS self-test — shown on the Pro schedule when no visits are assigned.
 * Runs the phone's real location check and records it (pro_gps_tests) so the
 * owner can verify iPhone/Android accuracy before launch. Optional address
 * field measures the distance against the 150 m rule; without one the test
 * is recorded as "GPS unverified" and never blocks anything.
 */
import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { ProButton } from "@/components/pro/portal/kit";

type TestResult = {
  result: "within_150m" | "outside_150m" | "no_target";
  distance_m: number | null;
  accuracy_m: number | null;
  geocode_failed: boolean;
};

export default function GpsTestCard() {
  const { language } = useLanguage();
  const es = language === "es";
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    setOutcome(null);
    if (!("geolocation" in navigator)) {
      setError(es
        ? "Este teléfono no permite leer la ubicación desde el navegador."
        : "This phone can't share its location with the browser.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Resolve the typed address in the browser (server-side geocoders
          // are blocked from the backend runtime).
          let target: { target_lat: number; target_lng: number } | undefined;
          const addr = address.trim();
          if (addr) {
            try {
              const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
              );
              const hits = await res.json();
              const hit = hits?.[0];
              if (hit?.lat && hit?.lon) {
                target = { target_lat: parseFloat(hit.lat), target_lng: parseFloat(hit.lon) };
              }
            } catch {
              target = undefined;
            }
          }
          const { data, error: fnErr } = await supabase.functions.invoke("pro-gps-test", {
            body: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy_m: Math.round(pos.coords.accuracy ?? 0),
              address: addr || undefined,
              ...target,
            },
          });
          if (fnErr || !data?.ok) {
            setError(es ? "No se pudo guardar la prueba. Intente de nuevo." : "Couldn't save the test. Try again.");
          } else {
            setOutcome(data as TestResult);
          }
        } catch {
          setError(es ? "No se pudo guardar la prueba. Intente de nuevo." : "Couldn't save the test. Try again.");
        } finally {
          setBusy(false);
        }
      },
      () => {
        setBusy(false);
        setError(es
          ? "Active la ubicación para este sitio en los ajustes de su teléfono y vuelva a intentar."
          : "Turn on location for this site in your phone settings, then try again.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  return (
    <section className="mx-[18px] mt-4 space-y-3 rounded-[18px] border border-[hsl(var(--pro-navy)/0.07)] bg-white p-4 pro-card">
      <div className="flex items-center gap-2">
        <Crosshair className="h-5 w-5 text-[hsl(var(--pro-blue))]" aria-hidden />
        <h2 className="text-[15px] font-bold text-[hsl(var(--pro-ink))]">
          {es ? "Prueba de ubicación (GPS)" : "Location (GPS) test"}
        </h2>
      </div>
      <p className="text-[13px] leading-snug text-[hsl(var(--pro-ink-soft))]">
        {es
          ? "Antes del lanzamiento probamos que el GPS de su teléfono funcione con las llegadas y salidas. Párese en la dirección de prueba, escríbala abajo y corra la prueba."
          : "Before launch we verify your phone's GPS works for check-in and check-out. Stand at the test address, type it below, and run the test."}
      </p>
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder={es ? "Dirección donde está parado (opcional)" : "Address where you're standing (optional)"}
        className="min-h-[44px] w-full rounded-lg border border-input bg-background px-3 text-[14px] text-foreground"
      />
      <ProButton onClick={run} disabled={busy} className="w-full">
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {es ? "Leyendo su ubicación…" : "Reading your location…"}
          </span>
        ) : (
          es ? "Correr prueba de GPS" : "Run GPS test"
        )}
      </ProButton>
      {error && <p className="text-[13px] font-semibold text-destructive">{error}</p>}
      {outcome && (
        <div className="space-y-1 rounded-lg bg-[hsl(var(--pro-navy)/0.04)] p-3 text-[13px] text-[hsl(var(--pro-ink))]">
          <p className="font-bold">
            {outcome.result === "within_150m"
              ? (es ? "Dentro de 150 m — prueba exitosa" : "Within 150 m — test passed")
              : outcome.result === "outside_150m"
                ? (es ? "Fuera de 150 m" : "Outside 150 m")
                : (es ? "Ubicación registrada (sin dirección de referencia)" : "Location recorded (no reference address)")}
          </p>
          {outcome.accuracy_m !== null && (
            <p>{es ? "Precisión del teléfono" : "Phone accuracy"}: ±{outcome.accuracy_m} m</p>
          )}
          {outcome.distance_m !== null && (
            <p>{es ? "Distancia a la dirección" : "Distance to address"}: {outcome.distance_m} m</p>
          )}
          {outcome.geocode_failed && (
            <p>{es
              ? "No se pudo localizar esa dirección; la prueba se guardó sin distancia."
              : "That address couldn't be located; the test was saved without a distance."}</p>
          )}
        </div>
      )}
    </section>
  );
}
