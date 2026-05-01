/**
 * Notion client for build-time fetching.
 *
 * Matches the live "Tech Labor Market Tracker" workspace schema.
 *
 * Publications DB — columns consumed:
 *   Title             (title)
 *   Publisher         (select)
 *   Publication Date  (date)
 *   Vector            (multi_select: "V1 Demand" | "V2 Salaries" | "V3 AI Impact" | "V4 Training")
 *   Country Scope     (multi_select: free-form country labels)
 *   Tier              (select: A | B | C)
 *   URL               (url, optional)
 *   PDF URL           (url, optional — presence ⇒ pdf button enabled)
 *
 * Biweekly DB — columns consumed:
 *   Cycle Date           (title — ISO date string like "2026-04-17")
 *   Digest Summary       (rich_text — bullet list)
 *   Most Important Delta (rich_text — narrative paragraph)
 *   Vectors Covered      (multi_select: same labels as Publications.Vector)
 *   Publications Cited   (relation → Publications DB)
 *   Publications Added   (number)
 *   Status               (select: Draft | Published | Superseded)
 *
 * Editorial prose (thesis, findings, callout, framing) is NOT in Notion today
 * and lives in `src/data/index.ts`. See INSIGHTS_BRIEF.md §2.
 *
 * Property readers throw with the missing column name on first encounter —
 * noisy build beats silent shape drift.
 */

import { Client } from '@notionhq/client';
import type {
  BiweeklyNotionData,
  Callout,
  DigestFinding,
  LiveReadout,
  Publication,
  ThesisNode,
  Tier,
  VectorKey,
} from './types';

type NotionProperty = Record<string, unknown>;
type NotionProperties = Record<string, NotionProperty>;

let _client: Client | null = null;
function client(): Client {
  if (!_client) {
    const auth = process.env.NOTION_TOKEN;
    if (!auth) throw new Error('NOTION_TOKEN is required to query Notion');
    _client = new Client({ auth });
  }
  return _client;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

// ---------- property helpers ----------

function prop(props: NotionProperties, name: string): NotionProperty {
  const p = props[name];
  if (!p) throw new Error(`Missing Notion property: "${name}"`);
  return p;
}

function richTextToString(nodes: unknown): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((n: any) => (typeof n?.plain_text === 'string' ? n.plain_text : ''))
    .join('');
}

function title(props: NotionProperties, name: string): string {
  const p = prop(props, name) as { title?: unknown };
  const s = richTextToString(p.title).trim();
  if (!s) throw new Error(`Notion property "${name}" (title) is empty`);
  return s;
}

function richText(props: NotionProperties, name: string, required = true): string {
  const p = prop(props, name) as { rich_text?: unknown };
  const s = richTextToString(p.rich_text).trim();
  if (!s && required) throw new Error(`Notion property "${name}" (rich_text) is empty`);
  return s;
}

/**
 * Optional rich-text reader. Returns undefined when the column is missing or
 * empty — never throws. Use for columns that may not yet exist in the schema.
 */
function richTextOptional(props: NotionProperties, name: string): string | undefined {
  const p = props[name] as { rich_text?: unknown } | undefined;
  if (!p) return undefined;
  const s = richTextToString(p.rich_text).trim();
  return s || undefined;
}

/**
 * Map a Notion rich_text array into ThesisNode[] runs. Splits plain_text on
 * `\n` to emit explicit `{ type: 'br' }` nodes. Returns undefined when the
 * column is missing or empty.
 *
 * Annotation mapping: bold → em, underline → u. Other annotations (italic,
 * strikethrough, code, color) are ignored — the H1 is intentionally minimal.
 */
function richTextNodesOptional(
  props: NotionProperties,
  name: string,
): ThesisNode[] | undefined {
  const p = props[name] as { rich_text?: unknown } | undefined;
  if (!p || !Array.isArray(p.rich_text)) return undefined;
  const out: ThesisNode[] = [];
  for (const node of p.rich_text as Array<any>) {
    const raw: string = typeof node?.plain_text === 'string' ? node.plain_text : '';
    if (!raw) continue;
    const ann = node.annotations ?? {};
    const em = Boolean(ann.bold);
    const u = Boolean(ann.underline);
    const segments = raw.split('\n');
    segments.forEach((seg, i) => {
      if (seg) {
        const run: ThesisNode = { type: 'text', text: seg };
        if (em) (run as any).em = true;
        if (u) (run as any).u = true;
        out.push(run);
      }
      if (i < segments.length - 1) out.push({ type: 'br' });
    });
  }
  if (out.length === 0) return undefined;
  return out;
}

function dateProp(props: NotionProperties, name: string): string {
  const p = prop(props, name) as { date?: { start?: string | null } | null };
  const start = p.date?.start;
  if (!start) throw new Error(`Notion property "${name}" (date) is empty`);
  return start;
}

