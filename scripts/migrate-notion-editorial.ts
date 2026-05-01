/**
 * One-off migration: extend the Notion workspace so editorial content
 * (thesis, live readout, callout, findings) can live in Notion instead of
 * STATIC_FRAMING.
 *
 * Steps (each is idempotent — re-running is safe):
 *   1. Create the Findings DB as a sibling of the Biweekly DB so it inherits
 *      integration access. Skip if a DB titled "Findings" already exists
 *      under the same parent page.
 *   2. Add 8 rich_text columns + Findings (relation) to the Biweekly DB.
 *      Skip columns that already exist.
 *   3. Create 3 Finding pages (V1/V2/V3) seeded from src/data STATIC_FRAMING.
 *      Skip if pages with matching Title already exist.
 *   4. Patch the latest Published Biweekly row with thesis/live/callout
 *      content and link the 3 findings via relation. Skip fields that are
 *      already non-empty.
 *
 * Run:
 *   set -a; source .env; set +a; pnpm exec tsx scripts/migrate-notion-editorial.ts
 */

import { Client } from '@notionhq/client';

const FINDINGS_DB_TITLE = 'Findings';

// ----- editorial seed (must match src/data/index.ts STATIC_FRAMING) -----

const SEED = {
  thesisHeadline: [
    { text: 'El empleo tech ya no sube en bloque.' },
    { br: true },
    { text: 'Se ' },
    { text: 'bifurca', bold: true },
    { text: ' por ' },
    { text: 'exposición a la IA', underline: true },
    { text: '.' },
  ],
  liveReadout: {
    label: 'Última lectura',
    value: 'IA en el payroll EE.UU.',
    valueAccent: '−16k empleos/mes',
    source: 'Goldman Sachs · How will AI affect the US labor market, abril 2026',
  },
  callout: {
    tag: 'So what para Bridge',
    text: 'Cuatro fuentes Tier A convergen este ciclo — Goldman, BCG, McKinsey e Indeed: el daño se concentra en juniors y tareas substituibles, no en seniors AI-augmentados. Nuestro bootcamp V4 (Apply) entrena exactamente la unidad que crece.',
    linkLabel: 'Ver full state',
  },
  findings: [
    {
      titleKey: 'Q2-V1 Empleo concentrado en 4 países',
      vector: 'V1 Demand',
      stat: '+9',
      statUnit: 'pp YoY',
      finding:
        'Net Employment Outlook sube por cuarto trimestre consecutivo, pero concentrado en 4 países.',
      body:
        'EE.UU., India, Países Bajos y España tiran del indicador global. España aporta +34pp, su lectura más alta desde 2022. El resto de Europa se mueve en banda plana.',
      sourceLabel: 'ManpowerGroup — Employment Outlook Survey Q2 2026',
    },
    {
      titleKey: 'Q2-V2 Premium IA +21%',
      vector: 'V2 Salaries',
      stat: '+21',
      statUnit: '% premium',
      finding:
        'Los roles con competencias IA pagan un 21% más que los equivalentes sin IA en 2025.',
      body:
        'El premium creció 3 puntos respecto a 2024. Más marcado en operaciones, marketing y finanzas que en ingeniería, donde el baseline ya era alto.',
      sourceLabel: 'PwC — AI Jobs Barometer 2026',
    },
    {
      titleKey: 'Q2-V3 BCG 50–55% reshape',
      vector: 'V3 AI Impact',
      stat: '50–55',
      statUnit: '% empleos',
      finding:
        'BCG cuantifica el techo del “reshape vs. replace”: 50–55% de los empleos en EE.UU. serán reconfigurados por la IA en 2–3 años.',
      body:
        'Solo 10–15% serán eliminados a 5 años. Triangula con Goldman Sachs (−16k empleos/mes en EE.UU.) y McKinsey (uso IA en el trabajo 30%→76%): el efecto agregado es real pero pequeño; lo que predomina es la reconfiguración del puesto, no su sustitución.',
      sourceLabel: 'BCG — AI Will Reshape More Jobs Than It Replaces, abril 2026',
    },
  ],
};

// ----- helpers -----

const c = new Client({ auth: process.env.NOTION_TOKEN });

