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
  Publication,
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
): BiweeklyNotionData {
  const p = page.properties;
  const citedIds = relationIds(p, 'Publications Cited');
  const citedPublications = citedIds
    .map((id) => pubsById.get(id))
    .filter((x): x is Publication => Boolean(x))
    .map((pub) => ({ title: pub.title, ...(pub.url ? { url: pub.url } : {}) }));

  return {
    issue,
    cycleDate: title(p, 'Cycle Date'),
    digestSummary: richText(p, 'Digest Summary'),
    mostImportantDelta: richText(p, 'Most Important Delta'),
    publicationsAdded: numberProp(p, 'Publications Added'),
    vectorsCovered: requiredMultiSelect(p, 'Vectors Covered').map((v) =>
      toVector(v, 'Biweekly.Vectors Covered'),
    ),
    citedPublications,
  };
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

  return mapBiweekly(
    published[0] as unknown as { properties: NotionProperties },
    published.length,
    pubsById,
  );
}
