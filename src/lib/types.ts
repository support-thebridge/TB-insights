export type VectorKey = 'v1' | 'v2' | 'v3' | 'v4';

export type Tier = 'A' | 'B' | 'C';

export interface Publication {
  title: string;
  publisher: string;
  vectors: VectorKey[];
  country: string[];
  tier: Tier;
  date: string;
  url?: string;
  pdfUrl?: string;
  pdf: boolean;
}

export interface Metric {
  v: VectorKey;
  metric: string;
  unit: 'pp' | '%' | 'USD' | 'M';
  last: number;
  prev: number;
  delta: number;
  unitDelta?: string;
  src: string;
  date: string;
}

export interface DigestFinding {
  vector: VectorKey;
  stat: string;
  statUnit: string;
  finding: string;
  body: string;
  sourceLabel: string;
  sourceUrl?: string;
}

export interface BiweeklyDigest {
  issue: number;
  dateLabel: string;
  thesisHeadline: string;
  thesisSub: string;
  liveReadout: { label: string; value: string; valueAccent?: string; source: string };
  sectionHeadline: string;
  sectionAside: string;
  digestHeadline: string;
  findings: [DigestFinding, DigestFinding, DigestFinding];
  callout: { tag: string; text: string; linkLabel: string; linkUrl?: string };
}

/**
 * Narrow shape of what Notion actually provides for one Biweekly cycle.
 * Composed with static editorial framing in `src/data/index.ts` to produce a
 * full `BiweeklyDigest` for components.
 */
export interface BiweeklyNotionData {
  issue: number;
  cycleDate: string;
  digestSummary: string;
  mostImportantDelta: string;
  publicationsAdded: number;
  vectorsCovered: VectorKey[];
  citedPublications: Array<{ title: string; url?: string }>;
}

export interface FlagshipReport {
  issueLabel: string;
  coverTitleTop: string;
  coverTitleEm: string;
  meta: { date: string; pages: string };
  sectionNum: string;
  sectionLabel: string;
  headline: string;
  authors: string;
  abstract: string;
  tags: Array<{ label: string; vector?: VectorKey }>;
  pdfUrl?: string;
}

export interface ReportCard {
  date: string;
  title: string;
  abstract: string;
  pages?: string;
  pdfUrl?: string;
  comingSoon?: boolean;
  state?: string;
}

export interface MethodStep {
  n: string;
  title: string;
  sub: string;
  cadence: string;
}
