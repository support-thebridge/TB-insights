// Canonical fallback data for scripts/fetch-notion.ts when NOTION_TOKEN is absent.
// Shape MUST match what Notion mappers in src/lib/notion.ts produce so the rest of
// the build is token-agnostic. If you change this file, also update the mappers.

export const publications = [
  { title: 'Employment Outlook Survey Q2 2026', publisher: 'ManpowerGroup', vectors: ['v1'], country: ['Global', 'España'], tier: 'A', date: '2026-04-08', pdf: true },
  { title: 'AI Jobs Barometer 2026', publisher: 'PwC', vectors: ['v2', 'v3'], country: ['Global'], tier: 'A', date: '2026-04-02', pdf: true },
  { title: 'Employment Outlook 2026, cap. 3 — Generative AI and the Labour Market', publisher: 'OECD', vectors: ['v3'], country: ['EU', 'Global'], tier: 'A', date: '2026-04-04', pdf: true },
  { title: 'Tech hiring pulse — Europe & US, March 2026', publisher: 'LinkedIn Economic Graph', vectors: ['v1'], country: ['US', 'EU'], tier: 'B', date: '2026-03-31', pdf: false },
  { title: 'OES National Occupational Employment and Wages 2025', publisher: 'BLS', vectors: ['v2'], country: ['US'], tier: 'A', date: '2026-03-22', pdf: true },
  { title: 'Future of Jobs Report 2025 — Reskilling Revolution tracker', publisher: 'WEF', vectors: ['v3', 'v4'], country: ['Global'], tier: 'A', date: '2026-02-28', pdf: true },
  { title: 'LFS Q4 2025 · ICT wage growth series', publisher: 'Eurostat', vectors: ['v2'], country: ['EU'], tier: 'A', date: '2026-03-14', pdf: false },
  { title: 'State of AI hiring in Spain — Q1 2026', publisher: 'Fundación COTEC', vectors: ['v1', 'v3'], country: ['España'], tier: 'B', date: '2026-03-09', pdf: true },
  { title: 'Talent shortage 2026 — G20 findings', publisher: 'ManpowerGroup', vectors: ['v1', 'v4'], country: ['Global'], tier: 'A', date: '2026-02-18', pdf: true },
  { title: 'Generative AI and productivity — field experiments', publisher: 'MIT CSAIL', vectors: ['v3'], country: ['US'], tier: 'B', date: '2026-02-05', pdf: true },
];

// Narrow BiweeklyNotionData — what Notion actually provides. Static framing
// (thesis, findings, callout) is composed in src/data/index.ts.
export const digest = {
  issue: 7,
  cycleDate: '2026-04-17',
  digestSummary:
    '• Stanford HAI AI Index 2026 confirma Brynjolfsson 2025: empleo SWE 22–25 años cayó ~20% desde 2024 en EEUU.\n• Global IT NEO Q2 2026 en 45%, +9pp YoY (ManpowerGroup).\n• AI-skill premium salarial +21% vs equivalentes sin IA (PwC).',
  mostImportantDelta:
    'La demanda agregada se enfría, pero los perfiles con competencias IA capturan el 82% de las ofertas y un premium salarial de dos dígitos.',
  publicationsAdded: 12,
  vectorsCovered: ['v1', 'v2', 'v3', 'v4'],
  citedPublications: [
    { title: 'Employment Outlook Survey Q2 2026', url: 'https://example.com/manpowergroup' },
    { title: 'AI Jobs Barometer 2026', url: 'https://example.com/pwc' },
    { title: 'Employment Outlook 2026, cap. 3 — Generative AI and the Labour Market', url: 'https://example.com/oecd' },
  ],
};

export const metrics = [
  { v: 'v1', metric: 'Global Net Employment Outlook', unit: 'pp', last: 27, prev: 18, delta: 9, src: 'ManpowerGroup', date: '2026-04-08' },
  { v: 'v1', metric: 'España · NEO IT & Tech', unit: 'pp', last: 34, prev: 22, delta: 12, src: 'ManpowerGroup', date: '2026-04-08' },
  { v: 'v1', metric: 'LinkedIn tech job postings (YoY, Global)', unit: '%', last: -6.4, prev: -11.2, delta: 4.8, src: 'LinkedIn Economic Graph', date: '2026-03-31' },
  { v: 'v2', metric: 'AI-skill salary premium (developed economies)', unit: '%', last: 21.0, prev: 18.3, delta: 2.7, src: 'PwC AI Jobs Barometer', date: '2026-04-02' },
  { v: 'v2', metric: 'Tech median base pay (US)', unit: 'USD', last: 132500, prev: 128800, delta: 2.9, unitDelta: '%', src: 'BLS OES 2025', date: '2026-03-22' },
  { v: 'v2', metric: 'EU ICT wage growth YoY', unit: '%', last: 4.6, prev: 5.1, delta: -0.5, src: "Eurostat LFS Q4 '25", date: '2026-03-14' },
  { v: 'v3', metric: 'Empleos expuestos a IA gen. (avanzadas)', unit: '%', last: 39, prev: 34, delta: 5, src: 'OECD Employment Outlook', date: '2026-04-04' },
  { v: 'v3', metric: 'AI augmentation share of exposed jobs', unit: '%', last: 72, prev: 69, delta: 3, src: 'OECD / WEF Future of Jobs', date: '2026-04-04' },
  { v: 'v3', metric: 'Puestos creados por IA a 5 años (Global)', unit: 'M', last: 69, prev: 69, delta: 0, src: 'WEF Future of Jobs 2025', date: '2026-01-15' },
  { v: 'v4', metric: 'Empresas con programas reskilling IA', unit: '%', last: 58, prev: 47, delta: 11, src: 'WEF Reskilling Revolution', date: '2026-02-28' },
];
