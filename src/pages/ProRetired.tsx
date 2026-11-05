import { Helmet } from "react-helmet-async";
import TidyLogo from "@/components/TidyLogo";
import { useLanguage } from "@/contexts/LanguageContext";

/** Every old Pro-portal URL lands here: Pros now use Connecteam. */
export default function ProRetired() {
  const { language } = useLanguage();
  const es = language === "es";
  return (
    <main className="min-h-screen bg-navy text-primary-foreground flex items-center justify-center px-6">
      <Helmet>
        <title>Tidy Pros · Connecteam</title>
        <meta name="description" content="Tidy Pros now use the Tidy app (Connecteam)." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-md text-center space-y-5">
        <div className="mx-auto w-32"><TidyLogo /></div>
        <h1 className="text-2xl font-bold">
          {es ? "Los Pros de Tidy ahora usan la app de Tidy (Connecteam)." : "Tidy Pros now use the Tidy app (Connecteam)."}
        </h1>
        <p className="text-base opacity-90">
          {es ? "¿Preguntas? " : "Questions? "}
          <a href="tel:+17868291141" className="font-semibold text-gold underline">(786) 829-1141</a>
        </p>
      </div>
    </main>
  );
}
