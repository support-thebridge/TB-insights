# TB-insights

Landing estática de **The Bridge Insights** — síntesis quincenal del mercado laboral tecnológico. Astro 5 + Tailwind 3, deploy en Cloudflare Pages, contenido en Notion como CMS de build-time.

## Estado actual

Snapshot a 2026-05-02.

| Fase | Estado | Notas |
|---|---|---|
| 1 · Scaffold + componentes | Hecho | 7 secciones migradas desde `_handoff/design-system/prototype.html`. Build sin warnings. |
| 2 · Notion como CMS de build | Hecho | Publications, Biweekly y Findings DBs. Editorial completo en Notion con fallback per-field a `STATIC_FRAMING`. |
| 3 · Suscripción + email | Pendiente | Plan detallado en `docs/subscribe-plan.md`. Decisión cerrada: Brevo como sistema de verdad, trigger humano vía `workflow_dispatch`. |
| 4 · Deploy + cron de rebuild | Hecho | Cloudflare Pages + GitHub Actions cada 6h. |

Lo construido hasta ahora se traduce en: la home renderiza el último ciclo publicado en Notion, con thesis con énfasis tipográfico (bold→`.em`, underline→`.u`), 3 finding cards (V1/V2/V3 según el ciclo) que enlazan a su fuente en la library de la misma página vía anchors `#pub-<slug>`, y los datos de Publications Cited y Vectors Covered se reflejan en el aside del digest.

## Stack

Astro 5 (SSG) · Tailwind 3 · Cloudflare Pages · Cloudflare Pages Functions · Notion API (build-time) · GitHub Actions (cron) · pnpm.

Explícitamente no usamos Next.js, Vercel, Docker, shadcn, Framer Motion, analítica de terceros, ni SSR. Motion en CSS puro.

## Comandos

```bash
pnpm dev      # Astro dev server con HMR (corre prebuild antes)
pnpm build    # Genera dist/ — falla si Notion devuelve algo inesperado
pnpm preview  # Sirve dist/ como Cloudflare lo serviría
pnpm check    # Type-check
```

`pnpm build` ejecuta `prebuild` automáticamente (`tsx scripts/fetch-notion.ts`), que:
- Si hay `NOTION_TOKEN` + ambos DB IDs → fetch de Publications y Biweekly desde Notion. Resuelve findings vía `pages.retrieve` sobre las relations.
- Si falta cualquier credencial → cae a `scripts/seed.mjs`.

Output: `src/data/publications.json`, `src/data/latest-digest.json`, `src/data/metrics.json`. Los componentes leen desde ahí; **nunca** llaman a Notion en runtime.

## Variables de entorno

Producción y dev local (`.env`):

```
NOTION_TOKEN=
NOTION_PUBLICATIONS_DB_ID=
NOTION_BIWEEKLY_DB_ID=
```

`NOTION_FINDINGS_DB_ID` no se usa: las findings se resuelven por relación desde Biweekly. Las DBs Findings y Publications viven bajo el mismo parent page que Biweekly, así que comparten acceso de la integración sin configuración extra.

Variables que se añadirán en Fase 3 (subscribe + email): ver `docs/subscribe-plan.md`.

---

## Proceso editorial

Así se cierra una quincena hoy. El flujo pasa por Notion → build automático → web pública. No hay paso de email todavía (Fase 3).

### 1 · Producción de contenido en Notion

Workspace: **Tech Labor Market Tracker**. Tres DBs implicadas, todas hijas de la misma page (heredan acceso de la integración):

- **Tech Labor Market Publications**: catálogo público de fuentes. Mirror de la library en la web.
- **Biweekly Reports**: una row por quincena. Es el documento maestro del ciclo.
- **Findings**: una row por hallazgo. Cada Biweekly enlaza 3 findings vía relación.

#### Ciclo típico

1. **Recolección** (continua). Añadir publicaciones nuevas a la DB Publications: título, publisher, fecha, vector(es) V1–V4, country scope, tier A/B/C, URL y PDF URL si lo hay.
2. **Apertura del ciclo**. Crear un row en Biweekly Reports con `Cycle Date` (ISO date, sirve también como Title) y `Status = Draft`. Rellenar:
   - `Most Important Delta` (paragraph): el "qué movió la aguja" del ciclo. Aparece como párrafo grande encima de las cards.
   - `Digest Summary` (bullets): la lista canónica de hallazgos para uso interno.
   - `Vectors Covered` (multi-select): los vectores cubiertos este ciclo.
   - `Publications Cited` (relation → Publications): las fuentes citadas en el ciclo.
   - `Publications Added` (number): cuántas publicaciones nuevas pasaron el filtro.
