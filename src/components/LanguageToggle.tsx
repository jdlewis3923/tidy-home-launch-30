import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();

  const toggle = () => {
    setLanguage(language === "en" ? "es" : "en");
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-foreground/70 hover:text-primary hover:bg-accent transition-colors border border-border/50"
      aria-label={language === "en" ? "Traducir al español" : "Translate to English"}
      title={language === "en" ? "Traducir al español" : "Translate to English"}
    >
      <Globe className="w-4 h-4" />
      <span>{language === "en" ? "ES" : "EN"}</span>
    </button>
  );
};

export default LanguageToggle;
