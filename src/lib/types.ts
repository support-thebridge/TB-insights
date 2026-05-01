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
  /**
   * Slug of the source Publication's title, when the Finding's `Publication`
   * relation in Notion resolves to a row in the live Publications DB. The
   * digest card renders an in-page anchor `#pub-<slug>` and the library row
   * carries the matching id. Absent when the finding has no relation set or
   * the relation points at an unknown publication.
   */
  sourcePubSlug?: string;
}

/**
 * Inline rich-text node for the hero H1. Maps Notion annotations:
 *   bold      → em (red accent, .em class)
 *   underline → u  (mint underline, .u class)
 * `\n` in Notion plain_text becomes a separate `{ type: 'br' }` node.
 */
export type ThesisNode =
  | { type: 'text'; text: string; em?: boolean; u?: boolean }
  | { type: 'br' };

export interface LiveReadout {
  label: string;
  value: string;
  valueAccent?: string;
  source: string;
}

export interface Callout {
  tag: string;
  text: string;
  linkLabel: string;
  linkUrl?: string;
}

export interface BiweeklyDigest {
  issue: number;
  dateLabel: string;
  thesisHeadline: ThesisNode[];
  thesisSub: string;
  liveReadout: LiveReadout;
  sectionHeadline: string;
  sectionAside: string;
  digestHeadline: string;
  findings: [DigestFinding, DigestFinding, DigestFinding];
  callout: Callout;
}

/**
 * Narrow shape of what Notion actually provides for one Biweekly cycle.
 * Composed with static editorial framing in `src/data/index.ts` to produce a
 * full `BiweeklyDigest` for components.
 *
 * The optional `editorial` block carries fields that recently moved from
 * STATIC_FRAMING into Notion. Any field absent in Notion falls back to
 * STATIC_FRAMING per-field at compose time.
 */
export interface BiweeklyNotionData {
  issue: number;
  cycleDate: string;
  digestSummary: string;
  mostImportantDelta: string;
  publicationsAdded: number;
  vectorsCovered: VectorKey[];
  citedPublications: Array<{ title: string; url?: string }>;
  editorial?: {
    thesisHeadline?: ThesisNode[];
    liveReadout?: Partial<LiveReadout>;
    callout?: Partial<Callout>;
    findings?: DigestFinding[];
  };
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
