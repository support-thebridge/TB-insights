# The Bridge Insights — Build Brief (Astro + Cloudflare Pages)

Stack definitivo, optimizado para plan gratuito.

---

## 1. Stack confirmado

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Astro 5** | SSG puro, HTML mínimo, islands sólo donde haga falta |
| Estilos | **Tailwind 3** + tokens CSS vars | Reutilizamos `colors_and_type.css` como source of truth |
| Tipografía | **@fontsource-variable** + `next/font`-style local via `public/fonts/` | Futura Std licenciado local |
| Motion | **Motion One** (3 kB) o CSS-only | Framer Motion es overkill para lo que hay |
| UI components | **Escribir a mano** (son ~10) | shadcn/ui es React — Astro los importa pero añade peso |
| CMS | **Notion** vía `@notionhq/client` en build time | — |
| Deploy | **Cloudflare Pages** (free tier) | 500 builds/mes, bandwidth ilimitado, SSL, edge CDN |
| Email capture | **Cloudflare Pages Function** (1 archivo) | 100k req/día gratis, escribe a Notion DB subscribers |
| PDFs públicos | `public/pdfs/bridge/*.pdf` | Servidos por CDN |
| PDFs privados | Pages Function con token + fetch a R2 bucket | R2 tiene 10GB/mes gratis |
| Rebuild | **GitHub Actions cron** cada 6 h + webhook on Notion change | Pages rebuild via deploy hook URL |

**Lo que NO usamos:** Next.js, Vercel, Docker, PM2, ISR, server-side rendering, shadcn, Framer Motion, analytics.

---

## 2. Estructura de archivos

```
insights-web/
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
├── package.json
├── .env.example
├── README.md
│
├── public/
│   ├── fonts/
│   │   ├── Futura_Book_Regular.otf
│   │   └── futura-std-medium.otf
│   └── pdfs/
│       └── bridge/              # reports públicos de The Bridge
│
├── src/
│   ├── pages/
│   │   ├── index.astro          # landing entera (7 secciones)
│   │   └── api/                 # (vacío — las functions van en /functions)
│   │
│   ├── components/
│   │   ├── Nav.astro
│   │   ├── Hero.astro
│   │   ├── DigestBlock.astro
│   │   ├── LivingDashboard.astro
│   │   ├── ReportsSection.astro
│   │   ├── IndustryLibrary.astro
│   │   ├── MethodologySteps.astro
│   │   ├── EmailCapture.astro
│   │   └── Footer.astro
│   │
│   ├── lib/
│   │   ├── notion.ts            # client + queries tipadas
│   │   └── types.ts             # Publication, BiweeklyReport, Metric
│   │
│   ├── data/                    # generado en build — NO commitear
│   │   ├── publications.json
│   │   ├── latest-digest.json
│   │   └── metrics.json
│   │
│   └── styles/
│       └── tokens.css           # copia de colors_and_type.css
│
├── scripts/
│   └── fetch-notion.mjs         # prebuild: pobla src/data/
│
├── functions/
│   └── api/
│       └── subscribe.ts         # Cloudflare Pages Function → Notion
│
└── design-system/               # referencia (copia del handoff)
    ├── README.md
    ├── colors_and_type.css
    ├── prototype.html
    └── assets/
```

---

## 3. Variables de entorno

`.env` (local) / Cloudflare Pages env vars:

```
NOTION_TOKEN=secret_xxxxx
NOTION_PUBLICATIONS_DB_ID=d947fed1-5006-489c-8e5c-4e1bf00d93fe
NOTION_BIWEEKLY_DB_ID=26fc01ab-b176-47c7-b4ce-861f705ab4fb
NOTION_SUBSCRIBERS_DB_ID=<crear nueva>
```

Crear en Notion una **DB Subscribers** con propiedades: `Email` (email), `Source` (select: landing / digest / report), `Created` (created_time), `Vector Interest` (multi-select opcional).

---

## 4. Prompts para Claude Code — por fases

### Fase 1 · Scaffold + migración visual (sin Notion)

```
Soy Diego de The Bridge. Vamos a montar una landing estática llamada
"The Bridge Insights" con Astro + Tailwind para deploy en Cloudflare Pages.

Lee antes de escribir código:
1. ./design-system/README.md                (brand guide)
2. ./design-system/colors_and_type.css      (tokens)
3. ./design-system/prototype.html           (maqueta HTML aprobada)
4. ./INSIGHTS_BRIEF.md                      (este documento)

Tareas Fase 1:
1. pnpm create astro@latest . (template: minimal, TS strict)
2. pnpm add -D tailwindcss @astrojs/tailwind
3. Config Tailwind: trasladar TODAS las CSS vars de tokens.css
   a theme.extend (colors, fontFamily, spacing, borderRadius).
4. Cargar fuentes Futura desde /public/fonts vía @font-face en
   global.css — NO usar Google Fonts para Futura.
5. Inter Tight sí desde Google Fonts (preconnect + display=swap).
6. Migrar el HTML de prototype.html a componentes Astro uno a uno:
   Nav, Hero, DigestBlock, LivingDashboard, ReportsSection,
   IndustryLibrary, MethodologySteps, EmailCapture, Footer.
7. Index.astro monta los 9 componentes.
8. Por ahora datos en src/data/mock.ts con las mismas muestras del
   prototype. Notion viene en Fase 2.
9. Motion: sólo CSS (fade-up on scroll con IntersectionObserver inline).
   Respetar prefers-reduced-motion.

Antes de escribir código, devuélveme:
- árbol final de src/
- mapping token CSS var → clase Tailwind
- confirmación de que todo compila con `pnpm build` sin warnings

Espera OK antes de generar.
```