function rt(text: string, opts: { bold?: boolean; underline?: boolean } = {}) {
  return [{
    type: 'text' as const,
    text: { content: text },
    annotations: {
      bold: !!opts.bold,
      italic: false,
      strikethrough: false,
      underline: !!opts.underline,
      code: false,
      color: 'default' as const,
    },
  }];
}

function plain(text: string) {
  return rt(text);
}

function thesisToRichText(nodes: typeof SEED.thesisHeadline) {
  // Notion rich_text allows '\n' inside a single text run. We coalesce
  // br nodes by appending '\n' to the previous run's text.
  const out: any[] = [];
  for (const n of nodes) {
    if ((n as any).br) {
      const last = out[out.length - 1];
      if (last) last.text.content += '\n';
      else out.push(...rt('\n'));
      continue;
    }
    const tn = n as { text: string; bold?: boolean; underline?: boolean };
    out.push(...rt(tn.text, { bold: tn.bold, underline: tn.underline }));
  }
  return out;
}

async function findChildDb(parentPageId: string, title: string): Promise<string | null> {
  // Notion's search by parent isn't first-class; we use search and filter.
  const resp: any = await c.search({
    query: title,
    filter: { property: 'object', value: 'database' },
  });
  for (const r of resp.results) {
    if (r.object !== 'database') continue;
    if (r.parent?.page_id?.replace(/-/g, '') !== parentPageId.replace(/-/g, '')) continue;
    const dbTitle = r.title?.[0]?.plain_text;
    if (dbTitle === title) return r.id;
  }
  return null;
}

// ----- step 1: create Findings DB -----

async function ensureFindingsDb(parentPageId: string): Promise<string> {
  const existing = await findChildDb(parentPageId, FINDINGS_DB_TITLE);
  if (existing) {
    console.log(`  · Findings DB already exists: ${existing}`);
    return existing;
  }
  const db: any = await c.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: FINDINGS_DB_TITLE } }],
    properties: {
      Title: { title: {} },
      Vector: {
        select: {
          options: [
            { name: 'V1 Demand', color: 'blue' },
            { name: 'V2 Salaries', color: 'green' },
            { name: 'V3 AI Impact', color: 'orange' },
            { name: 'V4 Training', color: 'purple' },
          ],
        },
      },
      Stat: { rich_text: {} },
      'Stat Unit': { rich_text: {} },
      Finding: { rich_text: {} },
      Body: { rich_text: {} },
      'Source Label': { rich_text: {} },
      'Source URL': { url: {} },
    },
  });
  console.log(`  ✓ Created Findings DB: ${db.id}`);
  return db.id;
}

// ----- step 2: extend Biweekly schema -----

async function extendBiweeklySchema(biweeklyDbId: string, findingsDbId: string) {
  const db: any = await c.databases.retrieve({ database_id: biweeklyDbId });
  const existing = new Set(Object.keys(db.properties));

  const newProps: Record<string, any> = {};
  const richCols = [
    'Thesis Headline',
    'Live Readout Label',
    'Live Readout Value',
    'Live Readout Value Accent',
    'Live Readout Source',
    'Callout Tag',
    'Callout Text',
    'Callout Link Label',
  ];
  for (const name of richCols) {
    if (!existing.has(name)) newProps[name] = { rich_text: {} };
  }
  if (!existing.has('Findings')) {
    newProps['Findings'] = {
      relation: {
        database_id: findingsDbId,
        type: 'single_property',
        single_property: {},
      },
    };
  }
  if (Object.keys(newProps).length === 0) {
    console.log('  · Biweekly schema already extended, nothing to add');
    return;
  }
  await c.databases.update({ database_id: biweeklyDbId, properties: newProps });
  console.log(`  ✓ Added to Biweekly: ${Object.keys(newProps).join(', ')}`);
}

// ----- step 3: create Finding pages -----