3. **Bloque editorial superior**. En la misma row de Biweekly, los campos que alimentan el hero y el callout:
   - `Thesis Headline` (rich_text): el H1 de la home. **Selecciona** las palabras que llevan énfasis: bold para énfasis rojo (`.em`), underline para subrayado mint (`.u`). Saltos de línea explícitos = `<br>` en la web.
   - `Live Readout {Label, Value, Value Accent, Source}`: la lectura destacada que aparece en el hero.
   - `Callout {Tag, Text, Link Label}`: el bloque "So what para Bridge" debajo del digest.
4. **Findings (3 por ciclo)**. Crear/actualizar 3 rows en la DB Findings, una por card del digest:
   - `Title` (identificador interno, no se renderiza).
   - `Vector` (select V1/V2/V3/V4): tematiza la card con el color del vector.
   - `Stat`, `Stat Unit`, `Finding`, `Body`, `Source Label`: contenido de la card.
   - `Publication` (relation → Publications): apunta a la fuente principal. Cuando está rellena, el "Fuente · …" de la card se convierte en un link interno a la fila correspondiente en la library, con scroll suave y un flash mint sobre la fila destino.
   - `Source URL` (opcional): solo se usa si `Publication` está vacía — fallback a link externo en nueva pestaña.
5. **Linkado de findings en Biweekly**. En el row de Biweekly, en la columna `Findings` (relation), añadir las 3 finding pages. **El orden de la relación = orden de las cards** en la web (la primera relación es la card izquierda).
6. **Cierre del ciclo**. Cambiar `Status` a `Published`. Si hubo un ciclo anterior publicado, su `Status` puede pasar a `Superseded` (no es obligatorio: la web siempre sirve el `Published` con `Cycle Date` más reciente).

### 2 · Build y publicación

- Cloudflare Pages tiene un deploy hook conectado al repo.
- GitHub Actions ejecuta un cron cada 6h que llama al deploy hook → Cloudflare lanza `pnpm build` → la web se actualiza.
- Un push a `main` también dispara deploy automático.
- Latencia máxima entre cambiar `Status=Published` en Notion y verlo en producción: 6h. Para acelerar, ejecutar el deploy hook a mano desde Cloudflare.

### 3 · Comportamiento de fallback

El composer (`src/data/index.ts`) hace merge per-field: si Notion entrega un campo, se usa; si no, se cae a `STATIC_FRAMING` definido en código. Esto permite empezar a poblar Notion gradualmente sin romper la web. Excepción: las findings son **all-or-nothing** — si Notion entrega ≠3, se usa el set estático completo y el build emite un warn.

Si falta `NOTION_TOKEN` por completo, todo el contenido viene de `scripts/seed.mjs` (datos de demo).

### 4 · Edición rápida de copys que no están en Notion

Algunos textos siguen en código por ser evergreen o estructurales:

- Subtítulo del hero (`thesisSub`), headline del digest section, títulos de Reports/Library/Method, los 6 pasos de metodología, copy del form de suscripción y footer.
- Reportes (flagship + 6 cards): `flagshipReport` y `reportCards` en `src/data/index.ts`. Se moverá a Notion si la cadencia de publicación lo justifica (Tier 2 aplazado).

Para cambiar cualquiera de estos: edita `src/data/index.ts`, commit y push. Cloudflare rebuilda automáticamente.

---

## Estructura del proyecto

```
src/
  components/        Astro components, 1:1 con prototype.html
  data/              JSON generado por prebuild + composer (index.ts)
  lib/
    notion.ts        Cliente Notion build-time (no usar en edge)
    types.ts         Modelo de datos (BiweeklyDigest, Publication, etc.)
    slug.ts          Slug estable para anchors #pub-<slug>
  pages/index.astro  Home
  styles/            Tailwind base + estilos específicos del proyecto
scripts/
  fetch-notion.ts    Prebuild orchestrator (Notion → JSON, o seed)
  seed.mjs           Datos de demo cuando no hay credenciales
  inspect-notion.ts  Diagnóstico de schema (run manual)
  migrate-notion-*.ts  Migraciones one-off del esquema Notion. Idempotentes.
functions/
  api/               Cloudflare Pages Functions (Fase 3 pendiente)
docs/
  subscribe-plan.md  Plan de Fase 3 (suscripción + email)
_handoff/
  design-system/     Material de referencia. No modificar.
INSIGHTS_BRIEF.md    Brief original con las 4 fases y decisiones de stack.
CLAUDE.md            Reglas para Claude Code en este repo.
```

## Más info

- `INSIGHTS_BRIEF.md` — visión y decisiones de producto/stack.
- `CLAUDE.md` — guía operativa para sesiones de Claude (lectura obligatoria antes de empezar trabajo no trivial).
- `_handoff/design-system/README.md` — sistema de diseño y reglas de marca.
- `_handoff/design-system/prototype.html` — referencia visual aprobada.
- `docs/subscribe-plan.md` — plan de suscripción y distribución por email.
