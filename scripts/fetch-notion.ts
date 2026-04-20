/**
 * Prebuild orchestrator. Runs via tsx before `astro dev` and `astro build`.
 *
 * - If NOTION_TOKEN + both DB IDs are present: fetch from Notion.
 * - Otherwise: load scripts/seed.mjs and serialize it.
 *
 * In all cases writes three files:
 *   src/data/publications.json
 *   src/data/latest-digest.json     (BiweeklyNotionData, composed into full digest by src/data/index.ts)
 *   src/data/metrics.json           (always from seed — no Metrics DB yet)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fetchLatestBiweekly, fetchPublications } from '../src/lib/notion.ts';
import { digest as seedDigest, metrics as seedMetrics, publications as seedPublications } from './seed.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../src/data');

async function write(filename: string, data: unknown): Promise<void> {
  const path = resolve(DATA_DIR, filename);
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const count = Array.isArray(data) ? `${data.length} rows` : '1 record';
  console.log(`  ✓ ${filename} (${count})`);
}

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  const token = process.env.NOTION_TOKEN;
  const pubsDb = process.env.NOTION_PUBLICATIONS_DB_ID;
  const biweeklyDb = process.env.NOTION_BIWEEKLY_DB_ID;
  const hasNotion = Boolean(token && pubsDb && biweeklyDb);

  if (hasNotion) {
    console.log('→ Fetching from Notion…');
    const pubs = await fetchPublications();
    const digest = await fetchLatestBiweekly(pubs.byId);
    await write('publications.json', pubs.items);
    await write('latest-digest.json', digest);
    await write('metrics.json', seedMetrics);
  } else {
    const missing = [
      !token && 'NOTION_TOKEN',
      !pubsDb && 'NOTION_PUBLICATIONS_DB_ID',
      !biweeklyDb && 'NOTION_BIWEEKLY_DB_ID',
    ].filter(Boolean);
    console.log(`→ No Notion credentials (missing: ${missing.join(', ')}). Using seed data.`);
    await write('publications.json', seedPublications);
    await write('latest-digest.json', seedDigest);
    await write('metrics.json', seedMetrics);
  }
}

main().catch((err) => {
  console.error('fetch-notion failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
