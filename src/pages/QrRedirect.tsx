import { useEffect, useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseQrCode, qrRedirectTarget } from "@/lib/qr-codes";
import { pushEvent } from "@/lib/tracking";
import RouteFallback from "@/components/RouteFallback";

/**
 * /q/:code — the printed door-hanger QR target.
 *
 * Every hit is logged (raw code, timestamp, user agent) and then redirected to
 * /neighbor. A malformed or unknown code NEVER 404s: it lands on /neighbor with
 * placement=unknown so a mis-scanned piece of paper still converts.
 */
const QrRedirect = () => {
  const { code } = useParams();
  const parsed = useMemo(() => parseQrCode(code), [code]);
  const target = useMemo(() => qrRedirectTarget(code), [code]);

  useEffect(() => {
    const raw = (code ?? "").slice(0, 120);
    pushEvent("qr_scan", {
      qr_code: raw,
      qr_parsed: Boolean(parsed),
      placement: parsed?.placement ?? "unknown",
      zip: parsed?.zip ?? undefined,
      lang: parsed?.lang ?? undefined,
      route: parsed?.route ?? undefined,
    });
    // Fire-and-forget: a logging failure must never block the redirect.
    void supabase
      .from("qr_scans")
      .insert({
        raw_code: raw,
        parsed: Boolean(parsed),
        lang: parsed?.lang ?? null,
        zip: parsed?.zip ?? null,
        placement: parsed?.placement ?? "unknown",
        route: parsed?.route ?? null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : null,
        referrer: typeof document !== "undefined" ? document.referrer.slice(0, 500) || null : null,
      })
      .then(({ error }) => {
        if (error) console.warn("[qr] scan log failed", error.message);
      });
  }, [code, parsed]);

  if (!target) return <RouteFallback />;
  return <Navigate to={target} replace />;
};

export default QrRedirect;
