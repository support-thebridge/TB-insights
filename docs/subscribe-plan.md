# Plan de suscripción y distribución por email

Estado: pendiente de empezar. Detalla la Fase 3 del `INSIGHTS_BRIEF.md` con las decisiones tomadas en conversación el 2026-05-01.

---

## Arquitectura en una frase

Form en la landing → Cloudflare Pages Function → Brevo Contacts API. Cada quincena, cuando un row de Biweekly pasa a `Status=Published`, un job dispara una campaña en Brevo Marketing API hacia la lista única de suscriptores.

```
[Form HTML] → POST /api/subscribe → Pages Function → Brevo /v3/contacts (double opt-in)
                                                      │
                                                      └─► Brevo confirma email → contacto activo en lista

[Notion Biweekly Status=Published] → trigger → Brevo /v3/emailCampaigns (create + sendNow)
                                                       │
                                                       └─► Notion: Email Sent At = now()  (idempotencia)
```

Sistema de verdad para emails: **solo Brevo**. Notion no almacena suscriptores; descartamos `NOTION_SUBSCRIBERS_DB_ID` del brief original.

---

## Decisiones cerradas

| Decisión | Elegido | Motivo |
|---|---|---|
| Sistema de verdad de emails | Brevo | Un solo lugar, gestión nativa de bounces/unsub/GDPR |
| Double opt-in | Sí | Filtra bots, cumple GDPR, mejora reputación de envío |
| Formato del email | Empezamos por opción A: corto + link a la landing | Coste de implementación bajo, empuja tráfico web |
| Idempotencia del envío | Columna `Email Sent At` en Biweekly | Re-runs no duplican envíos |
| Privacidad | Texto + link a política bajo el input | Requisito legal |

## Decisiones abiertas (a cerrar al volver)

1. **Diseño del email opción A**: ¿asunto, longitud del párrafo, qué CTA? Borrador inicial pendiente de revisión.
2. **¿Una lista o varias en Brevo?** Por ahora una sola ("Tech Labor Market Tracker"). Si más adelante segmentamos por idioma o cohorte (corporate vs. individual) se parte.
3. **¿Quién dispara el envío?** Dos opciones que evaluamos al volver:
   - (a) Último step del workflow de GitHub Actions cron (ya rebuilda cada 6h).
   - (b) Job programado en Claude Cowork, separado del rebuild.
   Recomendación tentativa: (a) — la infra ya existe, un solo punto de fallo, logs en GitHub.
4. **¿Política de privacidad?** Necesitamos URL pública (puede vivir bajo `thebridge.school` o como `/privacy` en este dominio).

---

## Pre-requisitos en Brevo (manuales, hacer antes de codear)

1. **API key Marketing v3**: Brevo → Settings → SMTP & API → API Keys → Create. Permisos: Contacts (write), Email Campaigns (write).
2. **Crear lista**: Brevo → Contacts → Lists → New list → "Tech Labor Market Tracker". Anota el list ID (es un número entero).
3. **Activar double opt-in**: Brevo → Contacts → Forms → Create form (incluso si no usamos el form de Brevo, el flujo DOI vive ahí). Configurar:
   - Email de confirmación (asunto, cuerpo, branding).
   - URL de "gracias" tras confirmar (puede apuntar a la landing con `?confirmed=1`).
   - Anota el **template ID del DOI** y el **redirect URL** — la API los pide en el `POST /contacts`.
4. **Diseñar plantilla de email** (cuando subamos a opción B): Brevo → Templates → New → diseño con merge tags `{{params.thesisHeadline}}`, `{{params.findings}}`, etc. No urgente; opción A no usa template.
5. **Sender verificado**: Brevo → Senders → añadir y verificar el email saliente (típicamente `insights@thebridge.school` o similar). Sin esto las campañas no salen.

---

## Variables de entorno (Cloudflare Pages)

Añadir como secrets en Pages → Settings → Environment variables → Production:

```
BREVO_API_KEY              # Marketing v3 key
BREVO_LIST_ID              # ID numérico de la lista
BREVO_DOI_TEMPLATE_ID      # ID numérico del DOI template
BREVO_DOI_REDIRECT_URL     # URL absoluta a la que vuelve el usuario tras confirmar
BREVO_SENDER_EMAIL         # Sender verificado (from)
BREVO_SENDER_NAME          # Nombre visible (ej. "The Bridge Insights")
```

Para el job de envío de campaña (donde sea que corra):

```
NOTION_TOKEN               # ya existe
NOTION_BIWEEKLY_DB_ID      # ya existe
BREVO_API_KEY              # mismo que arriba
BREVO_LIST_ID              # mismo que arriba
BREVO_SENDER_EMAIL         # mismo que arriba
BREVO_SENDER_NAME          # mismo que arriba
SITE_URL                   # base URL pública (para construir el link al digest)
```

---

## Tareas técnicas (orden de ejecución)

### Sprint A — recolección (≈ media jornada)

1. **Crear `functions/api/subscribe.ts`**. Cloudflare Pages Function (edge runtime). Usar `fetch` directo, **no** `@notionhq/client` (la regla de la edge en CLAUDE.md ya no aplica para Brevo, pero `fetch` sigue siendo lo correcto en edge).
   - Acepta `POST application/json` con `{ email: string }`.
   - Valida formato de email (regex razonable).
   - Llama a `POST https://api.brevo.com/v3/contacts/doubleOptinConfirmation` con:
     ```json
     {
       "email": "...",
       "includeListIds": [BREVO_LIST_ID],
       "templateId": BREVO_DOI_TEMPLATE_ID,
       "redirectionUrl": BREVO_DOI_REDIRECT_URL
     }
     ```
   - Headers: `api-key: <BREVO_API_KEY>`, `accept: application/json`, `content-type: application/json`.
   - Mapea respuestas:
     - 201 / 204 → 200 al cliente con `{ ok: true, status: "pending_confirmation" }`.
     - 400 con código `invalid_parameter` → 400 al cliente con `{ error: "email_invalid" }`.
     - 400 con código `duplicate_parameter` (ya está en la lista y confirmado) → 200 con `{ ok: true, status: "already_subscribed" }`. Trato como éxito UX.
     - 5xx → 502 al cliente con mensaje genérico.
   - Rate limit casero: rechazar más de N intentos por IP en M minutos (KV o memoria) — opcional para v1.