function numberProp(props: NotionProperties, name: string): number {
  const p = prop(props, name) as { number?: number | null };
  if (p.number == null) throw new Error(`Notion property "${name}" (number) is empty`);
  return p.number;
}

function multiSelect(props: NotionProperties, name: string): string[] {
  const p = prop(props, name) as { multi_select?: Array<{ name: string }> };
  return (p.multi_select ?? []).map((o) => o.name).filter(Boolean);
}

function requiredMultiSelect(props: NotionProperties, name: string): string[] {
  const vals = multiSelect(props, name);
  if (vals.length === 0) throw new Error(`Notion property "${name}" (multi_select) is empty`);
  return vals;
}

function select(props: NotionProperties, name: string): string {
  const p = prop(props, name) as { select?: { name: string } | null };
  const v = p.select?.name;
  if (!v) throw new Error(`Notion property "${name}" (select) is empty`);
  return v;
}

function selectOptional(props: NotionProperties, name: string): string | undefined {
  const p = props[name] as { select?: { name: string } | null } | undefined;
  return p?.select?.name || undefined;
}

function urlProp(props: NotionProperties, name: string): string | undefined {
  const p = props[name] as { url?: string | null } | undefined;
  if (!p) return undefined;
  return p.url || undefined;
}

function relationIds(props: NotionProperties, name: string): string[] {
  const p = prop(props, name) as { relation?: Array<{ id: string }> };
  return (p.relation ?? []).map((r) => r.id);
}

// ---------- normalization ----------

function toVector(raw: string, ctx: string): VectorKey {
  // Notion stores "V1 Demand" / "V2 Salaries" / etc. We keep lowercase short keys.
  const head = raw.trim().slice(0, 2).toLowerCase();
  if (head === 'v1' || head === 'v2' || head === 'v3' || head === 'v4') return head;
  throw new Error(`${ctx}: unexpected vector "${raw}", want V1..V4`);
}

function toTier(s: string): Tier {
  const v = s.toUpperCase();
  if (v === 'A' || v === 'B' || v === 'C') return v;
  throw new Error(`Tier: unexpected value "${s}", want A|B|C`);
}

// ---------- mappers ----------

function mapPublication(page: { properties: NotionProperties }): Publication {
  const p = page.properties;
  const pdfUrl = urlProp(p, 'PDF URL');
  return {
    title: title(p, 'Title'),
    publisher: select(p, 'Publisher'),
    date: dateProp(p, 'Publication Date'),
    vectors: requiredMultiSelect(p, 'Vector').map((v) => toVector(v, 'Publications.Vector')),
    country: requiredMultiSelect(p, 'Country Scope'),
    tier: toTier(select(p, 'Tier')),
    url: urlProp(p, 'URL'),
    ...(pdfUrl ? { pdfUrl } : {}),
    pdf: Boolean(pdfUrl),
  };
}

function mapBiweekly(
  page: { properties: NotionProperties },
  issue: number,
  pubsById: Map<string, Publication>,
): { data: BiweeklyNotionData; findingIds: string[] } {
  const p = page.properties;
  const citedIds = relationIds(p, 'Publications Cited');
  const citedPublications = citedIds
    .map((id) => pubsById.get(id))
    .filter((x): x is Publication => Boolean(x))
    .map((pub) => ({ title: pub.title, ...(pub.url ? { url: pub.url } : {}) }));

  // Optional editorial fields. The Biweekly DB columns below were added after
  // the original schema; any may be absent in older rows or in new workspaces.
  const thesisHeadline = richTextNodesOptional(p, 'Thesis Headline');
  const liveLabel = richTextOptional(p, 'Live Readout Label');
  const liveValue = richTextOptional(p, 'Live Readout Value');
  const liveAccent = richTextOptional(p, 'Live Readout Value Accent');
  const liveSource = richTextOptional(p, 'Live Readout Source');
  const calloutTag = richTextOptional(p, 'Callout Tag');
  const calloutText = richTextOptional(p, 'Callout Text');
  const calloutLink = richTextOptional(p, 'Callout Link Label');

  const liveReadout: Partial<LiveReadout> = {};
  if (liveLabel) liveReadout.label = liveLabel;
  if (liveValue) liveReadout.value = liveValue;
  if (liveAccent) liveReadout.valueAccent = liveAccent;
  if (liveSource) liveReadout.source = liveSource;

  const callout: Partial<Callout> = {};
  if (calloutTag) callout.tag = calloutTag;
  if (calloutText) callout.text = calloutText;
  if (calloutLink) callout.linkLabel = calloutLink;

  const editorial: NonNullable<BiweeklyNotionData['editorial']> = {};
  if (thesisHeadline) editorial.thesisHeadline = thesisHeadline;
  if (Object.keys(liveReadout).length > 0) editorial.liveReadout = liveReadout;
  if (Object.keys(callout).length > 0) editorial.callout = callout;

  // Findings is a relation to a separate DB; both the column and that DB are
  // optional. Resolution happens after mapBiweekly so it can be async.
  const findingsProp = p['Findings'] as { relation?: Array<{ id: string }> } | undefined;
  const findingIds = (findingsProp?.relation ?? []).map((r) => r.id);

  return {
    data: {
      issue,
      cycleDate: title(p, 'Cycle Date'),
      digestSummary: richText(p, 'Digest Summary'),
      mostImportantDelta: richText(p, 'Most Important Delta'),
      publicationsAdded: numberProp(p, 'Publications Added'),
      vectorsCovered: requiredMultiSelect(p, 'Vectors Covered').map((v) =>
        toVector(v, 'Biweekly.Vectors Covered'),
      ),
      citedPublications,
      ...(Object.keys(editorial).length > 0 ? { editorial } : {}),
    },
    findingIds,
  };
}

