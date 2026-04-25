import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";

type Language = "en" | "es";

const translations: Record<string, string> = {
  // Navbar
  "Services": "Servicios",
  "How It Works": "Cómo Funciona",
  "Pricing": "Precios",
  "FAQ": "Preguntas Frecuentes",
  "Request Early Access": "Solicitar Acceso",
  "START MY PLAN": "EMPEZAR MI PLAN",
  "Home": "Inicio",
  "House Cleaning": "Limpieza del Hogar",
  "Lawn Care": "Cuidado del Jardín",
  "Car Detailing": "Detallado de Auto",
  "Bundle & Save": "Combo y Ahorra",
  "Refer": "Refiere",
  "Login": "Acceder",

  // Announcement ticker
  "Licensed & Insured": "Licenciado y Asegurado",
  "Background-Checked Pros": "Profesionales Verificados",
  "Cancel Anytime": "Cancela Cuando Quieras",
  "Photo Verified Every Visit": "Fotos Verificadas en Cada Visita",
  "No Long-Term Contracts": "Sin Contratos a Largo Plazo",
  "4.9★ Average Rating": "4.9★ Calificación Promedio",
  "Serving Kendall & Pinecrest": "Sirviendo Kendall y Pinecrest",
  "From $85/mo": "Desde $85/mes",
  "One Simple Monthly Plan": "Un Solo Plan Mensual",
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
  "What's Included": "Qué Incluye",
  "Everything your home needs. One plan.": "Todo lo que tu hogar necesita. Un plan.",
  "Everything your home needs. One simple plan.": "Todo lo que tu hogar necesita. Un plan simple.",
  "Three essential services. One subscription. Zero coordination required. Your schedule, your frequency — handled automatically every month.": "Tres servicios esenciales. Una suscripción. Cero coordinación. Tu horario, tu frecuencia — gestionado automáticamente cada mes.",
  "⭐ Most Popular": "⭐ Más Popular",
  "Most Popular": "Más Popular",
  "Best Value": "Mejor Precio",
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
  "Everything runs automatically — no coordination needed. Modify, skip, or adjust anytime.": "Todo funciona automáticamente — sin coordinación necesaria. Modifica, omite o ajusta en cualquier momento.",
  "Simple, transparent rates. No surprises.": "Tarifas simples y transparentes. Sin sorpresas.",
  "Pay monthly. Cancel anytime. Higher frequency = lower cost per visit. Bundle 2+ services for automatic discounts.": "Paga mensualmente. Cancela cuando quieras. Mayor frecuencia = menor costo por visita. Combina 2+ servicios para descuentos automáticos.",
  "Service": "Servicio",
  "Monthly": "Mensual",
  "Biweekly": "Quincenal",
  "Weekly": "Semanal",
  "Bundle discount auto-applied at checkout · 2 services = 15% off · 3 services = 20% off · Cancel anytime": "Descuento por combo aplicado automáticamente · 2 servicios = 15% descuento · 3 servicios = 20% descuento · Cancela cuando quieras",

  // FAQ
  "Most customers never need to think about any of this — but we've got you covered.": "La mayoría de los clientes nunca necesitan pensar en esto — pero te tenemos cubierto.",
  "Common questions": "Preguntas comunes",
  "Getting Started": "Primeros Pasos",
  "Services & Scheduling": "Servicios y Programación",
  "Service Scope": "Alcance del Servicio",
  "Billing": "Facturación",
  "Trust & Quality": "Confianza y Calidad",

  // FAQ Q&A (homepage)
  "What is Tidy?": "¿Qué es Tidy?",
  "Great question! Tidy is Miami's first all-in-one home services subscription — we handle your house cleaning, lawn care, and car detailing all under one simple monthly plan. No juggling multiple providers, no chasing quotes. Just one subscription and everything stays spotless.": "¡Buena pregunta! Tidy es la primera suscripción de servicios del hogar todo-en-uno de Miami — manejamos tu limpieza, jardín y detallado de auto en un solo plan mensual. Sin malabarear varios proveedores, sin perseguir cotizaciones. Una suscripción y todo queda impecable.",
  "How do I sign up?": "¿Cómo me inscribo?",
  "Super easy — just tap the 'Get Early Access' button, fill out a quick 60-second form with your name and contact info, and we'll reach out to confirm your spot and lock in your schedule. That's it!": "Súper fácil — toca el botón 'Solicitar Acceso', llena un formulario rápido de 60 segundos con tu nombre y contacto, y te llamamos para confirmar tu lugar y fijar tu horario. ¡Eso es todo!",
  "Where is Tidy available?": "¿Dónde está disponible Tidy?",
  "We're currently serving some of Miami's best neighborhoods: Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143), and Doral (33178). More areas are coming soon — grab your spot now!": "Ahora mismo servimos los mejores vecindarios de Miami: Kendall (33183, 33186), Pinecrest (33156), South Kendall (33173), Sunset (33176), Coral Gables (33146), South Miami (33143) y Doral (33178). Vienen más áreas — ¡reserva tu lugar ahora!",
  "Is there a commitment?": "¿Hay algún compromiso?",
  "Nope — zero commitment! There are no contracts and no cancellation fees. You can cancel anytime, no questions asked. We earn your business every single month.": "¡Para nada — cero compromiso! Sin contratos y sin cargos por cancelación. Puedes cancelar cuando quieras, sin preguntas. Nos ganamos tu confianza cada mes.",
  "How often do services happen?": "¿Cada cuánto se hacen los servicios?",
  "Totally up to you! Choose weekly, biweekly, or monthly for each service — and yes, you can mix and match. Want weekly lawn care but biweekly cleaning? Done. We build your plan around your life.": "¡Tú decides! Elige semanal, quincenal o mensual para cada servicio — y sí, puedes combinar. ¿Quieres jardín semanal pero limpieza quincenal? Listo. Armamos el plan a tu medida.",
  "Do I need to be home?": "¿Tengo que estar en casa?",
  "Not at all! Just give us access via a lockbox, gate code, or smart lock and our team handles everything while you're out living your best life. You'll get photo confirmation when each service is done.": "¡Para nada! Danos acceso con caja de seguridad, código de puerta o cerradura inteligente y nuestro equipo se encarga de todo mientras vives tu mejor vida. Recibes confirmación con fotos al terminar cada servicio.",
  "Can I reschedule or pause?": "¿Puedo reagendar o pausar?",
  "Absolutely! Life happens — just shoot us a message and we'll move things around for you. Need to pause for a vacation? No problem. We've got you covered.": "¡Claro que sí! La vida pasa — mándanos un mensaje y movemos todo. ¿Necesitas pausar por vacaciones? Sin problema. Te tenemos cubierto.",
  "What if it rains?": "¿Y si llueve?",
  "No worries! If weather impacts an outdoor service, we'll automatically reschedule it for the next available day. Your subscription stays active and you won't miss a beat.": "¡No te preocupes! Si el clima afecta un servicio exterior, lo reprogramamos automáticamente al siguiente día disponible. Tu suscripción sigue activa y no pierdes nada.",
  "What does house cleaning include?": "¿Qué incluye la limpieza del hogar?",
  "We cover all the essentials to keep your home feeling fresh — kitchen surfaces and countertops, full bathroom cleaning, dusting throughout, vacuuming and mopping all floors, and trash removal. Your home will look and feel amazing after every visit.": "Cubrimos todo lo esencial para que tu casa se sienta fresca — superficies de cocina y mostradores, limpieza completa de baños, limpieza de polvo, aspirado y trapeado de todos los pisos, y retiro de basura. Tu casa se verá y se sentirá increíble después de cada visita.",
  "What does lawn care include?": "¿Qué incluye el cuidado del jardín?",
  "We keep your curb appeal on point! Every visit includes professional mowing, clean edging along walkways and beds, and blowing all debris off your walkways and driveways. Your neighbors will notice the difference.": "¡Mantenemos tu fachada al máximo! Cada visita incluye corte profesional, bordeado limpio a lo largo de caminos y jardineras, y soplado de todos los escombros de caminos y entradas. Los vecinos van a notar la diferencia.",
  "What does car detailing include?": "¿Qué incluye el detallado de auto?",
  "Your ride deserves love too! We do a full exterior hand wash with wheel cleaning, thorough interior vacuum, and a complete interior surface wipe-down. Your car will look showroom-ready right in your driveway.": "¡Tu carro también merece cariño! Hacemos lavado exterior completo a mano con limpieza de ruedas, aspirado interior profundo y limpieza completa de superficies interiores. Tu carro va a lucir como de agencia en tu propio garaje.",
  "Are deep cleaning or restoration services included?": "¿Se incluyen limpiezas profundas o restauración?",
  "Tidy is designed for consistent, ongoing maintenance — the kind that keeps everything looking great week after week. If you need a one-time deep clean or restoration work, we offer those as add-ons. Just ask!": "Tidy está diseñado para mantenimiento constante — del que mantiene todo luciendo bien semana tras semana. Si necesitas una limpieza profunda única o trabajo de restauración, los ofrecemos como extras. ¡Solo pregunta!",
  "How does billing work?": "¿Cómo funciona la facturación?",
  "Simple and transparent! You're billed monthly via Stripe — everything is automatic, fully secure, and you'll get a receipt every time. No surprise charges, ever.": "¡Simple y transparente! Te cobramos mensualmente vía Stripe — todo es automático, totalmente seguro, y recibes un recibo cada vez. Sin cargos sorpresa, nunca.",
  "Can I cancel anytime?": "¿Puedo cancelar cuando quiera?",
  "Yes, 100%! No cancellation fees, no contracts, no awkward phone calls. If you ever want to cancel, just let us know and we'll take care of it immediately.": "¡Sí, 100%! Sin cargos por cancelación, sin contratos, sin llamadas incómodas. Si alguna vez quieres cancelar, solo avísanos y nos encargamos al instante.",
  "What if my payment fails?": "¿Qué pasa si falla mi pago?",
  "We'll pause your services and notify you right away via SMS and email so you can update your payment info. Once it's sorted, we'll get you back on schedule — easy as that.": "Pausamos tus servicios y te avisamos enseguida por SMS y correo para que actualices tu pago. Una vez resuelto, te ponemos de vuelta en horario — así de fácil.",
  "Can I change services later?": "¿Puedo cambiar servicios después?",
  "Of course! Want to add car detailing or switch your cleaning frequency? Just reach out and any changes will kick in at your next billing cycle. We're flexible because your needs are too.": "¡Por supuesto! ¿Quieres agregar detallado o cambiar la frecuencia de limpieza? Contáctanos y los cambios entran en tu próximo ciclo de facturación. Somos flexibles porque tus necesidades también lo son.",
  "Are contractors vetted?": "¿Están verificados los contratistas?",
  "Absolutely — your trust means everything to us. Every single contractor is fully background-checked, and we require photo documentation after every visit so you can see exactly what was done. Quality and accountability are built into everything we do.": "Absolutamente — tu confianza lo es todo. Cada contratista está completamente verificado, y exigimos documentación con fotos después de cada visita para que veas exactamente lo que se hizo. Calidad y responsabilidad en todo lo que hacemos.",
  "What if I'm not satisfied?": "¿Y si no quedo satisfecho?",
  "We want you to love every service! If something isn't right, just reach out within 24 hours and we'll make it right — whether that means a re-service or a credit. Your satisfaction is our top priority.": "¡Queremos que ames cada servicio! Si algo no está bien, contáctanos en 24 horas y lo resolvemos — ya sea con otro servicio o un crédito. Tu satisfacción es nuestra prioridad.",
  "How do I contact support?": "¿Cómo contacto a soporte?",
  "We're here for you! Email us at hello@jointidy.co and we'll get back to you within 1 hour during business hours. Real people, real answers, real fast.": "¡Estamos para ti! Escríbenos a hello@jointidy.co y te respondemos en 1 hora durante horario laboral. Personas reales, respuestas reales, súper rápido.",

  // Zip checker
  "Is Tidy in your neighborhood?": "¿Tidy está en tu vecindario?",
  "We're launching in select Miami ZIP codes first to ensure consistently high-quality service from day one.": "Estamos lanzando en códigos postales selectos de Miami primero para asegurar servicio de alta calidad desde el día uno.",
  "Enter ZIP code e.g. 33183": "Ingresa código postal ej. 33183",
  "Check →": "Verificar →",

  // Final CTA
  "You'll never book a home service again.": "Nunca más reservarás un servicio del hogar.",
  "One setup. Everything handled.": "Una configuración. Todo resuelto.",
  "No contracts. No payments until launch.": "Sin contratos. Sin pagos hasta el lanzamiento.",
  "Limited founding memberships available in your area. Takes 60 seconds. No commitment required.": "Membresías fundadoras limitadas en tu área. Toma 60 segundos. Sin compromiso.",
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

  // ============================================================
  // LANDING PAGES (LPs) — /house-cleaning, /lawn-care, /car-detailing, /bundle
  // Cuban-American Miami Spanish, conversational and direct.
  // ============================================================

  // Shared LP UI
  "Book in 60 seconds": "Reserva en 60 segundos",
  "Locked price · No contracts · Cancel anytime": "Precio fijo · Sin contratos · Cancela cuando quieras",
  "Plans": "Planes",
  "Pick your cadence. Lock your price.": "Elige tu frecuencia. Asegura tu precio.",
  "Every visit, every time.": "Cada visita, todas las veces.",
  "Three steps. Then never think about it.": "Tres pasos. Y no piensas más en eso.",
  "Pick your plan": "Elige tu plan",
  "Choose cadence. Lock your price.": "Elige la frecuencia. Asegura tu precio.",
  "We show up": "Llegamos",
  "Same crew every visit. ETA reminder 30 min before.": "El mismo equipo cada visita. Aviso de llegada 30 min antes.",
  "Set it and forget it": "Configúralo y olvídate",
  "Pause, skip, or cancel anytime from your dashboard.": "Pausa, omite o cancela cuando quieras desde tu panel.",
  "Local Reviews": "Reseñas Locales",
  "Placeholder Customer": "Cliente",
  "Placeholder reviews — verified customer reviews rolling out once we clear 50 jobs.": "Reseñas de muestra — reseñas verificadas próximamente al cumplir 50 trabajos.",
  "Questions, answered.": "Respuestas a tus preguntas.",
  "60-second signup. Same crew. Locked price.": "Inscripción en 60 segundos. El mismo equipo. Precio fijo.",
  "60-second signup. Locked price. Cancel anytime.": "Inscripción en 60 segundos. Precio fijo. Cancela cuando quieras.",
  "No contracts. Cancel anytime.": "Sin contratos. Cancela cuando quieras.",
  "Save 10%": "Ahorra 10%",
  "Bundle & save": "Combo y ahorra",
  "Trusted across Pinecrest · Kendall · Kendall West": "Confiado en Pinecrest · Kendall · Kendall West",

  // Trust signal row
  "Licensed": "Licenciado",
  "Insured": "Asegurado",
  "Background-Checked": "Verificado",
  "Locked Price": "Precio Fijo",
  "Serving 3 ZIPs": "3 Códigos Postales",

  // Landing ticker
  "Same Crew Every Visit": "El Mismo Equipo Cada Visita",
  "Locked Monthly Price": "Precio Mensual Fijo",
  "Photo Verified Visits": "Visitas con Fotos",
  "Serving 33156 · 33183 · 33186": "Sirviendo 33156 · 33183 · 33186",
  "Eco-Safe Products": "Productos Eco-Seguros",
  "60-Second Signup": "Inscripción en 60 Segundos",

  // Neighborhood trust
  "Built for Pinecrest + Kendall.": "Hecho para Pinecrest + Kendall.",
  "We serve only 33156, 33183, and 33186 — so your crew is local, on-time, and never stuck in traffic.": "Servimos solo 33156, 33183 y 33186 — así tu equipo es local, puntual y nunca varado en el tráfico.",
  "Pinecrest": "Pinecrest",
  "Kendall": "Kendall",
  "Kendall West": "Kendall West",

  // Sticky bar labels
  "House Cleaning · from $159/mo": "Limpieza del Hogar · desde $159/mes",
  "Lawn Care · from $85/mo": "Cuidado del Jardín · desde $85/mes",
  "Car Detailing · from $159/mo": "Detallado de Auto · desde $159/mes",
  "Bundle & Save · 10–20% off": "Combo y Ahorra · 10–20% descuento",

  // House Cleaning LP
  "Monthly House Cleaning in Pinecrest + Kendall": "Limpieza Mensual del Hogar en Pinecrest + Kendall",
  "Same crew. Locked rate. No contracts. Handle your home on autopilot.": "El mismo equipo. Tarifa fija. Sin contratos. Tu casa en piloto automático.",
  "Starting at $159/mo": "Desde $159/mes",
  "One-off cleanings in Pinecrest average **$180–$260**. Our monthly plan locks you in at **$159** — with the same crew every visit.":
    "Las limpiezas sueltas en Pinecrest cuestan en promedio **$180–$260**. Nuestro plan mensual te deja fijo en **$159** — con el mismo equipo cada visita.",
  // House Cleaning plans
  "One visit per month, same crew every time.": "Una visita al mes, el mismo equipo siempre.",
  "Two visits per month, priority scheduling.": "Dos visitas al mes, con prioridad en agendado.",
  "Weekly visits, dedicated crew, quarterly deep-clean.": "Visitas semanales, equipo dedicado, limpieza profunda trimestral.",
  // House Cleaning included
  "Dust all surfaces": "Sacudir todas las superficies",
  "Vacuum + mop all floors": "Aspirar + trapear todos los pisos",
  "Kitchen deep-clean": "Limpieza profunda de cocina",
  "Bathroom disinfect": "Desinfección de baños",
  "Bedroom tidy + linen change": "Orden de habitaciones + cambio de sábanas",
  "Interior windows": "Ventanas interiores",
  "Trash out": "Sacar la basura",
  "Eco-safe products": "Productos eco-seguros",
  "Same crew every visit": "El mismo equipo cada visita",
  "Fully insured": "Totalmente asegurado",
  // House Cleaning testimonials
  "Kitchen and bathrooms look reset every time. Same crew, same standard — feels effortless.":
    "La cocina y los baños quedan como nuevos cada vez. El mismo equipo, el mismo estándar — se siente sin esfuerzo.",
  "I haven't touched a mop in months. Locked monthly price, no surprise bills.":
    "No toco un trapeador hace meses. Precio mensual fijo, sin facturas sorpresa.",
  "Booked in under a minute. The crew is on time, polite, and thorough.":
    "Reservé en menos de un minuto. El equipo es puntual, amable y minucioso.",
  // House Cleaning FAQs
  "What's the price and what's it based on?": "¿Cuál es el precio y de qué depende?",
  "Plans start at $159/mo for a monthly visit, $279/mo biweekly, $459/mo weekly. Pricing is based on cadence and home size. Standard pricing covers most homes up to 2,500 sq ft — larger homes have a small flat upgrade.":
    "Los planes empiezan en $159/mes para una visita mensual, $279/mes quincenal y $459/mes semanal. El precio depende de la frecuencia y el tamaño de la casa. El precio estándar cubre la mayoría de las casas hasta 2,500 pies cuadrados — las casas más grandes tienen un pequeño cargo adicional fijo.",
  "Yes. No contracts, no cancellation fees. Pause, skip, or cancel from your dashboard anytime.":
    "Sí. Sin contratos, sin cargos por cancelación. Pausa, omite o cancela desde tu panel cuando quieras.",
  "What's your service area?": "¿Cuál es su área de servicio?",
  "We serve Pinecrest and Kendall — ZIP codes 33156, 33183, and 33186. We're not currently serving other areas.":
    "Servimos Pinecrest y Kendall — códigos postales 33156, 33183 y 33186. Por ahora no servimos otras áreas.",
  "What's actually included in a visit?": "¿Qué incluye realmente una visita?",
  "Kitchen deep-clean, bathroom disinfect, dusting all surfaces, vacuum and mop all floors, interior windows, bedroom tidy, linen change, and trash out — using eco-safe products.":
    "Limpieza profunda de cocina, desinfección de baños, sacudir todas las superficies, aspirar y trapear todos los pisos, ventanas interiores, orden de habitaciones, cambio de sábanas y sacar la basura — con productos eco-seguros.",
  "Who does the cleaning?": "¿Quién hace la limpieza?",
  "Licensed, insured, background-checked professionals. Same crew every visit so they learn your home.":
    "Profesionales licenciados, asegurados y verificados. El mismo equipo cada visita para que conozcan tu casa.",
  "How is scheduling handled?": "¿Cómo se maneja el horario?",
  "After signup, we lock in a recurring day and time window. You'll get an ETA reminder before every visit. Reschedule anytime from your dashboard.":
    "Al inscribirte, fijamos un día y horario recurrente. Recibes un aviso de llegada antes de cada visita. Reagenda cuando quieras desde tu panel.",
  "Reach out within 24 hours and we'll re-clean the area or credit your account — no questions asked.":
    "Avísanos en 24 horas y volvemos a limpiar el área o te acreditamos a tu cuenta — sin preguntas.",
  "Already booking cleaning? Add lawn care for $85/mo.": "¿Ya tienes limpieza? Agrega jardín por $85/mes.",
  "Save 10% when you stack — and never coordinate two providers again.":
    "Ahorra 10% al combinar — y nunca más coordines dos proveedores.",

  // Lawn Care LP
  "Monthly Lawn Care in Pinecrest + Kendall": "Cuidado Mensual del Jardín en Pinecrest + Kendall",
  "Mow, edge, blow. Same crew. Locked price. Never surprise-billed.":
    "Cortar, bordear, soplar. El mismo equipo. Precio fijo. Sin facturas sorpresa.",
  "Starting at $85/mo": "Desde $85/mes",
  "Most Pinecrest lawn pros charge **$40–$60 per visit**. Monthly Tidy is **$85/mo flat**, same crew, no surprise invoices.":
    "La mayoría de los jardineros en Pinecrest cobran **$40–$60 por visita**. Tidy mensual es **$85/mes fijo**, el mismo equipo, sin facturas sorpresa.",
  // Lawn Care plans
  "One visit per month.": "Una visita al mes.",
  "Two visits per month.": "Dos visitas al mes.",
  "Four visits per month, bush trim included.": "Cuatro visitas al mes, poda de arbustos incluida.",
  // Lawn Care included
  "Mow to precise height": "Corte a altura precisa",
  "Edge all borders": "Bordeado de todos los contornos",
  "Blow hardscapes clean": "Soplado de áreas pavimentadas",
  "Weed-whack fence lines": "Desbroce a lo largo de las cercas",
  "Bag or mulch clippings": "Embolsar o triturar el césped cortado",
  "Bush trim (weekly)": "Poda de arbustos (semanal)",
  "Seasonal fertilization available": "Fertilización por temporada disponible",
  "Locked $85 — never surprise-priced": "$85 fijo — nunca con precios sorpresa",
  // Lawn Care testimonials
  "Lawn looks sharp every week without me lifting a finger. Best $85 I spend monthly.":
    "El jardín se ve impecable cada semana sin mover un dedo. Los mejores $85 que gasto al mes.",
  "Edges are crisp, beds are clean, no debris left behind. Pure consistency.":
    "Los bordes salen limpios, las jardineras quedan despejadas, sin escombros. Pura consistencia.",
  "They show up rain or shine. Locked price, never a surprise invoice.":
    "Llegan llueva o truene. Precio fijo, nunca una factura sorpresa.",
  // Lawn Care FAQs
  "Plans start at $85/mo monthly, $149/mo biweekly, $239/mo weekly. Pricing is based on cadence and yard size. Standard pricing covers most yards up to 4,000 sq ft of mowable turf.":
    "Los planes empiezan en $85/mes mensual, $149/mes quincenal y $239/mes semanal. El precio depende de la frecuencia y el tamaño del jardín. El precio estándar cubre la mayoría de los jardines hasta 4,000 pies cuadrados de césped cortable.",
  "Mowing to precise height, edging all borders, blowing all hardscapes, weed-whacking fence lines, and bagging or mulching clippings. Weekly plans include bush trim.":
    "Corte a altura precisa, bordeado de todos los contornos, soplado de áreas pavimentadas, desbroce a lo largo de las cercas y embolsar o triturar el césped. Los planes semanales incluyen poda de arbustos.",
  "Who does the work?": "¿Quién hace el trabajo?",
  "Licensed, insured, background-checked crews. Same team every visit so your lawn stays consistent.":
    "Equipos licenciados, asegurados y verificados. El mismo equipo cada visita para que tu jardín se mantenga consistente.",
  "We automatically reschedule to the next available day. Your subscription stays active and your price doesn't change.":
    "Reprogramamos automáticamente para el siguiente día disponible. Tu suscripción sigue activa y tu precio no cambia.",
  "Reach out within 24 hours and we'll send the crew back or credit your account — no questions asked.":
    "Avísanos en 24 horas y mandamos al equipo de vuelta o te acreditamos a tu cuenta — sin preguntas.",
  "Already booking lawn? Add biweekly cleaning for $279/mo.": "¿Ya tienes jardín? Agrega limpieza quincenal por $279/mes.",

  // Car Detailing LP
  "Mobile Car Detailing in Pinecrest + Kendall": "Detallado Móvil de Auto en Pinecrest + Kendall",
  "We come to your driveway. Ceramic-safe. Monthly interior + exterior.":
    "Vamos a tu garaje. Seguro para cerámica. Interior + exterior mensual.",
  "A good mobile detail runs **$120–$180 per appointment**. Our subscription is **$159/mo** — and we come to your driveway.":
    "Un buen detallado móvil cuesta **$120–$180 por cita**. Nuestra suscripción es **$159/mes** — y vamos a tu garaje.",
  // Car Detailing plans
  "Basic Monthly": "Básico Mensual",
  "Premium Monthly": "Premium Mensual",
  "Full Detail": "Detallado Completo",
  "Interior + exterior, one vehicle.": "Interior + exterior, un vehículo.",
  "Full interior + exterior + wax, one vehicle.": "Interior + exterior + cera completos, un vehículo.",
  "Quarterly full detail, monthly maintenance, up to 2 vehicles.":
    "Detallado completo trimestral, mantenimiento mensual, hasta 2 vehículos.",
  // Car Detailing included
  "Exterior hand wash": "Lavado exterior a mano",
  "Ceramic-safe process": "Proceso seguro para cerámica",
  "Wheel + tire dress": "Limpieza de ruedas y abrillantado",
  "Dashboard + console wipe": "Limpieza de tablero y consola",
  "Interior + exterior glass": "Cristales interiores y exteriores",
  "Pet-hair removal add-on": "Extra: retiro de pelo de mascota",
  "Ozone treatment add-on": "Extra: tratamiento con ozono",
  "In your driveway": "En tu garaje",
  // Car Detailing testimonials
  "They come to my driveway every month — car looks showroom-fresh, no drop-off needed.":
    "Vienen a mi garaje cada mes — el carro queda como de agencia, sin tener que llevarlo a ningún lado.",
  "Ceramic-safe process protects the coating. Interior is spotless every time.":
    "El proceso seguro para cerámica protege el recubrimiento. El interior queda impecable cada vez.",
  "Locked monthly price. Same detailer every visit. Best routine I've added all year.":
    "Precio mensual fijo. El mismo detallador cada visita. La mejor rutina que añadí en todo el año.",
  // Car Detailing FAQs
  "Plans start at $159/mo for Basic, $239/mo Premium, and $459/mo Full Detail. Pricing is based on plan and vehicle size. Standard pricing covers sedans, coupes, crossovers, and 2-row SUVs.":
    "Los planes empiezan en $159/mes para Básico, $239/mes Premium y $459/mes Detallado Completo. El precio depende del plan y del tamaño del vehículo. El precio estándar cubre sedanes, coupés, crossovers y SUVs de 2 filas.",
  "What's actually included?": "¿Qué se incluye exactamente?",
  "Exterior hand wash with ceramic-safe products, wheel and tire dress, interior vacuum, dashboard and console wipe-down, and interior + exterior glass. Pet-hair and ozone available as add-ons.":
    "Lavado exterior a mano con productos seguros para cerámica, limpieza de ruedas y abrillantado, aspirado interior, limpieza de tablero y consola, y cristales interiores y exteriores. Pelo de mascota y ozono disponibles como extras.",
  "Who does the detailing?": "¿Quién hace el detallado?",
  "Licensed, insured, background-checked detailers. Same detailer every visit so they learn your vehicle.":
    "Detalladores licenciados, asegurados y verificados. El mismo detallador cada visita para que conozca tu vehículo.",
  "What about oversized or commercial vehicles?": "¿Y los vehículos grandes o comerciales?",
  "3-row SUVs, full-size trucks, and large vans get a small upgrade fee. Commercial vans and lifted trucks need a quick custom quote — we'll handle it.":
    "Las SUVs de 3 filas, camionetas grandes y vans grandes tienen un pequeño cargo adicional. Vans comerciales y camionetas elevadas necesitan una cotización rápida — la manejamos.",
  "Reach out within 24 hours and we'll send the detailer back or credit your account — no questions asked.":
    "Avísanos en 24 horas y mandamos al detallador de vuelta o te acreditamos a tu cuenta — sin preguntas.",
  "Already booking detailing? Add monthly cleaning for $159/mo.": "¿Ya tienes detallado? Agrega limpieza mensual por $159/mes.",

  // Bundle page
  "Bundle & Save": "Combo y Ahorra",
  "Bundle & Save — Stack services, save 10–20%": "Combo y Ahorra — Apila servicios, ahorra 10–20%",
  "The more you stack, the more you save. Pinecrest + Kendall only (33156 · 33183 · 33186).":
    "Mientras más combinas, más ahorras. Solo Pinecrest + Kendall (33156 · 33183 · 33186).",
  "2-Service Bundle": "Combo de 2 Servicios",
  "10% off": "10% descuento",
  "Pick any two — we coordinate everything and you save 10% every month.":
    "Elige cualquier dos — coordinamos todo y ahorras 10% cada mes.",
  "after 10% bundle discount": "después del 10% de descuento por combo",
  "Pick exactly 2 services to see your bundled price.": "Elige exactamente 2 servicios para ver tu precio combinado.",
  "Build my 2-service bundle": "Arma mi combo de 2 servicios",
  "Pick 2 services to continue": "Elige 2 servicios para continuar",
  "3-Service Bundle": "Combo de 3 Servicios",
  "20% off": "20% descuento",
  "All three services on one plan: cleaning, lawn care, and detailing. Lock in 20% off the combined monthly price.":
    "Los tres servicios en un solo plan: limpieza, jardín y detallado. Asegura 20% de descuento sobre el precio mensual combinado.",
  "Build my 3-service bundle": "Arma mi combo de 3 servicios",
  "Custom": "Personalizado",
  "Tailored": "A Medida",
  "Larger home, oversized lot, or fleet of vehicles? We'll build a custom plan and send you a personal quote.":
    "¿Casa más grande, terreno extenso o flota de vehículos? Armamos un plan a medida y te enviamos una cotización personal.",
  "Request a custom plan": "Solicita un plan personalizado",
  "Why bundle?": "¿Por qué combinar?",
  "10% off any 2 services — applied automatically": "10% de descuento en cualquier 2 servicios — aplicado automáticamente",
  "20% off all 3 services — applied automatically": "20% de descuento en los 3 servicios — aplicado automáticamente",
  "One subscription, one bill, one crew": "Una suscripción, una factura, un equipo",
  "Same locked price every month": "El mismo precio fijo cada mes",
  "Cancel or adjust anytime": "Cancela o ajusta cuando quieras",
  "Serving 33156 · 33183 · 33186 only": "Sirviendo solo 33156 · 33183 · 33186",
  "Ready to bundle?": "¿Listo para combinar?",
  "Start saving": "Comienza a ahorrar",

  // LP final CTA headlines (computed via template — list each one explicitly)
  "Ready to lock in your house cleaning?": "¿Listo para asegurar tu limpieza del hogar?",
  "Ready to lock in your lawn care?": "¿Listo para asegurar tu cuidado del jardín?",
  "Ready to lock in your car detailing?": "¿Listo para asegurar tu detallado de auto?",

  // SEO titles (browser tab) — translated for ES users
  "House Cleaning in Pinecrest + Kendall | Tidy Home Services":
    "Limpieza del Hogar en Pinecrest + Kendall | Tidy Home Services",
  "Lawn Care in Pinecrest + Kendall | Tidy Home Services":
    "Cuidado del Jardín en Pinecrest + Kendall | Tidy Home Services",
  "Car Detailing in Pinecrest + Kendall | Tidy Home Services":
    "Detallado de Auto en Pinecrest + Kendall | Tidy Home Services",
  "Bundle & Save in Pinecrest + Kendall | Tidy Home Services":
    "Combo y Ahorra en Pinecrest + Kendall | Tidy Home Services",
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

const STORAGE_KEY = "tidy.lang";

/**
 * Resolve the initial language. Order of precedence:
 *   1. ?lang=es / ?lang=en in the current URL (lets us share localized links)
 *   2. localStorage (so the toggle persists across page navigations + reloads)
 *   3. browser language (navigator.language → es if it starts with "es")
 *   4. fallback to "en"
 *
 * The URL param wins so a user clicking a /house-cleaning?lang=es link from
 * a Spanish-speaking neighbor lands in Spanish even if their browser is in EN.
 */
const resolveInitialLanguage = (): Language => {
  if (typeof window === "undefined") return "en";
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("lang");
    if (fromUrl === "es" || fromUrl === "en") return fromUrl;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
    const browserLang = navigator.language || (navigator as any).userLanguage || "en";
    return browserLang.startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
};

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(resolveInitialLanguage);

  // Persist preference + mirror to the URL so it survives pages + can be linked.
  // We rewrite the URL with replaceState (no history entry) — React Router
  // never re-renders on this because the path is unchanged.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
      const url = new URL(window.location.href);
      const current = url.searchParams.get("lang");
      // Only write ?lang= when ES (keep EN URLs clean — EN is the default).
      if (language === "es" && current !== "es") {
        url.searchParams.set("lang", "es");
        window.history.replaceState(null, "", url.toString());
      } else if (language === "en" && current) {
        url.searchParams.delete("lang");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      /* no-op */
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);

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
