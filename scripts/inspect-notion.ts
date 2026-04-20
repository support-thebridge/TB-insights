// One-off diagnostic. Dumps property values of one row from each DB so we can
// reconcile real content against the mapper. Run with:
//   set -a; source .env; set +a; tsx scripts/inspect-notion.ts

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function short(v: unknown, max = 160): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function extractValue(p: any): string {
  switch (p.type) {
    case 'title': return p.title.map((t: any) => t.plain_text).join('');
    case 'rich_text': return p.rich_text.map((t: any) => t.plain_text).join('');
    case 'select': return p.select?.name ?? '';
    case 'multi_select': return p.multi_select.map((o: any) => o.name).join(', ');
    case 'date': return p.date?.start ?? '';
    case 'url': return p.url ?? '';
    case 'number': return String(p.number ?? '');
    case 'checkbox': return String(p.checkbox);
    case 'files': return `[${p.files.length} file(s)]`;
    case 'relation': return `[${p.relation.length} relation(s): ${p.relation.map((r: any) => r.id).join(', ')}]`;
    default: return short(p);
  }
}

const DBS: Array<[string, string | undefined]> = [
  ['Publications', process.env.NOTION_PUBLICATIONS_DB_ID],
  ['Biweekly', process.env.NOTION_BIWEEKLY_DB_ID],
];

for (const [label, id] of DBS) {
  if (!id) continue;
  console.log(`\n## ${label} — first row values`);
  const resp: any = await notion.databases.query({ database_id: id, page_size: 1 });
  const row = resp.results[0];
  if (!row) { console.log('(empty)'); continue; }
  for (const [name, p] of Object.entries(row.properties) as Array<[string, any]>) {
    const v = extractValue(p);
    console.log(`  ${p.type.padEnd(14)} ${name.padEnd(28)} ${short(v)}`);
  }
}
