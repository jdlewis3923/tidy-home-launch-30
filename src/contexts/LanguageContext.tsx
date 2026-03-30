import { createContext, useContext, useState, ReactNode, useCallback } from "react";

type Language = "en" | "es";

const translations: Record<string, string> = {
  // Navbar
  "Services": "Servicios",
  "How It Works": "Cómo Funciona",
  "Pricing": "Precios",
  "FAQ": "Preguntas Frecuentes",
  "Request Early Access": "Solicitar Acceso",

  // Announcement ticker
  "Licensed & Insured": "Licenciado y Asegurado",
  "Background-Checked Pros": "Profesionales Verificados",
  "Cancel Anytime": "Cancela Cuando Quieras",
  "Photo Verified Every Visit": "Fotos Verificadas en Cada Visita",
  "No Long-Term Contracts": "Sin Contratos a Largo Plazo",
  "4.9★ Average Rating": "4.9★ Calificación Promedio",
  "Serving Kendall & Pinecrest": "Sirviendo Kendall y Pinecrest",
  "From $85/mo": "Desde $85/mes",
  "One Simple Monthly Plan": "Un Simple Plan Mensual",
  "Zero Rebooking Required": "Sin Necesidad de Reagendar",

  // Hero
  "Now accepting homes in Kendall & Pinecrest": "Ahora aceptando hogares en Kendall y Pinecrest",
  "Your Home. Handled.": "Tu Hogar. Resuelto.",
  "Every Month.": "Cada Mes.",
  "We handle scheduling, timing, and everything in between.": "Nosotros nos encargamos de la programación, los tiempos y todo lo demás.",
  "Just set it — we'll take care of the rest.": "Solo configúralo — nosotros nos encargamos del resto.",
  "Cleaning, lawn care, and car detailing — fully managed for you. No booking, no vendors, no reminders. Ever.": "Limpieza, jardín y detallado de auto — totalmente gestionado. Sin reservas, sin proveedores, sin recordatorios. Nunca.",
  "🏠 House Cleaning": "🏠 Limpieza del Hogar",
  "🌿 Lawn Care": "🌿 Cuidado del Jardín",
  "🚗 Car Detailing": "🚗 Detallado de Auto",
  "✓ Cancel Anytime": "✓ Cancela Cuando Quieras",
  "Request Early Access — Get $50 Off →": "Solicitar Acceso — Obtén $50 de Descuento →",
  "Limited founding memberships · No commitment required · Starting at $85/mo": "Membresías fundadoras limitadas · Sin compromiso · Desde $85/mes",

  // Proof bar
  "Miami Homeowners": "Propietarios en Miami",
  "Average Rating": "Calificación Promedio",
  "Core Services": "Servicios Principales",
  "ZIP Codes Served": "Códigos Postales",
  "Consistent service. No follow-ups. No hassle.": "Servicio consistente. Sin seguimientos. Sin complicaciones.",
  "Rebooking Required": "Reagendamiento Necesario",

  // Services

  // Services
  "What's Included": "Qué Incluye",
  "Everything your home needs. One simple plan.": "Todo lo que tu hogar necesita. Un plan simple.",
  "Three essential services. One subscription. Zero coordination required. Your schedule, your frequency — handled automatically every month.": "Tres servicios esenciales. Una suscripción. Cero coordinación. Tu horario, tu frecuencia — gestionado automáticamente cada mes.",
  "House Cleaning": "Limpieza del Hogar",
  "Lawn Care": "Cuidado del Jardín",
  "Car Detailing": "Detallado de Auto",
  "⭐ Most Popular": "⭐ Más Popular",
  "Kitchen & bathroom cleaning": "Limpieza de cocina y baño",
  "Floors vacuumed & mopped": "Pisos aspirados y trapeados",
  "Dusting & surface wipe-down": "Limpieza de polvo y superficies",
  "Trash removal": "Retiro de basura",
  "Mowing to standard height": "Corte de césped a altura estándar",
  "Edging along walkways": "Bordeado de caminos",
  "Debris blowing & cleanup": "Soplado y limpieza de escombros",
  "Weekly or biweekly cadence": "Frecuencia semanal o quincenal",
  "Exterior hand wash & wheels": "Lavado exterior a mano y ruedas",
  "Interior vacuum": "Aspirado interior",
  "Interior surface wipe-down": "Limpieza de superficies interiores",
  "Monthly or biweekly": "Mensual o quincenal",

  // How it works
  "Simple process": "Proceso simple",
  "Get 5–10 hours back every week": "Recupera 5–10 horas cada semana",
  "How it works — three steps, then you never think about it again.": "Cómo funciona — tres pasos, y nunca más piensas en ello.",
  "Choose Your Plan": "Elige Tu Plan",
  "Select your services and frequency. Takes 60 seconds. See pricing before you pay.": "Selecciona tus servicios y frecuencia. Toma 60 segundos. Ve los precios antes de pagar.",
  "We Handle Everything": "Nosotros Nos Encargamos",
  "A licensed, insured, background-checked professional shows up on time. You receive an ETA before every visit.": "Un profesional licenciado, asegurado y verificado llega a tiempo. Recibes un estimado antes de cada visita.",
  "You Never Think About It Again": "Nunca Más Piensas en Ello",
  "Recurring scheduling, automatic billing, photo verification after every visit. No reminders. No rebooking. No effort.": "Programación recurrente, facturación automática, verificación con fotos después de cada visita. Sin recordatorios. Sin reagendar. Sin esfuerzo.",
  "Design Your Plan →": "Diseña Tu Plan →",

  // Before/After
  "The difference": "La diferencia",
  "Life before and after Tidy": "La vida antes y después de Tidy",
  "❌ Before Tidy": "❌ Antes de Tidy",
  "✅ With Tidy": "✅ Con Tidy",
  "Multiple vendors to coordinate separately": "Múltiples proveedores para coordinar por separado",
  "Inconsistent, unreliable scheduling": "Programación inconsistente y poco confiable",
  "Missed appointments & no-shows": "Citas perdidas y ausencias",
  "Constant rebooking headaches": "Dolores de cabeza constantes por reagendar",
  "Hours lost managing home services monthly": "Horas perdidas gestionando servicios del hogar mensualmente",
  "Three separate bills every month": "Tres facturas separadas cada mes",
  "One simple monthly subscription": "Una simple suscripción mensual",
  "Everything runs on autopilot": "Todo funciona en piloto automático",
  "Reliable, on-time every single visit": "Confiable y puntual en cada visita",
  "Zero coordination ever required": "Cero coordinación necesaria",
  "5–10 hours back every week": "5–10 horas recuperadas cada semana",
  "One clean monthly bill": "Una sola factura mensual limpia",

  // Who it's for
  "Who it's for": "Para quién es",
  "Built for homeowners who want it handled.": "Hecho para propietarios que quieren que se encarguen de todo.",
  "If you'd rather spend your weekend doing anything but managing vendors, Tidy is for you.": "Si prefieres pasar tu fin de semana haciendo cualquier cosa menos gestionar proveedores, Tidy es para ti.",
  "Busy Professionals": "Profesionales Ocupados",
  "No time to manage 3 different vendors. One plan handles everything on autopilot while you focus on what matters.": "Sin tiempo para gestionar 3 proveedores diferentes. Un plan maneja todo en automático mientras te enfocas en lo que importa.",
  "Families": "Familias",
  "Keep your home consistently maintained without it falling on any one person. Reliable service, every single visit.": "Mantén tu hogar consistentemente mantenido sin que recaiga en una sola persona. Servicio confiable, cada visita.",
  "Time-Conscious Homeowners": "Propietarios que Valoran su Tiempo",
  "You value your weekend. Stop spending it coordinating, rebooking, and following up. Tidy handles all of it.": "Valoras tu fin de semana. Deja de gastarlo coordinando, reagendando y dando seguimiento. Tidy se encarga de todo.",

  // Testimonials
  "Reviews": "Reseñas",
  "Trusted by homeowners": "Confiado por propietarios",
  "Real homeowners. Real results.": "Propietarios reales. Resultados reales.",
  "Rated 4.9 by homeowners": "Calificado 4.9 por propietarios",
  "100+ Miami members": "100+ miembros en Miami",
  "Request Early Access →": "Solicitar Acceso →",

  // Why Tidy
  "Why Tidy": "Por Qué Tidy",
  "Why homeowners choose Tidy": "Por qué los propietarios eligen Tidy",
  "Full Autopilot": "Piloto Automático",
  "Everything runs automatically. No scheduling. No coordination. No thinking about it again after signup.": "Todo funciona automáticamente. Sin programar. Sin coordinar. Sin pensar en ello después de inscribirte.",
  "Satisfaction Guarantee": "Garantía de Satisfacción",
  "If it isn't perfect, we fix it fast. No contracts. Cancel anytime. We stand behind every visit.": "Si no es perfecto, lo arreglamos rápido. Sin contratos. Cancela cuando quieras. Respaldamos cada visita.",
  "Every professional is background-checked and fully insured. Photo verification submitted after every visit.": "Cada profesional está verificado y completamente asegurado. Verificación con fotos después de cada visita.",
  "Always on Schedule": "Siempre a Tiempo",
  "Weekly, biweekly, or monthly service. No delays, no chasing vendors, no rescheduling headaches.": "Servicio semanal, quincenal o mensual. Sin demoras, sin perseguir proveedores, sin dolores de cabeza por reagendar.",
  "One Simple Bill": "Una Sola Factura",
  "All services under one monthly subscription. Transparent pricing, no surprise charges, secure payments via Stripe.": "Todos los servicios bajo una suscripción mensual. Precios transparentes, sin cargos sorpresa, pagos seguros vía Stripe.",
  "Miami-Local": "Local en Miami",
  "Built for Florida homes. Serving Kendall, Kendall West & Pinecrest neighborhoods.": "Hecho para hogares de Florida. Sirviendo las comunidades de Kendall, Kendall West y Pinecrest.",

  // Pricing
  "Simple, transparent rates. No surprises.": "Tarifas simples y transparentes. Sin sorpresas.",
  "Pay monthly. Cancel anytime. Higher frequency = lower cost per visit. Bundle 2+ services for automatic discounts.": "Paga mensualmente. Cancela cuando quieras. Mayor frecuencia = menor costo por visita. Combina 2+ servicios para descuentos automáticos.",
  "Service": "Servicio",
  "Monthly": "Mensual",
  "Biweekly": "Quincenal",
  "Weekly": "Semanal",
  "Bundle discount auto-applied at checkout · 2 services = 15% off · 3 services = 20% off · Cancel anytime": "Descuento por combo aplicado automáticamente · 2 servicios = 15% descuento · 3 servicios = 20% descuento · Cancela cuando quieras",

  // FAQ
  "Common questions": "Preguntas comunes",
  "Getting Started": "Primeros Pasos",
  "Services & Scheduling": "Servicios y Programación",
  "Service Scope": "Alcance del Servicio",
  "Billing": "Facturación",
  "Trust & Quality": "Confianza y Calidad",

  // FAQ Q&A
  "What is Tidy?": "¿Qué es Tidy?",
  "Great question! Tidy is Miami's first all-in-one home services subscription — we handle your house cleaning, lawn care, and car detailing all under one simple monthly plan. No juggling multiple providers, no chasing quotes. Just one subscription and everything stays spotless.": "¡Gran pregunta! Tidy es la primera suscripción de servicios del hogar todo en uno de Miami — manejamos tu limpieza del hogar, cuidado del jardín y detallado de auto todo bajo un simple plan mensual. Sin malabarear múltiples proveedores, sin perseguir cotizaciones. Solo una suscripción y todo se mantiene impecable.",
  "How do I sign up?": "¿Cómo me inscribo?",
  "Super easy — just tap the 'Get Early Access' button, fill out a quick 60-second form with your name and contact info, and we'll reach out to confirm your spot and lock in your schedule. That's it!": "¡Súper fácil! Solo toca el botón 'Solicitar Acceso', llena un formulario rápido de 60 segundos con tu nombre e información de contacto, y nos comunicaremos para confirmar tu lugar y fijar tu horario. ¡Eso es todo!",
  "Where is Tidy available?": "¿Dónde está disponible Tidy?",
  "We're currently serving some of Miami's best neighborhoods: Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143), and Doral (33178). More areas are coming soon — grab your spot now!": "Actualmente estamos sirviendo algunos de los mejores vecindarios de Miami: Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143) y Doral (33178). ¡Más áreas pronto — reserva tu lugar ahora!",
  "Is there a commitment?": "¿Hay algún compromiso?",
  "Nope — zero commitment! There are no contracts and no cancellation fees. You can cancel anytime, no questions asked. We earn your business every single month.": "¡No — cero compromiso! No hay contratos ni cargos por cancelación. Puedes cancelar cuando quieras, sin preguntas. Nos ganamos tu confianza cada mes.",
  "How often do services happen?": "¿Con qué frecuencia son los servicios?",
  "Totally up to you! Choose weekly, biweekly, or monthly for each service — and yes, you can mix and match. Want weekly lawn care but biweekly cleaning? Done. We build your plan around your life.": "¡Totalmente tu decisión! Elige semanal, quincenal o mensual para cada servicio — y sí, puedes combinar. ¿Quieres jardín semanal pero limpieza quincenal? Listo. Construimos tu plan alrededor de tu vida.",
  "Do I need to be home?": "¿Necesito estar en casa?",
  "Not at all! Just give us access via a lockbox, gate code, or smart lock and our team handles everything while you're out living your best life. You'll get photo confirmation when each service is done.": "¡Para nada! Solo danos acceso con caja de seguridad, código de puerta o cerradura inteligente y nuestro equipo se encarga de todo mientras vives tu mejor vida. Recibirás confirmación con fotos cuando cada servicio termine.",
  "Can I reschedule or pause?": "¿Puedo reagendar o pausar?",
  "Absolutely! Life happens — just shoot us a message and we'll move things around for you. Need to pause for a vacation? No problem. We've got you covered.": "¡Absolutamente! La vida pasa — solo envíanos un mensaje y reorganizamos todo. ¿Necesitas pausar por vacaciones? Sin problema. Te tenemos cubierto.",
  "What if it rains?": "¿Qué pasa si llueve?",
  "No worries! If weather impacts an outdoor service, we'll automatically reschedule it for the next available day. Your subscription stays active and you won't miss a beat.": "¡No te preocupes! Si el clima afecta un servicio exterior, lo reprogramamos automáticamente para el próximo día disponible. Tu suscripción sigue activa y no pierdes nada.",
  "What does house cleaning include?": "¿Qué incluye la limpieza del hogar?",
  "We cover all the essentials to keep your home feeling fresh — kitchen surfaces and countertops, full bathroom cleaning, dusting throughout, vacuuming and mopping all floors, and trash removal. Your home will look and feel amazing after every visit.": "Cubrimos todo lo esencial para mantener tu hogar fresco — superficies de cocina y mostradores, limpieza completa de baños, limpieza de polvo, aspirado y trapeado de todos los pisos, y retiro de basura. Tu hogar se verá y sentirá increíble después de cada visita.",
  "What does lawn care include?": "¿Qué incluye el cuidado del jardín?",
  "We keep your curb appeal on point! Every visit includes professional mowing, clean edging along walkways and beds, and blowing all debris off your walkways and driveways. Your neighbors will notice the difference.": "¡Mantenemos tu fachada impecable! Cada visita incluye corte profesional, bordeado limpio a lo largo de caminos y camas, y soplado de todos los escombros. Tus vecinos notarán la diferencia.",
  "What does car detailing include?": "¿Qué incluye el detallado de auto?",
  "Your ride deserves love too! We do a full exterior hand wash with wheel cleaning, thorough interior vacuum, and a complete interior surface wipe-down. Your car will look showroom-ready right in your driveway.": "¡Tu auto también merece amor! Hacemos un lavado exterior completo a mano con limpieza de ruedas, aspirado interior profundo y limpieza completa de superficies interiores. Tu auto lucirá como de agencia en tu entrada.",
  "Are deep cleaning or restoration services included?": "¿Se incluyen servicios de limpieza profunda o restauración?",
  "Tidy is designed for consistent, ongoing maintenance — the kind that keeps everything looking great week after week. If you need a one-time deep clean or restoration work, we offer those as add-ons. Just ask!": "Tidy está diseñado para mantenimiento consistente y continuo — del tipo que mantiene todo luciendo genial semana tras semana. Si necesitas una limpieza profunda única o trabajo de restauración, los ofrecemos como extras. ¡Solo pregunta!",
  "How does billing work?": "¿Cómo funciona la facturación?",
  "Simple and transparent! You're billed monthly via Stripe — everything is automatic, fully secure, and you'll get a receipt every time. No surprise charges, ever.": "¡Simple y transparente! Se te cobra mensualmente vía Stripe — todo es automático, totalmente seguro, y recibirás un recibo cada vez. Sin cargos sorpresa, nunca.",
  "Can I cancel anytime?": "¿Puedo cancelar en cualquier momento?",
  "Yes, 100%! No cancellation fees, no contracts, no awkward phone calls. If you ever want to cancel, just let us know and we'll take care of it immediately.": "¡Sí, 100%! Sin cargos por cancelación, sin contratos, sin llamadas incómodas. Si alguna vez quieres cancelar, solo avísanos y nos encargamos inmediatamente.",
  "What if my payment fails?": "¿Qué pasa si mi pago falla?",
  "We'll pause your services and notify you right away via SMS and email so you can update your payment info. Once it's sorted, we'll get you back on schedule — easy as that.": "Pausaremos tus servicios y te notificaremos de inmediato por SMS y correo para que actualices tu información de pago. Una vez resuelto, te ponemos de vuelta en horario — así de fácil.",
  "Can I change services later?": "¿Puedo cambiar servicios después?",
  "Of course! Want to add car detailing or switch your cleaning frequency? Just reach out and any changes will kick in at your next billing cycle. We're flexible because your needs are too.": "¡Por supuesto! ¿Quieres agregar detallado de auto o cambiar la frecuencia de limpieza? Solo contáctanos y los cambios se aplican en tu próximo ciclo de facturación. Somos flexibles porque tus necesidades también lo son.",
  "Are contractors vetted?": "¿Los contratistas están verificados?",
  "Absolutely — your trust means everything to us. Every single contractor is fully background-checked, and we require photo documentation after every visit so you can see exactly what was done. Quality and accountability are built into everything we do.": "Absolutamente — tu confianza lo es todo para nosotros. Cada contratista está completamente verificado, y requerimos documentación fotográfica después de cada visita para que puedas ver exactamente qué se hizo. Calidad y responsabilidad están integradas en todo lo que hacemos.",
  "What if I'm not satisfied?": "¿Qué pasa si no estoy satisfecho?",
  "We want you to love every service! If something isn't right, just reach out within 24 hours and we'll make it right — whether that means a re-service or a credit. Your satisfaction is our top priority.": "¡Queremos que ames cada servicio! Si algo no está bien, contáctanos dentro de 24 horas y lo arreglaremos — ya sea un re-servicio o un crédito. Tu satisfacción es nuestra prioridad.",
  "How do I contact support?": "¿Cómo contacto soporte?",
  "We're here for you! Email us at hello@jointidy.co and we'll get back to you within 1 hour during business hours. Real people, real answers, real fast.": "¡Estamos aquí para ti! Envíanos un correo a hello@jointidy.co y te responderemos en 1 hora durante horario laboral. Personas reales, respuestas reales, super rápido.",

  // Zip checker
  "Is Tidy in your neighborhood?": "¿Tidy está en tu vecindario?",
  "We're launching in select Miami ZIP codes first to ensure consistently high-quality service from day one.": "Estamos lanzando en códigos postales selectos de Miami primero para asegurar servicio de alta calidad desde el día uno.",
  "Enter ZIP code e.g. 33183": "Ingresa código postal ej. 33183",
  "Check →": "Verificar →",

  // Final CTA
  "You'll never book a home service again.": "Nunca más reservarás un servicio del hogar.",
  "Limited founding memberships available in your area. Takes 60 seconds. No commitment required.": "Membresías fundadoras limitadas disponibles en tu área. Toma 60 segundos. Sin compromiso.",
  "Get Started — Request Early Access →": "Comienza — Solicitar Acceso →",
  "4.9★ Rating": "4.9★ Calificación",
  "Miami-Based": "Basado en Miami",

  // Lead popup
  "🎉 Founding Member Offer": "🎉 Oferta de Miembro Fundador",
  "Get $50 Off Your": "Obtén $50 de Descuento en Tu",
  "First Month": "Primer Mes",
  "Join Miami homeowners who have already simplified their home. Lock in founding pricing before we launch publicly.": "Únete a los propietarios de Miami que ya simplificaron su hogar. Asegura precios de fundador antes del lanzamiento público.",
  "First Name": "Nombre",
  "Last Name": "Apellido",
  "Email Address": "Correo Electrónico",
  "Phone Number": "Número de Teléfono",
  "ZIP Code": "Código Postal",
  "Submitting...": "Enviando...",
  "Claim My Founding Spot →": "Reservar Mi Lugar de Fundador →",
  "No commitment": "Sin compromiso",
  "Cancel anytime": "Cancela cuando quieras",
  "Secure & private": "Seguro y privado",

  // Footer
  "House Cleaning Miami": "Limpieza del Hogar Miami",
  "Lawn Care Miami": "Cuidado del Jardín Miami",
  "Car Detailing Miami": "Detallado de Auto Miami",
  "Referral Program": "Programa de Referidos",
  "Company": "Empresa",
  "Service Areas": "Áreas de Servicio",
  "Terms of Service": "Términos de Servicio",
  "Privacy Policy": "Política de Privacidad",
  "Contact Us": "Contáctanos",
  "Terms": "Términos",
  "Privacy": "Privacidad",

  // Bundle banner
  "💡 Bundle services and save automatically — 2 services: <strong>15% off</strong> · 3 services: <strong>20% off</strong> — Applied at checkout automatically": "💡 Combina servicios y ahorra automáticamente — 2 servicios: <strong>15% descuento</strong> · 3 servicios: <strong>20% descuento</strong> — Aplicado automáticamente",
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (text) => text,
});

export const useLanguage = () => useContext(LanguageContext);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const browserLang = navigator.language || (navigator as any).userLanguage || "en";
    return browserLang.startsWith("es") ? "es" : "en";
  });

  const t = useCallback((text: string): string => {
    if (language === "en") return text;
    return translations[text] || text;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
