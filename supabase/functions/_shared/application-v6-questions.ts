export const V6_QUESTIONS = [
  {
    "key": "v6.about.first_name",
    "section": 1,
    "label_en": "First name",
    "label_es": "Nombre",
    "type": "text",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 1,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.about.last_name",
    "section": 1,
    "label_en": "Last name",
    "label_es": "Apellido",
    "type": "text",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 2,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.about.phone",
    "section": 1,
    "label_en": "Mobile phone",
    "label_es": "Número de celular",
    "type": "text",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 3,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.about.email",
    "section": 1,
    "label_en": "Email",
    "label_es": "Correo electrónico",
    "type": "text",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 4,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.about.zip",
    "section": 1,
    "label_en": "Home ZIP code",
    "label_es": "Código postal de tu casa",
    "type": "text",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 5,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.about.lang",
    "section": 1,
    "label_en": "Languages you speak (pick all)",
    "label_es": "Idiomas que hablas (marca todos)",
    "type": "multi",
    "options": [
      {
        "value": "en",
        "en": "English",
        "es": "Inglés"
      },
      {
        "value": "es",
        "en": "Spanish",
        "es": "Español"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 6,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.paid_years",
    "section": 2,
    "label_en": "Years of paid experience doing this work",
    "label_es": "Años de experiencia remunerada en este trabajo",
    "type": "choice",
    "options": [
      {
        "value": "0",
        "en": "None",
        "es": "Ninguna"
      },
      {
        "value": "<1",
        "en": "Less than 1 year",
        "es": "Menos de 1 año"
      },
      {
        "value": "1-2",
        "en": "1–2 years",
        "es": "1–2 años"
      },
      {
        "value": "3-5",
        "en": "3–5 years",
        "es": "3–5 años"
      },
      {
        "value": "5+",
        "en": "5+ years",
        "es": "5 años o más"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 7,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.settings.cleaning",
    "section": 2,
    "label_en": "Where have you done this work? (pick all)",
    "label_es": "¿Dónde has hecho este trabajo? (marca todas las opciones que correspondan)",
    "type": "multi",
    "options": [
      {
        "value": "homes",
        "en": "Private homes",
        "es": "Casas particulares"
      },
      {
        "value": "rentals",
        "en": "Airbnbs/rentals",
        "es": "Airbnb o viviendas de alquiler"
      },
      {
        "value": "hotels",
        "en": "Hotels",
        "es": "Hoteles"
      },
      {
        "value": "commercial",
        "en": "Offices/commercial",
        "es": "Oficinas o locales comerciales"
      },
      {
        "value": "own",
        "en": "My own clients",
        "es": "Mis propios clientes"
      },
      {
        "value": "none",
        "en": "Not yet",
        "es": "Todavía no"
      }
    ],
    "service": "cleaning",
    "required": true,
    "sort": 8,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.settings.lawn",
    "section": 2,
    "label_en": "Where have you done this work? (pick all)",
    "label_es": "¿Dónde has hecho este trabajo? (marca todas las opciones que correspondan)",
    "type": "multi",
    "options": [
      {
        "value": "homes",
        "en": "Residential yards",
        "es": "Jardines de casas"
      },
      {
        "value": "company",
        "en": "Landscaping company",
        "es": "Empresa de jardinería"
      },
      {
        "value": "commercial",
        "en": "Commercial grounds/parks",
        "es": "Áreas comerciales o parques"
      },
      {
        "value": "own",
        "en": "My own clients",
        "es": "Mis propios clientes"
      },
      {
        "value": "none",
        "en": "Not yet",
        "es": "Todavía no"
      }
    ],
    "service": "lawn",
    "required": true,
    "sort": 9,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.settings.car_care",
    "section": 2,
    "label_en": "Where have you done this work? (pick all)",
    "label_es": "¿Dónde has hecho este trabajo? (marca todas las opciones que correspondan)",
    "type": "multi",
    "options": [
      {
        "value": "mobile",
        "en": "Mobile detailing",
        "es": "Limpieza detallada a domicilio"
      },
      {
        "value": "carwash",
        "en": "Car wash/dealership",
        "es": "Lavadero de autos o concesionario"
      },
      {
        "value": "own",
        "en": "My own clients",
        "es": "Mis propios clientes"
      },
      {
        "value": "none",
        "en": "Not yet",
        "es": "Todavía no"
      }
    ],
    "service": "car_care",
    "required": true,
    "sort": 10,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.current",
    "section": 2,
    "label_en": "What do you do for work right now?",
    "label_es": "¿En qué trabajas actualmente?",
    "type": "choice",
    "options": [
      {
        "value": "full",
        "en": "Full-time job",
        "es": "Trabajo de tiempo completo"
      },
      {
        "value": "part",
        "en": "Part-time job",
        "es": "Trabajo de medio tiempo"
      },
      {
        "value": "business",
        "en": "My own business with my own clients",
        "es": "Tengo mi propio negocio y mis clientes"
      },
      {
        "value": "between",
        "en": "Between jobs",
        "es": "Estoy buscando trabajo"
      },
      {
        "value": "other",
        "en": "Other",
        "es": "Otro"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 11,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.jobs",
    "section": 2,
    "label_en": "Most recent job",
    "label_es": "Tu trabajo más reciente",
    "type": "jobs",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 12,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.work.summary",
    "section": 2,
    "label_en": "Tell us about your experience in a sentence or two (optional)",
    "label_es": "Cuéntanos tu experiencia en una o dos frases (opcional)",
    "type": "longtext",
    "options": null,
    "service": "all",
    "required": false,
    "sort": 13,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.cleaning.kitchen",
    "section": 3,
    "label_en": "Kitchens: counters, sink, stovetop, appliance fronts",
    "label_es": "Cocinas: encimeras, fregadero, estufa y exteriores de electrodomésticos",
    "type": "slider",
    "options": null,
    "service": "cleaning",
    "required": true,
    "sort": 14,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.cleaning.bathrooms",
    "section": 3,
    "label_en": "Bathrooms: toilet, tub/shower, soap scum, mirrors",
    "label_es": "Baños: inodoro, bañera o ducha, residuos de jabón y espejos",
    "type": "slider",
    "options": null,
    "service": "cleaning",
    "required": true,
    "sort": 15,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.cleaning.floors",
    "section": 3,
    "label_en": "Floors: vacuuming and mopping without streaks",
    "label_es": "Pisos: aspirar y trapear sin dejar marcas",
    "type": "slider",
    "options": null,
    "service": "cleaning",
    "required": true,
    "sort": 16,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.cleaning.dusting",
    "section": 3,
    "label_en": "Detail dusting: baseboards, blinds, fixtures, high and low",
    "label_es": "Quitar el polvo a fondo: zócalos, persianas y accesorios, arriba y abajo",
    "type": "slider",
    "options": null,
    "service": "cleaning",
    "required": true,
    "sort": 17,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.cleaning.speed",
    "section": 3,
    "label_en": "Speed: a 3-bed / 2-bath home in about 3 hours",
    "label_es": "Ritmo de trabajo: una casa de 3 habitaciones y 2 baños en unas 3 horas",
    "type": "slider",
    "options": null,
    "service": "cleaning",
    "required": true,
    "sort": 18,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.cleaning.products",
    "section": 3,
    "label_en": "Products: the right product on the right surface, used safely",
    "label_es": "Productos: usar de forma segura el producto adecuado para cada superficie",
    "type": "slider",
    "options": null,
    "service": "cleaning",
    "required": true,
    "sort": 19,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.lawn.mowing",
    "section": 3,
    "label_en": "Mowing: even cut, clean lines, no scalping",
    "label_es": "Cortar el césped: corte uniforme, líneas definidas y sin cortar demasiado bajo",
    "type": "slider",
    "options": null,
    "service": "lawn",
    "required": true,
    "sort": 20,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.lawn.edging",
    "section": 3,
    "label_en": "Edging and string trimming",
    "label_es": "Perfilar bordes y recortar con desbrozadora",
    "type": "slider",
    "options": null,
    "service": "lawn",
    "required": true,
    "sort": 21,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.lawn.cleanup",
    "section": 3,
    "label_en": "Blowing and cleanup: walkways, driveway, beds",
    "label_es": "Soplar y limpiar: caminos, entrada de autos y macizos de plantas",
    "type": "slider",
    "options": null,
    "service": "lawn",
    "required": true,
    "sort": 22,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.lawn.upkeep",
    "section": 3,
    "label_en": "Equipment upkeep: blades, oil, small repairs",
    "label_es": "Mantenimiento del equipo: cuchillas, aceite y reparaciones menores",
    "type": "slider",
    "options": null,
    "service": "lawn",
    "required": true,
    "sort": 23,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.lawn.speed",
    "section": 3,
    "label_en": "Speed: a standard yard in about 45 minutes",
    "label_es": "Ritmo de trabajo: un jardín estándar en unos 45 minutos",
    "type": "slider",
    "options": null,
    "service": "lawn",
    "required": true,
    "sort": 24,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.lawn.reading",
    "section": 3,
    "label_en": "Reading a yard: sprinkler heads, obstacles, problem spots",
    "label_es": "Evaluar un jardín: aspersores, obstáculos y zonas problemáticas",
    "type": "slider",
    "options": null,
    "service": "lawn",
    "required": true,
    "sort": 25,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.car_care.wash",
    "section": 3,
    "label_en": "Exterior hand wash without swirls",
    "label_es": "Lavado exterior a mano sin marcas circulares",
    "type": "slider",
    "options": null,
    "service": "car_care",
    "required": true,
    "sort": 26,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.car_care.interior",
    "section": 3,
    "label_en": "Interior vacuum and wipe-down",
    "label_es": "Aspirar y limpiar las superficies del interior",
    "type": "slider",
    "options": null,
    "service": "car_care",
    "required": true,
    "sort": 27,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.car_care.stains",
    "section": 3,
    "label_en": "Stains and upholstery",
    "label_es": "Manchas y tapicería",
    "type": "slider",
    "options": null,
    "service": "car_care",
    "required": true,
    "sort": 28,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.car_care.glass",
    "section": 3,
    "label_en": "Glass, streak-free",
    "label_es": "Vidrios sin marcas",
    "type": "slider",
    "options": null,
    "service": "car_care",
    "required": true,
    "sort": 29,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.car_care.speed",
    "section": 3,
    "label_en": "Speed: a sedan maintenance wash in about 45 minutes",
    "label_es": "Ritmo de trabajo: lavado de mantenimiento de un sedán en unos 45 minutos",
    "type": "slider",
    "options": null,
    "service": "car_care",
    "required": true,
    "sort": 30,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.skill.car_care.products",
    "section": 3,
    "label_en": "Products: paint-safe, the right product for each surface",
    "label_es": "Productos: proteger la pintura y elegir el producto adecuado para cada superficie",
    "type": "slider",
    "options": null,
    "service": "car_care",
    "required": true,
    "sort": 31,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.equipment.cleaning",
    "section": 4,
    "label_en": "Tick what you own today",
    "label_es": "Marca el equipo que tienes actualmente",
    "type": "equipment",
    "options": [
      {
        "value": "vacuum",
        "en": "Vacuum",
        "es": "Aspiradora"
      },
      {
        "value": "mop",
        "en": "Mop/flat mop + bucket",
        "es": "Trapeador o mopa plana y cubeta"
      },
      {
        "value": "cloths",
        "en": "Microfiber cloths",
        "es": "Paños de microfibra"
      },
      {
        "value": "brushes",
        "en": "Scrub brushes",
        "es": "Cepillos para fregar"
      },
      {
        "value": "duster",
        "en": "Extension duster",
        "es": "Plumero extensible"
      },
      {
        "value": "caddy",
        "en": "Supply caddy",
        "es": "Organizador para productos"
      },
      {
        "value": "stool",
        "en": "Step stool",
        "es": "Banquito para alcanzar zonas altas"
      },
      {
        "value": "products",
        "en": "Cleaning products",
        "es": "Productos de limpieza"
      }
    ],
    "service": "cleaning",
    "required": true,
    "sort": 32,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.equipment.lawn",
    "section": 4,
    "label_en": "Tick what you own today",
    "label_es": "Marca el equipo que tienes actualmente",
    "type": "equipment",
    "options": [
      {
        "value": "mower",
        "en": "Mower",
        "es": "Cortadora de césped"
      },
      {
        "value": "trimmer",
        "en": "String trimmer",
        "es": "Desbrozadora"
      },
      {
        "value": "edger",
        "en": "Edger",
        "es": "Bordeadora"
      },
      {
        "value": "blower",
        "en": "Blower",
        "es": "Sopladora"
      },
      {
        "value": "haul",
        "en": "Truck or trailer to haul equipment",
        "es": "Camioneta o remolque para transportar el equipo"
      },
      {
        "value": "safety",
        "en": "Safety gear (eye/ear protection)",
        "es": "Equipo de seguridad (protección para ojos y oídos)"
      }
    ],
    "service": "lawn",
    "required": true,
    "sort": 33,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.equipment.car_care",
    "section": 4,
    "label_en": "Tick what you own today",
    "label_es": "Marca el equipo que tienes actualmente",
    "type": "equipment",
    "options": [
      {
        "value": "wash",
        "en": "Pressure washer or waterless kit",
        "es": "Hidrolavadora o kit de lavado sin agua"
      },
      {
        "value": "tank",
        "en": "Water tank",
        "es": "Tanque de agua"
      },
      {
        "value": "vacuum",
        "en": "Wet/dry vac",
        "es": "Aspiradora para líquidos y sólidos"
      },
      {
        "value": "extractor",
        "en": "Extractor",
        "es": "Extractora"
      },
      {
        "value": "towels",
        "en": "Microfiber towels",
        "es": "Toallas de microfibra"
      },
      {
        "value": "polisher",
        "en": "Polisher (optional)",
        "es": "Pulidora (opcional)"
      }
    ],
    "service": "car_care",
    "required": true,
    "sort": 34,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.equipment.ready",
    "section": 4,
    "label_en": "If anything is missing, could you have it before your first visit?",
    "label_es": "Si te falta algo, ¿podrías conseguirlo antes de tu primera visita?",
    "type": "choice",
    "options": [
      {
        "value": "yes",
        "en": "Yes",
        "es": "Sí"
      },
      {
        "value": "no",
        "en": "No",
        "es": "No"
      },
      {
        "value": "unsure",
        "en": "Not sure",
        "es": "No estoy seguro/a"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 35,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.vehicle",
    "section": 4,
    "label_en": "Do you have a reliable vehicle that fits your equipment?",
    "label_es": "¿Tienes un vehículo confiable en el que cabe tu equipo?",
    "type": "choice",
    "options": [
      {
        "value": "yes",
        "en": "Yes",
        "es": "Sí"
      },
      {
        "value": "no",
        "en": "No",
        "es": "No"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 36,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.licence",
    "section": 4,
    "label_en": "Do you have a valid driver’s licence and car insurance?",
    "label_es": "¿Tienes licencia de conducir vigente y seguro de auto?",
    "type": "choice",
    "options": [
      {
        "value": "yes",
        "en": "Yes",
        "es": "Sí"
      },
      {
        "value": "no",
        "en": "No",
        "es": "No"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 37,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.backup",
    "section": 4,
    "label_en": "If your car broke down, how would you get to a visit?",
    "label_es": "Si tu auto se averiara, ¿cómo llegarías a una visita?",
    "type": "choice",
    "options": [
      {
        "value": "second",
        "en": "Second vehicle",
        "es": "Otro vehículo"
      },
      {
        "value": "family",
        "en": "Family or friend",
        "es": "Un familiar o amigo"
      },
      {
        "value": "rideshare",
        "en": "Rideshare",
        "es": "Uber, Lyft u otro servicio similar"
      },
      {
        "value": "none",
        "en": "I don't have a backup",
        "es": "No tengo una alternativa"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 38,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.avail.grid",
    "section": 5,
    "label_en": "When can you work?",
    "label_es": "¿Cuándo puedes trabajar?",
    "type": "availability",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 39,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.avail.days",
    "section": 5,
    "label_en": "How many days a week do you want?",
    "label_es": "¿Cuántos días por semana quieres trabajar?",
    "type": "choice",
    "options": [
      {
        "value": "2",
        "en": "1–2",
        "es": "1–2"
      },
      {
        "value": "3",
        "en": "3",
        "es": "3"
      },
      {
        "value": "4",
        "en": "4",
        "es": "4"
      },
      {
        "value": "5",
        "en": "5",
        "es": "5"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 40,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.avail.start",
    "section": 5,
    "label_en": "Earliest start date",
    "label_es": "Primera fecha en la que puedes comenzar",
    "type": "date",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 41,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.intent.goal",
    "section": 6,
    "label_en": "What are you looking for?",
    "label_es": "¿Qué estás buscando?",
    "type": "choice",
    "options": [
      {
        "value": "steady",
        "en": "Steady weekly income",
        "es": "Ingresos semanales estables"
      },
      {
        "value": "side",
        "en": "Extra income on the side",
        "es": "Ingresos adicionales"
      },
      {
        "value": "grow",
        "en": "To grow my own business",
        "es": "Hacer crecer mi propio negocio"
      },
      {
        "value": "unsure",
        "en": "Not sure yet",
        "es": "Todavía no estoy seguro/a"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 42,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.intent.earnings",
    "section": 6,
    "label_en": "What would you like to earn per week?",
    "label_es": "¿Cuánto te gustaría ganar por semana?",
    "type": "choice",
    "options": [
      {
        "value": "under400",
        "en": "Under $400",
        "es": "Menos de $400"
      },
      {
        "value": "400-700",
        "en": "$400–700",
        "es": "$400–700"
      },
      {
        "value": "700-1000",
        "en": "$700–1,000",
        "es": "$700–1,000"
      },
      {
        "value": "1000+",
        "en": "$1,000+",
        "es": "$1,000 o más"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 43,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.intent.priorities",
    "section": 6,
    "label_en": "What matters most to you? (pick up to 2)",
    "label_es": "¿Qué es lo más importante para ti? (elige hasta 2)",
    "type": "multi",
    "options": [
      {
        "value": "steady",
        "en": "Steady schedule",
        "es": "Horario estable"
      },
      {
        "value": "pay",
        "en": "Good pay",
        "es": "Buen pago"
      },
      {
        "value": "clients",
        "en": "Same clients every visit",
        "es": "Los mismos clientes en cada visita"
      },
      {
        "value": "boss",
        "en": "Being my own boss",
        "es": "Ser mi propio jefe"
      },
      {
        "value": "flex",
        "en": "Flexibility",
        "es": "Flexibilidad"
      },
      {
        "value": "grow",
        "en": "Room to grow",
        "es": "Oportunidades para crecer"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 44,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.requirements.contractor",
    "section": 7,
    "label_en": "Tidy Pros are independent contractors (1099). You tell us your availability, and we build and fill your route.",
    "label_es": "Los Pros de Tidy son contratistas independientes (1099). Nos dices tu disponibilidad y nosotros organizamos tu ruta y te asignamos clientes.",
    "type": "choice",
    "options": [
      {
        "value": "works",
        "en": "Works for me",
        "es": "Me parece bien"
      },
      {
        "value": "question",
        "en": "I have a question",
        "es": "Tengo una pregunta"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 45,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.requirements.insurance",
    "section": 7,
    "label_en": "Before your first paid visit you’ll need your own liability insurance, about $25–60/month. Tidy reimburses $50/month for your first 3 months and helps you get a quote.",
    "label_es": "Antes de tu primera visita pagada, necesitarás tu propio seguro de responsabilidad civil, que cuesta aproximadamente $25–60 al mes. Tidy te reembolsa $50 al mes durante los primeros 3 meses y te ayuda a obtener una cotización.",
    "type": "choice",
    "options": [
      {
        "value": "works",
        "en": "Works for me",
        "es": "Me parece bien"
      },
      {
        "value": "question",
        "en": "I have a question",
        "es": "Tengo una pregunta"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 46,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.requirements.background",
    "section": 7,
    "label_en": "Tidy pays for a background check before your first visit.",
    "label_es": "Tidy paga la verificación de antecedentes antes de tu primera visita.",
    "type": "choice",
    "options": [
      {
        "value": "works",
        "en": "Works for me",
        "es": "Me parece bien"
      },
      {
        "value": "question",
        "en": "I have a question",
        "es": "Tengo una pregunta"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 47,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.authorized",
    "section": 7,
    "label_en": "Are you legally able to work in the United States?",
    "label_es": "¿Estás autorizado/a legalmente para trabajar en Estados Unidos?",
    "type": "choice",
    "options": [
      {
        "value": "yes",
        "en": "Yes",
        "es": "Sí"
      },
      {
        "value": "no",
        "en": "No",
        "es": "No"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 48,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.source",
    "section": 8,
    "label_en": "How did you hear about Tidy?",
    "label_es": "¿Cómo te enteraste de Tidy?",
    "type": "choice",
    "options": [
      {
        "value": "indeed",
        "en": "Indeed",
        "es": "Indeed"
      },
      {
        "value": "craigslist",
        "en": "Craigslist",
        "es": "Craigslist"
      },
      {
        "value": "friend",
        "en": "Friend or family",
        "es": "Un amigo o familiar"
      },
      {
        "value": "social",
        "en": "Facebook/Instagram",
        "es": "Facebook/Instagram"
      },
      {
        "value": "nextdoor",
        "en": "Nextdoor",
        "es": "Nextdoor"
      },
      {
        "value": "other",
        "en": "Other",
        "es": "Otro"
      }
    ],
    "service": "all",
    "required": true,
    "sort": 49,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.anything",
    "section": 8,
    "label_en": "Anything else you’d like us to know? (optional)",
    "label_es": "¿Hay algo más que quieras contarnos? (opcional)",
    "type": "longtext",
    "options": null,
    "service": "all",
    "required": false,
    "sort": 50,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.truth",
    "section": 8,
    "label_en": "Everything I’ve shared is true",
    "label_es": "Toda la información que he compartido es verdadera",
    "type": "consent",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 51,
    "active": true,
    "application_version": 6
  },
  {
    "key": "v6.sms",
    "section": 8,
    "label_en": "Tidy may text me about my application. Msg & data rates may apply. Reply STOP to opt out.",
    "label_es": "Tidy puede enviarme mensajes de texto sobre mi solicitud. Pueden aplicarse cargos por mensajes y datos. Responde STOP para dejar de recibirlos.",
    "type": "consent",
    "options": null,
    "service": "all",
    "required": true,
    "sort": 52,
    "active": true,
    "application_version": 6
  }
] as const;