2. **Conectar `EmailCapture.astro` al endpoint**. Reemplazar el handler actual (que probablemente solo hace `preventDefault`) por `fetch('/api/subscribe', …)`. Estados visibles: idle → loading → success ("Revisa tu bandeja para confirmar") / error ("Email inválido" / "Inténtalo más tarde").
3. **Test local**: `pnpm wrangler pages dev ./dist --compatibility-date=2025-04-01` con las env vars en `.dev.vars`. Probar happy path + email duplicado + email inválido.
4. **Texto de consentimiento + link a privacidad** debajo del input.

Verificación: enviar tu email real, recibir el DOI de Brevo, clicar, ver tu contacto en la lista de Brevo.

### Sprint B — distribución (≈ 1 día tras tener primer contenido publicable)

1. **Añadir columna `Email Sent At`** (date) a Biweekly DB en Notion. Ya tenemos un patrón para extender el esquema vía API (`scripts/migrate-notion-editorial.ts`); replicar.
2. **Decidir trigger** (decisión abierta #3). Si (a) GitHub Actions: crear `.github/workflows/send-digest.yml` que se ejecuta tras el rebuild. Si (b) Claude Cowork: añadirlo al skill scheduled.
3. **Job de envío** (`scripts/send-digest.ts` o equivalente):
   1. Query Biweekly: latest row con `Status=Published` y `Email Sent At` vacío.
   2. Si no hay → exit 0 (no hay nada que enviar).
   3. Construir contenido del email:
      - Asunto: `Quincena {issue} — {thesis headline plana, sin marcado}`
      - Body HTML mínimo (inline styles): eyebrow + thesis + 1 párrafo de digestHeadline + botón "Lee el digest completo" → `${SITE_URL}/#digest` (más adelante: `/#cycle-{issue}` cuando tengamos rutas por ciclo).
      - Versión texto plano para clientes que no renderizan HTML.
   4. Llamar a Brevo `POST /v3/emailCampaigns`:
      ```json
      {
        "name": "Quincena {issue} — {YYYY-MM-DD}",
        "subject": "...",
        "sender": { "name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL },
        "type": "classic",
        "htmlContent": "...",
        "recipients": { "listIds": [BREVO_LIST_ID] }
      }
      ```
      → guarda `campaignId`.
   5. `POST /v3/emailCampaigns/{id}/sendNow`.
   6. Si éxito (2xx) → `PATCH` la página Biweekly: `Email Sent At = now()`. Idempotente: re-runs encuentran el campo lleno y no envían.
   7. Logging: campaña ID, número estimado de destinatarios, timestamp.
4. **Test** con la lista en modo "Test" (Brevo permite enviar campañas a un email tester antes del send real).

Verificación: cambiar manualmente un Biweekly de Draft a Published en Notion, lanzar el job, recibir el email, verificar que `Email Sent At` queda estampado.

### Sprint C — opción B template Brevo (cuando justifique)

Solo cuando: lista > 100 subs y open rate < 30% en opción A.

- Diseñar plantilla en Brevo con todos los bloques editoriales.
- Cambiar el job: en vez de `htmlContent` inline, usar `templateId` + `params: { thesisHeadline, liveReadout, findings, callout }`.
- Mapear los runs de `thesisHeadline` a HTML antes de pasarlos como param.

---

## Riesgos y gotchas

- **Reputación del sender**: el primer envío a una lista nueva puede caer en spam si el dominio no tiene SPF/DKIM/DMARC. Brevo guía el setup; idealmente verificar antes del primer envío real.
- **Free tier Brevo**: 300 emails/día. Si la lista crece a >300 antes del primer Sprint C, partir el envío en 2-3 días o subir a plan Lite (≈25€/mes hasta 20k).
- **DOI y latencia**: el suscriptor no aparece en la lista hasta que clica el link. La UI tiene que ser explícita: "te hemos enviado un email para confirmar".
- **Idempotencia frágil**: si el job estampa `Email Sent At` antes de confirmar el `sendNow` 2xx, podemos perder envíos. Estampar **después**, dentro del mismo run, y aceptar que un fallo entre `sendNow` y `PATCH` envía dos veces (raro, mejor que el inverso).
- **Edge runtime y Notion**: el job de envío **no** corre en edge (corre en GitHub Actions o Claude Cowork). Ahí sí podemos usar `@notionhq/client` y `node-fetch`. La regla "no `@notionhq/client` en edge" solo aplica a `functions/api/*`.
- **Rate limit Brevo**: 10 req/s por API key en endpoints de Contacts. Para 1 sub a la vez no hay riesgo; sí lo habría si alguna vez hacemos backfill masivo.

---

## Cuando volvamos

Empezamos por Sprint A. Antes de codear el primer punto, confirmar:

- ¿Tienes ya creada la API key, la lista y el sender verificado en Brevo? Si no, esos 3 pasos manuales primero.
- ¿Texto del DOI confirmation email aprobado? (asunto + cuerpo + URL de gracias)
- ¿Texto de consentimiento + URL de privacidad?

Con esos tres en mano, el Sprint A entero cabe en una sesión.
