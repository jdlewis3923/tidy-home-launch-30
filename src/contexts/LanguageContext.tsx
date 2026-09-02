import { createContext, useContext, useState, ReactNode, useCallback, useEffect } from "react";

type Language = "en" | "es";

const translations: Record<string, string> = {
  // 404 page
  "Page not found": "P\u00e1gina no encontrada",
  "Oops! Page not found": "\u00a1Ups! No encontramos esta p\u00e1gina",
  "Return to Home": "Volver al inicio",

  // Pro dashboard — review bonus card
  "Review Bonus": "Bono por reseña",
  "This month's 5-star reviews": "Reseñas de 5 estrellas este mes",
  "counted toward your monthly cap": "contadas hacia tu límite mensual",
  "Bonuses earned": "Bonos ganados",
  "Cap remaining": "Límite restante",
  "Plus": "Además,",
  "more matched review(s) still in the 7-day hold period.": "reseña(s) más en el período de espera de 7 días.",
  "$25 per 5-star Google review that names you, capped at 4 per calendar month (up to $100). Paid 7 days after the review posts, on your Friday deposit. The cap does not roll over.":
    "$25 por cada reseña de 5 estrellas en Google que te mencione por nombre, con un límite de 4 por mes calendario (hasta $100). Se paga 7 días después de que se publique la reseña, en tu depósito del viernes. El límite no se acumula para el mes siguiente.",

  "Back to dashboard": "Volver al panel",

  // Chatbot widget
  "Tidy Concierge": "Concierge de Tidy",
  Call: "Llamar",
  Send: "Enviar",
  "Close chat": "Cerrar el chat",
  "Open chat with Tidy assistant": "Abrir el chat con el asistente de Tidy",
  "Hi! I'm Tidy's concierge assistant \u{1F44B} Ask me anything about cleaning, lawn care, detailing, pricing, or our service area.":
    "\u00a1Hola! Soy el asistente concierge de Tidy \u{1F44B} Preg\u00fantame lo que quieras sobre limpieza, jardiner\u00eda, detallado de carros, precios o nuestra zona de servicio.",
  "Sending...": "Enviando...",
  "Ask about pricing, areas, services...": "Pregunta sobre precios, zonas, servicios...",
  "A human will be with you soon. You can also call us at":
    "Una persona te atender\u00e1 pronto. Tambi\u00e9n puedes llamarnos al",
  "Couldn't reach Tidy. Try again or call ": "No pudimos conectar con Tidy. Intenta de nuevo o llama al ",
  "Something went wrong": "Algo sali\u00f3 mal",

  // ZIP checker / waitlist capture
  "We serve": "¡Servimos en",
  "Spots are limited — get started today.": "Cupos limitados — empieza hoy.",
  "We're not in": "Todavía no estamos en",
  "yet.": "—",
  "We launched in Pinecrest + Kendall first. Drop your email and we'll alert you the moment we expand to your area.": "Comenzamos en Pinecrest y Kendall. Déjanos tu correo y te avisamos en cuanto lleguemos a tu zona.",
  "You're on the list.": "Estás en la lista.",
  "We'll email you the moment Tidy reaches": "Te escribiremos en cuanto Tidy llegue a",
  "No spam — one note when we expand.": "Sin spam — un solo aviso cuando nos expandamos.",
  "Please enter a valid email.": "Ingresa un correo válido.",
  "Couldn't save — try again in a moment.": "No se pudo guardar — inténtalo en un momento.",
  "← try another zip": "← probar otro código postal",
  "notify me": "avísame",
  "saving…": "guardando…",

  // Navbar
  Services: "Servicios",
  "How It Works": "Cómo Funciona",
  Pricing: "Precios",
  FAQ: "Preguntas Frecuentes",
  "Request Early Access": "Solicitar Acceso",
  "START MY PLAN": "EMPEZAR MI PLAN",
  Home: "Inicio",
  "House Cleaning": "Limpieza del Hogar",
  "Lawn Care": "Cuidado del Jardín",
  "Car Detailing": "Detallado de Carro",
  "Bundle & Save": "Combo y Ahorra",
  Refer: "Refiere",
  Login: "Acceder",

  // Announcement ticker
  "Background-Checked": "Antecedentes Verificados",
  "Background-Checked Pros": "Profesionales con Antecedentes Verificados",
  "Same Pro Every Time": "El Mismo Profesional Cada Visita",
  "Cancel Anytime": "Cancela Cuando Quieras",
  "Photo Verified Every Visit": "Fotos Verificadas en Cada Visita",
  "No Long-Term Contracts": "Sin Contratos a Largo Plazo",

  "Serving Kendall & Pinecrest": "Sirviendo Kendall y Pinecrest",
  "One Monthly Plan": "Un Plan Mensual",
  "No Rebooking": "Sin Reagendar",
  "One Simple Monthly Plan": "Un Solo Plan Mensual",
  "Zero Rebooking Required": "Sin Necesidad de Reagendar",

  // Hero
  "Now accepting homes in Kendall & Pinecrest": "Ahora aceptando hogares en Kendall y Pinecrest",
  "Now accepting homes in Kendall & Pinecrest · Limited spots":
    "Ahora aceptando hogares en Kendall y Pinecrest · Cupos limitados",
  "Your Home. Handled.": "Tu Hogar. Resuelto.",
  "Your Home.": "Tu Hogar.",
  "On Autopilot.": "En Piloto Automático.",
  "Every Month.": "Cada Mes.",
  "Scheduling, timing, and follow-through — handled.": "Programación, tiempos y seguimiento — resueltos.",
  "Set it once. We take care of the rest.": "Configúralo una vez. Nosotros nos encargamos del resto.",
  "No contracts · Cancel anytime · From $45 a visit": "Sin contratos · Cancela cuando quieras · Desde $45 por visita",
  "Founding memberships · No commitment · From $45 a visit": "Membresías fundadoras · Sin compromiso · Desde $45 por visita",
  "START MY PLAN →": "EMPEZAR MI PLAN →",
  "We handle scheduling, timing, and everything in between.":
    "Nosotros nos encargamos de la programación, los tiempos y todo lo demás.",
  "Just set it — we'll take care of the rest.": "Solo configúralo — nosotros nos encargamos del resto.",
"Cleaning, lawn care, and car detailing — fully managed for you. No booking, no vendors, no reminders. Ever.":
    "Limpieza, jardín y detallado de carro — lo manejamos todo nosotros. Sin reservas, sin proveedores, sin recordatorios. Nunca.",
  "🏠 House Cleaning": "🏠 Limpieza del Hogar",
  "🌿 Lawn Care": "🌿 Cuidado del Jardín",
  "🚗 Car Detailing": "🚗 Detallado de Carro",
  "✓ Cancel Anytime": "✓ Cancela Cuando Quieras",
  "Limited founding memberships · No commitment required · From $45 a visit":
    "Membresías fundadoras limitadas · Sin compromiso · Desde $45 por visita",

  // Proof bar
  "Miami Homeowners": "Propietarios en Miami",
  "Core Services": "Servicios Principales",
  "ZIP Codes Served": "Códigos Postales",
  "Consistent service. No follow-ups. No hassle.": "Servicio consistente. Sin seguimientos. Sin complicaciones.",
  "Rebooking Required": "Reagendamiento Necesario",

  // Services
  "What's Included": "Qué Incluye",
  "Everything your home needs. One plan.": "Todo lo que tu hogar necesita. Un plan.",
  "Everything your home needs. One simple plan.": "Todo lo que tu hogar necesita. Un plan simple.",
"Three essential services. One subscription. Zero coordination required. Your schedule, your frequency — handled automatically every month.":
    "Tres servicios esenciales. Una suscripción. Cero coordinación. Tu horario, tu frecuencia — todo corre solo cada mes.",
  "⭐ Most Popular": "⭐ Más Popular",
  "Most Popular": "Más Popular",
  "Best Value": "Mejor Precio",
  "Kitchen & bathroom cleaning": "Limpieza de cocina y baño",
  "Floors vacuumed & mopped": "Pisos aspirados y trapeados",
  "Dusting & surface wipe-down": "Limpieza de polvo y superficies",
  "Trash removal": "Retiro de basura",
  "Mowing to standard height": "Corte de grama a altura estándar",
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
  "How it works — three steps, then you never think about it again.":
    "Cómo funciona — tres pasos, y nunca más piensas en ello.",
  "Choose Your Plan": "Elige Tu Plan",
  "Select your services and frequency. About 2 minutes. See pricing before you pay.":
    "Selecciona tus servicios y frecuencia. Unos 2 minutos. Ve los precios antes de pagar.",
  "We Handle Everything": "Nosotros Nos Encargamos",
  "Your assigned professional shows up on time. You receive an ETA before every visit.":
    "Un profesional verificado y con antecedentes revisados llega a tiempo. Recibes un estimado antes de cada visita.",
  "You Never Think About It Again": "Nunca Más Piensas en Ello",
  "Recurring scheduling, automatic billing, photo verification after every visit. No reminders. No rebooking. No effort.":
    "Programación recurrente, facturación automática, verificación con fotos después de cada visita. Sin recordatorios. Sin reagendar. Sin esfuerzo.",
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
  "Hours lost managing home services monthly": "Horas perdidas manejando servicios del hogar mensualmente",
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
"If you'd rather spend your weekend doing anything but managing vendors, Tidy is for you.":
    "Si prefieres pasar tu fin de semana haciendo cualquier cosa menos lidiar con proveedores, Tidy es para ti.",
  "Busy Professionals": "Profesionales Ocupados",
"No time to manage 3 different vendors. One plan handles everything on autopilot while you focus on what matters.":
    "Sin tiempo para estar detrás de 3 compañías diferentes. Un plan maneja todo en automático mientras te enfocas en lo que importa.",
  Families: "Familias",
  "Keep your home consistently maintained without it falling on any one person. Reliable service, every single visit.":
    "Mantén tu hogar consistentemente mantenido sin que recaiga en una sola persona. Servicio confiable, cada visita.",
  "Time-Conscious Homeowners": "Propietarios que Valoran su Tiempo",
  "You value your weekend. Stop spending it coordinating, rebooking, and following up. Tidy handles all of it.":
    "Valoras tu fin de semana. Deja de gastarlo coordinando, reagendando y dando seguimiento. Tidy se encarga de todo.",

  // Testimonials
  Reviews: "Reseñas",

  "Request Early Access →": "Solicitar Acceso →",

  // Why Tidy
  "Why Tidy": "Por Qué Tidy",
  "Why homeowners choose Tidy": "Por qué los propietarios eligen Tidy",
  "Full Autopilot": "Piloto Automático",
  "Everything runs automatically. No scheduling. No coordination. No thinking about it again after signup.":
    "Todo funciona automáticamente. Sin programar. Sin coordinar. Sin pensar en ello después de inscribirte.",
  "Satisfaction Guarantee": "Garantía de Satisfacción",
  "First visit perfect or it's free. After that, if it isn't perfect, we fix it fast. No contracts. Cancel anytime.":
    "Primera visita perfecta o es gratis. Después, si no es perfecto, lo arreglamos rápido. Sin contratos. Cancela cuando quieras.",
  "Every professional is background-checked through Checkr. Photo verification submitted after every visit.":
    "Cada profesional tiene sus antecedentes revisados a través de Checkr. Verificación con fotos después de cada visita.",
  "Always on Schedule": "Siempre a Tiempo",
  "Weekly, biweekly, or monthly service. No delays, no chasing vendors, no rescheduling headaches.":
    "Servicio semanal, quincenal o mensual. Sin demoras, sin perseguir proveedores, sin dolores de cabeza por reagendar.",
  "One Simple Bill": "Una Sola Factura",
  "All services under one monthly subscription. Transparent pricing, no surprise charges, secure payments via Stripe.":
    "Todos los servicios bajo una suscripción mensual. Precios transparentes, sin cargos sorpresa, pagos seguros vía Stripe.",
  "Miami-Local": "Local en Miami",
  "Built for Florida homes. Serving Kendall, Kendall West & Pinecrest neighborhoods.":
    "Hecho para hogares de Florida. Sirviendo las comunidades de Kendall, Kendall West y Pinecrest.",

  // Pricing
  "Everything runs automatically — no coordination needed. Modify, skip, or adjust anytime.":
    "Todo funciona automáticamente — sin coordinación necesaria. Modifica, omite o ajusta en cualquier momento.",
  "Simple, transparent rates. No surprises.": "Tarifas simples y transparentes. Sin sorpresas.",
  "Pay monthly. Cancel anytime. Higher frequency = lower cost per visit. Add a 2nd service and one free premium add-on a month.":
    "Paga mensualmente. Cancela cuando quieras. Mayor frecuencia = menor costo por visita. Agrega un 2.º servicio y recibe un servicio adicional premium gratis al mes.",
  Service: "Servicio",
  Monthly: "Mensual",
  Biweekly: "Quincenal",
  Weekly: "Semanal",
  "Bundle 2+ services · you pick 1 free premium add-on every month · Cancel anytime":
    "Combina 2+ servicios · eliges 1 servicio adicional premium gratis cada mes · Cancela cuando quieras",

  // FAQ
  "Most customers never need to think about any of this — but we've got you covered.":
    "La mayoría de los clientes nunca necesitan pensar en esto — pero te tenemos cubierto.",
  "Common questions": "Preguntas comunes",
  "Getting Started": "Primeros Pasos",
  "Services & Scheduling": "Servicios y Programación",
  "Service Scope": "Alcance del Servicio",
  Billing: "Facturación",
  "Trust & Quality": "Confianza y Calidad",

  // FAQ Q&A (homepage)
  "What is Tidy?": "¿Qué es Tidy?",
  "Great question! Tidy is an all-in-one home services subscription — we handle your house cleaning, lawn care, and car detailing all under one simple monthly plan. No juggling multiple providers, no chasing quotes. Just one subscription and everything stays spotless.":
    "¡Buena pregunta! Tidy es una suscripción de servicios del hogar todo-en-uno en Miami — manejamos tu limpieza, jardín y detallado de carro en un solo plan mensual. Sin malabarear varios proveedores, sin perseguir cotizaciones. Una suscripción y todo queda impecable.",
  "How do I sign up?": "¿Cómo me inscribo?",
  "Super easy — just tap the 'Get Early Access' button, fill out a quick 2-minute form with your name and contact info, and we'll reach out to confirm your spot and lock in your schedule. That's it!":
    "Súper fácil — toca el botón 'Solicitar Acceso', llena un formulario rápido de 2 minutos con tu nombre y contacto, y te llamamos para confirmar tu lugar y fijar tu horario. ¡Eso es todo!",
  "Where is Tidy available?": "¿Dónde está disponible Tidy?",
  "We're currently serving some of Miami's best neighborhoods: Kendall (33183, 33186) and Pinecrest (33156). More areas are coming soon — grab your spot now!":
    "Ahora mismo servimos los mejores vecindarios de Miami: Kendall (33183, 33186) y Pinecrest (33156). Vienen más áreas — ¡reserva tu lugar ahora!",
  "Is there a commitment?": "¿Hay algún compromiso?",
  "Nope — zero commitment! There are no contracts and no cancellation fees. You can cancel anytime, no questions asked. We earn your business every single month.":
    "¡Para nada — cero compromiso! Sin contratos y sin cargos por cancelación. Puedes cancelar cuando quieras, sin preguntas. Nos ganamos tu confianza cada mes.",
  "How often do services happen?": "¿Cada cuánto se hacen los servicios?",
  "Totally up to you! Choose weekly, biweekly, or monthly for each service — and yes, you can mix and match. Want weekly lawn care but biweekly cleaning? Done. We build your plan around your life.":
    "¡Tú decides! Elige semanal, quincenal o mensual para cada servicio — y sí, puedes combinar. ¿Quieres jardín semanal pero limpieza quincenal? Listo. Armamos el plan a tu medida.",
  "Do I need to be home?": "¿Tengo que estar en casa?",
  "Not at all! Just give us access via a lockbox, gate code, or smart lock and our team handles everything while you're out living your best life. You'll get photo confirmation when each service is done.":
    "¡Para nada! Danos acceso con caja de seguridad, código de puerta o cerradura inteligente y nuestro equipo se encarga de todo mientras tú haces lo tuyo. Recibes confirmación con fotos al terminar cada servicio.",
  "Can I reschedule or pause?": "¿Puedo reagendar o pausar?",
  "Absolutely! Life happens — just shoot us a message and we'll move things around for you. Need to pause for a vacation? No problem. We've got you covered.":
    "¡Claro que sí! Las cosas pasan — mándanos un mensaje y movemos todo. ¿Necesitas pausar por vacaciones? Sin problema. Te tenemos cubierto.",
  "What if it rains?": "¿Y si llueve?",
  "No worries! If weather impacts an outdoor service, we'll automatically reschedule it for the next available day. Your subscription stays active and you won't miss a beat.":
    "¡No te preocupes! Si el clima afecta un servicio exterior, lo reprogramamos automáticamente al siguiente día disponible. Tu suscripción sigue activa y no pierdes nada.",
  "What does house cleaning include?": "¿Qué incluye la limpieza del hogar?",
  "We cover all the essentials to keep your home feeling fresh — kitchen surfaces and countertops, full bathroom cleaning, dusting throughout, vacuuming and mopping all floors, and trash removal. Your home will look and feel amazing after every visit.":
    "Cubrimos todo lo esencial para que tu casa se sienta fresca — superficies de cocina y mostradores, limpieza completa de baños, limpieza de polvo, aspirado y trapeado de todos los pisos, y retiro de basura. Tu casa se verá y se sentirá increíble después de cada visita.",
  "What does lawn care include?": "¿Qué incluye el cuidado del jardín?",
  "We keep your curb appeal on point! Every visit includes professional mowing, clean edging along walkways and beds, and blowing all debris off your walkways and driveways. Your neighbors will notice the difference.":
    "¡Mantenemos tu fachada al máximo! Cada visita incluye corte profesional, bordeado limpio a lo largo de caminos y jardineras, y soplado de todos los escombros de caminos y entradas. Los vecinos van a notar la diferencia.",
  "What does car detailing include?": "¿Qué incluye el detallado de carro?",
  "Your ride deserves love too! We do a full exterior hand wash with wheel cleaning, thorough interior vacuum, and a complete interior surface wipe-down. Your car will look showroom-ready right in your driveway.":
    "¡Tu carro también merece cariño! Hacemos lavado exterior completo a mano con limpieza de ruedas, aspirado interior profundo y limpieza completa de superficies interiores. Tu carro va a lucir como nuevo en tu propio garaje.",
  "Are deep cleaning or restoration services included?": "¿Se incluyen limpiezas profundas o restauración?",
  "Tidy is designed for consistent, ongoing maintenance — the kind that keeps everything looking great week after week. If you need a one-time deep clean or restoration work, we offer those as add-ons. Just ask!":
    "Tidy está diseñado para mantenimiento constante — del que mantiene todo luciendo bien semana tras semana. Si necesitas una limpieza profunda única o trabajo de restauración, los ofrecemos como extras. ¡Solo pregunta!",
  "How does billing work?": "¿Cómo funciona la facturación?",
  "Simple and transparent! You're billed monthly via Stripe — everything is automatic, fully secure, and you'll get a receipt every time. No surprise charges, ever.":
    "¡Simple y transparente! Te cobramos mensualmente vía Stripe — todo es automático, totalmente seguro, y recibes un recibo cada vez. Sin cargos sorpresa, nunca.",
  "Can I cancel anytime?": "¿Puedo cancelar cuando quiera?",
  "Yes, 100%! No cancellation fees, no contracts, no awkward phone calls. If you ever want to cancel, just let us know and we'll take care of it immediately.":
    "¡Sí, 100%! Sin cargos por cancelación, sin contratos, sin llamadas incómodas. Si alguna vez quieres cancelar, solo avísanos y nos encargamos al instante.",
  "What if my payment fails?": "¿Qué pasa si falla mi pago?",
  "We'll pause your services and notify you right away via SMS and email so you can update your payment info. Once it's sorted, we'll get you back on schedule — easy as that.":
    "Pausamos tus servicios y te avisamos enseguida por SMS y correo para que actualices tu pago. Una vez resuelto, te ponemos de vuelta en horario — así de fácil.",
  "Can I change services later?": "¿Puedo cambiar servicios después?",
  "Of course! Want to add car detailing or switch your cleaning frequency? Just reach out and any changes will kick in at your next billing cycle. We're flexible because your needs are too.":
    "¡Por supuesto! ¿Quieres agregar detallado o cambiar la frecuencia de limpieza? Contáctanos y los cambios entran en tu próximo ciclo de facturación. Somos flexibles porque tus necesidades también lo son.",
  "Are contractors background-checked?": "¿Los contratistas tienen antecedentes verificados?",
  "Absolutely — your trust means everything to us. Every single contractor is screened through Checkr, and we require photo documentation after every visit so you can see exactly what was done. Quality and accountability are built into everything we do.":
    "Absolutamente — tu confianza lo es todo. Cada contratista está completamente verificado, y exigimos documentación con fotos después de cada visita para que veas exactamente lo que se hizo. Calidad y responsabilidad en todo lo que hacemos.",
  "What if I'm not satisfied?": "¿Y si no quedo satisfecho?",
  "We want you to love every service! If something isn't right, just reach out within 24 hours and we'll make it right — whether that means a re-service or a credit. Your satisfaction is our top priority.":
    "¡Queremos que ames cada servicio! Si algo no está bien, contáctanos en 24 horas y lo resolvemos — ya sea con otro servicio o un crédito. Tu satisfacción es nuestra prioridad.",
  "How do I contact support?": "¿Cómo contacto a soporte?",
  "We're here for you! Email us at hello@jointidy.co and we'll get back to you within 1 hour during business hours. Real people, real answers, real fast.":
    "¡Estamos para ti! Escríbenos a hello@jointidy.co y te respondemos en 1 hora durante horario laboral. Personas reales, respuestas reales, súper rápido.",

  // Zip checker
  "Is Tidy in your neighborhood?": "¿Tidy está en tu vecindario?",
  "We're launching in select Miami ZIP codes first to ensure consistently high-quality service from day one.":
    "Estamos lanzando en códigos postales selectos de Miami primero para asegurar servicio de alta calidad desde el día uno.",
  "Enter ZIP code e.g. 33183": "Ingresa código postal ej. 33183",
  "Check →": "Verificar →",

  // Add-on catalogue + bundle small print (batch 15/16)
  "Inside oven, inside fridge, interior windows, baseboard scrub, laundry, inside kitchen cabinets":
    "Interior del horno, interior del refrigerador, ventanas interiores, limpieza de zócalos, lavandería, interior de gabinetes de cocina",
  "Weed removal, leaf & debris cleanup, bed edge reset, exterior windows & screens":
    "Remoción de maleza, limpieza de hojas y escombros, reajuste del borde de jardineras, ventanas y mosquiteros exteriores",
  "Pet hair removal, clay bar & ceramic coat, headlight restoration, interior protect & condition":
    "Remoción de pelo de mascotas, barra de arcilla y capa cerámica, restauración de faros, protección y acondicionamiento del interior",
  "Available as add-ons: inside oven, inside fridge, interior windows, deep baseboard scrub, laundry (wash/dry/fold), inside kitchen cabinets.":
    "Disponibles como servicios adicionales: interior del horno, interior del refrigerador, ventanas interiores, limpieza profunda de zócalos, lavandería (lavado/secado/doblado), interior de gabinetes de cocina.",
  "Available as add-ons: weed removal, leaf & debris cleanup, bed edge reset, exterior windows & screens. Driveway pressure wash is specialist work, quoted separately.":
    "Disponibles como servicios adicionales: remoción de maleza, limpieza de hojas y escombros, reajuste del borde de jardineras, ventanas y mosquiteros exteriores. El lavado a presión de la entrada es trabajo especializado y se cotiza aparte.",
  "Available as add-ons: pet hair removal, clay bar & ceramic coat, headlight restoration, interior protect & condition.":
    "Disponibles como servicios adicionales: remoción de pelo de mascotas, barra de arcilla y capa cerámica, restauración de faros, protección y acondicionamiento del interior.",
  "from": "desde",
  "Figures assume monthly service for each service. Your price changes with the visit frequency you choose.":
    "Las cifras asumen servicio mensual para cada servicio. Tu precio cambia según la frecuencia de visitas que elijas.",
  "Paint correction": "Corrección de pintura",
  "Four visits per month.": "Cuatro visitas por mes.",

  // Final CTA
  "You'll never book a home service again.": "Nunca más reservarás un servicio del hogar.",
  "Never book a home service again.": "Nunca más reserves un servicio del hogar.",
  "Set it once. We handle the rest.": "Configúralo una vez. Nosotros nos encargamos del resto.",
  "About 2 minutes · No contracts · Cancel anytime":
    "Unos 2 minutos · Sin contratos · Cancela cuando quieras",
  "One setup. Everything handled.": "Una configuración. Todo resuelto.",
  "No contracts. No payments until launch.": "Sin contratos. Sin pagos hasta el lanzamiento.",
  "Limited founding memberships available in your area. Takes about 2 minutes. No commitment required.":
    "Membresías fundadoras limitadas en tu área. Toma unos 2 minutos. Sin compromiso.",
  "Get Started — Request Early Access →": "Comienza — Solicitar Acceso →",

  "Miami-Based": "Basado en Miami",

  // Lead popup
  "🎉 Founding Member Offer": "🎉 Oferta de Miembro Fundador",
  "Founding Rate Locked": "Tarifa de Fundador Bloqueada",
  "Your Price Never Rises": "Tu Precio Nunca Sube",
  "Join Miami homeowners who have already simplified their home. Lock in founding pricing before we launch publicly.":
    "Únete a los propietarios de Miami que ya simplificaron su hogar. Asegura precios de fundador antes del lanzamiento público.",
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
  "Car Detailing Miami": "Detallado de Carro Miami",
  "Referral Program": "Programa de Referidos",
  Company: "Empresa",
  "Service Areas": "Áreas de Servicio",
  // Account creation consent
  "By creating an account you agree to our": "Al crear una cuenta, aceptas nuestros",
  "and": "y",
  "Terms of Service": "Términos de Servicio",
  "Privacy Policy": "Política de Privacidad",
  "Contact Us": "Contáctanos",
  Terms: "Términos",
  Privacy: "Privacidad",

  // Bundle banner
  "💡 Bundle 2+ services and you pick <strong>one free premium add-on every month</strong> — your choice from our add-on list":
    "💡 Combina 2+ servicios y eliges <strong>un servicio adicional premium gratis cada mes</strong> — tú eliges de nuestra lista",

  // ============================================================
  // LANDING PAGES (LPs) — /house-cleaning, /lawn-care, /car-detailing, /bundle
  // Cuban-American Miami Spanish, conversational and direct.
  // ============================================================

  // Shared LP UI
  "Book in about 2 minutes": "Reserva en unos 2 minutos",
  "Locked price · No contracts · Cancel anytime": "Precio fijo · Sin contratos · Cancela cuando quieras",
  Plans: "Planes",
  "Pick your cadence. Lock your price.": "Elige tu frecuencia. Asegura tu precio.",
  Choose: "Elige",
  "Every visit, every time.": "Cada visita, todas las veces.",
  "Three steps. Then never think about it.": "Tres pasos. Y no piensas más en eso.",
  "Pick your plan": "Elige tu plan",
  "Choose cadence. Lock your price.": "Elige la frecuencia. Asegura tu precio.",
  "We show up": "Llegamos",
  "Same Pro every visit. ETA reminder 30 min before.": "El mismo Pro cada visita. Aviso de llegada 30 min antes.",
  "Set it and forget it": "Configúralo y olvídate",
  "Pause, skip, or cancel anytime from your dashboard.": "Pausa, omite o cancela cuando quieras desde tu panel.",
  "Same Pro": "El Mismo Pro",
  "Your same pro every visit, not a rotating marketplace roster.":
    "Tu mismo profesional en cada visita, no un equipo rotativo de la app.",
  "Photo-Verified": "Verificado con Fotos",
  "Before-and-after photos from every visit, sent to your phone.":
    "Fotos antes y después de cada visita, enviadas a tu teléfono.",
  "Every pro is background-checked through Checkr before their first visit.":
    "Cada profesional tiene sus antecedentes revisados a través de Checkr antes de su primera visita.",

  "Questions, answered.": "Respuestas a tus preguntas.",
  "About 2 minutes to sign up. Same Pro. Locked price.": "Inscripción en unos 2 minutos. El mismo Pro. Precio fijo.",
  "About 2 minutes to sign up. Locked price. Cancel anytime.": "Inscripción en unos 2 minutos. Precio fijo. Cancela cuando quieras.",
  "No contracts. Cancel anytime.": "Sin contratos. Cancela cuando quieras.",
  "Free monthly add-on": "Servicio adicional gratis al mes",
  "Bundle & save": "Combo y ahorra",

  // Trust signal row

  "Locked Price": "Precio Fijo",
  "Serving 3 ZIPs": "3 Códigos Postales",

  // Landing ticker
  "Same Pro Every Visit": "El Mismo Pro Cada Visita",
  "Locked Monthly Price": "Precio Mensual Fijo",
  "Photo Verified Visits": "Fotos Tras Cada Visita",
  "Serving 33156 · 33183 · 33186": "Sirviendo 33156 · 33183 · 33186",
  "Pinecrest & Kendall — Miami-Dade": "Pinecrest y Kendall — Miami-Dade",
"Eco-Safe Products": "Productos Ecológicos",

  // Neighborhood trust
  "Built for Pinecrest + Kendall.": "Hecho para Pinecrest + Kendall.",
  "We serve only 33156, 33183, and 33186 — so your Pro is local, on-time, and never stuck in traffic.":
    "Servimos solo 33156, 33183 y 33186 — así tu equipo es local, puntual y nunca varado en el tráfico.",
  "We serve these three neighborhoods only — so your Pro is local, on-time, and never stuck in traffic.":
    "Servimos solo estas tres comunidades — así tu equipo es local, puntual y nunca varado en el tráfico.",
  "Kendall & Pinecrest": "Kendall y Pinecrest",
  "Built for Kendall & Pinecrest": "Hecho para Kendall y Pinecrest",
  "Serving Kendall & Pinecrest with recurring house cleaning, lawn care, and car detailing subscriptions.":
    "Sirviendo Kendall y Pinecrest con suscripciones recurrentes de limpieza del hogar, cuidado del jardín y detallado de carro.",
  "A quick form · No contracts": "Un formulario rápido · Sin contratos",
  "A quick form to sign up. Same Pro. Locked price.":
    "Un formulario rápido para inscribirte. El mismo equipo. Precio fijo.",
  "Book in a couple of minutes": "Reserva en un par de minutos",
  "We serve Pinecrest and Kendall only. We are not currently serving other areas.":
    "Servimos solo Pinecrest y Kendall. Por ahora no servimos otras áreas.",
  Pinecrest: "Pinecrest",
  Kendall: "Kendall",
  "Kendall West": "Kendall West",

  // Sticky bar labels
  "House Cleaning · from $139 a visit": "Limpieza del Hogar · desde $139 por visita",
  "Lawn Care · from $45 a visit": "Cuidado del Jardín · desde $45 por visita",
  "Shine Complete · from $149/mo": "Shine Complete · desde $149/mes",
  "Bundle your services · free monthly add-on": "Combina tus servicios · servicio adicional gratis al mes",

  // House Cleaning LP
  "Monthly House Cleaning in Pinecrest + Kendall": "Limpieza Mensual del Hogar en Pinecrest + Kendall",
  "Same Pro. Locked rate. No contracts. Handle your home on autopilot.":
    "El mismo equipo. Tarifa fija. Sin contratos. Tu casa en piloto automático.",
  "From $139 a visit": "Desde $139 por visita",
  "One-off cleanings in Pinecrest average **$180–$260**. Our plans start at **$139 a visit** — with the same Pro every time.":
    "Las limpiezas sueltas en Pinecrest cuestan en promedio **$180–$260**. Nuestros planes empiezan en **$139 por visita** — con el mismo equipo cada vez.",
  // House Cleaning plans
  "One visit per month, same Pro every time.": "Una visita al mes, el mismo Pro siempre.",
  "Two visits per month, priority scheduling.": "Dos visitas al mes, con prioridad en agendado.",
  "Weekly visits, dedicated Pro, quarterly deep-clean.":
    "Visitas semanales, equipo dedicado, limpieza profunda trimestral.",
  // House Cleaning included
  "Dust all surfaces": "Sacudir todas las superficies",
  "Vacuum + mop all floors": "Aspirar + trapear todos los pisos",
  "Kitchen deep-clean": "Limpieza profunda de cocina",
  "Bathroom disinfect": "Desinfección de baños",
  "Bedroom tidy + linen change": "Orden de habitaciones + cambio de sábanas",
  "Interior windows": "Ventanas interiores",
  "Trash out": "Sacar la basura",
  "Eco-safe products": "Productos ecológicos",
  "Same Pro every visit": "El mismo Pro cada visita",

  // House Cleaning testimonials
  "Kitchen and bathrooms look reset every time. Same Pro, same standard — feels effortless.":
    "La cocina y los baños quedan como nuevos cada vez. El mismo equipo, el mismo estándar — se siente sin esfuerzo.",
  "I haven't touched a mop in months. Locked monthly price, no surprise bills.":
    "No toco un trapeador hace meses. Precio mensual fijo, sin facturas sorpresa.",
  "Booked in under a minute. Your Pro is on time, polite, and thorough.":
    "Reservé en menos de un minuto. El equipo es puntual, amable y minucioso.",
  // House Cleaning FAQs
  "What's the price and what's it based on?": "¿Cuál es el precio y de qué depende?",
  "One flat price per visit, set by the size of your home: $139, $189 or $279. How often we come just multiplies it — monthly is one visit, biweekly two, weekly four. Homes with 5+ bedrooms are quoted by hand.":
    "Un precio fijo por visita, según el tamaño de tu casa: $139, $189 o $279. La frecuencia solo lo multiplica — mensual es una visita, quincenal dos y semanal cuatro. Las casas de 5+ recámaras las cotizamos a mano.",
  "Yes. No contracts, no cancellation fees. Pause, skip, or cancel from your dashboard anytime.":
    "Sí. Sin contratos, sin cargos por cancelación. Pausa, omite o cancela desde tu panel cuando quieras.",
  "What's your service area?": "¿Cuál es el área de servicio?",
  "We serve Pinecrest and Kendall — ZIP codes 33156, 33183, and 33186. We're not currently serving other areas.":
    "Servimos Pinecrest y Kendall — códigos postales 33156, 33183 y 33186. Por ahora no servimos otras áreas.",
  "What's actually included in a visit?": "¿Qué incluye realmente una visita?",
  "Kitchen deep-clean, bathroom disinfect, dusting all surfaces, vacuum and mop all floors, bedroom tidy, linen change, and trash out — using eco-safe products.":
    "Limpieza profunda de cocina, desinfección de baños, sacudir todas las superficies, aspirar y trapear todos los pisos, orden de habitaciones, cambio de sábanas y sacar la basura — con productos ecológicos.",
"Mowing to precise height, edging all borders, blowing all hardscapes, weed-whacking fence lines, and bagging or mulching clippings. A bed edge reset is available as an add-on.":
    "Corte a altura precisa, bordeado de todas las orillas, soplado de aceras y entradas, recorte a lo largo de las cercas y recoger o triturar la grama cortada. La poda de setos y arbustos está disponible como servicio adicional.",
  "Kitchen deep-clean, bathroom disinfect, dusting all surfaces, vacuum and mop all floors, interior windows, bedroom tidy, linen change, and trash out — using eco-safe products.":
    "Limpieza profunda de cocina, desinfección de baños, sacudir todas las superficies, aspirar y trapear todos los pisos, ventanas interiores, orden de habitaciones, cambio de sábanas y sacar la basura — con productos ecológicos.",
  "Who does the cleaning?": "¿Quién hace la limpieza?",
  "How is scheduling handled?": "¿Cómo se maneja el horario?",
  "After signup, we lock in a recurring day and time window. You'll get an ETA reminder before every visit. Reschedule anytime from your dashboard.":
    "Al inscribirte, fijamos un día y horario recurrente. Recibes un aviso de llegada antes de cada visita. Reagenda cuando quieras desde tu panel.",
  "Reach out within 24 hours and we'll re-clean the area or credit your account — no questions asked.":
    "Avísanos en 24 horas y volvemos a limpiar el área o te acreditamos a tu cuenta — sin preguntas.",
  "Already booking cleaning? Add lawn care from $45 a visit.": "¿Ya tienes limpieza? Agrega jardín desde $45 por visita.",
  "Add a 2nd service and you pick one free premium add-on every month — and you never coordinate two providers again.":
    "Agrega un 2º servicio y te regalamos un lavado de carro cada mes — y nunca más coordinas dos proveedores.",

  // Lawn Care LP
  "Monthly Lawn Care in Pinecrest + Kendall": "Cuidado Mensual del Jardín en Pinecrest + Kendall",
  "Mow, edge, blow. Same Pro. Locked price. Never surprise-billed.":
    "Cortar, bordear, soplar. El mismo equipo. Precio fijo. Sin facturas sorpresa.",
  "From $45 a visit": "Desde $45 por visita",
  "Most Pinecrest lawn pros charge **$40–$60 per visit** and re-quote you later. Tidy is **$45 a visit** flat, same Pro, no surprise invoices.":
    "La mayoría de los jardineros en Pinecrest cobran **$40–$60 por visita**. Tidy es **$45 por visita**, precio fijo, el mismo equipo, sin facturas sorpresa.",
  // Lawn Care plans
  "One visit per month.": "Una visita al mes.",
  "Two visits per month.": "Dos visitas al mes.",
  "Four visits per month, bush trim included.": "Cuatro visitas al mes, poda de arbustos incluida.",
  // Lawn Care included
  "Mow to precise height": "Corte a altura precisa",
"Edge all borders": "Bordeado de todas las orillas",
  "Blow hardscapes clean": "Soplado de aceras y entradas",
  "Weed-whack fence lines": "Recorte a lo largo de las cercas",
  "Bag or mulch clippings": "Recoger o triturar la grama cortada",
  "Bush trim (weekly)": "Poda de arbustos (semanal)",
    "Locked $45 a visit — never surprise-priced": "$45 por visita, precio fijo — nunca con precios sorpresa",
  // Lawn Care testimonials
  "Lawn looks sharp every week without me lifting a finger. Best $85 I spend monthly.":
    "El jardín se ve impecable cada semana sin mover un dedo. El mejor dinero que gasto al mes.",
  "Edges are crisp, beds are clean, no debris left behind. Pure consistency.":
    "Los bordes salen limpios, las jardineras quedan despejadas, sin escombros. Pura consistencia.",
  "They show up rain or shine. Locked price, never a surprise invoice.":
    "Llegan llueva o truene. Precio fijo, nunca una factura sorpresa.",
  // Lawn Care FAQs
  "One flat price per visit, set by the size of your lawn: $45, $65 or $99. How often we come just multiplies it — monthly is one visit, biweekly two, weekly four. Pick your best guess and we confirm the size from satellite imagery before your first visit.":
    "Un precio fijo por visita, según el tamaño de tu jardín: $45, $65 o $99. La frecuencia solo lo multiplica — mensual es una visita, quincenal dos y semanal cuatro. Elige tu mejor estimación y confirmamos el tamaño con imágenes satelitales antes de la primera visita.",
"Mowing to precise height, edging all borders, blowing all hardscapes, weed-whacking fence lines, and bagging or mulching clippings. Weekly plans include bush trim.":
    "Corte a altura precisa, bordeado de todas las orillas, soplado de aceras y entradas, recorte a lo largo de las cercas y recoger o triturar la grama. Los planes semanales incluyen poda de arbustos.",
  "Who does the work?": "¿Quién hace el trabajo?",
  "We automatically reschedule to the next available day. Your subscription stays active and your price doesn't change.":
    "Reprogramamos automáticamente para el siguiente día disponible. Tu suscripción sigue activa y tu precio no cambia.",
  "Reach out within 24 hours and we'll send your Pro back or credit your account — no questions asked.":
    "Avísanos en 24 horas y mandamos al equipo de vuelta o te acreditamos a tu cuenta — sin preguntas.",
  "Already booking lawn? Add cleaning from $139 a visit.":
    "¿Ya tienes jardín? Agrega limpieza desde $139 por visita.",

  // Car Detailing LP
  "Mobile Car Detailing in Pinecrest + Kendall": "Detallado Móvil de Carro en Pinecrest + Kendall",
  "We come to your driveway. Ceramic-safe. Monthly interior + exterior.":
    "Vamos a tu garaje. Seguro para cerámica. Interior + exterior mensual.",
  "A good mobile detail runs **$120–$180 per appointment**. Shine Complete is **$149/mo** for 3 maintenance washes a month plus 2 full details a year — in your driveway.":
    "Un buen detallado móvil cuesta **$120–$180 por cita**. Shine Complete es **$149/mes** por 3 lavados de mantenimiento al mes más 2 detallados completos al año — en tu entrada.",
  // Car Detailing plans
  "Shine Complete · Size 1": "Shine Complete · Tamaño 1",
  "Shine Complete · Size 2": "Shine Complete · Tamaño 2",
  "Shine Complete · Size 3": "Shine Complete · Tamaño 3",
  "Sedans and coupes. 3 washes a month plus 2 full details a year.":
    "Sedanes y coupés. 3 lavados al mes más 2 detallados completos al año.",
"Crossovers and 2-row SUVs. Same flat monthly price.":
    "Crossovers y SUV de 2 filas. El mismo precio fijo mensual.",
  "Trucks, 3-row SUVs and vans.": "Camionetas, SUV de 3 filas y vans.",
  "Interior + exterior, one vehicle.": "Interior + exterior, un vehículo.",
  "Interior + exterior, every two weeks, one vehicle.": "Interior + exterior, cada dos semanas, un vehículo.",
  // Car Detailing included
  "Exterior hand wash": "Lavado exterior a mano",
  "Ceramic-safe process": "Proceso seguro para cerámica",
  "Wheel + tire dress": "Limpieza de ruedas y abrillantado",
  "Dashboard + console wipe": "Limpieza de tablero y consola",
  "Interior + exterior glass": "Cristales interiores y exteriores",
  "Pet-hair removal add-on": "Extra: retiro de pelo de mascota",
  "Headlight restoration add-on": "Extra: restauración de faros",
  "In your driveway": "En tu garaje",
  // Car Detailing testimonials
  "They come to my driveway every month — car looks showroom-fresh, no drop-off needed.":
    "Vienen a mi garaje cada mes — el carro queda como nuevo, sin tener que llevarlo a ningún lado.",
  "Ceramic-safe process protects the coating. Interior is spotless every time.":
    "El proceso seguro para cerámica protege el recubrimiento. El interior queda impecable cada vez.",
  "Locked monthly price. Same detailer every visit. Best routine I've added all year.":
    "Precio mensual fijo. El mismo detallador cada visita. La mejor rutina que añadí en todo el año.",
  // Car Detailing FAQs
  "Shine Complete is one flat monthly price set by what you drive: $149, $179 or $239. Every plan is 3 maintenance washes a month plus 2 full details a year.":
    "Shine Complete es un precio fijo mensual según lo que conduces: $149, $179 o $239. Todos los planes incluyen 3 lavados de mantenimiento al mes más 2 detallados completos al año.",
  "What's actually included?": "¿Qué se incluye exactamente?",
  "Exterior hand wash with ceramic-safe products, wheel and tire dress, interior vacuum, dashboard and console wipe-down, and interior + exterior glass. Pet hair removal, clay bar & ceramic coat, headlight restoration, and interior protect & condition are available as add-ons.":
    "Lavado exterior a mano con productos seguros para cerámica, limpieza de ruedas y abrillantado, aspirado interior, limpieza de tablero y consola, y cristales interiores y exteriores. Remoción de pelo de mascotas, barra de arcilla y capa cerámica, restauración de faros, y protección y acondicionamiento del interior están disponibles como servicios adicionales.",
  "3-row SUVs, full-size trucks and vans are size 3 at $239/mo — a size, never a surcharge. Commercial vans and lifted trucks we price by hand.":
    "Las SUVs de 3 filas, camionetas grandes y vans son tamaño 3 a $239/mes — es un tamaño, nunca un cargo extra. Las vans comerciales y camionetas elevadas las cotizamos a mano.",
  "Exterior hand wash with ceramic-safe products, wheel and tire dress, interior vacuum, dashboard and console wipe-down, and interior + exterior glass. Pet hair and clay bar & ceramic coat available as add-ons.":
    "Lavado exterior a mano con productos seguros para cerámica, limpieza de ruedas y abrillantado, aspirado interior, limpieza de tablero y consola, y cristales interiores y exteriores. Pelo de mascotas y barra de arcilla con capa cerámica disponibles como extras.",
  "Who does the detailing?": "¿Quién hace el detallado?",
  "What about oversized or commercial vehicles?": "¿Y los vehículos grandes o comerciales?",
  "3-row SUVs, full-size trucks, and large vans get a small upgrade fee. Commercial vans and lifted trucks need a quick custom quote — we'll handle it.":
    "Las SUVs de 3 filas, camionetas grandes y vans grandes tienen un pequeño cargo adicional. Vans comerciales y camionetas elevadas necesitan una cotización rápida — la manejamos.",
  "Reach out within 24 hours and we'll send the detailer back or credit your account — no questions asked.":
    "Avísanos en 24 horas y mandamos al detallador de vuelta o te acreditamos a tu cuenta — sin preguntas.",
  "Already on Shine Complete? Add cleaning from $139 a visit.":
    "¿Ya tienes Shine Complete? Agrega limpieza desde $139 por visita.",

  // Bundle page
  "Bundle your services — a free premium add-on every month": "Combina tus servicios — un servicio adicional premium gratis cada mes",
  "Bundle your services": "Combina tus servicios",
  "Hold two or more services and you pick one free premium add-on every month. Pinecrest & Kendall only (33156 · 33183 · 33186).":
    "Si tienes dos o más servicios, eliges un servicio adicional premium gratis cada mes. Solo Pinecrest y Kendall (33156 · 33183 · 33186).",
  "Every service on one bill — and you still pick one free premium add-on every month.":
    "Todos los servicios en una sola factura — y sigues eligiendo un servicio adicional premium gratis cada mes.",
  "The more you stack, the more you save. Pinecrest + Kendall only (33156 · 33183 · 33186).":
    "Mientras más combinas, más ahorras. Solo Pinecrest + Kendall (33156 · 33183 · 33186).",
  "2-Service Bundle": "Combo de 2 Servicios",
  "1 free premium add-on a month": "1 servicio adicional premium gratis al mes",
  "Add a 2nd service — you pick one free premium add-on every month.":
    "Agrega un 2º servicio — eliges un servicio adicional premium gratis cada mes.",
  "plus one free premium add-on every month, your pick": "más un servicio adicional premium gratis cada mes, tú eliges",
  "Pick exactly 2 services to see your bundled price.": "Elige exactamente 2 servicios para ver tu precio combinado.",
  "Build my 2-service bundle": "Arma mi combo de 2 servicios",
  "Pick 2 services to continue": "Elige 2 servicios para continuar",
  "3-Service Bundle": "Combo de 3 Servicios",
  "Build my 3-service bundle": "Arma mi combo de 3 servicios",
  Custom: "Personalizado",
  Tailored: "A Medida",
  "Larger home, oversized lot, or fleet of vehicles? We'll build a custom plan and send you a personal quote.":
    "¿Casa más grande, terreno extenso o flota de vehículos? Armamos un plan a medida y te enviamos una cotización personal.",
  "Request a custom plan": "Solicita un plan personalizado",
  "Why bundle?": "¿Por qué combinar?",
  "Two or more services — you pick 1 free premium add-on every month":
    "Dos o más servicios — eliges 1 servicio adicional premium gratis cada mes",
  "Your choice from the add-on list, applied automatically at checkout":
    "Tú eliges de la lista de servicios adicionales, se aplica automáticamente al pagar",
  "One subscription, one bill, one Pro": "Una suscripción, una factura, un Pro",
  "Same locked price every month": "El mismo precio fijo cada mes",
  "Cancel or adjust anytime": "Cancela o ajusta cuando quieras",
  "Serving 33156 · 33183 · 33186 only": "Sirviendo solo 33156 · 33183 · 33186",
  "Ready to bundle?": "¿Listo para combinar?",
  "Start saving": "Comienza a ahorrar",

  // LP final CTA headlines (computed via template — list each one explicitly)
  "Ready to lock in your house cleaning?": "¿Listo para asegurar tu limpieza del hogar?",
  "Ready to lock in your lawn care?": "¿Listo para asegurar tu cuidado del jardín?",
  "Ready to lock in your car detailing?": "¿Listo para asegurar tu detallado de carro?",

  // SEO titles (browser tab) — translated for ES users
  "House Cleaning in Pinecrest + Kendall | Tidy Home Concierge":
    "Limpieza del Hogar en Pinecrest + Kendall | Tidy Home Concierge",
  "Lawn Care in Pinecrest + Kendall | Tidy Home Concierge":
    "Cuidado del Jardín en Pinecrest + Kendall | Tidy Home Concierge",
  "Car Detailing in Pinecrest + Kendall | Tidy Home Concierge":
    "Detallado de Carro en Pinecrest + Kendall | Tidy Home Concierge",
  "Bundle Your Services in Pinecrest + Kendall | Tidy Home Concierge":
    "Combina Tus Servicios en Pinecrest + Kendall | Tidy Home Concierge",

  // Thank You page
  "You're in.": "Ya estás dentro.",
  "As one of the 25 founding homes in your ZIP, your founding rate is locked — your price never rises for as long as you're a member.":
    "Como uno de los 25 hogares fundadores en tu código postal, tu tarifa de fundador está bloqueada — tu precio nunca sube mientras seas miembro.",
  "We're prioritizing homes for the initial rollout — and you're at the front of the line.":
    "Estamos priorizando hogares para el lanzamiento inicial, y tú estás al frente de la fila.",
  "Here's what happens next:": "Esto es lo que sigue:",
  "Check your email": "Revisa tu correo",
  "your confirmation just landed with your founding member details and next steps.":
    "tu confirmación acaba de llegar con los detalles de tu membresía fundadora y los próximos pasos.",
  "Watch for a text from Tidy": "Espera un mensaje de texto de Tidy",
  "within 24 hours to confirm your spot and check your ZIP code availability.":
    "en un plazo de 24 horas para confirmar tu lugar y verificar la disponibilidad en tu código postal.",
  "Once we launch in your area": "Cuando lancemos en tu zona",
  ", you'll be among the first activated — with priority scheduling and locked pricing.":
    ", estarás entre los primeros en activarse, con programación prioritaria y precio bloqueado.",
  "Questions? Email us at": "¿Preguntas? Escríbenos a",
  "Back to the site": "Volver al sitio",

  // Apply page (contractor application)
  "Application received | Tidy": "Solicitud recibida | Tidy",
  "Application received": "Solicitud recibida",
  "Thanks for applying. We'll review and be in touch within":
    "Gracias por aplicar. Revisaremos tu solicitud y te contactaremos dentro de",
  "Back to Tidy": "Volver a Tidy",
  "Careers at Tidy — Apply to join Miami's home-service crew":
    "Empleos en Tidy — Aplica para unirte al equipo de servicios del hogar de Miami",
  "Join Tidy's contractor network in Kendall and Pinecrest. Cleaning, lawn care, and car detailing pros — weekly pay, predictable routes.":
    "Únete a la red de contratistas de Tidy en Kendall y Pinecrest. Profesionales de limpieza, jardinería y detallado de carros — pago semanal, rutas predecibles.",
  "Back to site": "Volver al sitio",
  "Now hiring · Miami": "Contratando ahora · Miami",
  "2–3 business days": "2–3 días hábiles",
  "Join our team —": "Únete a nuestro equipo —",
  "we bring the customers.": "nosotros traemos los clientes.",
  "Tidy is Miami's subscription home-service brand. We're hiring background-checked cleaners, lawn pros, and detailers in Kendall and Pinecrest.":
    "Tidy es la marca de servicios del hogar por suscripción de Miami. Estamos contratando limpiadores, jardineros y detallistas verificados en Kendall y Pinecrest.",
  "Weekly direct deposit": "Depósito directo semanal",
  "Paid every Friday — no chasing invoices.": "Te pagamos cada viernes — sin perseguir facturas.",
  "Predictable routes": "Rutas predecibles",
  "Recurring subscribers in 33156 / 33183 / 33186.": "Suscriptores recurrentes en 33156 / 33183 / 33186.",
  "We handle the admin": "Nosotros manejamos la administración",
  "Booking, billing, and customer support — all on us.":
    "Reservas, facturación y atención al cliente — todo por nuestra cuenta.",
  "Grow with the brand": "Crece con la marca",
"Background check on every hire": "Verificación de antecedentes en cada contratación",
  "Insurance requirement": "Requisito de seguro",
  "Every Tidy Pro carries their own commercial general liability policy at $1,000,000 per occurrence / $2,000,000 aggregate, naming Tidy Home Concierge LLC as Additional Insured. It must be active and verified before your first visit.":
    "Cada Pro de Tidy mantiene su propia póliza de responsabilidad civil general comercial de $1,000,000 por ocurrencia / $2,000,000 agregado, con Tidy Home Concierge LLC nombrada como Asegurado Adicional. Debe estar activa y verificada antes de tu primera visita.",
  "No LLC is required and most solo operators pay about $25 to $60 a month; Hiscox and NEXT Insurance are the two carriers our Pros use.":
    "No se requiere LLC y la mayoría de los operadores independientes pagan entre $25 y $60 al mes; Hiscox y NEXT Insurance son las dos aseguradoras que usan nuestros Pros.",
  "We reimburse up to $50 a month": "Reembolsamos hasta $50 al mes",
  "toward your premium for the first 3 months — paid with your Friday deposit once your certificate is verified.":
    "de tu prima durante los primeros 3 meses — pagados con tu depósito del viernes una vez que tu certificado esté verificado.",
  "Apply to join Tidy": "Aplica para unirte a Tidy",
  "Takes about 2 minutes.": "Toma unos 2 minutos.",
  "First name": "Nombre",
  "Last name": "Apellido",
  Email: "Correo electrónico",
  Phone: "Teléfono",
  "ZIP code": "Código postal",
  "Which service are you applying for?": "¿Para qué servicio estás aplicando?",
  Multiple: "Varios",
  "Years of relevant experience": "Años de experiencia relevante",
  "1–2 years": "1–2 años",
  "3–5 years": "3–5 años",
  "5+ years": "5+ años",
  "Do you have your own reliable transportation?": "¿Tienes tu propio transporte confiable?",
  "Do you have your own professional equipment in working condition?":
    "¿Tienes tu propio equipo profesional en buen estado?",
  "Are you authorized to work in the United States?": "¿Estás autorizado para trabajar en Estados Unidos?",
  Yes: "Sí",
  No: "No",
  "Brief description of your relevant experience": "Breve descripción de tu experiencia relevante",
  "Tell us about your background in this service…": "Cuéntanos sobre tu experiencia en este servicio…",
  "By submitting, you confirm Tidy may contact you about this role. You will undergo a background check at Tidy's expense if we move forward.":
    "Al enviar, confirmas que Tidy puede contactarte sobre este puesto. Si avanzamos, se realizará una verificación de antecedentes por cuenta de Tidy.",
  "Submitting…": "Enviando…",
  "Submit application": "Enviar solicitud",
  "Please pick a role": "Por favor elige un puesto",
  "Please pick experience range": "Por favor elige un rango de experiencia",
  "Reliable transportation?": "¿Transporte confiable?",
  "Professional equipment?": "¿Equipo profesional?",
  "US work authorization?": "¿Autorización para trabajar en EE. UU.?",
  "Could not submit": "No se pudo enviar",
  "Please try again": "Intenta de nuevo",

  // Service cards (homepage)
  "Most popular · Members often pair with lawn care":
    "Más popular · Los miembros suelen combinarlo con el cuidado del jardín",
  "From $149/mo": "Desde $149/mes",
  "Biweekly from $278/mo": "Quincenal desde $278/mes",
  "Consistent interior care for a home that always feels reset. Handled on your schedule without lifting a finger.":
    "Cuidado interior constante para un hogar que siempre se siente renovado. Lo manejamos según tu horario sin que muevas un dedo.",
  Included: "Incluido",
  "Kitchen & bathroom deep clean": "Limpieza profunda de cocina y baño",
  "Dusting all surfaces & fixtures": "Sacudir todas las superficies y accesorios",
  "Trash removal & liner replacement": "Retiro de basura y cambio de bolsas",
  "Not Included": "No incluido",
  "Deep carpet shampooing": "Lavado profundo de alfombras",
  "Window exterior washing": "Lavado de ventanas por fuera",
  "Garage or attic cleaning": "Limpieza de garaje o ático",
  "Add-ons:": "Adicionales:",
  "Deep clean, inside oven, inside fridge, interior windows":
    "Limpieza profunda, interior del horno, interior del refrigerador, ventanas interiores",
  "See plans & details": "Ver planes y detalles",
  "Best value · Pairs perfectly with cleaning": "Mejor valor · Combina perfecto con la limpieza",
  "Biweekly from $90/mo": "Quincenal desde $90/mes",
  "Professional lawn maintenance to keep your Miami home's exterior sharp year-round. No scheduling required, ever.":
    "Mantenimiento profesional del jardín para que el exterior de tu casa en Miami luzca impecable todo el año. Sin programar nada, nunca.",
  "Edging along walkways & beds": "Bordeado de caminos y jardineras",
  "Debris blowing & full cleanup": "Soplado de residuos y limpieza completa",
  "Tree trimming or removal": "Poda o remoción de árboles",
  "Irrigation system repair": "Reparación del sistema de riego",
  "Landscape design or planting": "Diseño de paisajismo o siembra",
  "Bed edge reset, weed removal, leaf cleanup": "Reajuste del borde de jardineras, remoción de maleza, limpieza de hojas",
  "Comes to your driveway · No drop-off needed": "Vamos a tu entrada · Sin llevar el carro a ningún lado",
  "3 washes a month + 2 full details a year": "3 lavados al mes + 2 detallados completos al año",
  "Driveway-ready detailing at your door. We come to you — exterior wash, interior vacuum, surface cleaning.":
    "Detallado en la entrada de tu casa. Vamos a ti — lavado exterior, aspirado interior y limpieza de superficies.",
  "Interior vacuum & floor mats": "Aspirado interior y tapetes",
  "Dashboard & surface wipe-down": "Limpieza del tablero y las superficies",
  "Monthly or biweekly visits": "Visitas mensuales o quincenales",
  "Paint correction or ceramic coating": "Corrección de pintura o recubrimiento cerámico",
  "Paint sealant machine application": "Aplicación de sellador de pintura a máquina",
  "Leather conditioning, clay bar, tire shine": "Acondicionamiento de cuero, barra de arcilla, brillo para llantas",

  // How it works (homepage 5 steps)
  "Five simple steps — then your home runs on autopilot.":
    "Cinco pasos simples — y luego tu hogar funciona en piloto automático.",
  "Choose Your Services": "Elige Tus Servicios",
  "Pick house cleaning, lawn care, car detailing — or all three. Select your preferred frequency for each.":
    "Elige limpieza del hogar, cuidado del jardín, detallado de carro — o los tres. Selecciona la frecuencia que prefieras para cada uno.",
  "Set Up Your Plan": "Configura Tu Plan",
  "Tell us about your home, choose your schedule, and review your price. Takes under 2 minutes.":
    "Cuéntanos sobre tu hogar, elige tu horario y revisa tu precio. Toma menos de 2 minutos.",
  "Tidy Confirms & Coordinates": "Tidy Confirma y Coordina",
  "We assign your professional and lock in your recurring schedule. You'll get a confirmation with your first visit date.":
    "Asignamos un profesional verificado y con antecedentes revisados, y fijamos tu horario recurrente. Recibirás una confirmación con la fecha de tu primera visita.",
  "Your Pro Completes the Visit": "Tu Profesional Completa la Visita",
  "Your professional arrives on schedule, completes the service, and submits photo verification when done.":
    "Tu profesional llega puntual, completa el servicio y envía la verificación con fotos al terminar.",
  "Manage Everything from Your Dashboard": "Controla Todo desde Tu Panel",
  "Adjust services, skip visits, update your plan, or pause anytime — all from one simple dashboard.":
    "Ajusta servicios, omite visitas, actualiza tu plan o pausa cuando quieras — todo desde un panel simple.",

  // Proof bar / trust chips
  "First Visit Perfect or Free": "Primera Visita Perfecta o Gratis",
  "Photo-Verified Visits": "Visitas Verificadas con Fotos",
  "Every professional is screened through Checkr before their first visit. Photo verification submitted after every visit.":
    "Cada profesional pasa por una revisión a través de Checkr antes de su primera visita. Se envía verificación con fotos después de cada visita.",
  "How are your pros background-checked?": "¿Cómo se revisan los antecedentes de tus profesionales?",
  "Photo-Verified Every Visit": "Verificado con Fotos en Cada Visita",
  "Serving Kendall + Pinecrest": "Sirviendo Kendall + Pinecrest",

  // Pricing table + pricing FAQ
  "🔧 Cleaning Add-Ons": "🔧 Adicionales de Limpieza",
  "🔧 Lawn Add-Ons": "🔧 Adicionales de Jardín",
  "🔧 Detailing Add-Ons": "🔧 Adicionales de Detallado",
  "one-time": "una sola vez",
  "Extra-large home (2,501–4,000 sq ft): +$60 per visit. Extra-large lot (4,001–7,500 sq ft mowable turf): +$30 per visit. Extra-large vehicle: +$30 per visit. Above those sizes we quote individually.":
    "Casa extra grande (2,501–4,000 pies²): +$60 por visita. Terreno extra grande (4,001–7,500 pies² de grama cortable): +$30 por visita. Vehículo extra grande: +$30 por visita. Por encima de esos tamaños cotizamos de forma individual.",
  "Available as add-ons: pet-hair removal, headlight restoration.":
    "Disponibles como complementos: eliminación de pelo de mascotas, restauración de faros.",
  "Choose weekly, biweekly, or monthly depending on the service — and mix and match freely. Car detailing is monthly or biweekly. Want weekly lawn care but biweekly cleaning? Done.":
    "Elige semanal, quincenal o mensual según el servicio, y combínalos libremente. El detallado de carros es mensual o quincenal. ¿Quieres jardinería semanal pero limpieza quincenal? Listo.",
  "What affects my price?": "¿Qué afecta mi precio?",
  "Pricing is based on the services you choose and how often you'd like them — weekly, biweekly, or monthly. That's it. No hidden fees.":
    "El precio depende de los servicios que elijas y con qué frecuencia los quieras — semanal, quincenal o mensual. Eso es todo. Sin cargos ocultos.",
  "How does bundling work?": "¿Cómo funciona combinar servicios?",
  "Hold two or more services and you pick one free premium add-on every month — your choice from our add-on list. It is applied automatically at checkout, no code needed.":
    "Si tienes dos o más servicios, eliges un servicio adicional premium gratis cada mes — tú eliges de nuestra lista. Se aplica automáticamente al pagar, sin códigos.",
  "Can I add services later?": "¿Puedo agregar servicios después?",
  "Yes. You can add or remove any service at any time. Changes take effect on your next billing cycle.":
    "Sí. Puedes agregar o quitar cualquier servicio en cualquier momento. Los cambios aplican en tu próximo ciclo de facturación.",
  "Can I adjust my plan after signing up?": "¿Puedo ajustar mi plan después de inscribirme?",
  "Absolutely. Change your frequency, swap services, or pause anytime through your dashboard or by contacting us.":
    "Por supuesto. Cambia tu frecuencia, cambia de servicios o pausa cuando quieras desde tu panel o contactándonos.",

  // Footer
  "Miami's subscription home service. House cleaning, lawn care, and car detailing — one simple monthly plan. Serving Pinecrest, Kendall and Kendall West.":
    "El servicio del hogar por suscripción de Miami. Limpieza del hogar, cuidado del jardín y detallado de carro — un solo plan mensual simple. Sirviendo Kendall + Pinecrest.",
  "© 2026 Tidy Home Concierge LLC · Miami, Florida": "© 2026 Tidy Home Concierge LLC · Miami, Florida",
  "Serving 33183 Kendall · 33186 Kendall West · 33156 Pinecrest with recurring house cleaning, lawn care, and car detailing subscriptions.":
    "Sirviendo 33183 Kendall · 33186 Kendall West · 33156 Pinecrest con suscripciones recurrentes de limpieza del hogar, cuidado del jardín y detallado de carro.",
  "Coming soon": "Próximamente",
  "Join our team": "Únete a nuestro equipo",
  "Tidy on Instagram": "Tidy en Instagram",
  "Tidy on Facebook": "Tidy en Facebook",
  "TikTok coming soon": "TikTok próximamente",
  "Call now": "Llamar ahora",

  // FAQ — homepage
  "We currently serve Pinecrest (33156), Kendall (33183), and Kendall West (33186). We're launching in select Miami ZIP codes first to ensure consistently high-quality service from day one.":
    "Actualmente servimos Pinecrest (33156), Kendall (33183) y Kendall West (33186). Estamos lanzando primero en códigos postales selectos de Miami para asegurar un servicio de alta calidad desde el día uno.",
  "Tidy is an all-in-one home services subscription — we handle your house cleaning, lawn care, and car detailing all under one simple monthly plan. No juggling multiple providers, no chasing quotes. Just one subscription and everything stays spotless.":
    "Tidy es una suscripción todo en uno de servicios del hogar en Miami — nos encargamos de la limpieza de tu casa, el cuidado del jardín y el detallado de tu carro bajo un solo plan mensual. Sin coordinar varios proveedores, sin perseguir cotizaciones. Una sola suscripción y todo se mantiene impecable.",
  "Tap 'Start My Plan,' choose your services and schedule, and complete checkout. Your first visit is confirmed within 24 hours.":
    "Toca 'Empezar Mi Plan', elige tus servicios y tu horario, y completa el pago. Tu primera visita se confirma dentro de 24 horas.",
  "No contracts, no cancellation fees. You can cancel anytime, no questions asked. We earn your business every single month.":
    "Sin contratos, sin cargos por cancelación. Puedes cancelar cuando quieras, sin preguntas. Nos ganamos tu preferencia cada mes.",
  "Choose weekly, biweekly, or monthly for each service — and mix and match freely. Want weekly lawn care but biweekly cleaning? Done.":
    "Elige semanal, quincenal o mensual para cada servicio — y combínalos libremente. ¿Quieres jardín semanal pero limpieza quincenal? Listo.",
  "Not at all. Provide access via a lockbox, gate code, or smart lock and our team handles everything. You'll get photo confirmation when each service is complete.":
    "Para nada. Danos acceso con una caja de llaves, un código de portón o una cerradura inteligente y nuestro equipo se encarga de todo. Recibirás confirmación con fotos cuando cada servicio esté completo.",
  "Yes — reschedule, pause for vacation, or skip a visit anytime through your dashboard or by contacting us. No penalties.":
    "Sí — reagenda, pausa por vacaciones u omite una visita cuando quieras desde tu panel o contactándonos. Sin penalizaciones.",
  "If weather impacts an outdoor service, we automatically reschedule for the next available day. Your subscription stays active.":
    "Si el clima afecta un servicio exterior, reagendamos automáticamente para el siguiente día disponible. Tu suscripción sigue activa.",
  "How does scheduling actually work?": "¿Cómo funciona la programación en la práctica?",
  "After signup, Tidy assigns a recurring day and time window for each service. You'll receive a confirmation and an ETA reminder before every visit. No rebooking needed — it just repeats automatically.":
    "Después de inscribirte, Tidy asigna un día y una ventana de horario recurrentes para cada servicio. Recibirás una confirmación y un recordatorio con la hora estimada antes de cada visita. No necesitas reagendar — se repite automáticamente.",
  "Kitchen surfaces, full bathroom cleaning, dusting throughout, vacuuming and mopping all floors, and trash removal with fresh liners.":
    "Superficies de cocina, limpieza completa de baños, sacudir el polvo en toda la casa, aspirado y trapeado de todos los pisos, y retiro de basura con bolsas nuevas.",
  "Professional mowing to standard height, clean edging along walkways and beds, and debris blowing off walkways and driveways.":
    "Corte profesional a altura estándar, bordeado limpio en caminos y jardineras, y soplado de residuos en caminos y entradas.",
  "Full exterior hand wash with wheel cleaning, interior vacuum with floor mats, and dashboard and surface wipe-down — right in your driveway.":
    "Lavado exterior completo a mano con limpieza de ruedas, aspirado interior con tapetes, y limpieza del tablero y superficies — en tu propia entrada.",
  "Can I add extra services or upgrades?": "¿Puedo agregar servicios adicionales o mejoras?",
  "Yes. Add-ons like deep cleaning, bed edge reset, leather conditioning, and more are available as one-time or recurring extras. You can add them anytime through your dashboard.":
    "Sí. Los servicios adicionales como limpieza profunda, poda de setos, acondicionamiento de cuero y más están disponibles como extras únicos o recurrentes. Puedes agregarlos cuando quieras desde tu panel.",
  "Tidy is designed for consistent ongoing maintenance. Deep cleans and restoration work are available as add-ons — just ask.":
    "Tidy está diseñado para mantenimiento continuo y constante. Las limpiezas profundas y los trabajos de restauración están disponibles como servicios adicionales — solo pídelos.",
  "Billing & Account": "Facturación y Cuenta",
  "You're billed monthly via Stripe — automatic, fully secure, with a receipt every time. No surprise charges.":
    "Se te cobra mensualmente vía Stripe — automático, totalmente seguro y con recibo cada vez. Sin cargos sorpresa.",
  "When am I charged?": "¿Cuándo se me cobra?",
  "Your first charge happens at signup. After that, billing recurs on the same date each month. You can view your billing history in your dashboard.":
    "Tu primer cargo ocurre al inscribirte. Después, la facturación se repite en la misma fecha cada mes. Puedes ver tu historial de facturación en tu panel.",
  "Yes, 100%. No cancellation fees, no contracts. Let us know and we'll take care of it immediately.":
    "Sí, 100%. Sin cargos por cancelación, sin contratos. Avísanos y lo resolvemos de inmediato.",
  "We'll pause your services and notify you via SMS and email so you can update your payment info. Once resolved, you're back on schedule.":
    "Pausaremos tus servicios y te notificaremos por SMS y correo para que actualices tu información de pago. Una vez resuelto, vuelves a tu programación.",
  "Of course. Add, remove, or change frequency for any service anytime. Changes kick in at your next billing cycle.":
    "Por supuesto. Agrega, elimina o cambia la frecuencia de cualquier servicio cuando quieras. Los cambios aplican en tu siguiente ciclo de facturación.",
  "Are professionals background-checked?": "¿Los profesionales tienen antecedentes verificados?",
  "Every professional is screened through Checkr and required to submit photo documentation after each service.":
    "Cada profesional pasa por una revisión a través de Checkr y debe enviar documentación con fotos después de cada servicio.",
  "Reach out within 24 hours and we'll make it right — re-service or credit, no questions asked. Your satisfaction is our top priority.":
    "Contáctanos dentro de 24 horas y lo resolvemos — repetimos el servicio o te damos un crédito, sin preguntas. Tu satisfacción es nuestra prioridad.",
  "What if something goes wrong during a visit?": "¿Qué pasa si algo sale mal durante una visita?",
  "Contact us immediately and we'll make it right — a redo at no charge, or a credit if you prefer.":
    "Contáctanos de inmediato y lo resolveremos — repetimos el servicio sin costo o te damos un crédito si lo prefieres.",
  "Email hello@jointidy.co and we'll respond within 1 hour during business hours. Real people, real answers.":
    "Escríbenos a hello@jointidy.co y responderemos dentro de 1 hora en horario laboral. Personas reales, respuestas reales.",
  "Your Dashboard": "Tu Panel",
  "What can I do from the dashboard?": "¿Qué puedo hacer desde el panel?",
"View upcoming visits, manage your services and schedule, update payment info, skip or pause visits, and review service history — all in one place.":
    "Ver próximas visitas, cambiar tus servicios y horario, actualizar tu información de pago, omitir o pausar visitas, y revisar el historial de servicios — todo en un solo lugar.",
  "Can I manage everything without calling?": "¿Puedo hacerlo todo sin llamar?",
  "Yes. The dashboard gives you full control over your plan. No phone calls, no emails required for routine changes.":
    "Sí. El panel te da control total sobre tu plan. Sin llamadas ni correos para los cambios de rutina.",

  // Founding member section + founding offer
  "Founding Member Pricing": "Precio de Miembro Fundador",
  "Lock in your rate as one of our first members. Your price stays put as we grow.":
    "Asegura tu tarifa como uno de nuestros primeros miembros. Tu precio se mantiene mientras crecemos.",
  "Built on Accountability": "Construido sobre la Responsabilidad",
  "Every visit gets photo verification after the service, and a named point of contact on every job.":
    "Cada visita recibe verificación con fotos después del servicio y un contacto asignado en cada trabajo.",
  "Not happy? We make it right within 24 hours — re-service or credit, no questions asked.":
    "¿No quedaste satisfecho? Lo resolvemos dentro de 24 horas — repetimos el servicio o te damos un crédito, sin preguntas.",
  "FOUNDING MEMBERS": "MIEMBROS FUNDADORES",
  "Be among the first homes on autopilot.": "Sé de los primeros hogares en piloto automático.",
  "Tidy is now accepting a limited group of founding members across Pinecrest, Kendall, and Kendall West. Join early and lock in founding-member pricing.":
    "Tidy está aceptando un grupo limitado de miembros fundadores en Pinecrest, Kendall y Kendall West. Únete temprano y asegura el precio de miembro fundador.",
  "Background-Checked · Photo-Verified Visits · First visit perfect or it's free":
    "Antecedentes Verificados · Visitas Verificadas con Fotos · Primera visita perfecta o es gratis",
  "One free premium add-on on your first visit · First visit perfect or it's free · Only 25 founding homes per ZIP":
    "Un servicio adicional premium gratis en tu primera visita · Primera visita perfecta o es gratis · Solo 25 casas fundadoras por código postal",
  "One free premium add-on on your first visit — a $45 value": "Un servicio adicional gratis en la primera visita — valor de $45",
  "One free premium add-on on your first visit": "Un servicio adicional gratis en la primera visita",
  "More life. Less chores.": "Más vida. Menos tareas.",
  "See your price — 60 seconds": "Ve tu precio — 60 segundos",
  "See your price in 60 seconds. No contract.": "Ve tu precio en 60 segundos. Sin contrato.",
  "or call": "o llama al",
  "Thanks for scanning — you’re looking at one of 25 founding spots in": "Gracias por escanear — estás viendo uno de los 25 lugares fundadores en",
  "See your price": "Ve tu precio",
  "See your price in 60 seconds. No account, no call.": "Ve tu precio en 60 segundos. Sin cuenta, sin llamadas.",
  "Pick your day": "Elige tu día",
  "Choose the day and time that suits you.": "Elige el día y la hora que te convenga.",
  "Meet your Pro": "Conoce a tu Pro",
  "The same background-checked Pro, every visit.": "El mismo Pro verificado, en cada visita.",
  "Serving Pinecrest, Kendall and Kendall West.": "Servimos Pinecrest, Kendall y Kendall West.",
  "First visit perfect or it's free": "Primera visita perfecta o es gratis",
  "Only 25 founding homes per ZIP": "Solo 25 casas fundadoras por código postal",

  // Refer page
  "Copy referral link": "Copiar enlace de referido",
  "Become a customer": "Hazte cliente",
  "Refer a Neighbor — Give $50, Get $50 | Tidy Home Concierge":
    "Refiere a un Vecino — Da $50, Recibe $50 | Tidy Home Concierge",
  "Refer a neighbor in Pinecrest or Kendall (33156 · 33183 · 33186). They get $50 off their first month, you get $50 off yours. No limit, no fine print.":
    "Refiere a un vecino en Pinecrest o Kendall (33156 · 33183 · 33186). Ellos reciben $50 de descuento en su primer mes y tú $50 en el tuyo. Sin límite, sin letra pequeña.",
  "Refer & Earn": "Refiere y Gana",
  "Give $50, Get $50 — refer a neighbor in Pinecrest + Kendall":
    "Da $50, Recibe $50 — refiere a un vecino en Pinecrest + Kendall",
  "Send a neighbor your link. They get $50 off their first month. You get $50 off yours. No cap, no expiration, no fine print.":
    "Envía tu enlace a un vecino. Tu vecino recibe $50 de descuento en su primer mes. Tú recibes $50 en el tuyo. Sin tope, sin vencimiento, sin letra pequeña.",
  "How it works": "Cómo funciona",
  "Three steps. Two rewards.": "Tres pasos. Dos recompensas.",
  "Share your link": "Comparte tu enlace",
  "Copy your unique referral link and send it to a neighbor in 33156, 33183, or 33186.":
    "Copia tu enlace de referido único y envíaselo a un vecino en 33156, 33183 o 33186.",
  "They sign up": "Ellos se inscriben",
  "Your neighbor checks out with your link. $50 is automatically applied to their first month.":
    "Tu vecino paga usando tu enlace. Se aplican $50 automáticamente a su primer mes.",
  "You both save": "Ambos ahorran",
  "Once their first invoice clears, $50 is credited to your next month. No cap, stack as many as you want.":
    "Cuando se procese la primera factura de tu vecino, se acreditan $50 a tu próximo mes. Sin tope, acumula todos los que quieras.",
  "Your referral link": "Tu enlace de referido",
  "We couldn't load your referral link": "No pudimos cargar tu enlace de referido",
  "Something went wrong on our side — your link was not created. Try again, or call us at (786) 829-1141.":
    "Algo falló de nuestro lado — tu enlace no se creó. Intenta de nuevo o llámanos al (786) 829-1141.",
  "Try again": "Intentar de nuevo",
  "Sign in to get your link": "Inicia sesión para obtener tu enlace",
  "Loading…": "Cargando…",
  "Share this link with a neighbor. They save $50, you save $50.":
    "Comparte este enlace con un vecino. Él ahorra $50 y tú ahorras $50.",
  Copied: "Copiado",
  Copy: "Copiar",
  "Credits earned:": "Créditos ganados:",
  "— your first referral starts the meter.": "— tu primer referido pone el contador en marcha.",
  "Active customers get a unique referral link in their dashboard. Log in to grab yours and start earning.":
    "Los clientes activos reciben un enlace de referido único en su panel. Inicia sesión para obtener el tuyo y empezar a ganar.",
  "Log in to get your code": "Inicia sesión para obtener tu código",
  "Become a customer first": "Primero hazte cliente",
  "Not a member yet? Start with a plan.": "¿Aún no eres miembro? Empieza con un plan.",
  "Lock in your monthly price, then send your link to a neighbor.":
    "Asegura tu precio mensual y luego envía tu enlace a un vecino.",

  // Service landing pages + bundle
  "Reliable lawn care, done right every time. Mow, edge, blow.":
    "Cuidado del jardín confiable, bien hecho siempre. Cortamos, bordeamos y soplamos.",
  "Same Pro every visit. Locked monthly price. Cancel anytime.":
    "El mismo equipo en cada visita. Precio mensual fijo. Cancela cuando quieras.",
  "Tidy isn't just lawn — it's a system for your entire home.":
    "Tidy no es solo jardín — es un sistema para todo tu hogar.",
  "Start lawn care": "Empezar cuidado del jardín",
  "Start your plan": "Empieza tu plan",
  "Lawn care in Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186). Mow, edge, blow. One flat price per visit from $45. Same Pro, no contracts. Book in about 2 minutes.":
    "Cuidado del jardín en Pinecrest, Kendall y Palmetto Bay (33156, 33183, 33186). Cortamos, bordeamos y soplamos. Un precio fijo por visita desde $45. El mismo equipo, sin contratos. Reserva en unos 2 minutos.",
  "Professional house cleaning, handled for you. Weekly, biweekly, or monthly.":
    "Limpieza profesional del hogar, resuelta por nosotros. Semanal, quincenal o mensual.",
  "Tidy isn't just cleaning — it's a system for your entire home.":
    "Tidy no es solo limpieza — es un sistema para todo tu hogar.",
  "Book your cleaning": "Reserva tu limpieza",
  "House cleaning in Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186). One flat price per visit from $139. Same Pro, no contracts, eco-safe. Book in about 2 minutes.":
    "Limpieza del hogar en Pinecrest, Kendall y Palmetto Bay (33156, 33183, 33186). Un precio fijo por visita desde $139. El mismo equipo, sin contratos, productos ecológicos. Reserva en unos 2 minutos.",
  "Professional car detailing at your home. Ceramic-safe, monthly.":
    "Detallado profesional de carros en tu casa. Seguro para cerámica, mensual.",
  "Same detailer every visit. Locked monthly price. Cancel anytime.":
    "El mismo detallador en cada visita. Precio mensual fijo. Cancela cuando quieras.",
  "Tidy isn't just detailing — it's a system for your entire home.":
    "Tidy no es solo detallado — es un sistema para todo tu hogar.",
  "Book detailing": "Reservar detallado",
  "Shine Complete mobile car care in Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186). 3 washes a month plus 2 full details a year, from $149/mo. Book in about 2 minutes.":
    "Shine Complete a domicilio en Pinecrest, Kendall y Palmetto Bay (33156, 33183, 33186). 3 lavados al mes más 2 detallados completos al año, desde $149/mes. Reserva en unos 2 minutos.",
  "One flat price set by the size of your home, lawn or vehicle. Hold two or more services and you pick one free premium add-on every month — Pinecrest, Kendall and Palmetto Bay (33156, 33183, 33186).":
    "Un precio fijo según el tamaño de tu casa, jardín o vehículo. Si tienes dos o más servicios, eliges un servicio adicional premium gratis cada mes — Pinecrest, Kendall y Palmetto Bay (33156, 33183, 33186).",
  "About 2 minutes · No contracts": "Unos 2 minutos · Sin contratos",
  "Locked price · No contracts · Cancel anytime · Pause or reschedule anytime":
    "Precio fijo · Sin contratos · Cancela cuando quieras · Pausa o reagenda cuando quieras",
  "Set it once. We handle the rest — scheduling, reminders, the same Pro every visit.":
    "Configúralo una vez. Nosotros nos encargamos del resto — programación, recordatorios y el mismo equipo en cada visita.",
  "No contracts · Cancel, pause, or reschedule anytime": "Sin contratos · Cancela, pausa o reagenda cuando quieras",
  "Background-checked pros": "Profesionales con antecedentes verificados",
  "Serving ": "Sirviendo ",

  // Terms of Service page
  "Effective Date: March 25, 2026": "Fecha de vigencia: 25 de marzo de 2026",
  "1. Service Type": "1. Tipo de Servicio",
  "Tidy provides recurring maintenance services including house cleaning, lawn care, and car detailing. Tidy does NOT provide restoration, hazardous cleanup, or extreme-condition services unless purchased separately. Services are performed by independent contractors engaged by Tidy. Tidy carries commercial general liability coverage on every Tidy assignment, and contractors are background-checked.":
    "Tidy ofrece servicios de mantenimiento recurrente que incluyen limpieza del hogar, cuidado del jardín y detallado de carros. Tidy NO ofrece servicios de restauración, limpieza de materiales peligrosos ni servicios en condiciones extremas, a menos que se compren por separado. Los servicios son realizados por contratistas independientes contratados por Tidy. Tidy cuenta con cobertura de responsabilidad civil general en cada asignación, y los contratistas son verificados.",
  "2. Service Scope Limitations": "2. Limitaciones del Alcance del Servicio",
  "Standard services include routine maintenance only. Not included: extreme buildup or neglect, hazardous materials, mold remediation, biohazard cleanup, heavy stain restoration, paint correction, construction debris cleanup.":
    "Los servicios estándar incluyen únicamente mantenimiento de rutina. No se incluye: acumulación extrema o abandono, materiales peligrosos, remediación de moho, limpieza de riesgo biológico, restauración de manchas severas, corrección de pintura ni limpieza de escombros de construcción.",
  "3. Access Requirements": "3. Requisitos de Acceso",
  "Customer must provide safe and unobstructed access. Service may be skipped or rescheduled if contractors cannot safely access the property.":
    "El cliente debe proporcionar acceso seguro y sin obstrucciones. El servicio puede omitirse o reagendarse si los contratistas no pueden acceder a la propiedad de forma segura.",
  "4. Weather Conditions": "4. Condiciones Climáticas",
  "Outdoor services may be rescheduled due to unsafe weather. Subscription remains active.":
    "Los servicios exteriores pueden reagendarse por clima inseguro. La suscripción permanece activa.",
  "5. Subscription Billing": "5. Facturación de la Suscripción",
  "All services are billed on a recurring monthly basis via Stripe. By signing up, you authorize Tidy to charge your payment method automatically on a recurring basis.":
    "Todos los servicios se facturan de forma mensual recurrente vía Stripe. Al inscribirte, autorizas a Tidy a cobrar tu método de pago automáticamente de forma recurrente.",
  "6. Failed Payments": "6. Pagos Fallidos",
  "If payment fails, service may be paused until resolved. You will be notified immediately.":
    "Si el pago falla, el servicio puede pausarse hasta que se resuelva. Se te notificará de inmediato.",
  "7. Cancellation": "7. Cancelación",
  "You can cancel at any time from the Billing page in your account. Cancellation takes effect at the end of the billing period you have already paid for, so you keep the visits in that period and no further charge is made. We do not prorate or refund the period already paid. You can undo a cancellation any time before it takes effect. You can also pause your plan for up to 60 days from the Billing page, during which no charges are made and we hold your slot. You can skip an individual visit from your dashboard, which does not change your billing for that period.":
    "Puedes cancelar en cualquier momento desde la página de Facturación en tu cuenta. La cancelación entra en vigor al final del período de facturación que ya pagaste, por lo que conservas las visitas de ese período y no se realiza ningún cargo adicional. No prorrateamos ni reembolsamos el período ya pagado. Puedes deshacer una cancelación en cualquier momento antes de que entre en vigor. También puedes pausar tu plan hasta por 60 días desde la página de Facturación; durante la pausa no se realizan cargos y reservamos tu lugar. Puedes omitir una visita individual desde tu panel, lo cual no cambia la facturación de ese período.",
  "8. Satisfaction": "8. Satisfacción",
  "Notify us within 24 hours of any service issue. We will make reasonable efforts to resolve it.":
    "Notifícanos dentro de 24 horas sobre cualquier problema con el servicio. Haremos esfuerzos razonables para resolverlo.",
  "9. SMS Communications": "9. Comunicaciones por SMS",
  "By checking the SMS consent box and providing your phone number, you expressly consent to receive recurring automated promotional and informational text messages from Tidy Home Concierge LLC, including service updates, appointment reminders, and exclusive offers, at the phone number provided. Message frequency varies.":
    "Al marcar la casilla de consentimiento de SMS y proporcionar tu número de teléfono, aceptas expresamente recibir mensajes de texto automatizados recurrentes, promocionales e informativos, de Tidy Home Concierge LLC, incluidos avisos de servicio, recordatorios de citas y ofertas exclusivas, al número proporcionado. La frecuencia de los mensajes varía.",
  "Msg & data rates may apply. Consent to receive SMS messages is not a condition of any purchase. You may opt out at any time by replying STOP to any message. Reply HELP for assistance or contact":
    "Pueden aplicar tarifas de mensajes y datos. El consentimiento para recibir mensajes SMS no es condición para ninguna compra. Puedes darte de baja en cualquier momento respondiendo STOP a cualquier mensaje. Responde HELP para obtener ayuda o contacta a",
  "Carriers are not liable for delayed or undelivered messages.":
    "Los operadores no son responsables por mensajes retrasados o no entregados.",
  "SMS Data Privacy": "Privacidad de Datos de SMS",
  "Text messaging opt-in data and consent will not be shared with any third parties or affiliates for marketing or promotional purposes. All other data-sharing categories specifically exclude text messaging opt-in data and consent.":
    "Los datos de suscripción y consentimiento para mensajes de texto no se compartirán con terceros ni afiliados con fines de marketing o promoción. Todas las demás categorías de intercambio de datos excluyen específicamente los datos de suscripción y consentimiento para mensajes de texto.",
  "10. Limitation of Liability": "10. Limitación de Responsabilidad",
  "Tidy's liability is limited to the amount paid for the specific service in question.":
    "La responsabilidad de Tidy se limita al monto pagado por el servicio específico en cuestión.",
  "11. Governing Law": "11. Ley Aplicable",
  "These Terms are governed by the laws of the State of Florida.":
    "Estos Términos se rigen por las leyes del Estado de Florida.",
  "12. Contact": "12. Contacto",
  "13. Pricing and Founding Rate": "13. Precios y Tarifa Fundadora",
  "The price shown at signup is the price charged. Founding members — the first 25 homes per ZIP code — keep their signup rate for as long as their membership remains active and are not subject to later price increases. A founding rate is tied to continuous membership and does not carry over if the plan is cancelled and later restarted.":
    "El precio mostrado al inscribirte es el precio cobrado. Los miembros fundadores — los primeros 25 hogares por código postal — mantienen su tarifa de inscripción mientras su membresía permanezca activa y no están sujetos a aumentos de precio posteriores. La tarifa fundadora está vinculada a la membresía continua y no se transfiere si se cancela el plan y se reinicia más tarde.",
  "14. Referral Program": "14. Programa de Referidos",
  "A customer who refers a new customer receives $50 in account credit, and the new customer receives $50 off their first month. The credit is applied after the referred customer's first invoice clears. The referred customer must be new to Tidy. Credit has no cash value.":
    "Un cliente que refiere a un nuevo cliente recibe $50 en crédito de cuenta, y el nuevo cliente recibe $50 de descuento en su primer mes. El crédito se aplica después de que se acredite la primera factura del cliente referido. El cliente referido debe ser nuevo en Tidy. El crédito no tiene valor en efectivo.",
  "← Back to the site": "← Volver al sitio",

  // Privacy Policy page
  "Information We Collect": "Información que Recopilamos",
  "Name, email, phone, service address, ZIP code, and payment information. Payment is processed securely by Stripe — we never store card details. Usage data: IP address, browser type, pages visited.":
    "Nombre, correo electrónico, teléfono, dirección de servicio, código postal e información de pago. Los pagos son procesados de forma segura por Stripe — nunca almacenamos los datos de tu tarjeta. Datos de uso: dirección IP, tipo de navegador y páginas visitadas.",
  "How We Use It": "Cómo la Usamos",
  "To provide and manage services, schedule appointments, process payments, communicate with you, and improve our offerings.":
    "Para prestar y gestionar los servicios, agendar citas, procesar pagos, comunicarnos contigo y mejorar nuestra oferta.",
  "SMS Communications & Data Privacy": "Comunicaciones por SMS y Privacidad de Datos",
  "By providing your phone number and checking the SMS consent box, you consent to receive recurring automated SMS messages from Tidy Home Concierge LLC, including service updates, appointment reminders, and promotional offers. Message frequency varies. Message and data rates may apply. Reply STOP to cancel or HELP for assistance. Contact":
    "Al proporcionar tu número de teléfono y marcar la casilla de consentimiento de SMS, aceptas recibir mensajes SMS automatizados recurrentes de Tidy Home Concierge LLC, incluidos avisos de servicio, recordatorios de citas y ofertas promocionales. La frecuencia de los mensajes varía. Pueden aplicar tarifas de mensajes y datos. Responde STOP para cancelar o HELP para obtener ayuda. Contacta a",
  "for support.": "para soporte.",
  "Text messaging opt-in data and consent will not be shared with any third parties or affiliates for marketing or promotional purposes. All other data-sharing categories explicitly exclude SMS/text messaging opt-in information and consent data — this information will not be sold, rented, or disclosed to any third party under any circumstances.":
    "Los datos de suscripción y consentimiento para mensajes de texto no se compartirán con terceros ni afiliados con fines de marketing o promoción. Todas las demás categorías de intercambio de datos excluyen explícitamente la información de suscripción y los datos de consentimiento de SMS/mensajes de texto — esta información no será vendida, alquilada ni divulgada a ningún tercero bajo ninguna circunstancia.",
  "Mobile information, including phone numbers collected for SMS communications, will not be shared with third parties or affiliates for marketing or promotional purposes. Consent to receive SMS is not a condition of purchase. Carriers are not liable for delayed or undelivered messages.":
    "La información móvil, incluidos los números de teléfono recopilados para comunicaciones por SMS, no se compartirá con terceros ni afiliados con fines de marketing o promoción. El consentimiento para recibir SMS no es condición de compra. Los operadores no son responsables por mensajes retrasados o no entregados.",
  "Information Sharing": "Compartir Información",
  "We do not sell your personal information. We share only with trusted third parties necessary to operate our services: Stripe (payments), Twilio (SMS delivery only), and analytics tools. These parties do not receive your SMS opt-in consent data or use your information for their own marketing purposes.":
    "No vendemos tu información personal. Solo la compartimos con terceros de confianza necesarios para operar nuestros servicios: Stripe (pagos), Twilio (solo envío de SMS) y herramientas de analítica. Estas partes no reciben tus datos de consentimiento de SMS ni usan tu información para sus propios fines de marketing.",
  Security: "Seguridad",
  "Industry-standard security measures. No transmission method is 100% secure.":
    "Medidas de seguridad estándar de la industria. Ningún método de transmisión es 100% seguro.",
  "Cookies & Tracking": "Cookies y Rastreo",
  "We use Google Analytics and Meta Pixel. You may disable cookies through your browser settings.":
    "Usamos Google Analytics y Meta Pixel. Puedes desactivar las cookies desde la configuración de tu navegador.",
  "Your Rights": "Tus Derechos",
  "Request access, correction, or deletion:": "Solicita acceso, corrección o eliminación:",
  Minors: "Menores de Edad",
  "Our services are not intended for individuals under 18.":
    "Nuestros servicios no están destinados a personas menores de 18 años.",
  Contact: "Contacto",

  // Coming soon page
  "Tidy Home Concierge — Coming soon to Miami": "Tidy Home Concierge — Muy pronto en Miami",
  "Launching soon in Miami": "Muy pronto en Miami",
  "We're almost ready.": "Ya casi estamos listos.",
  "Subscription home care in Kendall & Pinecrest — house cleaning, lawn care, and mobile car detailing. Hiring our founding crew now.":
    "Cuidado del hogar por suscripción en Kendall y Pinecrest — limpieza del hogar, cuidado del jardín y detallado de carros a domicilio. Estamos contratando a nuestro equipo fundador.",
  "Tidy Home Concierge is a Miami subscription home-services company hiring our founding crew. Cleaning, lawn, car detailing. Opening soon.":
    "Tidy Home Concierge es una empresa de servicios del hogar por suscripción en Miami que está contratando a su equipo fundador. Limpieza, jardín y detallado de carros. Abrimos muy pronto.",
  "Opening soon in Miami": "Abrimos muy pronto en Miami",
  "Questions?": "¿Preguntas?",
  "Tidy Home Concierge LLC · Miami, FL": "Tidy Home Concierge LLC · Miami, FL",
  Admin: "Admin",

  // Service area line + price cadence labels
  "Trusted across 33156 · 33183 · 33186": "Con la confianza de 33156 · 33183 · 33186",
  "/mo": "/mes",
  "$139/mo": "$139/mes",
  "$278/mo": "$278/mes",
  "$556/mo": "$556/mes",
  "$45/mo": "$45/mes",
  "$90/mo": "$90/mes",
  "$180/mo": "$180/mes",
  "$149/mo": "$149/mes",
  "$179/mo": "$179/mes",
  "$239/mo": "$239/mes",

  // Billing — manage subscription
  "Manage subscription": "Administrar suscripción",
  "Pause plan": "Pausar plan",
  "Resume plan": "Reanudar plan",
  "Cancel plan": "Cancelar plan",
  "Keep my plan": "Mantener mi plan",
  "Cancel your Tidy plan?": "¿Cancelar tu plan Tidy?",
  "Your plan stays active until the end of the period you have already paid for, then it will not renew. You can undo this any time before then.":
    "Tu plan sigue activo hasta el final del período que ya pagaste, y luego no se renovará. Puedes deshacer esto en cualquier momento antes de esa fecha.",
  "Yes, cancel my plan": "Sí, cancelar mi plan",
  "Pause your plan": "Pausar tu plan",
  "We hold your slot while you are paused. No charges while paused.":
    "Guardamos tu cupo mientras estás en pausa. Sin cargos durante la pausa.",
  "Resume on": "Reanudar el",
  days: "días",
  Paused: "En pausa",
  "Paused until": "En pausa hasta",
  "Cancels at period end": "Se cancela al final del período",
  "Your plan will not renew.": "Tu plan no se renovará.",
  "Your plan is staying active.": "Tu plan seguirá activo.",
  "Your plan is paused.": "Tu plan está en pausa.",
  "Your plan is active again.": "Tu plan está activo de nuevo.",
  "We couldn't update your plan. Please try again.":
    "No pudimos actualizar tu plan. Inténtalo de nuevo.",
  "Manage or cancel your plan": "Administra o cancela tu plan",

  // Plan guard & change service note
  "You already have a Tidy plan.": "Ya tienes un plan de Tidy.",
  "Go to Billing": "Ir a Facturación",
  "Need to add or change a service? Email ": "¿Necesitas agregar o cambiar un servicio? Envía un correo a ",
  " and we'll update your plan.": " y actualizaremos tu plan.",

  // Dashboard — skip visit
  "Upcoming Visits": "Próximas Visitas",
  "No upcoming visits scheduled.": "No hay próximas visitas programadas.",
  "View full schedule": "Ver calendario completo",
  "Skip this visit?": "¿Omitir esta visita?",
  "Skip this visit": "Omitir esta visita",
  "Skipping...": "Saltando...",
  "We will skip this visit only. Your plan and billing are unchanged, and your next visit goes ahead as normal.":
    "Solo omitiremos esta visita. Tu plan y facturación no cambian, y tu próxima visita sigue como estaba.",
  "Keep it": "Mantenerla",
  "Visit skipped.": "Visita saltada.",
  "We could not skip this visit. Please try again.":
    "No pudimos omitir esta visita. Inténtalo de nuevo.",
  "Skipped": "Saltada",

  // /neighbor + /vecino — founding neighbor door hanger.
  // The Spanish wording here is the exact copy printed on the tear-off card.
  "Founding neighbor offer": "Oferta de vecino fundador",
  "Your founding rate is locked — your price never rises": "Tu tarifa de fundador queda fija — tu precio nunca sube",
  "First visit perfect or it’s free": "Primera visita perfecta o es gratis",
  "Capped at 25 founding homes per ZIP": "Limitado a 25 hogares fundadores por código postal",
  "Be one of the first 25 homes on your street":
    "Sé uno de los primeros 25 hogares de tu calle",
  "One plan for cleaning, lawn care and car care — one flat price per visit, set by the size of your property.":
    "Un solo plan para limpieza, jardinería y cuidado del carro — un precio fijo por visita, según el tamaño de tu propiedad.",
  "Claim your founding spot": "Reserva tu lugar de fundador",
  "Be one of the first 25 homes in": "Sé uno de los primeros 25 hogares en",
  "Cleaning, lawn and car care on one plan. One flat price per visit.":
    "Limpieza, grama y cuidado del carro en un solo plan. Un precio fijo por visita.",
  "No contract. Cancel anytime.": "Sin contrato. Cancela cuando quieras.",
  of: "de",
  "founding spots left in": "lugares de fundador disponibles en",
  "Founding pricing is capped at 25 homes in": "El precio de fundador está limitado a 25 hogares en",
  "Founding spots in": "Los lugares de fundador en",
  "are full.": "están completos.",
  "Join the waitlist": "Únete a la lista de espera",
  "your neighborhood": "tu vecindario",
  "Service Address": "Dirección del servicio",
  "Founding spots are limited to 25 homes per ZIP and do not reopen.":
    "Los lugares de fundador están limitados a 25 hogares por código postal y no se vuelven a abrir.",
  "Locked founding rate": "Tarifa de fundador fija",
  "One free premium add-on": "Un servicio adicional premium gratis",
  "Three services. One plan.": "Tres servicios. Un solo plan.",
  "Kitchen, baths, floors and dusting, same Pro every visit.":
    "Cocina, baños, pisos y polvo, con el mismo equipo en cada visita.",
  "Mow, edge, trim and blow down — clippings hauled off.":
    "Cortamos, orillamos, recortamos y sopleteamos — nos llevamos los recortes.",
  "Hand wash, wheels, glass and interior wipe-down in your driveway.":
    "Lavado a mano, ruedas, cristales e interior limpiado en tu entrada.",
  "Takes about two minutes. No contract.": "Toma unos dos minutos. Sin contrato.",
  "Claim your spot in": "Reserva tu lugar en",
  "What a founding neighbor gets": "Lo que recibe un vecino fundador",
  "Where plans start": "Desde dónde empiezan los planes",
  "per visit, size 1": "por visita, tamaño 1",
  "per month, size 1": "por mes, tamaño 1",
  "Serving Pinecrest & Kendall — 33156, 33183, 33186":
    "Servimos Pinecrest y Kendall — 33156, 33183, 33186",
  "from $45 a visit": "desde $45 por visita",
  "five-star reviews": "reseñas de cinco estrellas",
  "from neighbors in": "de vecinos en",
  "Pinecrest and Kendall": "Pinecrest y Kendall",

  // Post-visit rating page (/rate)
  "How did your visit go?": "¿Cómo te fue con tu visita?",
  "Tap a star. It takes a few seconds and it goes straight to your Pro.":
    "Toca una estrella. Toma unos segundos y le llega directo a tu profesional.",
  "Star rating": "Calificación con estrellas",
  stars: "estrellas",
  "Anything you'd like to add? (optional)": "¿Algo que quieras agregar? (opcional)",
  "Submit rating": "Enviar calificación",
  "Thank you — that means a lot.": "Gracias — eso significa mucho.",
  "Would you share it on Google? It takes 30 seconds and it helps your Pro directly.":
    "¿Lo compartes en Google? Toma 30 segundos y ayuda directo a tu profesional.",
  "Leave a Google review": "Dejar una reseña en Google",
  "Thank you for telling us.": "Gracias por contarnos.",
  "This went straight to our team, not to a public review. Someone will follow up with you about making it right.":
    "Esto le llegó directo a nuestro equipo, no a una reseña pública. Alguien te va a contactar para resolverlo.",
  "Need us sooner? Call": "¿Nos necesitas antes? Llama al",
  "or email": "o escribe a",

  // /rate rebuild — ungated Google prompt
  "How was your visit?": "¿Cómo te fue la visita?",
  "Anything you want us to know?": "¿Algo que quieras contarnos?",
  "Anything you want us to know? (optional)": "¿Algo que quieras contarnos? (opcional)",
  "Thanks — that helps.": "Gracias — eso ayuda.",

  "Leave us a Google review": "Déjanos una reseña en Google",
  "It takes 20 seconds and it's the single biggest thing that helps a small local company.":
    "Toma 20 segundos y es lo que más ayuda a una empresa local pequeña.",
  "Let us make it right.": "Déjanos resolverlo.",
  "Tell us what happened and we'll re-clean the area free, or refund the visit.":
    "Cuéntanos qué pasó y volvemos a limpiar el área gratis, o te devolvemos el pago de la visita.",
  "Tell us what happened": "Cuéntanos qué pasó",
  "Or email hello@jointidy.co": "O escribe a hello@jointidy.co",





  // Site fix pass — "From" pricing, size qualifiers, corrected claims.
  From: "Desde",
  "size 1 home — sizes 2 and 3 cost more, see sizes below":
    "hogar tamaño 1 — los tamaños 2 y 3 cuestan más, mira los tamaños abajo",
  "size 1 lot — sizes 2 and 3 cost more, see sizes below":
    "terreno tamaño 1 — los tamaños 2 y 3 cuestan más, mira los tamaños abajo",
  "sedans and coupes": "sedanes y coupés",
  "crossovers and 2-row SUVs": "crossovers y SUVs de 2 filas",
  "trucks, 3-row SUVs and vans": "camionetas, SUVs de 3 filas y vans",
  "Built for 33156 · 33183 · 33186": "Hecho para 33156 · 33183 · 33186",
  "Built for Pinecrest · Kendall · Kendall West": "Hecho para Pinecrest · Kendall · Kendall West",
  // "First visit perfect or it's free" is already defined above.

  "Extra-large home (2,501–4,000 sq ft): +$60 per visit. Above that size we quote individually.":
    "Hogar extra grande (2,501–4,000 pies²): +$60 por visita. Arriba de ese tamaño cotizamos individualmente.",
  "Extra-large lot (4,001–7,500 sq ft of mowable turf): +$30 per visit. Above that size we quote individually.":
    "Terreno extra grande (4,001–7,500 pies² de grama cortable): +$30 por visita. Arriba de ese tamaño cotizamos individualmente.",
  "Lifted trucks, commercial vans and oversized vehicles are quoted individually.":
    "Camionetas elevadas, vans comerciales y vehículos de gran tamaño se cotizan individualmente.",
  "Locked price — never surprise-priced": "Precio fijo — nunca precios sorpresa",
  "Background-checked Pros. Same Pro every visit so your lawn stays consistent.":
    "Equipos con antecedentes verificados. El mismo equipo en cada visita para que tu grama se mantenga igual.",
  "Background-checked detailers. Same detailer every visit so they learn your vehicle.":
    "Especialistas con antecedentes verificados. El mismo especialista en cada visita para que conozca tu carro.",
  "We couldn't save your details. Please try again, or call us at (786) 829-1141.":
    "No pudimos guardar tus datos. Inténtalo de nuevo o llámanos al (786) 829-1141.",

  // Car Wash / Car Detail split — StepProperty
  "wash or detail?": "¿lavado o detallado?",
  "Car Wash": "Lavado de Carro",
  "Car Detail": "Detallado de Carro",
  "Pick your arrival time": "Elige tu horario de llegada",
  "Done by ~{time}": "Listo antes de las ~{time}",
  "Included — a detail starts with a full exterior wash.":
    "Incluido — un detallado comienza con un lavado exterior completo.",
  "A thorough exterior wash — about an hour.":
    "Un lavado exterior completo — aproximadamente una hora.",
  "Full interior + exterior detail — about 3.5 hours.":
    "Detallado completo interior y exterior — aproximadamente 3.5 horas.",

  // Before-payment access gate — StepPayment
  "Before we come out": "Antes de ir a tu casa",
  "There's an outdoor water spigot I can reach from my driveway or parking spot":
    "Hay una llave de agua exterior a la que puedo acceder desde mi entrada o estacionamiento",
  "There's an outdoor electrical outlet available":
    "Hay un tomacorriente exterior disponible",
  "Washing vehicles is allowed at this property (some HOAs and condo lots don't permit it)":
    "Lavar vehículos está permitido en esta propiedad (algunas HOA y condominios no lo permiten)",
  "If you're not sure about the last one, check with your HOA first — we can't wash where it isn't permitted, and we can't refund a trip we couldn't complete.":
    "Si no estás seguro de lo último, consulta primero con tu HOA — no podemos lavar donde no esté permitido, y no podemos reembolsar una visita que no pudimos completar.",
  "We may not be able to service this address. Send us the details and we'll tell you before you pay.":
    "Puede que no podamos dar servicio en esta dirección. Envíanos los detalles y te avisaremos antes de que pagues.",
  "Call us": "Llámanos",

  // Preferred Pro — DashboardServices
  "Preferred Pro": "Pro preferido",
  "No preference (fastest scheduling)": "Sin preferencia (agenda más rápido)",
  "Choose a Pro if you'd like the same person whenever possible.": "Elige un Pro si prefieres que sea la misma persona siempre que sea posible.",
  "— high demand, limited times": "— alta demanda, horarios limitados",
  "We'll send {name} whenever we can. Requesting a specific Pro can mean fewer available times, and if they're booked or out we'll send another Tidy Pro rather than push your visit.":
    "Enviaremos a {name} siempre que podamos. Pedir un Pro específico puede significar menos horarios disponibles, y si está ocupado o no disponible enviaremos a otro Pro de Tidy en lugar de retrasar tu visita.",
  "Save preference": "Guardar preferencia",
  "Preference saved": "Preferencia guardada",
  "Could not save your preference": "No se pudo guardar tu preferencia",
  "Loading Pros…": "Cargando Pros…",

  // Admin Applicants — preferred pro count
  "Preferred by": "Preferido por",
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
      // Sync <html lang> for SEO + Google Ads Quality Score on Spanish bids.
      if (typeof document !== "undefined") {
        document.documentElement.lang = language;
      }
    } catch {
      /* no-op */
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);

  const t = useCallback(
    (text: string): string => {
      if (language === "en") return text;
      return translations[text] || text;
    },
    [language],
  );

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
};
