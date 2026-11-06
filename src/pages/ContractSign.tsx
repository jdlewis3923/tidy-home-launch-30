import { Helmet } from "react-helmet-async";
import TidyLogo from "@/components/TidyLogo";
import { useLanguage } from "@/contexts/LanguageContext";

/** Website signing is retired: every old agreement link lands here and never collects a signature. */
export default function ContractSign() {
  const { language } = useLanguage();
  const es = language === "es";
  return (
    <main className="min-h-screen bg-navy text-primary-foreground flex items-center justify-center px-6">
      <Helmet>
        <title>Tidy Pro paperwork</title>
        <meta name="description" content="Tidy Pro paperwork lives in the Tidy app." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto w-32"><TidyLogo /></div>
        <h1 className="text-2xl font-bold">
          {es ? "Tus documentos están en la app de Tidy" : "Your paperwork lives in the Tidy app"}
        </h1>
        <p className="text-base opacity-90">
          {es ? "Revisa tu correo para ver el enlace." : "Check your email for the link."}
        </p>
        <p className="text-base opacity-90">
          {es ? "¿Preguntas? " : "Questions? "}
          <a href="tel:+17868291141" className="font-semibold text-gold underline">(786) 829-1141</a>
        </p>
      </div>
    </main>
  );
}
