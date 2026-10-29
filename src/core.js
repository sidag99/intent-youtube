/* Shared, dependency-free policy. Runs in extension pages, content scripts and tests. */
(() => {
  const MODES = {
    work: {name: 'Work', symbol: '⌘', description: 'Build something good.', topics: ['coding', 'programming', 'software', 'developer', 'javascript', 'typescript', 'python', 'react', 'engineering', 'design', 'figma', 'productivity', 'business', 'marketing', 'excel', 'career', 'startup', 'data science', 'web development', 'sql', 'git', 'docker', 'architecture', 'css', 'html', "accounting", "bookkeeping", "finance", "auditing", "spreadsheet", "power bi", "tableau", "analytics", "project management", "product management", "leadership", "management", "communication", "presentation", "negotiation", "consulting", "entrepreneurship", "freelancing", "sales", "operations", "automation", "cybersecurity", "devops", "testing", "debugging", "ux", "ui", "accessibility", "research methods", "technical writing", "client work", "supply chain"]},
    study: {name: 'Study', symbol: '↗', description: 'Make room for a new idea.', topics: ['lecture', 'lesson', 'course', 'tutorial', 'math', 'calculus', 'physics', 'chemistry', 'biology', 'history', 'science', 'language', 'university', 'exam', 'study', 'algebra', 'statistics', 'philosophy', "astronomy", "geography", "economics", "psychology", "sociology", "archaeology", "linguistics", "literature", "computer science", "algorithms", "data structures", "geometry", "trigonometry", "probability", "neuroscience", "anatomy", "medicine", "ecology", "earth science", "political science", "law", "worked example", "problem solving", "revision", "practice problems", "proof", "experiment", "derivation", "fundamentals", "how it works", "crash course", "seminar"]},
    music: {name: 'Music', symbol: '♫', description: 'Find your rhythm.', topics: ['music', 'song', 'album', 'playlist', 'lofi', 'lo-fi', 'jazz', 'piano', 'guitar', 'ambient', 'soundtrack', 'symphony', 'concert', 'orchestra', 'acoustic', 'beats', 'chillhop', 'classical', 'dj set', 'live set', 'lyrics', 'official audio', 'official video', 'synth', 'bossa nova', "vocals", "instrumental", "singing", "singer", "band", "performance", "cover", "remix", "mashup", "medley", "mixtape", "rap", "hip hop", "r&b", "soul", "funk", "blues", "rock", "metal", "pop", "indie", "folk", "country", "reggae", "electronic", "techno", "house music", "trance", "edm", "drum and bass", "synthwave", "choral", "opera", "bollywood", "k-pop", "afrobeats", "unplugged", "karaoke", "listening session", "music production", "music theory"]},
  };
  const FOCUS = Object.freeze({name: 'Focus', symbol: '◎', description: 'Hide Home and recommendations. Search and video playback stay available.'});
  const MODE_ICONS = Object.freeze({
    focus: '<path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4"/><circle cx="12" cy="12" r="3"/>',
    work: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M4 12c5 3 11 3 16 0M12 12v3"/>',
    study: '<path d="M12 6C9 3 5 3 2 4v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-3-1-7-1-10 2v14"/>',
    music: '<path d="M5 13v-2a7 7 0 0 1 14 0v2"/><rect x="3" y="11" width="4" height="9" rx="2"/><rect x="17" y="11" width="4" height="9" rx="2"/>',
  });
  const MAX_CUSTOM_INTENTS = 24;
  const INTENT_ICONS = Object.freeze({code: '⌘', book: '▤', music: '♫', compass: '◈', game: '♟', film: '▣', tools: '⚒', sparkles: '✦', news: '▥', plane: '✈', food: '♨', fitness: '⚡', palette: '◉', camera: '▧', language: '文', science: '⚛', history: '⌛', finance: '¤', leaf: '❧', heart: '♡'});
  // Trusted shared 24px outline icons, used by picker, tiles and YouTube controls.
  const INTENT_ICON_PATHS = Object.freeze({
    code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
    book: MODE_ICONS.study,
    music: MODE_ICONS.music,
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
    game: '<path d="M8 7h8c3 0 4 3 5 8 1 4-2 5-4 2l-1-1H8l-1 1c-2 3-5 2-4-2 1-5 2-8 5-8ZM7 10v5m-2.5-2.5h5"/><circle cx="16" cy="11" r=".75"/><circle cx="18" cy="14" r=".75"/>',
    film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4M17 8h4m-4 8h4M7 12h10"/>',
    tools: '<path d="m14 5 3 3 4-4a6 6 0 0 1-8 8L6 20a2.1 2.1 0 0 1-3-3l8-7a6 6 0 0 1 8-8l-5 3Z"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4M3 19v3m-1.5-1.5h3"/>',
    news: '<path d="M5 3h14v17H5a2 2 0 0 1-2-2V7h2m14 13a2 2 0 0 0 2-2V7h-2M8 7h8M8 11h3v3H8zM14 11h2m-2 3h2M8 17h8"/>',
    plane: '<path d="m21 3-6 18-4-8-8-4L21 3ZM11 13l5-5"/>',
    food: '<path d="M4 3v6c0 3 6 3 6 0V3M7 3v18M15 12h5V3c-4 2-5 6-5 9ZM20 12v9"/>',
    fitness: '<path d="m8 8 8 8M6 4l-3 3 3 3m1-7 3 3-4 4-3-3m14 7 4 4-3 3-4-4m4-4 3 3-3 3M4 4l-2-2m18 18 2 2"/>',
    palette: '<path d="M21 12a9 9 0 1 0-9 9h1a2 2 0 0 0 1-3c-1-2 0-3 2-3h2a3 3 0 0 0 3-3Z"/><circle cx="7" cy="10" r="1"/><circle cx="10" cy="6" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="6" cy="15" r="1"/>',
    camera: '<path d="M8 5 10 2h4l2 3h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4Z"/><circle cx="12" cy="13" r="4"/>',
    language: '<path d="M3 5h12M9 3v2M5 5c0 6 4 9 9 11M13 5c0 5-4 10-9 12M14 21l4-10 4 10M15.5 17h5"/>',
    science: '<ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1"/>',
    history: '<path d="M6 3h12M6 21h12M7 3v4c0 3 4 3 5 5-1 2-5 2-5 5v4M17 3v4c0 3-4 3-5 5 1 2 5 2 5 5v4M9 17h6"/>',
    finance: '<circle cx="12" cy="12" r="9"/><path d="M15 7h-4a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5H9M12 5v14"/>',
    leaf: '<path d="M21 3c0 10-3 17-10 17a7 7 0 0 1-7-7C4 6 11 3 21 3ZM3 21l13-13M8 16v-5m0 5h5"/>',
    heart: '<path d="M20.5 4.5a5.2 5.2 0 0 0-7.5 0L12 5.6l-1-1.1a5.2 5.2 0 0 0-7.5 7.3L12 21l8.5-9.2a5.2 5.2 0 0 0 0-7.3Z"/>'
  });
  const TEMPLATE_MATCHING = {
  "gaming": {
    "topics": [
      "gameplay",
      "walkthrough",
      "playthrough",
      "lets play",
      "speedrun",
      "boss fight",
      "quest",
      "rpg",
      "mmorpg",
      "fps",
      "strategy games",
      "sandbox",
      "survival game",
      "simulation",
      "multiplayer",
      "esports",
      "game lore",
      "game design",
      "game development",
      "mods",
      "modding",
      "gaming pc",
      "console",
      "retro games",
      "steam",
      "nintendo",
      "playstation",
      "xbox"
    ],
    "examples": [
      "Playing video games: complete playthroughs, difficult boss battles, quests, multiplayer matches, speedrunning and entertaining gameplay.",
      "Video game reviews, gaming news, release previews, game design, fictional worlds, characters and game lore.",
      "Gaming strategies, esports tournaments, competitive matches, mods, gaming PCs, consoles and retro games."
    ],
    "searches": [
      "video game gameplay walkthrough",
      "game reviews and gaming news",
      "video game strategy and lore",
      "esports highlights"
    ]
  },
  "tv-film": {
    "topics": [
      "cinema",
      "television",
      "tv series",
      "film",
      "movie",
      "episode",
      "season",
      "finale",
      "recap",
      "review",
      "analysis",
      "cinematography",
      "screenplay",
      "directing",
      "filmmaking",
      "animation",
      "documentary film",
      "actor interview",
      "behind the scenes",
      "visual effects",
      "story structure",
      "character arc",
      "streaming series",
      "video essay"
    ],
    "examples": [
      "Movie reviews, cinema criticism and film analysis, including cinematography, directing, screenwriting and storytelling.",
      "Television series, episode recaps, season finales, character arcs, plot explanations and discussions of TV drama and comedy.",
      "Filmmaking, animation, production design, visual effects, behind the scenes and interviews with actors and directors."
    ],
    "searches": [
      "film analysis video essay",
      "television series episode review",
      "filmmaking behind the scenes",
      "movie reviews"
    ]
  },
  "maker": {
    "topics": [
      "build log",
      "project",
      "workshop",
      "woodworking",
      "joinery",
      "metalworking",
      "welding",
      "machining",
      "cnc",
      "electronics",
      "circuits",
      "arduino",
      "raspberry pi",
      "robotics",
      "3d printing",
      "cad",
      "prototyping",
      "fabrication",
      "soldering",
      "furniture",
      "crafts",
      "sewing",
      "creative coding",
      "app building",
      "game development",
      "home lab",
      "diy"
    ],
    "examples": [
      "Building physical projects in a workshop: woodworking, furniture, metalworking, machining, welding, joinery and fabrication.",
      "Making electronics and robots with circuits, soldering, Arduino, Raspberry Pi, sensors, 3D printing and CAD prototypes.",
      "Building digital projects: creative coding, useful apps, games, home labs, automation and practical step by step project logs."
    ],
    "searches": [
      "maker project build log",
      "woodworking electronics robotics projects",
      "creative coding project tutorial",
      "3d printing fabrication workshop"
    ]
  },
  "ai": {
    "topics": [
      "ai",
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "neural network",
      "llm",
      "language model",
      "generative ai",
      "transformer",
      "diffusion",
      "agents",
      "rag",
      "embeddings",
      "fine tuning",
      "training",
      "inference",
      "prompt engineering",
      "evaluation",
      "benchmark",
      "alignment",
      "computer vision",
      "nlp",
      "reinforcement learning",
      "multimodal",
      "local models",
      "model quantization",
      "ai coding",
      "research paper"
    ],
    "examples": [
      "Artificial intelligence and machine learning research: neural networks, transformers, model training, deep learning and research paper explanations.",
      "Language models and practical AI engineering: agents, retrieval augmented generation, embeddings, fine tuning, inference, evaluation and coding assistants.",
      "Generative AI images, audio and video, diffusion models, computer vision, reinforcement learning, local models and responsible use of AI tools."
    ],
    "searches": [
      "artificial intelligence machine learning explained",
      "large language models agents tutorial",
      "AI research papers explained",
      "local AI practical projects"
    ]
  },
  "news": {
    "topics": [
      "current events",
      "breaking news",
      "reporting",
      "journalism",
      "world affairs",
      "politics",
      "government",
      "election",
      "parliament",
      "policy",
      "diplomacy",
      "geopolitics",
      "conflict",
      "international relations",
      "economy",
      "business news",
      "science news",
      "technology news",
      "local news",
      "investigation",
      "press conference",
      "interview",
      "public affairs",
      "current affairs"
    ],
    "examples": [
      "Reported current events and journalism: breaking news, public affairs, interviews, investigations and explanations of recent developments.",
      "World news, politics, elections, governments, diplomacy, geopolitics, international relations and public policy reporting.",
      "Current business, economic, science, technology and local news, with reporting and analysis of events happening now."
    ],
    "searches": [
      "world current events news analysis",
      "current affairs journalism",
      "science technology news",
      "business economic news"
    ]
  },
  "travel": {
    "topics": [
      "travel",
      "destination",
      "itinerary",
      "trip",
      "journey",
      "road trip",
      "backpacking",
      "sightseeing",
      "city guide",
      "walking tour",
      "local culture",
      "travel vlog",
      "holiday",
      "vacation",
      "tourism",
      "train journey",
      "flights",
      "airport",
      "hotel",
      "hostel",
      "accommodation",
      "visa",
      "border crossing",
      "budget travel",
      "hidden gems",
      "national park",
      "adventure travel",
      "cultural visit"
    ],
    "examples": [
      "Visiting new places: travel vlogs, city guides, destination recommendations, sightseeing, walking tours, local culture and things to do.",
      "Planning a trip: itineraries, budget travel, flights, train journeys, transport, accommodation, hotels, visas and practical travel advice.",
      "Exploring the world through road trips, backpacking, holidays, national parks, cultural visits and travel stories about unfamiliar places."
    ],
    "searches": [
      "travel destination city guide",
      "travel vlog local culture",
      "budget travel itinerary tips",
      "road trip train journey"
    ]
  },
  "cooking": {
    "topics": [
      "recipe",
      "cooking",
      "baking",
      "meal prep",
      "ingredients",
      "kitchen",
      "chef",
      "cuisine",
      "bread",
      "sourdough",
      "pastry",
      "dessert",
      "grilling",
      "barbecue",
      "roasting",
      "braising",
      "fermentation",
      "knife skills",
      "vegetarian",
      "vegan",
      "home cooking",
      "food preparation",
      "sauce",
      "culinary",
      "cook along"
    ],
    "examples": [
      "Preparing meals at home: recipes, ingredients, knife skills, sauces, kitchen techniques, meal preparation and practical cooking lessons.",
      "Baking bread, sourdough, pastries and desserts, fermentation, grilling, barbecue, roasting and other culinary techniques.",
      "Learning regional cuisines and vegetarian or vegan cooking through step by step recipes and chef demonstrations."
    ],
    "searches": [
      "home cooking recipes techniques",
      "baking bread dessert tutorial",
      "meal preparation kitchen skills",
      "regional cuisine cooking"
    ]
  },
  "fitness": {
    "topics": [
      "workout",
      "exercise",
      "strength training",
      "weightlifting",
      "resistance training",
      "calisthenics",
      "mobility",
      "flexibility",
      "stretching",
      "cardio",
      "endurance",
      "running",
      "cycling training",
      "swimming training",
      "conditioning",
      "bodyweight",
      "kettlebell",
      "pilates",
      "yoga practice",
      "form",
      "recovery",
      "hypertrophy",
      "powerlifting",
      "sports performance"
    ],
    "examples": [
      "Exercise and strength training: gym workouts, lifting weights, calisthenics, bodyweight routines, hypertrophy and correct movement technique.",
      "Building endurance and sports conditioning through running, cycling, swimming, cardio training and consistent workout habits.",
      "Mobility, flexibility, stretching, Pilates, yoga practice, exercise recovery and physical training routines."
    ],
    "searches": [
      "workout exercise strength training",
      "mobility flexibility exercise routine",
      "running endurance training",
      "correct lifting technique"
    ]
  },
  "art-design": {
    "topics": [
      "drawing",
      "painting",
      "sketching",
      "illustration",
      "graphic design",
      "product design",
      "typography",
      "color theory",
      "composition",
      "visual art",
      "digital art",
      "animation",
      "sculpture",
      "printmaking",
      "watercolor",
      "acrylic",
      "oil painting",
      "lettering",
      "branding",
      "logo design",
      "concept art",
      "art critique",
      "design process",
      "portfolio"
    ],
    "examples": [
      "Making visual art: drawing, sketching, illustration, painting, sculpture, printmaking, digital art and creative techniques.",
      "Graphic and product design: typography, lettering, layout, branding, logos, composition, color theory and design processes.",
      "Art critiques, concept art, visual storytelling, creative practice and developing an art or design portfolio."
    ],
    "searches": [
      "drawing painting illustration techniques",
      "graphic design typography branding",
      "art creative process critique",
      "digital art concept art tutorial"
    ]
  },
  "photography": {
    "topics": [
      "photography",
      "camera",
      "lens",
      "exposure",
      "aperture",
      "shutter speed",
      "iso",
      "composition",
      "lighting",
      "portrait",
      "landscape photography",
      "street photography",
      "wildlife photography",
      "macro",
      "astrophotography",
      "photo editing",
      "lightroom",
      "darkroom",
      "film photography",
      "camera review",
      "color grading",
      "photographic storytelling"
    ],
    "examples": [
      "Taking photographs: exposure, aperture, shutter speed, lenses, lighting, composition and practical camera techniques.",
      "Portrait, landscape, street, wildlife, macro, travel and astrophotography shoots, photo walks and photographic storytelling.",
      "Photo editing, Lightroom, darkroom work, film photography, camera reviews and choosing photographic equipment."
    ],
    "searches": [
      "photography camera techniques lighting",
      "portrait landscape street photography",
      "photo editing workflow",
      "camera lens photography review"
    ]
  },
  "languages": {
    "topics": [
      "language learning",
      "vocabulary",
      "grammar",
      "conversation",
      "pronunciation",
      "listening practice",
      "speaking",
      "reading practice",
      "comprehensible input",
      "immersion",
      "fluency",
      "accent",
      "dialogue",
      "subtitles",
      "translation",
      "linguistics",
      "beginner language",
      "language lesson",
      "bilingual",
      "english learning",
      "german learning",
      "spanish learning",
      "french learning",
      "japanese learning",
      "korean learning"
    ],
    "examples": [
      "Learning another language through conversation, comprehensible input, listening practice, dialogues, immersion and bilingual explanations.",
      "Vocabulary, grammar, pronunciation, accent practice, reading, writing, speaking skills and building fluency in a language.",
      "Beginner and advanced language lessons, translation exercises, subtitled listening material and practical communication in another language."
    ],
    "searches": [
      "language learning conversation practice",
      "comprehensible input listening practice",
      "language grammar pronunciation lesson",
      "language vocabulary speaking skills"
    ]
  },
  "science": {
    "topics": [
      "physics",
      "chemistry",
      "biology",
      "astronomy",
      "astrophysics",
      "cosmology",
      "geology",
      "ecology",
      "neuroscience",
      "genetics",
      "evolution",
      "quantum",
      "relativity",
      "experiment",
      "laboratory",
      "hypothesis",
      "research",
      "discovery",
      "scientific method",
      "mathematics",
      "space science",
      "earth science",
      "material science",
      "microbiology",
      "scientific explanation"
    ],
    "examples": [
      "Physics experiments and explanations of light, optics, waves, electricity, motion and forces.",
      "Astronomy, astrophysics, cosmology, space, geology, earth science, ecology and how the natural world works.",
      "Scientific discoveries, genetics, evolution, neuroscience, laboratory experiments, scientific methods and explanations of research."
    ],
    "searches": [
      "science experiments explained",
      "physics chemistry biology explained",
      "astronomy space discoveries",
      "scientific research explained"
    ]
  },
  "history": {
    "topics": [
      "history",
      "historical",
      "civilization",
      "ancient",
      "medieval",
      "archaeology",
      "empire",
      "dynasty",
      "antiquity",
      "prehistory",
      "social history",
      "political history",
      "oral history",
      "archive",
      "primary source",
      "historical documentary",
      "industrial revolution",
      "world war",
      "colonialism",
      "historical biography",
      "cultural history",
      "historical evidence"
    ],
    "examples": [
      "Historical documentaries about ancient civilizations, empires, medieval societies, prehistory and archaeology.",
      "Understanding past events through social, political and cultural history, biographies, revolutions and historical evidence.",
      "Historians explaining primary sources, archives, oral histories, wars and the causes and consequences of events in the past."
    ],
    "searches": [
      "history historical documentary",
      "ancient civilizations archaeology",
      "social cultural history explained",
      "historical evidence analysis"
    ]
  },
  "finance": {
    "topics": [
      "finance",
      "budgeting",
      "saving",
      "investing",
      "financial literacy",
      "personal finance",
      "cash flow",
      "compound interest",
      "economics",
      "inflation",
      "interest rates",
      "diversification",
      "index fund",
      "bonds",
      "stocks",
      "retirement planning",
      "credit",
      "debt",
      "tax education",
      "financial statements",
      "accounting",
      "business finance",
      "risk management",
      "money management"
    ],
    "examples": [
      "Financial education and personal money management: budgeting, saving, debt, credit, compound interest and retirement planning.",
      "Understanding investing principles, diversification, stocks, bonds, index funds and financial risk through educational explanations.",
      "Economic concepts, inflation, interest rates, accounting, financial statements, cash flow and business finance education."
    ],
    "searches": [
      "personal finance budgeting saving education",
      "investing principles explained",
      "economics financial literacy",
      "business finance accounting explained"
    ]
  },
  "nature": {
    "topics": [
      "nature",
      "wildlife",
      "ecology",
      "ecosystem",
      "conservation",
      "biodiversity",
      "animal behavior",
      "birds",
      "birdwatching",
      "forests",
      "ocean",
      "marine life",
      "geology",
      "mountains",
      "wilderness",
      "outdoors",
      "hiking",
      "natural history",
      "habitat",
      "plants",
      "botany",
      "environmental science",
      "national parks",
      "wildlife documentary",
      "landscape"
    ],
    "examples": [
      "Observing nature and wildlife: animal behavior, birds, marine life, plants, forests, oceans and wildlife documentaries.",
      "Ecology, ecosystems, biodiversity, habitats, conservation and understanding the relationships in the natural environment.",
      "Exploring the outdoors, wilderness, hiking, natural landscapes, mountains, national parks and geology."
    ],
    "searches": [
      "wildlife nature documentary",
      "ecology conservation natural world",
      "outdoors wilderness exploration",
      "animal behavior plants geology"
    ]
  },
  "diy-repair": {
    "topics": [
      "repair",
      "maintenance",
      "troubleshooting",
      "restoration",
      "fixing",
      "renovation",
      "home improvement",
      "bicycle repair",
      "appliance repair",
      "electronics repair",
      "computer repair",
      "soldering",
      "diagnostics",
      "disassembly",
      "refurbishment",
      "upcycling",
      "tool use",
      "plumbing",
      "carpentry",
      "mending",
      "service manual",
      "right to repair"
    ],
    "examples": [
      "Fixing and maintaining useful objects: appliance repair, electronics troubleshooting, computer repair, diagnosis and restoration.",
      "DIY home improvement, renovation, plumbing, carpentry, tool use, practical maintenance and step by step repair instructions.",
      "Bicycle repair, mending, refurbishment, disassembly, soldering and restoring damaged or worn equipment."
    ],
    "searches": [
      "DIY repair maintenance troubleshooting",
      "home improvement practical repairs",
      "electronics appliance repair",
      "restoration repair workshop"
    ]
  },
  "books": {
    "topics": [
      "books",
      "reading",
      "literature",
      "novel",
      "nonfiction",
      "fiction",
      "poetry",
      "literary criticism",
      "literary analysis",
      "book review",
      "author interview",
      "reading recommendations",
      "book club",
      "book discussion",
      "writing craft",
      "storytelling",
      "narrative",
      "essay",
      "reading list",
      "booktube",
      "classic literature",
      "creative writing"
    ],
    "examples": [
      "Books and reading: reviews, reading recommendations, book clubs and thoughtful discussions of novels and nonfiction.",
      "Literary analysis, classic literature, poetry, essays, narrative structure and criticism of written works.",
      "Author interviews, creative writing, storytelling techniques and the craft of writing books and literature."
    ],
    "searches": [
      "book reviews reading recommendations",
      "literary analysis books",
      "author interview writing craft",
      "book club literature discussion"
    ]
  },
  "wellbeing": {
    "topics": [
      "wellbeing",
      "mindfulness",
      "meditation",
      "stress management",
      "relaxation",
      "sleep",
      "sleep routine",
      "self care",
      "emotional wellbeing",
      "mental health education",
      "resilience",
      "journaling",
      "daily habits",
      "work life balance",
      "breathing exercise",
      "burnout recovery",
      "managing anxiety",
      "self compassion",
      "rest",
      "healthy routine",
      "attention",
      "digital wellbeing"
    ],
    "examples": [
      "Mindfulness, meditation, breathing exercises, relaxation, stress management and practical self care routines.",
      "Sleep habits, rest, recovering from burnout, managing daily routines, work life balance and digital wellbeing.",
      "Emotional wellbeing, self compassion, resilience, journaling and educational explanations of mental health and healthy habits."
    ],
    "searches": [
      "mindfulness stress management self care",
      "sleep healthy daily habits",
      "emotional wellbeing education",
      "meditation relaxation routines"
    ]
  }
};
  const INTENT_TEMPLATES = Object.freeze(Object.fromEntries(Object.entries({
    gaming: {name: 'Gaming', icon: 'game', description: 'Video games, gameplay, game reviews, strategy guides, walkthroughs, esports and gaming hardware.'},
    'tv-film': {name: 'TV & Film', icon: 'film', description: 'Film and television reviews, thoughtful criticism, story analysis, filmmaker interviews, production insights and recommendations about cinema and television.'},
    maker: {name: 'Making & Building', icon: 'tools', description: 'Hands-on making and building, both physical and digital: woodworking, metalworking, electronics, robotics, 3D printing, crafts, creative coding and practical project build logs.'},
    ai: {name: 'Artificial Intelligence', icon: 'sparkles', description: 'Artificial intelligence, machine learning, neural networks, language models, practical AI programming, tools, evaluation, research papers and technical explanations.'},
    news: {name: 'News', icon: 'news', description: 'Reported current events, public affairs, world news, science and business journalism, interviews and analysis explaining recent developments.'},
    travel: {name: 'Travel', icon: 'plane', description: 'Travel guides, destination planning, local culture, itineraries, practical travel advice and stories about exploring new places.'},
    cooking: {name: 'Cooking', icon: 'food', description: 'Cooking recipes, ingredient preparation, kitchen techniques, baking, meal planning and practical culinary skills.'},
    fitness: {name: 'Fitness', icon: 'fitness', description: 'Exercise routines, strength training, mobility, sports conditioning, movement technique and building consistent fitness habits.'},
    'art-design': {name: 'Art & Design', icon: 'palette', description: 'Drawing, painting, illustration, graphic and product design, typography, color, composition, creative processes and visual art critiques.'},
    photography: {name: 'Photography', icon: 'camera', description: 'Photography techniques, cameras, lighting, composition, photo editing and visual storytelling through still images.'},
    languages: {name: 'Languages', icon: 'language', description: 'Language lessons, vocabulary, grammar, conversation, listening practice, pronunciation and learning to communicate in another language.'},
    science: {name: 'Science', icon: 'science', description: 'Scientific explanations and experiments, physics, chemistry, biology, astronomy, scientific discoveries and understanding research.'},
    history: {name: 'History', icon: 'history', description: 'Historical documentaries, past civilizations, social and political history, historical evidence and careful analysis of events from the past.'},
    finance: {name: 'Finance', icon: 'finance', description: 'Financial education, budgeting, saving, investing principles, economic concepts and understanding personal and business finances.'},
    nature: {name: 'Nature', icon: 'leaf', description: 'Wildlife, ecology, conservation, geology, natural environments and observing and exploring the outdoors.'},
    'diy-repair': {name: 'DIY & Repair', icon: 'tools', description: 'Practical repairs and maintenance for homes, bicycles, appliances and technology, troubleshooting problems and restoring useful objects.'},
    books: {name: 'Books', icon: 'book', description: 'Book reviews, literary analysis, reading recommendations, author interviews, writing and thoughtful conversations about literature.'},
    wellbeing: {name: 'Wellbeing', icon: 'heart', description: 'Mindfulness, stress management, sleep routines, emotional wellbeing, healthy daily habits and practical self-care.'}
  }).map(([id, record]) => [id, Object.freeze({...record, symbol: INTENT_ICONS[record.icon], topics: Object.freeze(TEMPLATE_MATCHING[id].topics), examples: Object.freeze(TEMPLATE_MATCHING[id].examples), searches: Object.freeze(TEMPLATE_MATCHING[id].searches)})])));
  const ROLE_PRESETS = Object.freeze(Object.fromEntries(Object.entries({
    general: {name: 'General', workDescription: '', studyDescription: ''},
    'software-engineer': {name: 'Software engineer', workDescription: 'Practical software engineering: implementing, testing and debugging applications, reviewing code, designing system architecture, maintaining production services and collaborating on software projects.', studyDescription: 'Learning computer science, algorithms, data structures, programming languages, operating systems, databases and software design through technical lessons and worked examples.'},
    accountant: {name: 'Accountant', workDescription: 'Accounting workflows: bookkeeping, reconciliations, financial reporting, spreadsheets, accounting systems, audit preparation and tax compliance work for accounting professionals.', studyDescription: 'Learning accounting principles, double-entry bookkeeping, financial statement analysis, cost accounting, auditing and tax concepts through lessons and worked examples.'},
    designer: {name: 'Designer', workDescription: 'Graphic and product design workflows, typography, layout, accessibility, prototyping, design systems, usability research and completing client design deliverables.', studyDescription: 'Learning visual design fundamentals, color theory, typography, interaction design, human-computer interaction and practical design critiques.'},
    researcher: {name: 'Researcher', workDescription: 'Academic research workflows, literature reviews, research methods, experimental design, data analysis, reproducible scientific coding, paper writing and research communication.', studyDescription: 'Deep explanations of scientific concepts, statistics, research methodology and critically evaluating scholarly papers, evidence and experimental results.'},
    student: {name: 'Student', workDescription: 'Completing assignments, planning coursework, taking effective notes, writing essays, using study tools and managing student projects.', studyDescription: 'University and school lessons, worked problems, exam preparation, mathematics, sciences, humanities and language learning.'}
  }).map(([id, record]) => [id, Object.freeze(record)])));
  function plainObject(value) {
    if (!value || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.hasOwn(prototype, 'constructor') && typeof prototype.constructor === 'function' && Function.prototype.toString.call(prototype.constructor) === Function.prototype.toString.call(Object);
  }
  const factoryRolePresets = () => Object.fromEntries(Object.entries(ROLE_PRESETS).map(([id, record]) => [id, {...record}]));
  function roleRecords(input) {
    if (!plainObject(input)) return factoryRolePresets();
    const records = {};
    for (const [id, value] of Object.entries(input)) {
      if (!(Object.hasOwn(ROLE_PRESETS, id) || /^custom-[a-z0-9-]{1,48}$/.test(id)) || !plainObject(value) || typeof value.name !== 'string' || typeof value.workDescription !== 'string' || typeof value.studyDescription !== 'string') continue;
      const name = value.name.trim().slice(0, 48);
      if (!name) continue;
      records[id] = {name, workDescription: value.workDescription.trim().slice(0, 1000), studyDescription: value.studyDescription.trim().slice(0, 1000)};
      if (Object.keys(records).length === 20) break;
    }
    return records;
  }
  function customRecords(input) {
    const records = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return records;
    for (const [id, value] of Object.entries(input)) {
      if (!/^custom-[a-z0-9-]{1,48}$/.test(id) || !value || typeof value.name !== 'string' || typeof value.description !== 'string') continue;
      const name = value.name.trim().slice(0, 48), description = value.description.trim().slice(0, 1000);
      if (!name || !description) continue;
      const icon = Object.hasOwn(INTENT_ICONS, value.icon) ? value.icon : 'compass';
      records[id] = {name, description, icon, ...(Object.hasOwn(INTENT_TEMPLATES, value.templateId) ? {templateId: value.templateId} : {})};
      if (Object.keys(records).length === MAX_CUSTOM_INTENTS) break;
    }
    return records;
  }
  function defaultTemplate(settings, id) {
    const record = settings.customIntents?.[id], template = record && INTENT_TEMPLATES[record.templateId];
    return template && !settings.intentDescriptions?.[id]?.trim() && record.description?.trim() === template.description ? template : null;
  }
  const validMode = (mode, settings = {}) => Object.hasOwn(MODES, mode) || mode === 'off' || mode === 'focus' || Object.hasOwn(customRecords(settings.customIntents), mode);
  function orderIds(ids, input) {
    return [...new Set([...(Array.isArray(input) ? input.filter(id => typeof id === 'string' && ids.includes(id)) : []), ...ids])];
  }
  const descriptionTerms = text => terms(String(text || '').replace(/[;.!?]/g, ','));
  function modes(settings = {}) {
    const builtins = Object.fromEntries(Object.entries(MODES).map(([id, mode]) => {
      const description = typeof settings.intentDescriptions?.[id] === 'string' ? settings.intentDescriptions[id].trim().slice(0, 1000) : '';
      const name = typeof settings.intentNames?.[id] === 'string' ? settings.intentNames[id].trim().slice(0, 48) : '';
      return [id, {...mode, name: name || mode.name, description: description || mode.description, topics: description ? descriptionTerms(description) : [...mode.topics]}];
    }));
    const custom = Object.fromEntries(Object.entries(customRecords(settings.customIntents)).map(([id, record]) => {
      const template = defaultTemplate(settings, id);
      return [id, {...record, symbol: INTENT_ICONS[record.icon], topics: template ? [...template.topics] : descriptionTerms(record.description)}];
    }));
    const definitions = {...builtins, ...custom};
    return Object.fromEntries(orderIds(Object.keys(definitions), settings.intentOrder).map(id => [id, definitions[id]]));
  }
  const defaults = () => ({mode: 'work', newTabMode: 'last', metadataLimit: 4, rolePresets: factoryRolePresets(), lastRolePreset: null, intentOrder: Object.keys(MODES), customIntents: {}, intentNames: Object.fromEntries(Object.entries(MODES).map(([id, mode]) => [id, mode.name])), intentDescriptions: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), countModes: {work: true, study: true, music: false, off: true, focus: true}, matchOnlyModes: Object.fromEntries(Object.keys(MODES).map(id => [id, false])), hideShorts: true, hideClickbait: true, limitEnabled: true, dailyMinutes: 60, countPlayback: true, customTopics: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), channels: Object.fromEntries(Object.keys(MODES).map(k => [k, ''])), blockedTerms: ''});
  function sanitize(input = {}) {
    const out = defaults();
    out.rolePresets = roleRecords(input.rolePresets);
    if (typeof input.lastRolePreset === 'string' && Object.hasOwn(out.rolePresets, input.lastRolePreset)) out.lastRolePreset = input.lastRolePreset;
    out.customIntents = customRecords(input.customIntents);
    for (const mode of Object.keys(MODES)) if (typeof input.intentNames?.[mode] === 'string' && input.intentNames[mode].trim()) out.intentNames[mode] = input.intentNames[mode].trim().slice(0, 48);
    for (const mode of Object.keys(MODES)) if (typeof input.intentDescriptions?.[mode] === 'string') out.intentDescriptions[mode] = input.intentDescriptions[mode].trim().slice(0, 1000);
    const ids = [...Object.keys(MODES), ...Object.keys(out.customIntents)];
    out.intentOrder = orderIds(ids, input.intentOrder);
    if (validMode(input.mode, out)) out.mode = input.mode;
    if (input.newTabMode === 'last' || validMode(input.newTabMode, out)) out.newTabMode = input.newTabMode;
    else if (input.newTabMode === 'leisure') out.newTabMode = 'work';
    for (const mode of [...ids, 'off', 'focus']) out.countModes[mode] = typeof input.countModes?.[mode] === 'boolean' ? input.countModes[mode] : mode !== 'music';
    out.matchOnlyModes = Object.fromEntries(ids.map(id => [id, input.matchOnlyModes?.[id] === true]));
    for (const key of ['hideShorts', 'hideClickbait', 'limitEnabled', 'countPlayback']) if (typeof input[key] === 'boolean') out[key] = input[key];
    if (Number.isFinite(Number(input.dailyMinutes))) out.dailyMinutes = Math.max(1, Math.min(1440, Math.round(Number(input.dailyMinutes))));
    if ((typeof input.metadataLimit === 'number' || typeof input.metadataLimit === 'string' && input.metadataLimit.trim()) && Number.isFinite(Number(input.metadataLimit))) out.metadataLimit = Math.max(0, Math.min(40, Math.round(Number(input.metadataLimit))));
    for (const field of ['customTopics', 'channels']) for (const mode of ids) out[field][mode] = String(input[field]?.[mode] || '').slice(0, 4000);
    out.blockedTerms = String(input.blockedTerms || '').slice(0, 4000);
    return out;
  }
  function initialMode(settings = {}) {
    const s = sanitize(settings);
    return s.newTabMode === 'last' ? s.mode : s.newTabMode;
  }
  function countsMode(settings = {}, mode = settings.mode) {
    if (!validMode(mode, settings)) return true;
    const value = settings.countModes?.[mode];
    return typeof value === 'boolean' ? value : mode !== 'music';
  }
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const terms = value => [...new Set(String(value || '').split(/[,\n]/).map(normalize).filter(Boolean))];
  // Channel names may contain commas. Quoted CSV fields keep them as one name,
  // while existing comma/newline-separated settings remain compatible.
  function channelNames(value) {
    const fields = []; let field = '', quoted = false;
    const input = String(value || '');
    for (let i = 0; i < input.length; i++) {
      const char = input[i];
      if (char === '"' && (quoted || !field.trim())) {
        if (quoted && input[i + 1] === '"') {field += '"'; i++;} else quoted = !quoted;
      } else if (!quoted && (char === ',' || char === '\n' || char === '\r')) {fields.push(field.trim()); field = '';}
      else field += char;
    }
    fields.push(field.trim()); const seen = new Set(); return fields.filter(name => {const key = normalize(name); if (!key || seen.has(key)) return false; seen.add(key); return true;});
  }
  const channelTerms = value => channelNames(value).map(normalize);
  const formatChannelTerms = names => names.map(name => String(name).trim()).filter(Boolean).map(name => /[,"\r\n]/.test(name) ? '"' + name.replaceAll('"', '""') + '"' : name).join('\n');
  function matches(text, term) {
    const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalize(text));
  }
  function clickbait(title) {
    const patterns = [/you won.?t believe/i, /what happens next/i, /changed my life/i, /they don.?t want you to know/i, /this changes everything/i, /gone (wrong|sexual)/i, /shocking (truth|reveal)/i, /doctors hate/i, /watch (this )?(before|until)/i, /the truth about/i, /i was wrong about/i, /\b(must watch|insane|mind.?blowing|unbelievable)\b/i, /[!?]{3,}/];
    if (patterns.some(p => p.test(title))) return true;
    const letters = String(title).replace(/[^a-zA-Z]/g, '');
    return letters.length >= 18 && letters.replace(/[^A-Z]/g, '').length / letters.length > .85;
  }
  function classify(video, settings) {
    if (settings.hideShorts && video.shorts) return {visible: false, reason: 'shorts'};
    if (!video.title?.trim()) return {visible: settings.mode === 'off', reason: 'loading'};
    if (terms(settings.blockedTerms).some(t => matches(`${video.title} ${video.channel || ''}`, t))) return {visible: false, reason: 'blocked term'};
    if (settings.hideClickbait && clickbait(video.title)) return {visible: false, reason: 'clickbait'};
    if (settings.mode === 'off') return {visible: true, reason: 'unfiltered'};
    if (settings.mode === 'focus') return {visible: false, reason: 'focus mode'};
    if (channelTerms(settings.channels[settings.mode]).includes(normalize(video.channel))) return {visible: true, reason: 'your channel'};
    const topics = [...(modes(settings)[settings.mode]?.topics || []), ...terms(settings.customTopics[settings.mode])];
    return topics.some(t => matches(`${video.title} ${video.description || ''}`, t)) ? {visible: true, reason: settings.mode} : {visible: false, reason: 'outside mode'};
  }
  function dayKey(now = Date.now()) {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function nextMidnight(now = Date.now()) {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  function advanceUsage(days, from, to, counting) {
    const out = {...days};
    if (counting && Number.isFinite(from) && to > from) {
      // A delayed alarm after sleep must not charge hours of inactive time.
      let cursor = Math.max(from, to - 35000);
      while (cursor < to) {
        const end = Math.min(to, nextMidnight(cursor));
        const key = dayKey(cursor);
        out[key] = Math.max(0, Number(out[key]) || 0) + end - cursor;
        cursor = end;
      }
    }
    return Object.fromEntries(Object.keys(out).sort().slice(-14).map(k => [k, out[k]]));
  }
  function isYouTube(url) {
    try { const u = new URL(url); return ['http:', 'https:'].includes(u.protocol) && ['youtube.com', 'youtube-nocookie.com'].some(h => u.hostname === h || u.hostname.endsWith(`.${h}`)); } catch { return false; }
  }
  function snapshot(settings, days, now = Date.now()) {
    const usedMs = days[dayKey(now)] || 0;
    return {settings, usedMs, remainingMs: Math.max(0, settings.dailyMinutes * 60000 - usedMs), blocked: settings.limitEnabled && usedMs >= settings.dailyMinutes * 60000, day: dayKey(now), resetAt: nextMidnight(now)};
  }
  globalThis.IntentCore = {MODES, FOCUS, MODE_ICONS, ROLE_PRESETS, INTENT_TEMPLATES, INTENT_ICONS, INTENT_ICON_PATHS, MAX_CUSTOM_INTENTS, defaultTemplate, modes, validMode, defaults, sanitize, initialMode, countsMode, normalize, terms, channelNames, channelTerms, formatChannelTerms, matches, clickbait, classify, dayKey, nextMidnight, advanceUsage, isYouTube, snapshot};
})();
