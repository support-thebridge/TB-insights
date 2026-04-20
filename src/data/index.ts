/**
 * Components import from this module.
 *
 * Data lineage:
 *   - publications.json       ← Notion Publications DB (live)
 *   - latest-digest.json      ← Notion Biweekly DB (narrow BiweeklyNotionData)
 *   - metrics.json            ← seed (no Metrics DB yet)
 *
 * The components need a full `BiweeklyDigest` (hero headline, three findings,
 * callout, etc). Today Notion only stores a narrow slice of that (`cycleDate`,
 * `mostImportantDelta`, `publicationsAdded`, `citedPublications`). We compose
 * the rest here with static editorial framing until the Notion schema grows.
 */

import type {
  BiweeklyDigest,
  BiweeklyNotionData,
  FlagshipReport,
  Metric,
  MethodStep,
  Publication,
  ReportCard,
} from '../lib/types';

import digestJson from './latest-digest.json';
import metricsJson from './metrics.json';
import publicationsJson from './publications.json';

export const metrics = metricsJson as Metric[];
export const publications = publicationsJson as Publication[];

// ---------- biweekly composition ----------

const notionDigest = digestJson as BiweeklyNotionData;

function formatDateLabel(isoDate: string, issue: number): string {
  // "2026-04-17" → "Quincena 7 — 17 abril 2026"
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const fmt = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `Quincena ${issue} — ${fmt.format(d)}`;
}

// Editorial framing that Notion does not yet own. Edit in code until the
// Biweekly DB schema is extended.
const STATIC_FRAMING = {
  thesisHeadline: 'El empleo tech ya no sube en bloque. Se bifurca por exposición a la IA.',
  thesisSub:
    'Leemos, filtramos y sintetizamos cada quincena los informes que definen el mercado laboral tecnológico. Una tesis por ciclo, cuatro vectores, una fuente citable.',
  liveReadout: {
    label: 'Última lectura',
    value: 'Global tech NEO',
    valueAccent: '+9pp YoY',
    source: 'ManpowerGroup · Employment Outlook Q2 2026',
  },
  sectionHeadline: 'Lo que leyó el equipo, reducido a una tesis.',
  findings: [
    {
      vector: 'v1' as const,
      stat: '+9',
      statUnit: 'pp YoY',
      finding:
        'Net Employment Outlook sube por cuarto trimestre consecutivo, pero concentrado en 4 países.',
      body:
        'EE.UU., India, Países Bajos y España tiran del indicador global. España aporta +34pp, su lectura más alta desde 2022. El resto de Europa se mueve en banda plana.',
      sourceLabel: 'ManpowerGroup — Employment Outlook Survey Q2 2026',
    },
    {
      vector: 'v2' as const,
      stat: '+21',
      statUnit: '% premium',
      finding:
        'Los roles con competencias IA pagan un 21% más que los equivalentes sin IA en 2025.',
      body:
        'El premium creció 3 puntos respecto a 2024. Más marcado en operaciones, marketing y finanzas que en ingeniería, donde el baseline ya era alto.',
      sourceLabel: 'PwC — AI Jobs Barometer 2026',
    },
    {
      vector: 'v3' as const,
      stat: '39',
      statUnit: '% puestos',
      finding:
        'OCDE revisa al alza la exposición: 39% de los empleos en economías avanzadas están afectados.',
      body:
        '28% complementariedad (augmentation), 11% sustitución. Knowledge workers sin reconversión son el segmento con mayor riesgo de desplazamiento a 24 meses.',
      sourceLabel: 'OECD — Employment Outlook 2026, cap. 3',
    },
  ] as BiweeklyDigest['findings'],
  callout: {
    tag: 'So what para Bridge',
    text: 'La demanda que crece ya no es “un dev más” — es un profesional con agencia sobre herramientas IA. Nuestro bootcamp V4 (Apply) es exactamente esa unidad de conversión.',
    linkLabel: 'Ver full state',
  },
};

export const digest: BiweeklyDigest = {
  issue: notionDigest.issue,
  dateLabel: formatDateLabel(notionDigest.cycleDate, notionDigest.issue),
  thesisHeadline: STATIC_FRAMING.thesisHeadline,
  thesisSub: STATIC_FRAMING.thesisSub,
  liveReadout: STATIC_FRAMING.liveReadout,
  sectionHeadline: STATIC_FRAMING.sectionHeadline,
  sectionAside: `En este ciclo ${notionDigest.publicationsAdded} publicaciones nuevas pasaron el filtro de frescura y tier. Los hallazgos seleccionados cubren los vectores ${notionDigest.vectorsCovered.map((v) => v.toUpperCase()).join(', ')}.`,
  digestHeadline: notionDigest.mostImportantDelta,
  findings: STATIC_FRAMING.findings,
  callout: STATIC_FRAMING.callout,
};