async function ensureFindingPages(findingsDbId: string): Promise<string[]> {
  const out: string[] = [];
  for (const f of SEED.findings) {
    const search: any = await c.databases.query({
      database_id: findingsDbId,
      filter: { property: 'Title', title: { equals: f.titleKey } },
    });
    if (search.results.length > 0) {
      console.log(`  · Finding "${f.titleKey}" exists`);
      out.push(search.results[0].id);
      continue;
    }
    const page: any = await c.pages.create({
      parent: { type: 'database_id', database_id: findingsDbId },
      properties: {
        Title: { title: plain(f.titleKey) },
        Vector: { select: { name: f.vector } },
        Stat: { rich_text: plain(f.stat) },
        'Stat Unit': { rich_text: plain(f.statUnit) },
        Finding: { rich_text: plain(f.finding) },
        Body: { rich_text: plain(f.body) },
        'Source Label': { rich_text: plain(f.sourceLabel) },
      },
    });
    console.log(`  ✓ Created finding "${f.titleKey}" → ${page.id}`);
    out.push(page.id);
  }
  return out;
}

// ----- step 4: patch latest Biweekly row -----

async function patchLatestBiweekly(biweeklyDbId: string, findingIds: string[]) {
  const resp: any = await c.databases.query({
    database_id: biweeklyDbId,
    filter: { property: 'Status', select: { equals: 'Published' } },
    sorts: [{ property: 'Cycle Date', direction: 'descending' }],
    page_size: 1,
  });
  if (resp.results.length === 0) {
    console.warn('  ! No Published row to patch');
    return;
  }
  const row = resp.results[0];
  const props = row.properties;

  const isEmpty = (name: string) => {
    const p = props[name];
    if (!p) return true;
    if (p.rich_text) return p.rich_text.length === 0;
    if (p.relation) return p.relation.length === 0;
    return false;
  };

  const update: Record<string, any> = {};
  if (isEmpty('Thesis Headline')) update['Thesis Headline'] = { rich_text: thesisToRichText(SEED.thesisHeadline) };
  if (isEmpty('Live Readout Label')) update['Live Readout Label'] = { rich_text: plain(SEED.liveReadout.label) };
  if (isEmpty('Live Readout Value')) update['Live Readout Value'] = { rich_text: plain(SEED.liveReadout.value) };
  if (isEmpty('Live Readout Value Accent')) update['Live Readout Value Accent'] = { rich_text: plain(SEED.liveReadout.valueAccent) };
  if (isEmpty('Live Readout Source')) update['Live Readout Source'] = { rich_text: plain(SEED.liveReadout.source) };
  if (isEmpty('Callout Tag')) update['Callout Tag'] = { rich_text: plain(SEED.callout.tag) };
  if (isEmpty('Callout Text')) update['Callout Text'] = { rich_text: plain(SEED.callout.text) };
  if (isEmpty('Callout Link Label')) update['Callout Link Label'] = { rich_text: plain(SEED.callout.linkLabel) };
  if (isEmpty('Findings')) update['Findings'] = { relation: findingIds.map((id) => ({ id })) };

  if (Object.keys(update).length === 0) {
    console.log(`  · Latest row ${row.id} already populated`);
    return;
  }
  await c.pages.update({ page_id: row.id, properties: update });
  console.log(`  ✓ Patched ${row.id}: ${Object.keys(update).join(', ')}`);
}

// ----- main -----

async function main() {
  const biweeklyDbId = process.env.NOTION_BIWEEKLY_DB_ID!;
  if (!process.env.NOTION_TOKEN || !biweeklyDbId) {
    throw new Error('NOTION_TOKEN and NOTION_BIWEEKLY_DB_ID required');
  }
  const db: any = await c.databases.retrieve({ database_id: biweeklyDbId });
  const parentPageId = db.parent?.page_id;
  if (!parentPageId) throw new Error('Biweekly DB parent is not a page');
  console.log(`Biweekly parent page: ${parentPageId}`);

  console.log('\n[1/4] Ensure Findings DB');
  const findingsDbId = await ensureFindingsDb(parentPageId);

  console.log('\n[2/4] Extend Biweekly schema');
  await extendBiweeklySchema(biweeklyDbId, findingsDbId);

  console.log('\n[3/4] Ensure Finding pages');
  const findingIds = await ensureFindingPages(findingsDbId);

  console.log('\n[4/4] Patch latest Biweekly row');
  await patchLatestBiweekly(biweeklyDbId, findingIds);

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
