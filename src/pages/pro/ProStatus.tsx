/**
 * Status — /pro/status (mockup screen 5). Tier, the three Tier 2 gates as
 * recorded (never rounded up), badge card that flips to a verify QR.
 */
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import QRCode from "qrcode";
import { BadgeCheck, Star } from "lucide-react";
import ProShell from "@/components/pro/portal/ProShell";
import { CopyLink, ErrorState, ProButton, ScheduleSkeleton, StatusPill } from "@/components/pro/portal/kit";
import { useProSession } from "@/hooks/useProSession";
import { TIER_2_GATES } from "@/lib/pro-pay";
import { useLanguage } from "@/contexts/LanguageContext";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const daysActive = (since: string | null) => since ? Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000)) : 0;
const DOTS = [[8, 18, "--pro-gold", 12], [88, 12, "--pro-gold", 10], [20, 70, "--pro-green", 6], [80, 62, "--pro-gold", 8], [70, 8, "--pro-green", 6], [30, 6, "--pro-gold", 7]] as const;

export default function ProStatus() {
  const { me, coi, isOwner, loading, error, reload, userId } = useProSession();
  const { language } = useLanguage();
  const es = language === "es";
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const verifyUrl = me?.badge_token ? `${window.location.origin}/verify/${me.badge_token}` : null;
  useEffect(() => { if (verifyUrl) void QRCode.toDataURL(verifyUrl, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(null)); }, [verifyUrl]);

  if (!loading && !userId) return <Navigate to="/pro/welcome" replace />;
  const tier2 = me?.tier === "tier_2_pro" || me?.tier === "tier_2";
  const visitsDone = me?.completed_visits ?? 0;
  const rating = me?.avg_rating ?? 0;
  const days = daysActive(me?.active_since ?? null);
  const up = (i: number) => reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.26, delay: 0.08 * i, ease: EASE } };
  const badgeActive = me?.badge_status === "active";

  return (
    <ProShell title={es ? "Estado" : "Status"} showBell dark>
      {loading && <ScheduleSkeleton />}
      {!loading && error && <ErrorState title={es ? "No se pudo cargar su estado" : "Couldn't load your status"} onRetry={reload} />}
      {!loading && !error && (
        <div className="pro-status-screen">
          <div className="pro-status-hero">
            {DOTS.map(([x, y, c, s], i) => (
              <motion.span key={i} aria-hidden className="absolute rotate-45 rounded-[2px]" style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, background: `hsl(var(${c}))` }}
                initial={reduce ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, delay: 0.1 + i * 0.04 }} />
            ))}
            <motion.div initial={reduce ? false : { scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: reduce ? 0 : 0.3, ease: EASE }} className="pro-status-emblem">
              <BadgeCheck aria-hidden />
            </motion.div>
            <motion.div {...up(0)} className="pro-status-tier">
            <h2>{tier2 ? (es ? "Pro Nivel 2" : "Tier 2 Pro") : (es ? "Nivel 1 Verificado" : "Tier 1 Verified")}</h2>
            <p>
              {tier2 ? (es ? "El pago de Nivel 2 aplica a sus visitas completadas." : "Tier 2 pay applies to your completed visits.")
                : es ? `Nivel 2 se desbloquea con ${TIER_2_GATES.visits} visitas completadas, calificación de ${TIER_2_GATES.rating} y ${TIER_2_GATES.days} días activo.`
                : `Tier 2 unlocks at ${TIER_2_GATES.visits} completed visits, a ${TIER_2_GATES.rating} rating and ${TIER_2_GATES.days} days active.`}
            </p>
            </motion.div>
          </div>

          <motion.section {...up(1)} className="pro-status-progress">
            {[
              [es ? "Visitas completadas" : "Completed visits", `${visitsDone} / ${TIER_2_GATES.visits}`, (visitsDone / TIER_2_GATES.visits) * 100, "--pro-blue"],
              [es ? "Calificación de clientes" : "Customer rating", `${rating ? rating.toFixed(2) : "—"} / ${TIER_2_GATES.rating}`, rating ? (rating / TIER_2_GATES.rating) * 100 : 0, "--pro-blue"],
              [es ? "Días activo" : "Days active", `${days} / ${TIER_2_GATES.days}`, (days / TIER_2_GATES.days) * 100, "--pro-green"],
            ].map(([l, v, p, t]) => (
              <div key={String(l)} className="pro-status-milestone">
                <div className="pro-status-label"><span>{l}</span><span>{v}</span></div>
                <div className="pro-status-track" role="progressbar" aria-label={String(l)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, p as number)} aria-valuetext={String(v)}>
                  <motion.div className={`pro-status-fill ${t === "--pro-green" ? "pro-status-fill-green" : ""}`} initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.min(100, p as number)}%` }} transition={{ duration: reduce ? 0 : 0.3, ease: EASE }} />
                </div>
              </div>
            ))}
          </motion.section>

          <motion.div {...up(2)} className="pro-status-badge-wrap">
            <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: reduce ? 0 : 0.3, ease: EASE }} className="pro-status-badge-button">
            <ProButton variant="outlined" type="button" disabled={!verifyUrl} onClick={() => setFlipped((f) => !f)} aria-pressed={flipped} aria-label={es ? "Voltear insignia para ver el código QR" : "Flip badge to show QR code"} className="pro-status-badge-button">
              <div className="pro-status-badge-face" aria-hidden={flipped}>
                <div className="flex items-start gap-3">
                  <BadgeCheck className="pro-status-badge-icon" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="pro-status-badge-title">{es ? "Su insignia" : "Your Badge"}</p>
                    <p className="pro-status-badge-number-label">{es ? "Número Pro" : "Pro number"}</p>
                    <p className="pro-status-badge-number">{me?.pro_number ?? "—"}</p>
                  </div>
                  <StatusPill tone={badgeActive ? "green" : "neutral"}>{badgeActive ? (es ? "ACTIVA" : "ACTIVE") : (me?.badge_status ?? (es ? "pendiente" : "pending"))}</StatusPill>
                </div>
                <p className="pro-status-badge-note">{es ? "Su enlace de verificación: los clientes pueden comprobar su insignia con él." : "Your verification link — customers can check your badge with this."}</p>
              </div>
              <div className="pro-status-badge-back" aria-hidden={!flipped}>
                {qr ? <img src={qr} alt={es ? "Código QR de verificación" : "Verification QR code"} className="h-[150px] w-[150px]" /> : null}
              </div>
            </ProButton>
            </motion.div>
          </motion.div>
          {verifyUrl && <div className="pro-status-extra"><CopyLink value={verifyUrl} label={es ? "Copiar" : "Copy"} /></div>}

          {!isOwner && <section className="pro-status-extra">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-semibold text-[hsl(var(--pro-ink))]">{es ? "Seguro" : "Insurance"}</p>
              <StatusPill tone={coi?.can_work ? "green" : "amber"}>{({ none: ["Missing", "Falta"], under_review: ["Under review", "En revisión"], active: ["Active", "Activo"], expiring: ["Expiring", "Por vencer"], expired: ["Expired", "Vencido"] } as Record<string, [string, string]>)[coi?.status ?? "none"]?.[es ? 1 : 0]}</StatusPill>
            </div>
            <p className="mt-1 text-[12.5px] text-[hsl(var(--pro-ink-soft))]">
              {coi?.expires_at ? `${es ? "El certificado vence el" : "Certificate on file expires"} ${new Date(coi.expires_at).toLocaleDateString(es ? "es-US" : "en-US", { month: "long", day: "numeric", year: "numeric" })}.` : (es ? "Aún no hay certificado registrado." : "No certificate on file yet.")}
            </p>
          </section>}

          {me?.referral_code && (
            <section className="pro-status-extra">
              <p className="inline-flex items-center gap-2 text-[14px] font-semibold text-[hsl(var(--pro-ink))]"><Star className="h-4 w-4 text-[hsl(var(--pro-gold))]" aria-hidden />{es ? "Recomiende a un Pro" : "Refer a Pro"}</p>
              <p className="mt-1 text-[12.5px] text-[hsl(var(--pro-ink-soft))]">{es ? "Comparta su código con alguien que encaje bien." : "Share your code with someone who'd be a good fit."}</p>
              <div className="mt-2"><CopyLink value={me.referral_code} label={es ? "Copiar código" : "Copy code"} /></div>
            </section>
          )}
        </div>
      )}
    </ProShell>
  );
}