### Fase 2 · Notion wiring en build time

```
Fase 2: conectar Notion.

1. Crear src/lib/notion.ts con:
   - notion = new Client({ auth: process.env.NOTION_TOKEN })
   - getPublications(): todas las rows de PUBLICATIONS_DB_ID
   - getLatestBiweekly(): la row más reciente de BIWEEKLY_DB_ID
   - tipadas contra src/lib/types.ts
2. Crear scripts/fetch-notion.mjs (node, ESM) que:
   - Llama las funciones de lib/notion.ts
   - Escribe src/data/publications.json, latest-digest.json, metrics.json
3. Modificar package.json:
   "prebuild": "node scripts/fetch-notion.mjs"
4. Componentes Astro importan desde src/data/*.json (no desde Notion
   directamente — todo estático en build).
5. Fallback: si NOTION_TOKEN no existe, usar src/data/mock.ts.

Schema esperado (confirmar contra DBs reales antes de tipar):
- Publications: Title, Publisher, Date, Vector (multi), Country (multi),
  Tier (select A/B/C), URL, PDF (files).
- Biweekly: Issue, Date, Thesis, Finding1..3, Source1..3.

Devuélveme el diff propuesto antes de tocar archivos.
```

### Fase 3 · Email capture via Pages Function

```
Fase 3: Pages Function de subscribe.

1. Crear functions/api/subscribe.ts (Cloudflare Pages Functions syntax):
   - onRequestPost({ request, env })
   - Valida email con regex simple
   - Llama a Notion API (fetch, no @notionhq/client — mejor en edge)
     POST /v1/pages con parent=SUBSCRIBERS_DB_ID
   - Responde { ok: true } o { error }
   - Rate limit: 1 req/IP/minuto via KV (opcional Fase 4)
2. EmailCapture.astro: fetch a /api/subscribe, mostrar estado inline.
3. Testing local: `pnpm wrangler pages dev ./dist --compatibility-date=2025-04-01`

Devuélveme el código completo de la function antes de commitear.
```

### Fase 4 · Deploy a Cloudflare Pages

```
Fase 4: deploy.

1. Push a GitHub (repo nuevo o existente).
2. Cloudflare Dashboard → Pages → Create project → Connect to Git.
3. Build settings:
   - Build command: pnpm build
   - Output directory: dist
   - Root directory: / (o /insights-web si es subcarpeta)
   - Env vars: NOTION_TOKEN, NOTION_PUBLICATIONS_DB_ID,
     NOTION_BIWEEKLY_DB_ID, NOTION_SUBSCRIBERS_DB_ID
4. Deploy hook: copiar la URL.
5. GitHub Actions workflow (.github/workflows/rebuild.yml):
   - Cron cada 6 h
   - Step: curl -X POST $DEPLOY_HOOK_URL
6. Custom domain: insights.thebridge.tech → Cloudflare DNS (ya en CF
   si el dominio está delegado).

Genera .github/workflows/rebuild.yml y un README con los pasos del
dashboard. No escribas los secrets.
```

---

## 5. Tokens Tailwind (resumen)

```js
// tailwind.config.mjs — theme.extend
colors: {
  ins: {
    bg:        '#0a0a0a',
    'bg-2':    '#0e0e0f',
    surface:   '#131314',
    'surface-2': '#181819',
    line:      'rgba(255,255,255,0.10)',
    'line-2':  'rgba(255,255,255,0.06)',
    fg:        '#fafafa',
    'fg-2':    '#a7a7ac',
    'fg-3':    '#6a6a70',
  },
  v: {
    1: '#3b82f6',   // demand
    2: '#f97316',   // salaries
    3: '#a855f7',   // ai impact
    4: '#22c55e',   // training
  },
  accent: '#ef3340',
  mint:   '#73ffba',
},
fontFamily: {
  sans:    ['"Futura Std"', 'Futura', 'Century Gothic', 'system-ui'],
  display: ['"Inter Tight"', 'system-ui'],
},
```

---

## 6. Deploy Cloudflare Pages — cheatsheet

1. `git push` tu repo a GitHub.
2. [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → Create → Pages → Connect to Git.
3. Selecciona repo + branch `main`.
4. Framework preset: **Astro** (detecta solo).
5. Build output: `dist`.
6. Env vars (Production + Preview): las 4 de la sección 3.
7. Deploy. Primer build ≈ 2 min.
8. Custom domain → settings → Domains → Add → `insights.thebridge.tech`.

**Coste estimado:** 0 €/mes mientras estés bajo:
- 500 builds/mes (a 6 h = 120 builds/mes, holgura enorme)
- 100k req/día en Functions
- Bandwidth ilimitado en Pages

---

## 7. Siguiente paso

Descomprime el zip del handoff en tu repo, instala Claude Code (`npm i -g @anthropic-ai/claude-code`), entra al repo con `claude`, y pega el prompt de **Fase 1**. Cuando termine Fase 1 y el build local funcione, sigues con Fase 2.

Si te atascas en cualquier fase, vuelves aquí con el error y lo desatascamos.
