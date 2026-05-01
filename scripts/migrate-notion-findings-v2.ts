/**
 * One-off migration v2: link Findings → Publications.
 *
 * Steps (idempotent — safe to re-run):
 *   1. Add `Publication` (single relation → Publications) to the Findings DB.
 *   2. Discover real publication IDs in the Publications DB by title prefix.
 *   3. Rewrite the 3 finding pages on the latest Biweekly cycle with content
 *      anchored on real publications: V1 Indeed, V3 Goldman, V4 NBER.
 *      The pages are updated in place (same IDs already linked from Biweekly).
 *
 * Run:
 *   set -a; source .env; set +a; pnpm exec tsx scripts/migrate-notion-findings-v2.ts
 */

import { Client } from '@notionhq/client';

const c = new Client({ auth: process.env.NOTION_TOKEN });

function plain(text: string) {
  return [{ type: 'text' as const, text: { content: text } }];
}

interface FindingSpec {
  vector: string;
  stat: string;
  statUnit: string;
  finding: string;
  body: string;
  sourceLabel: string;
  /** A unique substring that appears in the matching publication's Title. */
  pubTitleMatch: string;
}

const SPECS: FindingSpec[] = [
  {
    vector: 'V1 Demand',
    stat: 'post-2021',
    statUnit: 'normalización',
    finding:
      'La debilidad del mercado tech es resaca pandémica, no sustitución por IA.',
    body:
      'Indeed Hiring Lab muestra que el enfriamiento del empleo se explica por la regresión a la media tras el boom 2021, no por reemplazo IA. La línea baja vuelve a la tendencia de 2019, no por debajo.',
    sourceLabel: 'Indeed Hiring Lab — What Goes Up, Must Come Down, abril 2026',
    pubTitleMatch: 'What Goes Up, Must Come Down',
  },
  {
    vector: 'V3 AI Impact',
    stat: '−16k',
    statUnit: 'empleos/mes',
    finding:
      'Goldman cuantifica por primera vez el efecto agregado de la IA en el payroll EE.UU.',
    body:
      'Sustracción de ~16.000 empleos/mes y +0,1pp en la tasa de paro. Morgan Stanley confirma ~10bp por vía independiente. Efecto real, magnitud pequeña — la narrativa de “colapso por IA” no se sostiene.',
    sourceLabel: 'Goldman Sachs — How Will AI Affect the US Labor Market, abril 2026',
    pubTitleMatch: 'How Will AI Affect the US Labor Market',
  },
  {
    vector: 'V4 Training',
    stat: '6,1M',
    statUnit: 'trabajadores',
    finding:
      '6,1M trabajadores EE.UU. (4,2%) combinan alta exposición a IA y baja capacidad adaptativa.',
    body:
      'Concentrados en perfiles clerical, ~86% mujeres, ciudades pequeñas. El reshape tiene víctimas concretas — y son exactamente los perfiles que un programa de reentrenamiento dirigido podría capturar.',
    sourceLabel: 'NBER WP 34705 — Manning & Aguirre, abril 2026',
    pubTitleMatch: 'How Adaptable Are American Workers',
  },
];

async function findFindingsDb(parentPageId: string): Promise<string> {
  const resp: any = await c.search({
    query: 'Findings',
    filter: { property: 'object', value: 'database' },
  });
  for (const r of resp.results) {
    if (r.object !== 'database') continue;
    if (r.parent?.page_id?.replace(/-/g, '') !== parentPageId.replace(/-/g, '')) continue;
    if (r.title?.[0]?.plain_text === 'Findings') return r.id;
  }
  throw new Error('Findings DB not found under Biweekly parent');
}

