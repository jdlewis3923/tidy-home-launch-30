import { useState, useCallback } from "react";
import { Globe } from "lucide-react";

const translations: Record<string, Record<string, string>> = {
  // Navbar
  "Services": "Servicios",
  "How It Works": "Cómo Funciona",
  "Pricing": "Precios",
  "FAQ": "Preguntas Frecuentes",
  "Request Early Access": "Solicitar Acceso",

  // Announcement ticker
  "🎉 Launching Soon in Kendall, Pinecrest & Kendall West — Join the Waitlist!": "🎉 ¡Próximo Lanzamiento en Kendall, Pinecrest y Kendall West — Únete a la Lista!",
  "🏠 One Subscription. Clean Home, Lawn & Car.": "🏠 Una Suscripción. Casa, Jardín y Auto Limpios.",
  "⭐ 100+ Five-Star Reviews from Miami Families": "⭐ 100+ Reseñas de 5 Estrellas de Familias de Miami",

  // Hero
  "One Subscription.": "Una Suscripción.",
  "Your Entire Home — Handled.": "Todo Tu Hogar — Resuelto.",
  "House cleaning, lawn care & car detailing — bundled into one simple monthly plan. Starting at just": "Limpieza del hogar, cuidado del jardín y detallado de auto — todo en un plan mensual simple. Desde solo",
  "$85/mo": "$85/mes",
  "Join the Waitlist": "Únete a la Lista",
  "See Pricing": "Ver Precios",
  "No contracts. Cancel anytime.": "Sin contratos. Cancela cuando quieras.",
  "Serving Kendall, Pinecrest & Kendall West": "Sirviendo Kendall, Pinecrest y Kendall West",
  "Vetted & insured pros": "Profesionales verificados y asegurados",

  // Proof bar
  "Happy Homes": "Hogares Felices",
  "Star Reviews": "Reseñas 5 Estrellas",
  "Services Completed": "Servicios Completados",
  "Years Experience": "Años de Experiencia",

  // Trust bar
  "Trusted by Miami Homeowners": "Confiado por Propietarios de Miami",
  "Licensed & Insured": "Licenciado y Asegurado",
  "Background-Checked Teams": "Equipos Verificados",
  "Eco-Friendly Products": "Productos Ecológicos",
  "Satisfaction Guaranteed": "Satisfacción Garantizada",

  // Services
  "Everything Your Home Needs": "Todo lo que Tu Hogar Necesita",
  "Three essential services, one effortless subscription.": "Tres servicios esenciales, una suscripción sin esfuerzo.",
  "House Cleaning": "Limpieza del Hogar",
  "Lawn Care": "Cuidado del Jardín",
  "Car Detailing": "Detallado de Auto",

  // How it works
  "How Tidy Works": "Cómo Funciona Tidy",
  "Getting started is simple.": "Comenzar es simple.",
  "Pick Your Plan": "Elige Tu Plan",
  "We Match You": "Te Asignamos",
  "Sit Back & Relax": "Relájate y Disfruta",
  "Get Started Now": "Comienza Ahora",

  // Before/After
  "See the Tidy Difference": "Mira la Diferencia Tidy",
  "Before": "Antes",
  "After": "Después",

  // Who it's for
  "Who Tidy Is For": "¿Para Quién es Tidy?",
  "Busy Professionals": "Profesionales Ocupados",
  "Growing Families": "Familias en Crecimiento",
  "Rental Property Owners": "Propietarios de Alquiler",
  "Snowbirds & Part-Time Residents": "Residentes de Temporada",

  // Why Tidy
  "Why Choose Tidy?": "¿Por Qué Elegir Tidy?",
  "Save Time": "Ahorra Tiempo",
  "Save Money": "Ahorra Dinero",
  "Trusted Pros": "Profesionales de Confianza",
  "One Dashboard": "Un Solo Panel",

  // Pricing
  "Simple, Transparent Pricing": "Precios Simples y Transparentes",
  "Choose the plan that fits your home.": "Elige el plan que se adapte a tu hogar.",
  "Most Popular": "Más Popular",
  "Best Value": "Mejor Valor",
  "/mo": "/mes",
  "Get Started": "Comenzar",

  // FAQ
  "Frequently Asked Questions": "Preguntas Frecuentes",

  // Zip checker
  "Is Tidy in Your Neighborhood?": "¿Tidy Está en Tu Vecindario?",
  "Enter your ZIP code": "Ingresa tu código postal",
  "Check": "Verificar",
  "We're in your area!": "¡Estamos en tu zona!",

  // Final CTA
  "Ready to Simplify Your Home?": "¿Listo Para Simplificar Tu Hogar?",
  "Join 100+ Miami families already on the waitlist.": "Únete a más de 100 familias de Miami en la lista de espera.",
  "Claim Your Spot": "Reserva Tu Lugar",

  // Footer
  "All rights reserved.": "Todos los derechos reservados.",
  "Terms": "Términos",
  "Privacy": "Privacidad",

  // Lead popup
  "Join the Tidy Waitlist": "Únete a la Lista de Tidy",
  "Be the first to know when we launch in your area.": "Sé el primero en saber cuando lancemos en tu zona.",
  "Full Name": "Nombre Completo",
  "Email": "Correo Electrónico",
  "Phone (optional)": "Teléfono (opcional)",
  "ZIP Code": "Código Postal",
  "Submit": "Enviar",

  // Testimonials
  "What Our Clients Say": "Lo Que Dicen Nuestros Clientes",
};

type Language = "en" | "es";

let currentLanguage: Language = "en";
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return currentLanguage;
}

export function translate(text: string): string {
  if (currentLanguage === "en") return text;
  return translations[text] || text;
}

export function useLanguage() {
  const [, setTick] = useState(0);

  const forceUpdate = useCallback(() => {
    setTick(t => t + 1);
  }, []);

  // Subscribe on mount
  useState(() => {
    listeners.add(forceUpdate);
    return () => listeners.delete(forceUpdate);
  });

  return { language: currentLanguage, t: translate };
}

function setLanguage(lang: Language) {
  currentLanguage = lang;
  listeners.forEach(fn => fn());
}

const LanguageToggle = () => {
  const { language } = useLanguage();

  const toggle = () => {
    setLanguage(language === "en" ? "es" : "en");
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold text-foreground/80 hover:text-primary hover:bg-accent transition-colors"
      aria-label={language === "en" ? "Traducir al español" : "Translate to English"}
      title={language === "en" ? "Traducir al español" : "Translate to English"}
    >
      <Globe className="w-4 h-4" />
      <span>{language === "en" ? "ES" : "EN"}</span>
    </button>
  );
};

export default LanguageToggle;
