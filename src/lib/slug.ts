/**
 * Stable, URL-safe slug from a publication title. Used for in-page anchors
 * (`#pub-<slug>`) so digest finding cards can scroll to their source row in
 * the library. Same input always yields the same output across runs.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