/**
 * Resolve Finding pages by ID in the order given. Skips IDs that fail to
 * retrieve or that lack the expected properties — partial findings drop the
 * whole set later (composer falls back to STATIC_FRAMING when length ≠ 3).
 */
async function fetchFindingsByIds(ids: string[]): Promise<DigestFinding[]> {
  if (ids.length === 0) return [];
  const out: DigestFinding[] = [];
  for (const id of ids) {
    let page: any;
    try {
      page = await client().pages.retrieve({ page_id: id });
    } catch (err) {
      console.warn(`  ! Findings: failed to retrieve ${id}: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    if (!page || !('properties' in page)) continue;
    const p = page.properties as NotionProperties;
    const vectorRaw = selectOptional(p, 'Vector');
    const stat = richTextOptional(p, 'Stat');
    const statUnit = richTextOptional(p, 'Stat Unit');
    const finding = richTextOptional(p, 'Finding');
    const body = richTextOptional(p, 'Body');
    const sourceLabel = richTextOptional(p, 'Source Label');
    const sourceUrl = urlProp(p, 'Source URL');

    if (!vectorRaw || !stat || !statUnit || !finding || !body || !sourceLabel) {
      console.warn(`  ! Findings: page ${id} is missing required fields, skipping`);
      continue;
    }
    out.push({
      vector: toVector(vectorRaw, 'Findings.Vector'),
      stat,
      statUnit,
      finding,
      body,
      sourceLabel,
      ...(sourceUrl ? { sourceUrl } : {}),
    });
  }
  return out;
}

// ---------- public API ----------

export interface PublicationsResult {
  items: Publication[];
  byId: Map<string, Publication>;
}

export async function fetchPublications(): Promise<PublicationsResult> {
  const databaseId = requireEnv('NOTION_PUBLICATIONS_DB_ID');
  const items: Publication[] = [];
  const byId = new Map<string, Publication>();
  let cursor: string | undefined;
  do {
    const resp: any = await client().databases.query({
      database_id: databaseId,
      start_cursor: cursor,
      sorts: [{ property: 'Publication Date', direction: 'descending' }],
      page_size: 100,
    });
    for (const page of resp.results) {
      if ('properties' in page) {
        const pub = mapPublication(page as unknown as { properties: NotionProperties });
        items.push(pub);
        byId.set(page.id, pub);
      }
    }
    cursor = resp.has_more ? resp.next_cursor ?? undefined : undefined;
  } while (cursor);
  return { items, byId };
}

export async function fetchLatestBiweekly(
  pubsById: Map<string, Publication>,
): Promise<BiweeklyNotionData> {
  const databaseId = requireEnv('NOTION_BIWEEKLY_DB_ID');

  // Only Published rows count as issues. Fetch once, use the list for both
  // "latest" selection and the issue number (count of Published rows).
  const resp: any = await client().databases.query({
    database_id: databaseId,
    filter: {
      property: 'Status',
      select: { equals: 'Published' },
    },
    sorts: [{ property: 'Cycle Date', direction: 'descending' }],
    page_size: 100,
  });

  const published = resp.results.filter((r: any) => 'properties' in r);
  if (published.length === 0) {
    throw new Error('Biweekly DB has no rows with Status = Published');
  }

  const { data, findingIds } = mapBiweekly(
    published[0] as unknown as { properties: NotionProperties },
    published.length,
    pubsById,
  );

  if (findingIds.length > 0) {
    const findings = await fetchFindingsByIds(findingIds);
    if (findings.length > 0) {
      data.editorial = { ...(data.editorial ?? {}), findings };
    }
  }

  return data;
}
