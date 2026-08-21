import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${t("Page not found")} · Tidy Home Concierge`;
    return () => {
      document.title = previous;
    };
  }, [t]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onOpenPopup={() => navigate("/")} />
      <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
        <h1 className="mb-4 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-6 text-xl text-muted-foreground">{t("Oops! Page not found")}</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          {t("Return to Home")}
        </Link>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