export const citedPublications = notionDigest.citedPublications;

// ---------- static editorial content ----------

export const flagshipReport: FlagshipReport = {
  issueLabel: 'The Bridge · Report Nº 01',
  coverTitleTop: 'De la clase',
  coverTitleEm: 'al deploy.',
  meta: { date: 'Abril 2026', pages: '68pp · ES / EN' },
  sectionNum: '01',
  sectionLabel: 'Reporte insignia',
  headline:
    'Cómo 1.200 alumnos aplicaron IA en sus empresas en los primeros 90 días tras el bootcamp.',
  authors: 'Diego García, Laura Fernández, Pere Santamaría',
  abstract:
    'Medimos la ratio TRAIN → PRACTICE → APPLY en 14 cohortes corporate de 2025. El 58% de los participantes desplegó al menos una solución IA en producción dentro del primer trimestre, con un impacto medio declarado de 4,2h recuperadas por semana y caso.',
  tags: [
    { label: 'V3 · AI Impact', vector: 'v3' },
    { label: 'V4 · Training', vector: 'v4' },
    { label: 'Corporate · B2B' },
  ],
};

export const reportCards: ReportCard[] = [
  {
    date: 'Feb 2026',
    title: 'Mapa de habilidades IA en PYMES españolas',
    abstract: 'Encuesta a 340 PYMES sobre qué tareas han automatizado y qué skills les faltan.',
    pages: '24pp',
  },
  {
    date: 'Dic 2025',
    title: 'El puesto que no existía en 2023: AI Integrator',
    abstract: 'Perfil, cohortes observadas y trayectoria salarial del rol emergente.',
    pages: '18pp',
  },
  {
    date: 'Oct 2025',
    title: 'Mujeres en tech: 3 años de cohortes Bridge',
    abstract: 'Conversión, retención y brecha salarial medida en 820 alumnas.',
    pages: '32pp',
  },
  {
    date: 'Próximo · Q3 2026',
    title: 'Copilotos internos: auditoría de 40 agentes en producción',
    abstract:
      'Qué agentes sobreviven al primer trimestre y por qué — casos con Nuvolar, Santander y otros.',
    comingSoon: true,
    state: 'Coming soon',
  },
  {
    date: 'Próximo · Q4 2026',
    title: 'Anuario Bridge 2026 — empleo tech post-IA',
    abstract: 'Resumen anual del estado del mercado con los 4 vectores y 10 tesis.',
    comingSoon: true,
    state: 'Coming soon',
  },
  {
    date: 'En curso',
    title: 'Propón un tema',
    abstract:
      'Si trabajas en HR, L&D o estrategia y tienes una pregunta que no se responde — escríbenos.',
    comingSoon: true,
    state: 'Corporate partners',
  },
];

export const methodSteps: MethodStep[] = [
  { n: '01', title: 'Ingesta', sub: 'Web scraping + RSS + búsqueda semántica en 42 fuentes vigiladas.', cadence: 'Diario' },
  { n: '02', title: 'Filtro de frescura', sub: 'Descartamos lo publicado hace más de 15 días salvo datos de referencia.', cadence: 'Auto' },
  { n: '03', title: 'Tiering A / B / C', sub: 'A: datos primarios de un publisher oficial. B: análisis de think-tank / big4. C: opinión.', cadence: 'Editorial' },
  { n: '04', title: 'Clasificación por vector', sub: 'Cada publicación etiquetada V1–V4 y con country scope multi.', cadence: 'Editorial' },
  { n: '05', title: 'Síntesis quincenal', sub: 'Una tesis dominante, tres hallazgos citados, un “so what” accionable.', cadence: 'Quincenal' },
  { n: '06', title: 'Publicación', sub: 'Notion → ISR en 15min → email a suscriptores.', cadence: 'Quincenal' },
];

export const libraryMeta = {
  total: publications.length,
  addedThisCycle: notionDigest.publicationsAdded,
  page: 1,
  totalPages: Math.max(1, Math.ceil(publications.length / 10)),
  showing: `1–${Math.min(10, publications.length)} de ${publications.length}`,
};