async function ensurePublicationRelation(
  findingsDbId: string,
  publicationsDbId: string,
): Promise<void> {
  const db: any = await c.databases.retrieve({ database_id: findingsDbId });
  if (db.properties['Publication']) {
    console.log('  · Publication relation already exists on Findings');
    return;
  }
  await c.databases.update({
    database_id: findingsDbId,
    properties: {
      Publication: {
        relation: {
          database_id: publicationsDbId,
          type: 'single_property',
          single_property: {},
        },
      },
    },
  });
  console.log('  ✓ Added Publication relation to Findings');
}

async function findPubByTitleMatch(
  publicationsDbId: string,
  match: string,
): Promise<string> {
  const resp: any = await c.databases.query({
    database_id: publicationsDbId,
    filter: { property: 'Title', title: { contains: match } },
    page_size: 5,
  });
  if (resp.results.length === 0) {
    throw new Error(`No publication matches "${match}"`);
  }
  if (resp.results.length > 1) {
    console.warn(`  ! "${match}" matched ${resp.results.length} pubs, using first`);
  }
  return resp.results[0].id;
}

async function getLinkedFindingIds(biweeklyDbId: string): Promise<string[]> {
  const resp: any = await c.databases.query({
    database_id: biweeklyDbId,
    filter: { property: 'Status', select: { equals: 'Published' } },
    sorts: [{ property: 'Cycle Date', direction: 'descending' }],
    page_size: 1,
  });
  if (resp.results.length === 0) throw new Error('No published Biweekly row');
  const row = resp.results[0];
  const rel = row.properties['Findings']?.relation ?? [];
  return rel.map((r: any) => r.id);
}

async function rewriteFinding(
  pageId: string,
  spec: FindingSpec,
  publicationId: string,
): Promise<void> {
  const titleKey = `Q2-${spec.vector.split(' ')[0]} ${spec.pubTitleMatch.slice(0, 40)}`;
  await c.pages.update({
    page_id: pageId,
    properties: {
      Title: { title: plain(titleKey) },
      Vector: { select: { name: spec.vector } },
      Stat: { rich_text: plain(spec.stat) },
      'Stat Unit': { rich_text: plain(spec.statUnit) },
      Finding: { rich_text: plain(spec.finding) },
      Body: { rich_text: plain(spec.body) },
      'Source Label': { rich_text: plain(spec.sourceLabel) },
      Publication: { relation: [{ id: publicationId }] },
    },
  });
  console.log(`  ✓ Rewrote ${pageId} → ${spec.vector} (pub ${publicationId})`);
}

async function main() {
  const biweeklyDbId = process.env.NOTION_BIWEEKLY_DB_ID!;
  const publicationsDbId = process.env.NOTION_PUBLICATIONS_DB_ID!;
  if (!process.env.NOTION_TOKEN || !biweeklyDbId || !publicationsDbId) {
    throw new Error('NOTION_TOKEN, NOTION_BIWEEKLY_DB_ID, NOTION_PUBLICATIONS_DB_ID required');
  }
  const bweekly: any = await c.databases.retrieve({ database_id: biweeklyDbId });
  const parentPageId = bweekly.parent?.page_id;
  if (!parentPageId) throw new Error('Biweekly parent missing');

  console.log('[1/3] Locate Findings DB and ensure Publication relation');
  const findingsDbId = await findFindingsDb(parentPageId);
  await ensurePublicationRelation(findingsDbId, publicationsDbId);

  console.log('\n[2/3] Resolve real publication IDs');
  const pubIds: string[] = [];
  for (const s of SPECS) {
    const id = await findPubByTitleMatch(publicationsDbId, s.pubTitleMatch);
    console.log(`  · "${s.pubTitleMatch}" → ${id}`);
    pubIds.push(id);
  }

  console.log('\n[3/3] Rewrite the 3 findings linked from latest Biweekly');
  const findingIds = await getLinkedFindingIds(biweeklyDbId);
  if (findingIds.length !== 3) {
    throw new Error(`Expected 3 linked findings, found ${findingIds.length}`);
  }
  for (let i = 0; i < 3; i++) {
    await rewriteFinding(findingIds[i], SPECS[i], pubIds[i]);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
