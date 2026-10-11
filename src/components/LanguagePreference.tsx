/**
 * Message language — stored on the account; every automatic text and email
 * (scheduling, reminders, Pro mail) is sent in it.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LanguagePreference({ className = "" }: { className?: string }) {
  const { language, setLanguage } = useLanguage();
  const [lang, setLang] = useState<"en" | "es" | null>(null);
  const es = language === "es";

  useEffect(() => {
    void supabase.rpc("my_language").then(({ data }) => setLang(data === "es" ? "es" : "en"));
  }, []);

  const choose = async (l: "en" | "es") => {
    const prev = lang;
    setLang(l);
    const { error } = await supabase.rpc("set_my_language", { _lang: l });
    if (error) { setLang(prev); toast.error(es ? "No se pudo guardar. Inténtalo de nuevo." : "Couldn't save. Try again."); return; }
    setLanguage(l);
    toast.success(l === "es" ? "Te escribiremos en español." : "We'll message you in English.");
  };

  return (
    <div className={`rounded-2xl border border-[hsl(var(--hairline,214_32%_91%))] bg-white p-5 ${className}`}>
      <p className="text-sm font-semibold text-foreground">{es ? "Idioma de mensajes" : "Message language"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{es ? "Tus textos y correos de Tidy llegan en este idioma." : "Your Tidy texts and emails arrive in this language."}</p>
      <div className="mt-3 flex gap-2" role="radiogroup">
        {(["en", "es"] as const).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={lang === l} disabled={lang === null}
            onClick={() => void choose(l)}
            className={`min-h-[44px] flex-1 rounded-xl border text-sm font-bold transition-colors ${lang === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}>
            {l === "en" ? "English" : "Español"}
          </button>
        ))}
      </div>
    </div>
  );
}
