/**
 * Pro Portal entry / splash — /pro/welcome (mockup screen 1).
 */
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import ProHead from "@/components/pro/portal/ProHead";
import heroHome from "@/assets/miami-waterfront.webp";
import { useLanguage } from "@/contexts/LanguageContext";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export default function ProLanding() {
  const { language, setLanguage } = useLanguage();
  const es = language === "es";
  const reduce = useReducedMotion();
  const fade = (d: number) => reduce ? {} : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: d, ease: EASE } };
  const words = es ? ["Hogar.", "Césped.", "Auto.", "Resuelto."] : ["Home.", "Lawn.", "Car.", "Handled."];
  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--pro-deep))] font-sans">
      <ProHead title="Tidy Pro Portal" />
      <motion.img src={heroHome} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover"
        initial={reduce ? false : { opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease: EASE }} />
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--pro-deep)/0.35)] via-[hsl(var(--pro-deep)/0.55)] to-[hsl(var(--pro-deep)/0.97)]" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-primary-foreground">
        <div className="flex justify-end">
          <button type="button" onClick={() => setLanguage(es ? "en" : "es")} className="min-h-[40px] px-2 text-[14px] font-medium">{es ? "EN" : "ES"}</button>
        </div>
        <motion.img src="/pro-icon-512.png" alt="Tidy Pro" className="mx-auto mt-4 h-28 w-28 rounded-[24%]"
          initial={reduce ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: EASE }} />

        <div className="mt-auto">
          <h1 className="text-[40px] font-extrabold leading-[1.02] tracking-[-0.02em]">
            {words.map((w, i) => (
              <motion.span key={w} {...fade(0.15 + i * 0.07)} className={`block ${i === 3 ? "text-[hsl(var(--pro-gold))]" : ""}`}>{w}</motion.span>
            ))}
          </h1>
          <motion.p {...fade(0.5)} className="mt-4 text-[14px] leading-snug text-primary-foreground/85">
            {es ? "Inicie sesión para gestionar su agenda, ver sus ganancias y crecer con TIDY." : "Log in to manage your schedule, track earnings, and grow with TIDY."}
          </motion.p>
          <motion.div {...fade(0.6)}>
            <Link to="/pro/login" className="mt-7 flex min-h-[50px] w-full items-center justify-center gap-10 rounded-full bg-[hsl(var(--pro-gold))] text-[16px] font-semibold text-[hsl(var(--pro-navy))] active:scale-[0.98]">
              {es ? "Iniciar sesión" : "Log In"} <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
            <Link to="/careers" className="mt-3 flex min-h-[50px] w-full items-center justify-center rounded-full border border-primary-foreground/80 text-[15px] font-medium">
              {es ? "Crear cuenta" : "Create Account"}
            </Link>
            <a href="mailto:hello@jointidy.co" className="mt-3 block py-2 text-center text-[13px] text-primary-foreground/70">{es ? "¿Necesita ayuda? Contacte a soporte" : "Need help? Contact support"}</a>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
